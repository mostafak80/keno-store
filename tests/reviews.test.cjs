const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
// Exercise the adapter at the Firestore boundary without contacting production.
function adapter({order,submission,fail=false}={}){
 const writes=[],stamp={toMillis:()=>1780000000000};
 const modules={doc:(_db,col,id)=>({col,id}),serverTimestamp:()=>stamp,
  getDoc:async ref=>({exists:()=>Boolean(ref.col==='orders'?order:submission),data:()=>ref.col==='orders'?order:submission}),
  setDoc:async(ref,data)=>{if(fail)throw Error('offline');writes.push({ref,data});},
  updateDoc:async(ref,data)=>{if(fail)throw Error('offline');writes.push({ref,data});},
  deleteDoc:async ref=>{if(fail)throw Error('offline');writes.push({ref,deleted:true});}};
 const window={KenoConfig:{FIREBASE_CONFIG:{apiKey:'test',projectId:'test'}},KenoReviews:{newToken:()=> 'b'.repeat(48)},KenoOrderStore:{saveOrder:async()=>{},getOrder:async()=>null}};
 const ctx={window,console:{warn(){},error(){},info(){}},testModules:modules};vm.createContext(ctx);
 let source=fs.readFileSync('js/firebase.js','utf8');
 source=source.replace('  root.KenoFirebase = KenoFirebase;', '  firestoreModules = testModules; KenoFirebase.init = async () => ({db:{}}); root.KenoFirebase = KenoFirebase;');
 vm.runInContext(source,ctx);return{api:window.KenoFirebase,writes,stamp};
}
test('review submission uses private collection and server timestamp',async()=>{
 const {api,writes,stamp}=adapter();await api.submitReview({orderId:'KENO-ONE',token:'a'.repeat(48),serviceId:'pubg',name:'عميل',rating:2,comment:'تجربتي'});
 assert.equal(writes[0].ref.col,'reviewSubmissions');assert.equal(writes[0].ref.id,'KENO-ONE--pubg');assert.equal(writes[0].data.createdAt,stamp);
});
test('moderation preserves low rating, original comment and date but strips all secrets',async()=>{
 const {api,writes}=adapter({submission:{orderId:'KENO-ONE',token:'private',serviceId:'pubg',name:'عميل',rating:1,comment:'تعليق نقدي',createdAt:{toMillis:()=>1780000000000}}});
 await api.moderateReview('KENO-ONE--pubg',true);const data=writes[0].data;
 assert.equal(data.rating,1);assert.equal(data.comment,'تعليق نقدي');assert.equal(data.timestamp,1780000000000);assert.equal('token' in data,false);assert.equal('orderId' in data,false);assert.equal('verified' in data,false);
});
test('invitation rejects unfinished orders and does not mutate them',async()=>{const {api,writes}=adapter({order:{id:'KENO-ONE',status:'pending'}});await assert.rejects(api.reviewInvite('KENO-ONE'));assert.equal(writes.length,0);});
test('legacy delivered order requires an explicit service association by admin',async()=>{const {api,writes}=adapter({order:{id:'KENO-OLD',status:'delivered'}});await assert.rejects(api.reviewInvite('KENO-OLD'));const order=await api.reviewInvite('KENO-OLD','pubg');assert.equal(order.serviceIds[0],'pubg');assert.equal(writes[0].data.reviewToken.length,48);});
test('failed cloud status update rejects instead of pretending to succeed locally',async()=>{const {api}=adapter({fail:true});await assert.rejects(api.updateOrderStatus('KENO-ONE','delivered'),/لم تُحفظ/);});
