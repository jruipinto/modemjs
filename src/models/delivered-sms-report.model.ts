export interface DeliveredSMSReport {
    firstOctet: number;             /** <fo> - first octet of the message PDU */
    id: number;                     /** index position of the message on choosen memory (example: "SM" SIM) */
    phoneNumber: number;            /**  <mr> - message reference number */
    submitTime: Date;               /** <scts> - arrival time of the message to the SC */
    deliveryTime: Date;             /** <dt> - sending time of the message */
    st: number;                     /** <st> - message status as coded in the PDU */
}

