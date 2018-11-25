bluetooth-spec-gatt
======

[![NPM](https://nodei.co/npm/bluetooth-spec-gatt.png)](https://nodei.co/npm/bluetooth-spec-gatt/)

Bluetooth UUIDs from GATT specifications,
gathered from bluetooth.org

```js
var gatt = require('bluetooth-spec-gatt');

// getting temperature characteristic
gatt.uuid.characteristic.temperature;

{
	"title": "Temperature",
	"code": "temperature",
	"id": "0x2A6E",
	"fields": [
		{
			"name": "Temperature",
			"informativetext": "Unit is in degrees Celsius with a resolution of 0.01 degrees Celsius",
			"requirement": "Mandatory",
			"format": "sint16",
			"unit": "thermodynamic_temperature.degree_celsius",
			"decimalexponent": "-2"
		}
	]
}

// how the unit looks like
gatt.uuid.unit["thermodynamic_temperature.degree_celsius"];

// how about short UUID?
var ref = gatt.uuid.shortUUID["0x2A6E"];
ref.scope; // characteristic
ref.code;  // temperature

gatt.uuid[ref.scope][ref.code];

```

Complex characteristics such as `Enumeration` and `Bitfield` is also parsed.

Fields such as `Abstract`, `Summary`, `Example` and `Notes` not parsed.

Services lacks characteristics and descriptors.

`uuid.js` is generated, rebuild it with `npm run fetch-uuids`