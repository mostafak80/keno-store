const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function catalog(){const ctx={window:{},URL,TextEncoder};vm.createContext(ctx);for(const f of ['js/config.js','js/image.js','js/catalog-parser.js','js/order.js','assets/catalog.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);return ctx.window;}
test('untrusted receipts reject attribute injection, SVG, remote trackers and oversized data',()=>{
 const api=catalog().KenoOrder;
 for(const value of ['x" onerror="alert(1)','data:image/svg+xml;base64,PHN2Zz4=','https://example.com/receipt.jpg','data:image/png;base64,'+'a'.repeat(700001)])assert.equal(api.safeReceiptUrl(value),'');
 assert.equal(api.safeReceiptUrl('data:image/png;base64,aGVsbG8='),'data:image/png;base64,aGVsbG8=');
});
test('only available services are orderable',()=>{const {KenoOrder:o}=catalog();assert.equal(o.isAvailable({visible:true,available:true}),true);for(const s of [null,{visible:false},{available:false},{status:'unavailable'}])assert.equal(o.isAvailable(s),false);});
test('oversized catalogs can be normalized before compression but cannot be published',()=>{
 const w=catalog(),data=structuredClone(w.KENO_CATALOG);data.services[0].image='data:image/jpeg;base64,'+'a'.repeat(820000);
 assert.throws(()=>w.KenoCatalogParser.validate(data),/حجم/);
 const normalized=w.KenoCatalogParser.validate(data,{deferSizeCheck:true});assert.ok(normalized.services[0].image.length>800000);
 assert.throws(()=>w.KenoCatalogParser.serialize(normalized),/حجم/);
 normalized.services[0].image='';assert.doesNotThrow(()=>w.KenoCatalogParser.serialize(normalized));
});
test('per-field keyboard and input constraints survive catalog export',()=>{
 const w=catalog(),data=structuredClone(w.KENO_CATALOG);Object.assign(data.services[0].fulfillment.fields[0],{inputMode:'numeric',numericOnly:true,maxLength:16});
 const field=w.KenoCatalogParser.parse(w.KenoCatalogParser.serialize(data)).services[0].fulfillment.fields[0];assert.equal(field.maxLength,16);assert.equal(field.numericOnly,true);assert.equal(field.inputMode,'numeric');
});
test('general and mobile design persist independently and report cloud failures',async()=>{
 const docs=new Map([['design',{data:{accentColor:'#fff',mobileDesign:{columns:2}}}]]);let fail=false;
 const modules={doc:(_db,_col,id)=>id,serverTimestamp:()=>1,getDoc:async id=>({exists:()=>docs.has(id),data:()=>docs.get(id)}),setDoc:async(id,data)=>{if(fail)throw Error('offline');docs.set(id,data);}};
 const ctx={window:{},console:{warn(){}},testModules:modules};vm.createContext(ctx);
 const source=fs.readFileSync('js/firebase.js','utf8').replace('  root.KenoFirebase = KenoFirebase;','  firestoreModules=testModules; KenoFirebase.init=async()=>({db:{}}); root.KenoFirebase = KenoFirebase;');vm.runInContext(source,ctx);
 const api=ctx.window.KenoFirebase;
 assert.equal((await api.loadDesignSettings('mobile')).columns,2);assert.equal((await api.loadDesignSettings()).mobileDesign,undefined);
 assert.equal(await api.saveDesignSettings({accentColor:'#111'}),true);assert.equal(await api.saveDesignSettings({columns:3},'mobile'),true);
 assert.equal((await api.loadDesignSettings()).accentColor,'#111');assert.equal((await api.loadDesignSettings('mobile')).columns,3);
 fail=true;assert.equal(await api.saveDesignSettings({columns:1},'mobile'),false);assert.equal((await api.loadDesignSettings('mobile')).columns,3);
});
