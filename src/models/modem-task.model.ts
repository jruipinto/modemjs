export interface ModemTask {
    id: number;                                         /** index number of task  */
    description?: string;                               /** optional description of the task to help debug */
    fn: () => void;                                     /** function to be executed by this task */
    expectedResult: 'OK' | '+CMGS:' | '\r' | string;    /** expected answer from modem after executing function */
    onResultFn: (receivedData: string) => void;         /** function to be executed on receiving the modem answer for this task function */
}