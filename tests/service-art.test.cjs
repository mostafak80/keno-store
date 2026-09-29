const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {window: {}, URL, TextEncoder};
vm.createContext(context);
for (const file of ['js/config.js', 'js/image.js', 'js/service-art.js', 'js/catalog-parser.js', 'assets/catalog.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
}
const {KenoServiceArt: art, KenoCatalogParser: parser, KENO_CATALOG: raw} = context.window;
const clone = value => JSON.parse(JSON.stringify(value));
test('every catalog service has real mobile and desktop WebP artwork', () => {
  for (const service of raw.services) for (const size of ['mobile', 'desktop']) {
    const file = fs.readFileSync(path.join(root, art[size](service.id)));
    assert.equal(file.toString('ascii', 0, 4), 'RIFF', service.id);
    assert.equal(file.toString('ascii', 8, 12), 'WEBP', service.id);
    assert(file.length < (size === 'mobile' ? 90000 : 250000), 'image budget: ' + service.id);
  }
});
test('catalog defaults include the full image collection without extra wordmarks', () => {
  const catalog = parser.validate(clone(raw));
  for (const service of catalog.services) {
    assert.equal(service.image, art.desktop(service.id));
    assert.equal(service.mobileImage, art.mobile(service.id));
    assert.equal(service.mobileShowWordmark, false);
  }
});
test('previous generated art saved by admin upgrades to the new collection', () => {
  const input = clone(raw), service = input.services[0];
  service.image = `assets/services-v1/${service.id}-desktop.webp`;
  service.mobileImage = `./assets/services-v1/${service.id}.webp`;
  const saved = parser.validate(input).services[0];
  assert.equal(saved.image, art.desktop(service.id));
  assert.equal(saved.mobileImage, art.mobile(service.id));
  assert.equal(saved.mobileShowWordmark, false);
});
test('custom admin images, explicit wordmark settings and unknown services are preserved', () => {
  const input = clone(raw), service = input.services[0];
  service.image = 'https://example.com/custom.webp';
  service.mobileImage = 'https://example.com/phone.webp';
  service.mobileShowWordmark = true;
  const saved = parser.validate(input).services[0];
  assert.equal(saved.image, service.image);
  assert.equal(saved.mobileImage, service.mobileImage);
  assert.equal(saved.mobileShowWordmark, true);
  assert.equal(art.desktop('new-service'), '');
  assert.equal(art.upgrade('assets/services-v1/netflix.webp', 'pubg'), 'assets/services-v1/netflix.webp');
});
