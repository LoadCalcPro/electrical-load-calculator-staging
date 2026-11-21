const assert = require('node:assert/strict');
const {createSchedule, updateCircuit, totals} = require('../one-line/panel-schedule-model.js');
const base = createSchedule({designation:'LP-1',phases:3,rows:6});
assert.equal(base.circuits.length,6);
const edited = updateCircuit(base,1,{description:'Lighting',breakerAmps:20,phase:'A',connectedVA:1800,status:'active'});
assert.equal(base.circuits[0].connectedVA,0);
assert.deepEqual(totals(edited),{connectedVA:1800,byPhase:{A:1800,B:0,C:0},unassignedVA:0});
assert.throws(()=>updateCircuit(base,1,{connectedVA:-1}));
console.log('Panel schedule model tests passed');
