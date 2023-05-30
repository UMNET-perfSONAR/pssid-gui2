"use strict";
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./schedules.json', 'utf-8'));
console.log(data);
