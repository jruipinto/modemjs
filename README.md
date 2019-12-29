<img src="https://github.com/jruipinto/modemjs/blob/master/docs/img/modemjs_logo_gray.svg" alt="Logo" width="60"/>



# Modem.js

NPM package to simplify sending and receiving SMS with a GSM Modem on Node.js over serialport.

Check the [documentation site](https://jruipinto.github.io/modemjs/) to learn more.

(PS: Modem.js and its respective [documentation](https://jruipinto.github.io/modemjs/) is still under active development until mids of January 2020)

### Introduction

**Modem.js** born from the need of a node.js library that would help me abstract the communication with a GSM Modem to handle the sending and reception of SMS.

Before starting the development of this package I searched NPM (node package manager) and didn't find any package simple enough that would fit my needs so I got to work and Modem.js born.

**This package is tested with an android phone as GSM Modem** (Samsung GT-S6312 with android version: 4.1.2) but other Modems or android phones may work, very likely.

Later, I may test Modem.js with other phones / gsm modems and make a list of supported / tested equipments (you may contribute too 😁).

### Skills needed

- [Node.js](https://nodejs.org/dist/latest-v12.x/docs/api/)
- [RXJS](https://rxjs-dev.firebaseapp.com)

### Prerequisites

##### Mandatory

- [NodeJS v12+](https://nodejs.org/en/download/) installed (earlier versions may work but weren't tested)
- GSM Modem connected to serialport (it may be a virtual com port, instead of the old RS232, you know... 😁)

(PS: You may check supported environments [here](https://jruipinto.github.io/modemjs/docs/supported-environments))

##### Optional

- Typescript v3+ (earlier versions may work but weren't tested)
- VSCode

(Typescript + VSCode will help you understand and implement the Modem.js library more easily)

### Quickstart

[quickstart docs](https://jruipinto.github.io/modemjs/docs/quickstart)

##### Install

```npm i modemjs```

##### Usage

Example of minimal code to receive and send SMS with your node app / bot 🤖

```javascript
// this example app is actually tested by me. So it MUST work if 
//  you use a valid phone number as recipient and the same gsm modem as me


// import { Modem } from 'modemjs'; // if you use typescript with nodejs
const Modem = require('modemjs').Modem; // if you prefer to use the standard nodejs' style javascript

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
//  missed delivery reports but are free to try smaller periods

modem.onReceivedSMS().subscribe(sms => console.log('SMS Received:', sms));
// this observable will log every SMS that your modem receives

modem.sendSMS({ phoneNumber: 910000000, text: 'Hi! I\'m a robot!' })
    .subscribe(data => console.log('Message delivered! Here is the report:', data));
// this funtion will send 'Hi! I\'m a robot!' to '910000000' as a text message / SMS and when
//  the message gets delivered to the recipient, the delivery report will be logged

```
