const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/ledger-core.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const core = context.window.FarmLedgerCore;

const validErrors = core.validateTransaction({
  farmId:'farm-1', author:'user@example.com', type:'purchase', animalType:'goat',
  amount:50000, description:'Bought goats', date:'2026-09-30', animalCount:3
});
assert.equal(validErrors.length, 0, `unexpected validation errors: ${validErrors.join(', ')}`);

assert.ok(core.validateTransaction({
  farmId:'farm-1', author:'user@example.com', type:'hacked', animalType:'goat',
  amount:50, description:'x', date:'2026-09-30', animalCount:1
}).includes('invalid transaction type'));

assert.ok(core.validateTransaction({
  farmId:'farm-1', author:'user@example.com', type:'death', animalType:'goat',
  amount:0, description:'Death', date:'2026-09-30', animalCount:0
}).includes('animalCount must be a positive integer for livestock events'));

assert.ok(core.validateTransaction({
  farmId:'farm-1', author:'user@example.com', type:'purchase', animalType:'goat',
  amount:50, description:'x', date:'2026-02-30', animalCount:1
}).includes('invalid date'));

const inventory = [
  {id:'g1', animalType:'goat', custodyState:'on_farm'},
  {id:'g2', animalType:'goat', custodyState:'on_farm'}
];
const failed = core.applyInventoryEvent(inventory, {id:'d1', type:'death', animalType:'goat', animalCount:3, date:'2026-09-30'});
assert.equal(failed.ok, false);
assert.ok(failed.errors.includes('death exceeds available on-farm inventory'));

const metrics = core.calculateMetrics([
  {type:'purchase', animalType:'goat', animalCount:5, amount:100000},
  {type:'death', animalType:'goat', animalCount:2, amount:30000},
  {type:'feed', animalType:'goat', animalCount:0, amount:5000}
]);
assert.equal(metrics.animalTotals.goat, 3);
assert.equal(metrics.lossValue, 30000);
assert.equal(metrics.spent, 5000);

console.log('ledger-core tests passed');
