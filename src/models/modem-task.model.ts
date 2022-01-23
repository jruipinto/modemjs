/**
 * Task to be executed by modem.
 * A task holds all info about what needs to be done, i.e.
 * description, the expected result, how to define if the
 * task is finished and what to do on finish
 */
export interface ModemTask {
  /** index number of task  */
  id: number;
  /** optional description of the task to help debug */
  description?: string;
  /** function to be executed by this task */
  fn: () => void;
  /** expected answer from modem after executing function */
  expectedResult: 'OK' | '+CMGS:' | '\r' | string;
  /** function to be executed on receiving the expectedResult for this task */
  onResultFn: (receivedData: string) => void;
}
