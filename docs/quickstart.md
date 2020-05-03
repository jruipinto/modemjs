---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
---

## Install

```npm i modemjs```

## Usage

Example of minimal code to receive and send SMS with your node app / bot 🤖

```javascript
// import { Modem } from 'modemjs'; // if you use typescript with nodejs
const Modem = require('modemjs').Modem; // if you prefer to use the standard nodejs style javascript

const modem = new Modem({
    port: 'COM10', // change this 
    baudRate: 230400, // change this
    initCommands: [
        '\u241bAT', 'AT+CMGF=1', 'AT+CNMI=1,1,0,1,0',
        'AT+CNMI=2', 'AT+CSMP=49,167,0,0', 'AT+CPMS=\"SM\",\"SM\",\"SM\"'
    ],
    msPause: 10000
});
// this config is necessary but will be simplified soon, in the next updates of modem.js
// PS: the msPause of 10000ms is recommended by now to avoid
//  missed delivery reports but you are free to try smaller periods

modem.onReceivedSMS().subscribe(sms => console.log('SMS Received:', sms));
// this observable will log every SMS that your modem receives

modem.sendSMS({ phoneNumber: 910000000, text: 'Hi! I\'m a robot!' })
    .subscribe(data => console.log('Message delivered! Here is the report:', data));
// this funtion will send 'Hi! I\'m a robot!' to '910000000' as a text message / SMS and when
//  the message gets delivered to the recipient, the delivery report will be logged

```