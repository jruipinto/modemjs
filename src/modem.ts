import { Subject, BehaviorSubject, Observable } from 'rxjs';
import { tap, filter, concatMap, map, takeWhile } from 'rxjs/operators';
import { clone } from 'ramda';
import SerialPort from 'serialport';
import { ModemTask, ModemConfig, SMS, DeliveredSMSReport, ReceivedSMS } from './models';
const Readline = require('@serialport/parser-readline');

const handleError = (err: any) => {
    if (err) {
        console.log(err.message);
    }
};
const notNull = <T>(value: T | null): value is T => value !== null;

export class Modem {

    private taskStack: ModemTask[] = [];
    private tasksCounter = 0;
    private taskInExecution: ModemTask | null = null;

    private port: SerialPort;
    private status = {
        error: false,
        debugMode: false
    }
    private msPause: number;

    private data$: Subject<string> = new Subject();
    private error$: Subject<string> = new Subject();

    constructor(modemCfg: ModemConfig) {
        this.port = new SerialPort(modemCfg.port, { baudRate: modemCfg.baudRate }, handleError);
        this.status.debugMode = modemCfg.debugMode ? true : false;
        this.msPause = modemCfg.msPause;

        this.port.on('error', err => {
            if (err) {
                this.error$.next(clone(err));
            }
        });
        this.error$.pipe(
            tap(err => {
                this.status.error = true;
                console.log('Modem error:', err);
            })
        ).subscribe();

        this.port
            .pipe(new Readline({ delimiter: '>' }))
            .on('data', () => {
                this.taskInExecution = null;
                this.nextTask();
            });
        this.port
            .pipe(new Readline({ delimiter: '\r\n' }))
            .on('data', (receivedData: string) => {
                if (receivedData) {
                    this.data$.next(clone(receivedData));
                }
            });
        this.data$.pipe(
            tap(receivedData => {
                if (receivedData.includes('ERROR')) {
                    this.error$.next(receivedData);
                }
            }),
            tap(receivedData => {
                if (this.status.debugMode) {
                    console.log('\r\n\r\n------------------modem says-------------------------');
                    console.log(
                        receivedData
                            .replace('\r', '<CR>')
                            .replace('\n', '<LF>')
                            .replace('\x1b', '<ESC>')
                            .replace('\x1A', '<CTRL-Z>')
                    );
                    console.log('\r\n');
                }
            }),
            // verify modem answer, remove taskInExecution and start nextTask()
            tap(receivedData => {
                if (!this.taskInExecution && !this.taskStack) {
                    return;
                }
                if (!this.taskInExecution && this.taskStack) {
                    return;
                }
                if (this.taskInExecution && !this.taskStack) {
                    if (receivedData.includes(this.taskInExecution.expectedResult)) {
                        this.taskInExecution.onResultFn(receivedData);
                        this.taskInExecution = null;
                    }
                    return;
                }
                if (this.taskInExecution && this.taskStack) {
                    if (receivedData.includes(this.taskInExecution.expectedResult)) {
                        this.taskInExecution.onResultFn(receivedData);
                        this.taskInExecution = null;
                        this.nextTask();
                    }
                    return;
                }
            })
        ).subscribe();

        // init modem
        modemCfg.initCommands.forEach(command => {
            this.addTask({
                id: this.generateTaskID(),
                description: command,
                fn: () => this.port.write(`${command}\r`, handleError),
                expectedResult: 'OK',
                onResultFn: (x) => { }
            });
        });

        this.nextTask();

    }

    private addTask(task: ModemTask) {
        this.taskStack = [...this.taskStack, task];
    }

    private generateTaskID() {
        this.tasksCounter = this.tasksCounter + 1;
        return this.tasksCounter;

    }

    private nextTask() {
        if (this.taskInExecution) {
            return;
        }
        if (!this.taskStack[0]) {
            return
        }
        this.taskInExecution = clone(this.taskStack[0]);
        this.taskStack = clone(this.taskStack.slice(1));
        this.taskInExecution.fn();
    }

    sendSMS({ phoneNumber, text }: SMS): Observable<DeliveredSMSReport> {
        const smsInfo$: BehaviorSubject<any> = new BehaviorSubject(null);
        let cmgsNumber: number;

        this.addTask({
            id: this.generateTaskID(),
            description: `AT+CMGS="${phoneNumber}"`,
            fn: () => {
                setTimeout(() => {
                    this.port.write(`AT+CMGS="${phoneNumber}"\r`, handleError);
                }, this.msPause);
            },
            expectedResult: 'notImportant',
            onResultFn: (x) => { }
        });
        this.addTask({
            id: this.generateTaskID(),
            description: `${text}\x1A`,
            fn: () => this.port.write(`${text}\x1A`, handleError),
            expectedResult: '+CMGS:',
            onResultFn: (receivedData) => {
                smsInfo$.next(receivedData);
            }
        });

        this.nextTask();

        return smsInfo$.pipe(
            filter(notNull),
            filter(data => data.includes('+CMGS:')),
            tap(data => { cmgsNumber = parseInt(data.split(':')[1], 10); }),
            concatMap(() => this.data$),
            filter(data => data.includes('+CDS:')),
            filter(data => parseInt(data.split(',')[1]) === cmgsNumber),

            // convert +CDS string to DeliveredSMSReport object
            map(data => {
                // data = '+CDS: 6,238,"910138725",129,"19/12/21,00:04:39+00","19/12/21,00:04:41+00",0'
                const cds = data
                    .replace(/\+CDS\:\ /gi, "")
                    .replace(/\"/gi, "")
                    .replace(/\//gi, "-")
                    .split(",");
                // cds = '6,238,910138725,129,19-12-21,00:04:39+00,19-12-21,00:04:41+00,0'
                const today = new Date;
                const report: DeliveredSMSReport = {
                    firstOctet: ~~cds[0],
                    id: ~~cds[1],
                    phoneNumber: ~~cds[2],
                    submitTime: new Date(today.getFullYear() + cds[4].slice(2) + 'T' + cds[5].replace('+', '.000+') + ':00'),
                    deliveryTime: new Date(today.getFullYear() + cds[6].slice(2) + 'T' + cds[7].replace('+', '.000+') + ':00'),
                    st: ~~cds[8]
                };
                // report = { firstOctet: 6, id: 238, phoneNumber: 910138725, submitTime: "2019-12-21T00:04:39.000Z", deliveryTime: "2019-12-21T00:04:41.000Z", 0 }
                return report;
            }),
            takeWhile(({ st }) => st !== 0, true)
        );
    }

    onReceivedSMS(): Observable<ReceivedSMS> {
        let readingSMS: boolean = false;
        let newSMS: ReceivedSMS = {
            id: 0,
            phoneNumber: null,
            submitTime: null,
            text: ''
        };
        return this.data$.pipe(
            tap(data => {
                if (data.includes('+CMTI:')) {
                    newSMS.id = ~~data.split(',')[1]
                    this.addTask({
                        id: this.generateTaskID(),
                        description: `AT+CMGR=${~~data.split(',')[1]}`,
                        fn: () => this.port.write(`AT+CMGR=${~~data.split(',')[1]}\r`, handleError),
                        expectedResult: '+CMGR:',
                        onResultFn: (x) => { }
                    });
                    this.nextTask();
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
                    const today = new Date;
                    const cmgr = data
                        .replace(/\+CMGR\:\ /gi, "")
                        .replace(/\"/gi, "")
                        .replace(/\//gi, "-")
                        .split(",");;
                    newSMS.phoneNumber = ~~cmgr[1].replace('+', '00').replace(/00351/, '');
                    newSMS.submitTime = new Date(today.getFullYear() + cmgr[3].slice(2) + 'T' + cmgr[4].replace('+', '.000+') + ':00');
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
                    text: ''
                }
            }),
            tap(({ id }) => {
                this.addTask({
                    id: this.generateTaskID(),
                    description: `AT+CMGD=${id}`,
                    fn: () => this.port.write(`AT+CMGD=${id}\r`, handleError),
                    expectedResult: 'OK',
                    onResultFn: (x) => { }
                });
                this.nextTask();
            })
        );
    }

}