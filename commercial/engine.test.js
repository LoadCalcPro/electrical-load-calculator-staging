const assert = require('assert');
const Engine = require('./engine.js');

const tableCases = [
  [200000, 'all-electric', 160000],
  [325000, 'all-electric', 172500],
  [348000, 'all-electric', 184000],
  [800000, 'all-electric', 410000],
  [900000, 'all-electric', 460000],
  [200000, 'not-all-electric', 200000],
  [325000, 'not-all-electric', 262500],
  [348000, 'not-all-electric', 272850],
  [800000, 'not-all-electric', 476250],
  [900000, 'not-all-electric', 496250]
];

for (const [connected, type, expected] of tableCases) {
  assert.strictEqual(
    Engine.restaurantDemand(connected, type).demand,
    expected,
    `${type} at ${connected} VA`
  );
}

const restaurant = {
  method: 'restaurant22088',
  restaurantType: 'all-electric',
  restaurantTotalLoadServed: true,
  occupancy: 'restaurant',
  sqft: 10000,
  actualLighting: '',
  hotelAllLighting: false,
  occupancyAreas: [],
  showWindowFt: '',
  trackFt: '',
  signQty: '',
  signRequired: false,
  receptacles: 10,
  other: [],
  kitchen: [{label: 'Range', qty: 1, va: 50000}],
  motors: [],
  continuous: [],
  special: [],
  cooling: 20000,
  heating: 30000,
  includedMotor: '',
  phase: '3',
  voltage: '208'
};

const result = Engine.calculate(restaurant);
assert.deepStrictEqual(result.errors, []);
assert.strictEqual(result.restaurantConnected, 116800);
assert.strictEqual(result.total, 93440);
assert.strictEqual(result.hvac, 50000);

const ineligible = Engine.calculate({
  ...restaurant,
  restaurantType: '',
  restaurantTotalLoadServed: false
});
assert(ineligible.errors.some(error => error.includes('all electric or not all electric')));
assert(ineligible.errors.some(error => error.includes('total load of the new restaurant')));

console.log('Commercial restaurant NEC 220.88 tests passed.');
