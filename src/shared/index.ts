import { ModemConfig, ModemStatus } from '../models';

const defaultModemInitCommands = [
  '\u241bAT',
  'AT+CMGF=1',
  'AT+CNMI=1,1,0,1,0',
  'AT+CNMI=2',
  'AT+CSMP=49,167,0,0',
  'AT+CPMS="SM","SM","SM"',
];

export const notNull = <T>(value: T | null): value is T => value !== null;

export const defaultModemConfig: ModemConfig = {
  portName: 'COM10',
  baudRate: 230400,
  pin: undefined,
  isSMSMode: true,
  shouldProvideExtendedErrorReports: false,
  isInDebugMode: false,
  initCommands: defaultModemInitCommands,
  msPause: 10000,
};

export enum ModemError {
  DISCONNECTED = 'Modem disconnected',
  UNDEFINED = 'Undefined error',
}

export const initialModemStatus: ModemStatus = {
  isConnected: false,
  isInDebugMode: false,
  isErrored: false,
  log: '',
  lastError: undefined,
  lastReceivedData: undefined,
};

export const convertInvisibleCharacters = (asciiString?: string): string => {
  if (!asciiString) return '';

  const invisibleAsciiCharacterList = new Map<string, string>([
    ['\r', '<CR>'],
    ['\n', '<LF>'],
    ['\x1b', '<ESC>'],
    ['\x1A', '<CTRL-Z>'],
  ]);

  const convertedString = Array.from(asciiString)
    .map(asciiCharacter => invisibleAsciiCharacterList.get(asciiCharacter) ?? asciiCharacter)
    .reduce((previousCharacter, currentCharacter) => previousCharacter + currentCharacter, '');

  return convertedString;
};