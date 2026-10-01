const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
function care(){
 const values=new Map(),window={crypto:webcrypto,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},getStoreCatalog:()=>({services:[{id:'pubg',name:'اسم طويل, لتجربة التقويم; عربي\\مع سطر\nجديد'}]})};
 const context={window,localStorage:window.localStorage,document:{getElementById:()=>null},location:{origin:'https://keno.example',pathname:'/'},TextEncoder,Date,URL,setTimeout,clearTimeout};vm.createContext(context);
 vm.runInContext(fs.readFileSync('js/customer-care.js','utf8').replace("  buildDialogs();root.addEventListener('DOMContentLoaded',readTrackLink);",''),context);
 return window.KenoCare;
}
function adapter({fail=false,order=null}={}){
 const writes=[],local=[],docs=new Map();if(order)docs.set('orders/'+order.id,order);
 const modules={doc:(_db,col,id)=>({col,id}),serverTimestamp:()=>({server:true}),
  getDoc:async ref=>({exists:()=>docs.has(ref.col+'/'+ref.id),data:()=>docs.get(ref.col+'/'+ref.id)}),
  setDoc:async(ref,data)=>{if(fail)throw Error('offline');writes.push({ref,data});},
  updateDoc:async(ref,data)=>{if(fail)throw Error('offline');writes.push({ref,data});},
  writeBatch:()=>{const batch=[];return{set:(ref,data)=>batch.push({ref,data}),update:(ref,data)=>batch.push({ref,data}),delete:ref=>batch.push({ref,deleted:true}),commit:async()=>{if(fail)throw Error('offline');writes.push(...batch);}};}};
 const window={KenoConfig:{FIREBASE_CONFIG:{apiKey:'test',projectId:'test'}},KenoCare:care(),KenoReviews:{newToken:()=> 'a'.repeat(48)},KenoOrder:{isValidWhatsAppNumber:phone=>/^\d{8,16}$/.test(phone)},KenoOrderStore:{saveOrder:async value=>{local.push(value);return true;},getOrder:async()=>null,deleteOrder:async()=>true}};
 const context={window,console:{warn(){},error(){},info(){}},testModules:modules};vm.createContext(context);
 vm.runInContext(fs.readFileSync('js/firebase.js','utf8').replace('  root.KenoFirebase = KenoFirebase;', '  firestoreModules = testModules; KenoFirebase.init = async () => ({db:{}}); root.KenoFirebase = KenoFirebase;'),context);
 return{api:window.KenoFirebase,writes,local};
}
const order=()=>({id:'KENO-1234567890',trackingToken:'a'.repeat(48),reviewToken:'b'.repeat(48),status:'pending',timestamp:Date.now(),total:55,customerPhone:'201012345678',customerAccount:'secret account',receipt:{dataUrl:'private receipt'},items:[{serviceId:'pubg',planId:'pubg-1',serviceName:'ببجي',planLabel:'60 شدة',quantity:1,price:55,fulfillment:[{id:'player-id',value:'secret player'}]}]});
test('tracking projection excludes account data, contact details, receipts and review claims',()=>{
 const projection=care().projection(order()),text=JSON.stringify(projection);for(const secret of ['secret','receipt','customerPhone','reviewToken','trackingToken','fulfillment'])assert.equal(text.includes(secret),false);
 assert.equal(projection.items[0].planId,'pubg-1');
});
test('private tracking token is independent and links reject external origins and invalid claims',()=>{
 const api=care(),value=order();delete value.trackingToken;api.prepareOrder(value);assert.match(value.trackingToken,/^[a-f0-9]{48}$/);assert.notEqual(value.trackingToken,value.reviewToken);
 assert.equal(api.parseToken(api.trackingLink(value)),value.trackingToken);
 assert.equal(api.parseToken('https://evil.example/#track/'+value.trackingToken),'');assert.equal(api.parseToken('KENO-1234567890'),'');
});
test('calendar exports a real future alarm and folds UTF-8 lines without leaking phone',()=>{
 const value={id:'a'.repeat(48),serviceId:'pubg',expiresAt:Date.now()+10*86400000,phone:'201012345678'};
 const ics=care().calendar(value);assert.match(ics,/BEGIN:VALARM\r\nTRIGGER;VALUE=DATE-TIME:/);assert.match(ics,/END:VCALENDAR\r\n$/);assert.equal(ics.includes(value.phone),false);
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
 const unfolded=ics.replace(/\r\n /g,'');assert.ok(unfolded.includes('\\,')&&unfolded.includes('\\;')&&unfolded.includes('\\n'));
});
test('order and public tracking are created in the same cloud batch',async()=>{
 const {api,writes,local}=adapter();const value=order(),result=await api.createOrder(value);assert.equal(result.cloud,true);assert.equal(local.length,1);assert.equal(writes.length,2);
 assert.equal(writes[0].ref.col,'orders');assert.equal(writes[1].ref.col,'orderTracking');assert.equal(JSON.stringify(writes[1].data).includes('secret'),false);
});
test('failed cloud batch does not claim cloud success',async()=>{
 const {api,writes,local}=adapter({fail:true});const result=await api.createOrder(order());assert.equal(result.cloud,false);assert.equal(result.success,true);assert.equal(writes.length,0);assert.equal(local.length,1);
});
test('status changes atomically update the private order and the customer timeline',async()=>{
 const value=order(),{api,writes}=adapter({order:value});await api.updateOrderStatus(value.id,'delivered');assert.equal(writes.length,2);assert.equal(writes[0].data.status,'delivered');assert.equal(writes[1].data.status,'delivered');
});
test('deleting an order removes its tracking link in the same batch',async()=>{
 const value=order(),{api,writes}=adapter({order:value});await api.deleteOrder(value.id);assert.equal(writes.length,2);assert.ok(writes.every(w=>w.deleted));assert.equal(writes[1].ref.col,'orderTracking');
});
test('legacy orders receive a separate tracking claim when the admin sets the execution date',async()=>{
 const value=order();delete value.trackingToken;const {api,writes}=adapter({order:value});const updated=await api.saveTrackingSchedule(value.id,Date.now()+3600000);assert.match(updated.trackingToken,/^[a-f0-9]{48}$/);assert.equal(writes.length,2);assert.equal(writes[1].data.expectedAt,updated.expectedAt);
});
test('contact opt-in is required before sending a request to the cloud',async()=>{
 const {api,writes}=adapter();await assert.rejects(api.createCareRequest({id:'a'.repeat(48),phone:'201012345678',consent:false}));assert.equal(writes.length,0);
});
test('cancellation writes only status and never reads private contact information',async()=>{
 const {api,writes}=adapter();await api.cancelCareRequest('a'.repeat(48));assert.equal(writes.length,1);assert.deepEqual(JSON.parse(JSON.stringify(writes[0].data)),{status:'cancelled'});
});
test('package details survive catalog export and do not change prices',()=>{
 const window={KenoConfig:{ICON_NAMES:new Set(['gamepad-2']),COLORS:new Set(['red'])}};const context={window,TextEncoder,URL};vm.createContext(context);
 vm.runInContext(fs.readFileSync('assets/catalog.js','utf8'),context);vm.runInContext(fs.readFileSync('js/catalog-parser.js','utf8'),context);
 const data=window.KENO_CATALOG,plan=data.services[0].plans[0],price=plan.price;plan.details={accountType:'شحن رصيد',duration:'مرة واحدة',devices:'حساب واحد',activation:'بمعرف اللاعب',delivery:'بعد تأكيد الدفع',compensation:'تُراجع مع المتجر'};
 const validated=window.KenoCatalogParser.validate(data);assert.equal(validated.services[0].plans[0].details.activation,'بمعرف اللاعب');assert.equal(validated.services[0].plans[0].price,price);
 const second=window.KenoCatalogParser.validate(JSON.parse(JSON.stringify(validated)));assert.equal(second.services[0].plans[0].details.compensation,'تُراجع مع المتجر');
});
