---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
---

## Install Modemjs

```
npm i modemjs
```

## Import Modem to your app and use it

```
import { Modem } from "modemjs";

const modem = new Modem({
  port: "COM10",
  baudRate: 230400,
  pin: null,
  smsMode: true,
  extendedErrorReports: true,
  debugMode: true,
  initCommands: [
    "\u241bAT",
    "AT+CMGF=1",
    "AT+CNMI=1,1,0,1,0",
    "AT+CNMI=2",
    "AT+CSMP=49,167,0,0",
    'AT+CPMS="SM","SM","SM"'
  ],
  msPause: 10000
});

modem
  .sendSMS({ phoneNumber: 910000000, text: `Hi! I'm a node bot!` })
  .subscribe(data => {
    console.log("Delivery Report:", data);
  });
```