'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ui = require('../js/storefront.js');
const context = { window: {}, URL, TextEncoder };
vm.createContext(context);
for (const file of ['js/config.js','js/catalog-parser.js','js/search.js','js/order.js','assets/catalog.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const raw = context.window.KENO_CATALOG;
const catalog = context.window.KenoCatalogParser.validate(raw);
const clone = v => JSON.parse(JSON.stringify(v));
test('existing catalog validates and all plan prices survive validation', () => {
  assert.equal(catalog.services.length, raw.services.length);
  for (const s of raw.services) for (const p of s.plans || []) {
    assert.equal(catalog.services.find(x => x.id === s.id).plans.find(x => x.id === p.id).price, p.price);
  }
});
test('three payment methods retain exact existing account details', () => {
  assert.deepEqual(Array.from(catalog.paymentMethods, m => m.id), ['vodafone-cash','instapay','telda']);
  for (const p of catalog.paymentMethods) {
    const original = raw.paymentMethods.find(m => m.id === p.id);
    assert.equal(p.number, original.number);
    assert.equal(p.link, original.link);
    assert.equal(p.enabled, true);
  }
});
test('picks use distinct available services and actual cheapest available plans', () => {
  const picks = ui.selectPicks(catalog);
  assert.equal(picks.length, 4);
  assert.equal(new Set(picks.map(p => p.service.id)).size, 4);
  assert.ok(picks.some(p => p.service.category === 'ai'));
  for (const {service, plan} of picks) {
    assert.equal(plan.price, Math.min(...service.plans.filter(p => p.available).map(p => p.price)));
    assert.ok(service.visible && plan.available);
  }
});
test('price edits immediately flow into picks without copying prices into UI state', () => {
  const edited = clone(catalog);
  const pubg = edited.services.find(s => s.id === 'pubg');
  pubg.plans[0].price = 7.25;
  assert.equal(ui.selectPicks(edited).find(x => x.service.id === 'pubg').plan.price, 7.25);
});
test('hidden and unavailable services never become promoted offers', () => {
  const edited = clone(catalog);
  edited.services[0].visible = false;
  edited.services[1].available = false;
  edited.services[2].status = 'unavailable';
  const excluded = new Set(edited.services.slice(0,3).map(s => s.id));
  assert.ok(ui.selectPicks(edited, 100).every(p => !excluded.has(p.service.id)));
});
test('unavailable and invalid prices are excluded from cheapest plan', () => {
  assert.equal(ui.lowestPlan({plans:[{price:1,available:false},{price:0,available:true},{price:NaN,available:true},{price:6.5,available:true}]}).price, 6.5);
  assert.equal(ui.lowestPlan({plans:[]}), null);
});
test('empty catalog produces safe empty collections and picks', () => {
  assert.deepEqual(ui.selectPicks({services:[]}), []);
  assert.deepEqual(ui.collections({services:[],categories:[]}), []);
});
test('selectors do not mutate catalog ordering, prices or settings', () => {
  const before = JSON.stringify(catalog);
  ui.selectPicks(catalog); ui.collections(catalog);
  assert.equal(JSON.stringify(catalog), before);
});
test('collection counts respect visibility and custom categories', () => {
  const source = {categories:[{id:'new',name:'جديد'},{id:'empty',name:'فارغ'}],services:[{category:'new',visible:true},{category:'new',visible:false}]};
  assert.deepEqual(ui.collections(source), [{id:'new',name:'جديد',count:1}]);
});
test('Arabic and English search remain functional', () => {
  const search = context.window.KenoSearch;
  assert.ok(search.filter(catalog, {query:'ببجي'}).some(s => s.id === 'pubg'));
  assert.ok(search.filter(catalog, {query:'ChatGPT'}).some(s => s.category === 'ai'));
});
test('WhatsApp order keeps service, current plan price and each selected payment method', () => {
  const service = catalog.services.find(s => s.id === 'pubg');
  const plan = service.plans[0];
  for (const method of catalog.paymentMethods) {
    const text = context.window.KenoOrder.buildOrderText(catalog, service, plan, {paymentMethod:method,orderCode:'KENO-TEST',customerAccount:'123456789'});
    assert.ok(text.includes(method.name)); assert.ok(text.includes(method.number));
    assert.ok(text.includes(plan.label)); assert.ok(text.includes(String(plan.price)));
    assert.ok(!text.includes('تم التحويل بالفعل'));
  }
});
test('catalog import/export preserves all three payment methods and plan prices', () => {
  const serialized = context.window.KenoCatalogParser.serialize(catalog);
  const target = {window:{}}; vm.createContext(target); vm.runInContext(serialized,target);
  assert.equal(target.window.KENO_CATALOG.paymentMethods.length,3);
  assert.equal(JSON.stringify(target.window.KENO_CATALOG.services.map(s => s.plans.map(p=>p.price))), JSON.stringify(catalog.services.map(s => s.plans.map(p=>p.price))));
});
