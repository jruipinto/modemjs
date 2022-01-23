export interface ModemStatus {
  /** Indicates if modem is connected */
  isConnected: boolean;
  /**
   * Indicates if modem is in running in debugMode,
   * which allows the dev to access full logs of
   * communication and other development helping features
   */
  isInDebugMode: boolean;
  /** Indicates if modem malfunction detected */
  isErrored: boolean;
  /**
   * Contains a log of all data going IN & OUT
   * of the modem, error messages and other info
   * which was printed to de console
   */
  log: string;
  /** Holds last error that modem thrown */
  lastError?: string;
  /** Holds last data streamed on data$ observable */
  lastReceivedData?: string;
}
