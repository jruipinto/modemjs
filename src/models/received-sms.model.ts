import { SMS } from './sms.model';

export interface ReceivedSMS extends SMS {
    id: number;                     /** id position in phone memory or SIM memory */
    submitTime: Date | null;        /** <scts> - arrival time of the message to the SC */
}
