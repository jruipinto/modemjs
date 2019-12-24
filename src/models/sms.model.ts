export interface SMS {
    phoneNumber: number | null;     /** The subscriber number of the person who sent the message */
    text: string;                   /** The actual message data in plain text */
}
