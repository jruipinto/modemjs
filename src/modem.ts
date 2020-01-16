import { clone } from 'ramda';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { concatMap, filter, map, take, takeWhile, tap } from 'rxjs/operators';
import SerialPort from 'serialport';
import { DeliveredSMSReport, ModemConfig, ModemStatus, ModemTask, ReceivedSMS, SMS } from './models';
// tslint:disable-next-line: no-var-requires
const Readline = require('@serialport/parser-readline');

const notNull = <T>(value: T | null): value is T => value !== null;

const defaultModemInitCommands = [
  '\u241bAT',
  'AT+CMGF=1',
  'AT+CNMI=1,1,0,1,0',
  'AT+CNMI=2',
  'AT+CSMP=49,167,0,0',
  'AT+CPMS="SM","SM","SM"',
];

export class Modem {
  public log$: Subject<string> = new Subject();
  public status$: BehaviorSubject<any> = new BehaviorSubject({
    connected: false,
    debugMode: false,
    error: false,
  });

  private currentTask: ModemTask | null = null;
  private taskStack: ModemTask[] = [];
  private tasksCounter = 0;

  private port: SerialPort;
  private msPause: number;
  private initCommands: string[];

  private data$: Subject<string> = new Subject();
  private error$: Subject<string> = new Subject();

  constructor(modemCfg: ModemConfig, errorCallback?: (err: any) => void) {
    this.port = new SerialPort(modemCfg.port, { baudRate: modemCfg.baudRate, autoOpen: false });
    this.updateStatus({ debugMode: modemCfg.debugMode ? true : false });
    this.msPause = modemCfg.msPause;
    this.initCommands = modemCfg.initCommands;

    this.port.on('close', err => {
      if (err.disconected === true) {
        this.updateStatus({ connected: false, error: true });
        this.error$.next('Error: Modem disconected');
      }
    });

    this.port.pipe(new Readline({ delimiter: '>' })).on('data', () => {
      this.currentTask = null;
      this.nextTaskExecute();
    });
    this.port.pipe(new Readline({ delimiter: '\r\n' })).on('data', (receivedData: string) => {
      if (receivedData) {
        this.data$.next(clone(receivedData));
      }
    });
    this.data$
      .pipe(
        // logs receivedData from modem
        tap(receivedData => this.log$.next(receivedData)),

        tap(receivedData => {
          if (receivedData.includes('ERROR')) {
            this.error$.next(receivedData);
          }
        }),

        tap(receivedData => {
          this.status$.subscribe(status => {
            if (status.debugMode) {
              // tslint:disable-next-line: no-console
              console.log('\r\n\r\n------------------modem says-------------------------');
              // tslint:disable-next-line: no-console
              console.log(
                receivedData
                  .replace('\r', '<CR>')
                  .replace('\n', '<LF>')
                  .replace('\x1b', '<ESC>')
                  .replace('\x1A', '<CTRL-Z>'),
              );
              // tslint:disable-next-line: no-console
              console.log('\r\n');
            }
          });
        }),

        // verify modem answer, remove currentTask and start nextTaskExecute()
        tap(receivedData => {
          if (!this.currentTask && !this.taskStack) {
            return;
          }
          if (!this.currentTask && this.taskStack) {
            return;
          }
          if (this.currentTask && !this.taskStack) {
            if (receivedData.includes(this.currentTask.expectedResult)) {
              this.currentTask.onResultFn(receivedData);
              this.currentTask = null;
            }
            return;
          }
          if (this.currentTask && this.taskStack) {
            if (receivedData.includes(this.currentTask.expectedResult)) {
              this.currentTask.onResultFn(receivedData);
              this.currentTask = null;
              this.nextTaskExecute();
            }
            return;
          }
        }),
      )
      .subscribe();

    this.port.on('error', this.handleError);
    this.error$
      .pipe(
        tap(err => {
          this.updateStatus({ error: true });
          // tslint:disable-next-line: no-console
          console.log('Modem error:', err);
        }),
        // logs err
        tap(err => this.log$.next(err)),
      )
      .subscribe();

    this.port.on('open', () => {
      this.updateStatus({ connected: true });
    });

    // init modem
    if (typeof modemCfg.autoOpen === 'undefined' || modemCfg.autoOpen === true) {
      this.init(errorCallback);
    }
  }

  public init(errorCallback?: (err: any) => void) {
    const modemInitComands = this.initCommands || defaultModemInitCommands;
    this.port.open(this.handleError);

    // init modem
    modemInitComands.forEach(command => {
      this.addTask({
        description: command,
        expectedResult: 'OK',
        fn: () => this.port.write(`${command}\r`, this.handleError),
        id: this.generateTaskID(),
        onResultFn: x => null,
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
            description: `AT+CMGR=${+data.split(',')[1]}`,
            expectedResult: '+CMGR:',
            fn: () => this.port.write(`AT+CMGR=${+data.split(',')[1]}\r`, this.handleError),
            id: this.generateTaskID(),
            onResultFn: x => null,
          });
          this.nextTaskExecute();
        }
        if (data.includes('+CMGR:')) {
          readingSMS = true;
        }
      }),
      filter(data => readingSMS),
      tap(data => {
        if (data.includes('OK')) {
          readingSMS = false;
        }
      }),
      map(data => {
        if (data.includes('OK')) {
          newSMS.text = newSMS.text ? newSMS.text.trim() : '';
          return newSMS;
        }
        if (data.includes('+CMGR:')) {
          const today = new Date();
          const cmgr = data
            .replace(/\+CMGR\:\ /gi, '')
            .replace(/\"/gi, '')
            .replace(/\//gi, '-')
            .split(',');
          newSMS.phoneNumber = +cmgr[1].replace('+', '00').replace(/00351/, '');
          newSMS.submitTime = new Date(
            today.getFullYear() + cmgr[3].slice(2) + 'T' + cmgr[4].replace('+', '.000+') + ':00',
          );
          return null;
        }
        newSMS.text = newSMS.text ? newSMS.text + data : data;
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
          fn: () => this.port.write(`AT+CMGD=${id}\r`, this.handleError),
          id: this.generateTaskID(),
          onResultFn: x => null,
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
          this.port.write(`AT+CMGS="${phoneNumber}"\r`, this.handleError);
        }, this.msPause);
      },
      id: this.generateTaskID(),
      onResultFn: x => null,
    });
    this.addTask({
      description: `${text}\x1A`,
      expectedResult: '+CMGS:',
      fn: () => this.port.write(`${text}\x1A`, this.handleError),
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
        cmgsNumber = parseInt(data.split(':')[1], 10);
      }),
      concatMap(() => this.data$),
      filter(data => data.includes('+CDS:')),
      filter(data => parseInt(data.split(',')[1], 10) === cmgsNumber),

      // convert +CDS string to DeliveredSMSReport object
      map(data => {
        // data = '+CDS: 6,238,"910000000",129,"19/12/21,00:04:39+00","19/12/21,00:04:41+00",0'
        const cds = data
          .replace(/\+CDS\:\ /gi, '')
          .replace(/\"/gi, '')
          .replace(/\//gi, '-')
          .split(',');
        // cds = '6,238,910000000,129,19-12-21,00:04:39+00,19-12-21,00:04:41+00,0'
        const today = new Date();
        const report: DeliveredSMSReport = {
          deliveryTime: new Date(today.getFullYear() + cds[6].slice(2) + 'T' + cds[7].replace('+', '.000+') + ':00'),
          firstOctet: +cds[0],
          id: +cds[1],
          phoneNumber: +cds[2],
          st: +cds[8],
          submitTime: new Date(today.getFullYear() + cds[4].slice(2) + 'T' + cds[5].replace('+', '.000+') + ':00'),
        };
        // report = { firstOctet: 6, id: 238, phoneNumber: 910000000, submitTime: "2019-12-21T00:04:39.000Z", deliveryTime: "2019-12-21T00:04:41.000Z", 0 }
        return report;
      }),
      takeWhile(({ st }) => st !== 0, true),
    );
  }

  private addTask(task: ModemTask) {
    this.taskStack = [...this.taskStack, task];
  }

  private generateTaskID() {
    this.tasksCounter = this.tasksCounter + 1;
    return this.tasksCounter;
  }
  private handleError(err: any) {
    if (err) {
      this.error$.next(clone(err));
    }
  }

  private nextTaskExecute() {
    if (this.currentTask) {
      return;
    }
    if (!this.taskStack[0]) {
      return;
    }
    this.currentTask = clone(this.taskStack[0]);
    this.taskStack = clone(this.taskStack.slice(1));
    this.currentTask.fn();
  }

  private updateStatus(patch: Partial<ModemStatus>) {
    this.status$.pipe(take(1)).subscribe(status => {
      this.status$.next({ ...status, ...patch });
    });
  }
}
