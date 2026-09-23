const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx={window:{},URL,TextEncoder};vm.createContext(ctx);
for(const file of ['js/config.js','js/catalog-parser.js','js/order.js','assets/catalog.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const parser=ctx.window.KenoCatalogParser,base=ctx.window.KENO_CATALOG,copy=()=>JSON.parse(JSON.stringify(base));
test('requirements and media survive serialize/parse, not inferred from game category',()=>{
 const data=copy(),f=data.services[0].fulfillment;f.fields=[{id:'email',type:'email',label:'بريد التنفيذ',required:true,hint:'البريد الفعلي',helpImage:'https://example.com/help.png',helpAlt:'مثال البريد'}];f.audio=['https://example.com/step.mp3','',''];
 const out=parser.parse(parser.serialize(data)).services[0].fulfillment;assert.equal(out.fields[0].type,'email');assert.equal(out.fields[0].helpImage,f.fields[0].helpImage);assert.equal(out.audio[0],f.audio[0]);
});
test('legacy game has no automatic account or password fields',()=>{
 const data=copy();delete data.services[0].fulfillment;const f=parser.validate(data).services[0].fulfillment;assert.ok(f.fields.every(x=>x.type!=='password'));assert.equal(f.fields[0].required,false);
});
test('Korean PUBG follows original account fulfillment notes, not ID inference',()=>{
 const s=parser.validate(base).services.find(s=>s.id==='pubg-korea');assert.ok(s.fulfillment.fields.every(f=>f.type!=='id'));assert.match(s.fulfillment.securityNote,/الحساب/);
});
test('shared account subscription does not ask for personal credentials',()=>{
 const s=parser.validate(base).services.find(s=>s.id==='chatgpt');assert.equal(s.fulfillment.fields.length,0);
});
for(const url of ['javascript:alert(1)','data:image/svg+xml;base64,AA==','http://example.com/a.png','assets/../secret.png','https://user:secret@example.com/a.png'])test('reject unsafe help media '+url,()=>{const data=copy();data.services[0].fulfillment.fields[0].helpImage=url;assert.throws(()=>parser.validate(data));});
test('duplicate field identifiers and unsupported types cannot enter catalog',()=>{const d=copy(),f=d.services[0].fulfillment.fields;f.push({...f[0]});assert.throws(()=>parser.validate(d));f.pop();f[0].type='script';assert.throws(()=>parser.validate(d));});
test('password execution note must explicitly describe password use',()=>{const d=copy();d.services[0].fulfillment.fields[0].type='password';d.services[0].fulfillment.securityNote='معلومات عامة';assert.throws(()=>parser.validate(d));});
test('cart WhatsApp associates separate accounts with duplicate service packages',()=>{const s=parser.validate(base).services[0],p=s.plans[0];const text=ctx.window.KenoOrder.buildCartOrderText(base,[{service:s,plan:p,quantity:1,fields:{'player-id':'111111'}},{service:s,plan:p,quantity:2,fields:{'player-id':'222222'}}]);assert.match(text,/1\.[\s\S]*111111[\s\S]*2\.[\s\S]*222222/);});
test('content and domain settings survive export, malformed domain rejected',()=>{const d=copy();d.settings.content={'copy-1-0':'نص جديد'};const out=parser.parse(parser.serialize(d));assert.equal(out.settings.content['copy-1-0'],'نص جديد');assert.equal(out.settings.siteUrl,'https://keno-store.vercel.app/');d.settings.siteUrl='javascript:alert(1)';assert.throws(()=>parser.validate(d));});
test('service availability survives roundtrip',()=>{const d=copy();d.services[0].available=false;d.services[0].status='unavailable';const out=parser.parse(parser.serialize(d));assert.equal(out.services[0].available,false);assert.equal(out.services[0].status,'unavailable');});
test('custom quotes are not presented as a free package',()=>{const s=parser.validate(base).services.find(s=>!s.plans.length);const text=ctx.window.KenoOrder.buildCartOrderText(base,[{service:s,quantity:1,fields:{details:'طلب تجريبي'}}]);assert.match(text,/تحتاج تسعيرًا/);});
