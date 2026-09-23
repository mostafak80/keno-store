const fs = require('fs');
const vm = require('vm');

const context = { window: {}, console: console, URL: URL, TextEncoder: TextEncoder, TextDecoder: TextDecoder };
context.window.URL = URL;
vm.createContext(context);

// Load catalog-parser.js
const parserCode = fs.readFileSync('js/catalog-parser.js', 'utf8');
vm.runInContext(parserCode, context);

// Load catalog.js
const catalogCode = fs.readFileSync('assets/catalog.js', 'utf8');
vm.runInContext(catalogCode, context);

try {
  const catalog = context.window.KENO_CATALOG;
  const parser = context.window.KenoCatalogParser;
  console.log('Validating catalog data with KenoCatalogParser...');
  const validated = parser.validate(catalog);
  console.log('✅ Catalog validation PASSED!');
  console.log(`- Services: ${validated.services.length}`);
  console.log(`- Categories: ${validated.categories.length}`);
  console.log(`- Payment Methods: ${(validated.paymentMethods || []).length}`);
  console.log(`- Store name: ${validated.settings.storeName}`);
} catch (err) {
  console.error('❌ Catalog validation FAILED:', err.message);
  process.exit(1);
}

