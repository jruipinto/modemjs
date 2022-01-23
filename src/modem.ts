import { clone } from 'ramda';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { concatMap, filter, map, take, takeWhile, tap } from 'rxjs/operators';
import SerialPort from 'serialport';
import { DeliveredSMSReport, ModemConfig, ModemStatus, ModemTask, ReceivedSMS, SMS } from './models';
import { convertInvisibleCharacters, defaultModemConfig, initialModemStatus, ModemError, notNull } from './shared';
// tslint:disable-next-line: no-var-requires
const Readline = require('@serialport/parser-readline');

export class Modem {
  public log$: Subject<string> = new Subject();
  public status$ = new BehaviorSubject<ModemStatus>(initialModemStatus);

  private currentTaskRunning: ModemTask | null = null;
  private taskQueue: ModemTask[] = [];
  private taskCounter = 0;

  private serialPort: SerialPort;
  private modemConfig: ModemConfig;

  private data$: Subject<string> = new Subject();
  private error$: Subject<string> = new Subject();

  constructor(modemCfg: ModemConfig, errorCallback?: (err: any) => void) {
    this.modemConfig = { ...defaultModemConfig, ...modemCfg };
    this.serialPort = new SerialPort(modemCfg.portName, { baudRate: modemCfg.baudRate, autoOpen: false });

    this.serialPort.on('close', ({ disconnected }) => {
      // if it was disconnected then it's an error
      disconnected && this.updateStatus({ isConnected: false, lastError: ModemError.DISCONNECTED });
    });

    this.serialPort.pipe(new Readline({ delimiter: '>' })).on('data', () => {
      this.currentTaskRunning = null;
      this.nextTaskExecute();
    });
    this.serialPort.pipe(new Readline({ delimiter: '\r\n' })).on('data', (receivedData: string) => {
      if (receivedData) {
        this.data$.next(clone(receivedData));
      }
    });
    this.data$
      .pipe(
        // logs received data
        tap(receivedData => {
          this.updateStatus({
            lastError: receivedData.includes('ERROR') ? receivedData : undefined,
            lastReceivedData: receivedData,
          });
        }),
      )
      .subscribe();

    this.serialPort.on('error', error => {
      this.updateStatus({ isErrored: true, lastError: error });
    });

    // init modem
    if (modemCfg.shouldAutoOpen || typeof modemCfg.shouldAutoOpen === 'undefined') {
      this.init(errorCallback);
    }
  }

  public init(errorCallback?: (err: any) => void) {
    this.serialPort.open(error => {
      if (error) {
        this.updateStatus({
          isConnected: false,
          lastError: error.message,
        });
        errorCallback?.(error);
      }
    });

    // init modem
    this.modemConfig.initCommands.forEach(command => {
      this.addTask({
        description: command,
        expectedResult: 'OK',
        fn: () => this.sendCommand(`${command}\r`),
        id: this.generateTaskID(),
        onResultFn: () => null,
      });
    });

    this.nextTaskExecute();
  }

  public onReceivedSMS(): Observable<ReceivedSMS> {
    let readingSMS: boolean = false;
    let newSMS: ReceivedSMS = {
      id: 0,
      phoneNumber: null,
      submitTime: null,
      text: '',
    };
    return this.data$.pipe(
      tap(data => {
        if (data.includes('+CMTI:')) {
          newSMS.id = +data.split(',')[1];
          this.addTask({
            description: `AT+CMGR=${newSMS.id}`,
            expectedResult: '+CMGR:',
            fn: () => this.sendCommand(`AT+CMGR=${newSMS.id}\r`),
            id: this.generateTaskID(),
            onResultFn: () => null,
          });
          this.nextTaskExecute();
        }
        if (data.includes('+CMGR:')) {
          readingSMS = true;
        }
      }),
      filter(() => readingSMS),
      tap(data => {
        if (data.includes('OK')) {
          readingSMS = false;
        }
      }),
      map(data => {
        if (data.includes('OK')) {
          newSMS.text = newSMS.text?.trim() ?? '';
          return newSMS;
        }
        if (data.includes('+CMGR:')) {
          const today = new Date();
          const [, phoneNumber, , submitDate, submitHour] = data
            .replace(/\+CMGR\:\ |\"/gi, '')
            .replace(/\//gi, '-')
            .split(',');
          newSMS.phoneNumber = +phoneNumber.replace('+', '00').replace(/00351/, '');
          newSMS.submitTime = new Date(
            `${today.getFullYear()}${submitDate.slice(2)}T${submitHour.replace('+', '.000+')}:00`,
          );
          return null;
        }
        newSMS.text += data;
        return null;
      }),
      filter(notNull),
      tap(() => {
        newSMS = {
          id: 0,
          phoneNumber: null,
          submitTime: null,
          text: '',
        };
      }),
      tap(({ id }) => {
        this.addTask({
          description: `AT+CMGD=${id}`,
          expectedResult: 'OK',
          fn: () => this.sendCommand(`AT+CMGD=${id}\r`),
          id: this.generateTaskID(),
          onResultFn: () => null,
        });
        this.nextTaskExecute();
      }),
    );
  }

  public sendSMS({ phoneNumber, text }: SMS): Observable<DeliveredSMSReport> {
    const smsInfo$: BehaviorSubject<any> = new BehaviorSubject(null);
    let cmgsNumber: number;
    this.error$.pipe(take(1)).subscribe(n => smsInfo$.error(n));

    this.addTask({
      description: `AT+CMGS="${phoneNumber}"`,
      expectedResult: 'notImportant',
      fn: () => {
        setTimeout(() => {
          this.sendCommand(`AT+CMGS="${phoneNumber}"\r`);
        }, this.modemConfig.msPause);
      },
      id: this.generateTaskID(),
      onResultFn: () => null,
    });
    this.addTask({
      description: `${text}\x1A`,
      expectedResult: '+CMGS:',
      fn: () => this.sendCommand(`${text}\x1A`),
      id: this.generateTaskID(),
      onResultFn: receivedData => {
        smsInfo$.next(receivedData);
      },
    });

    this.nextTaskExecute();

    return smsInfo$.pipe(
      filter(notNull),
      filter(data => data.includes('+CMGS:')),
      tap(data => {
        cmgsNumber = +data.split(':')[1];
      }),
      concatMap(() => this.data$),
      filter(data => data.includes('+CDS:')),
      filter(data => +data.split(',')[1] === cmgsNumber),

      // convert +CDS string to DeliveredSMSReport object
      map(data => {
        // data = '+CDS: 6,238,"910000000",129,"19/12/21,00:04:39+00","19/12/21,00:04:41+00",0'
        const [firstOctet, id, phoneNumber, , submitDate, submitHour, deliveryDate, deliveryHour, st] = data
          .replace(/\+CDS\:\ |\"/gi, '')
          .replace(/\//gi, '-')
          .split(',');
        // cds = '6,238,910000000,129,19-12-21,00:04:39+00,19-12-21,00:04:41+00,0'
        const today = new Date();
        const report: DeliveredSMSReport = {
          deliveryTime: new Date(
            `${today.getFullYear()}${deliveryDate.slice(2)}T${deliveryHour.replace('+', '.000+')}:00`,
          ),
          firstOctet: +firstOctet,
          id: +id,
          phoneNumber: +phoneNumber,
          st: +st,
          submitTime: new Date(`${today.getFullYear()}${submitDate.slice(2)}T${submitHour.replace('+', '.000+')}:00`),
        };
        // report = { firstOctet: 6, id: 238, phoneNumber: 910000000, submitTime: "2019-12-21T00:04:39.000Z", deliveryTime: "2019-12-21T00:04:41.000Z", 0 }
        return report;
      }),
      takeWhile(({ st }) => st !== 0, true),
    );
  }

  private addTask(task: ModemTask) {
    this.taskQueue = [...this.taskQueue, task];
  }

  private generateTaskID() {
    this.taskCounter++;
    return this.taskCounter;
  }

  private nextTaskExecute() {
    if (this.currentTaskRunning) {
      return;
    }
    if (!this.taskQueue.length) {
      return;
    }
    this.currentTaskRunning = clone(this.taskQueue[0]);
    this.taskQueue = clone(this.taskQueue.slice(1));
    this.currentTaskRunning.fn();
  }

  private updateStatus(newStatus: Partial<ModemStatus>) {
    const handleError = (err: any) => {
      console.log('Modem error:', err ?? ModemError.UNDEFINED);
      this.error$.next(clone(err ?? ModemError.UNDEFINED));
    };

    newStatus.isErrored = !(typeof newStatus.lastError !== 'undefined');

    if (newStatus.isErrored) {
      handleError(newStatus.lastError);
    } else {
      // TODO: refactor later. This is always printed but it should be only when in debug mode
      const receivedData = convertInvisibleCharacters(newStatus.lastReceivedData);

      console.log('\r\n\r\n------------------modem says-------------------------');
      console.log(receivedData);
      console.log('\r\n');

      // verify modem answer, remove currentTaskRunning and start nextTaskExecute()
      if (this.currentTaskRunning) {
        if (newStatus.lastReceivedData?.includes(this.currentTaskRunning.expectedResult)) {
          this.currentTaskRunning.onResultFn(newStatus.lastReceivedData);
          this.currentTaskRunning = null;
          this.taskQueue.length && this.nextTaskExecute();
        }
        return;
      }
    }

    const previousModemStatus$ = this.status$.pipe(take(1));

    previousModemStatus$.subscribe(previousModemStatus => {
      this.status$.next({
        ...previousModemStatus,
        ...newStatus,
      });
    });
  }

  private sendCommand(command: string): void {
    this.serialPort.write(command, error =>
      this.updateStatus({ isErrored: true, lastError: error ? `${error}` : ModemError.UNDEFINED }),
    );
  }
}
