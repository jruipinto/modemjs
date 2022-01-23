/** The Modem settings */
export interface ModemConfig {
  /** Modem's serialport (example COM1 or dev/ttys0) */
  portName: string;
  /** Modem serialport baudrate */
  baudRate: number;
  /** not implemented yet */
  pin?: number;
  /** not implemented yet (true = text; false = pdu) default is true */
  isSMSMode?: boolean;
  /** not implemented yet */
  shouldProvideExtendedErrorReports?: boolean;
  /** logs every message from modem for debugging / developping purposes */
  isInDebugMode?: boolean;
  /** AT commands to configure modem before starting */
  initCommands: string[];
  /** number of mili-seconds that program should wait before sending SMS to avoid losing status reports of earlier SMS's */
  msPause: number;
  /** defines if modem port should be open automatically on class declaration */
  shouldAutoOpen?: boolean;
}
