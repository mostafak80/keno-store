const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'C:/Users/Mostafa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const mock=`
window.__careEvents=[];window.__careRequests=[];window.__tracking={};
KenoFirebase.init=async()=>null;KenoFirebase.fetchLiveCatalog=async()=>null;KenoFirebase.listReviews=async()=>[];KenoFirebase.listReviewSubmissions=async()=>[];
KenoFirebase.getCurrentUser=()=>sessionStorage.getItem('test-owner')?{email:KenoConfig.ADMIN_EMAILS[0]}:null;
KenoFirebase.createOrder=async order=>{window.__savedOrder=order;await KenoOrderStore.saveOrder(order);__tracking[order.trackingToken]=KenoCare.projection(order);KenoCare.remember({...order,cloud:true});return{success:true,cloud:true};};
KenoFirebase.getOrders=()=>KenoOrderStore.getOrders();KenoFirebase.getOrder=id=>KenoOrderStore.getOrder(id);
KenoFirebase.getTracking=async token=>{if(window.__offline)throw Error('offline');return __tracking[token]||null;};
KenoFirebase.subscribeTracking=async(token,callback)=>{window.__trackingCallback=callback;return()=>{window.__trackingCallback=null;};};
KenoFirebase.createCareRequest=async request=>{if(window.__offline)throw Error('offline');__careRequests.push(request);};
KenoFirebase.cancelCareRequest=async id=>{window.__cancelledRequest=id;};KenoFirebase.closeCareRequest=async id=>{const r=__careRequests.find(r=>r.id===id);if(r)r.status='done';};
KenoFirebase.recordCareEvent=async event=>{__careEvents.push(event);};
KenoFirebase.getCareDashboard=async()=>({events:__careEvents,requests:__careRequests,orders:await KenoOrderStore.getOrders()});
KenoFirebase.saveTrackingSchedule=async(id,expectedAt)=>{const order=await KenoOrderStore.getOrder(id);order.expectedAt=expectedAt;await KenoOrderStore.saveOrder(order);window.__scheduled=order;return order;};
`;
(async()=>{
 const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep))throw Error();let data=fs.readFileSync(file);if(file.endsWith(path.join('js','firebase.js')))data=Buffer.from(data+mock);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch(_){res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const errors=[],qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#serviceGrid .service-card').first().waitFor();
  await page.evaluate(()=>{KenoOrder.openWhatsApp=url=>{window.__wa=url;return true;};});
  await page.locator('#openCustomerHub').click();assert.match(await page.locator('#careOrdersList').textContent(),/أول طلب/);await page.locator('[data-care-close="customerHub"]').click();
  await page.evaluate(()=>{location.hash='#service/netflix';});await page.locator('#serviceDialog[open]').waitFor();assert.equal(await page.locator('#carePlanDetails, #careComparison').count(),0);
  await page.locator('#planGroups label[data-plan-id="netflix-2"]').click();assert.equal(await page.locator('#planGroups input[value="netflix-2"]').isChecked(),true);
  await page.locator('[data-close-dialog="serviceDialog"]').first().click();
  await page.evaluate(()=>{location.hash='#service/pubg';});await page.locator('#serviceNext').click();await page.locator('#fulfill-player-id').fill('5123456789');await page.locator('#serviceNext').click();await page.locator('#reviewConfirmed').check();await page.locator('#orderButton').click();await page.waitForFunction(()=>window.__savedOrder);
  const order=await page.evaluate(()=>__savedOrder);assert.equal(order.trackingToken.length,48);assert.notEqual(order.trackingToken,order.reviewToken);assert.match(await page.evaluate(()=>decodeURIComponent(__wa)),/#track\//);
  await page.locator('#openCustomerHub').click();assert.equal(await page.locator('.care-order-card').count(),1);await page.locator('#careOrdersList [data-care-track]').click();await page.waitForFunction(()=>document.querySelectorAll('.care-timeline li').length===4);assert.equal(await page.locator('.care-timeline .is-current').textContent(),'1بانتظار تأكيد الدفع');
  await page.evaluate(()=>{const order=__tracking[__savedOrder.trackingToken];order.status='delivered';order.updatedAt=Date.now();__trackingCallback(order);});assert.match(await page.locator('#careTrackingResult').textContent(),/تم التسليم/);assert.equal(await page.locator('#careTrackingResult').textContent().then(s=>s.includes('5123456789')),false);
  await page.locator('#careOrdersTab').click();await page.locator('#careOrdersList [data-care-renew]').click();const expiry=new Date(Date.now()+20*86400000).toISOString().slice(0,10);await page.locator('#careExpiry').fill(expiry);
  const download=page.waitForEvent('download');await page.locator('#careRequestSubmit').click();const calendar=await download;assert.equal(calendar.suggestedFilename(),'keno-renewal.ics');assert.match(await page.locator('#careAlertsList').textContent(),/ينتهي/);assert.equal(await page.evaluate(()=>__careRequests.length),0);await page.locator('[data-care-close="customerHub"]').click();
  // Unavailable-package alerts remain accessible without the removed comparison panel.
  await page.evaluate(()=>{getStoreCatalog().services.find(s=>s.id==='pubg').plans[0].available=false;location.hash='#service/netflix';location.hash='#service/pubg';});await page.locator('[data-care-notify-service="pubg"]').click();await page.locator('#careRequestItem').selectOption('pubg-1');await page.locator('#careRequestPhone').fill('01012345678');await page.locator('#careRequestSubmit').click();assert.equal(await page.evaluate(()=>__careRequests.length),0);await page.locator('#careRequestConsent').check();await page.locator('#careRequestSubmit').click();await page.waitForFunction(()=>__careRequests.length===1);assert.equal(await page.evaluate(()=>__careRequests[0].consent),true);assert.equal(await page.evaluate(()=>__careRequests[0].planId),'pubg-1');
  await page.evaluate(()=>{getStoreCatalog().services.find(s=>s.id==='pubg').plans[0].available=true;KenoCare.refresh(getStoreCatalog());});assert.match(await page.locator('#careAlertsList').textContent(),/متاح الآن/);await page.locator('[data-care-cancel-request]').first().click();await page.waitForFunction(()=>window.__cancelledRequest);await page.locator('[data-care-close="customerHub"]').click();await page.locator('[data-close-dialog="serviceDialog"]').first().click();
  // Two identical packages keep their separate account fields when reordered at today's price.
  await page.evaluate(async()=>{const order={...__savedOrder,id:'KENO-REPEAT-12345678',trackingToken:'c'.repeat(48),status:'delivered',items:[{...__savedOrder.items[0],fulfillment:[{id:'player-id',label:'معرف اللاعب',value:'11111111'}]},{...__savedOrder.items[0],fulfillment:[{id:'player-id',label:'معرف اللاعب',value:'22222222'}]}]};await KenoOrderStore.saveOrder(order);KenoCare.remember(order);getStoreCatalog().services.find(s=>s.id==='pubg').plans[0].price=60;});
  await page.locator('#openCustomerHub').click();await page.locator('#careOrdersList [data-care-repeat="KENO-REPEAT-12345678"]').click();assert.equal(await page.locator('.cart-item-card').count(),2);await page.locator('#cartNextStepBtn').click();assert.equal(await page.locator('#cart-0-player-id').inputValue(),'11111111');assert.equal(await page.locator('#cart-1-player-id').inputValue(),'22222222');await page.locator('#cartNextStepBtn').click();assert.match(await page.locator('#cartDrawer').textContent(),/120/);await page.locator('#closeCartBtn').click();
  // Desktop/mobile, both themes: customer and service dialogs stay within the viewport.
  await page.locator('#openCustomerHub').click();await page.locator('#careOrdersList [data-care-track="'+order.id+'"]').click();await page.waitForTimeout(150);
  for(const theme of ['dark','light'])for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+' page '+width);
   assert.equal(await page.locator('#customerHub').evaluate(el=>el.scrollWidth<=el.clientWidth),true,theme+' hub '+width);
   if(width===390||width===1440)await page.screenshot({path:path.join(qa,'care-'+theme+'-'+width+'.png')});
  }
  await page.locator('[data-care-close="customerHub"]').click();await page.evaluate(()=>{location.hash='#service/netflix';});await page.locator('#serviceDialog[open]').waitFor();assert.equal(await page.locator('#carePlanDetails, #careComparison').count(),0);
  for(const theme of ['dark','light'])for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'service page '+theme+' '+width);
   assert.equal(await page.locator('#serviceDialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'service dialog '+theme+' '+width);
   if(width===390||width===1440)await page.screenshot({path:path.join(qa,'care-plans-'+theme+'-'+width+'.png')});
  }
  await page.locator('[data-close-dialog="serviceDialog"]').first().click();await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{sessionStorage.setItem('test-owner','1');location.hash='#admin';});await page.waitForFunction(()=>window.KenoAdminAuth);await page.evaluate(async()=>{KenoAdminAuth.setSession('OWNER',{email:KenoFirebase.getCurrentUser().email});await ensureAdminWorkspace();});
  await page.locator('#careAdminTab').click();await page.waitForFunction(()=>document.querySelectorAll('.care-metric').length===5);assert.match(await page.locator('#careAdminStatus').textContent(),/فتح واتساب لا يثبت البيع/);await page.screenshot({path:path.join(qa,'care-admin.png')});
  await page.locator('#servicesTab').click();await page.locator('[data-edit-service="pubg"]').click();await page.locator('[data-edit-plan="pubg-1"]').click();await page.locator('#careDetail-delivery').fill('خلال ساعتين بعد التأكيد');await page.locator('#careDetail-accountType').fill('شحن رصيد');await page.locator('#planForm button[type="submit"]').click();await page.locator('#serviceForm button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#editorDialog').open);assert.equal(await page.evaluate(()=>getAdminDraft().services.find(s=>s.id==='pubg').plans[0].details.delivery),'خلال ساعتين بعد التأكيد');
  await page.locator('#ordersTab').click();await page.locator('[data-order-action="view-details"]').first().click();await page.locator('#careExpectedAt').fill(expiry+'T14:30');await page.locator('#careSaveSchedule').click();await page.waitForFunction(()=>window.__scheduled);assert.ok(await page.evaluate(()=>__scheduled.expectedAt>0));await page.locator('[data-close-dialog="orderDetailsDialog"]').first().click();
  // A failed cloud lookup must explicitly identify a saved local copy.
  await page.evaluate(()=>{window.__offline=true;sessionStorage.removeItem('test-owner');location.hash='#catalog';});await page.locator('#openCustomerHub').click();await page.locator('#careOrdersList [data-care-track]').first().click();await page.waitForFunction(()=>document.querySelector('#careTrackingStatus').textContent.includes('نسخة محفوظة'));assert.match(await page.locator('#careTrackingStatus').textContent(),/ليست تأكيدًا/);
  assert.deepEqual(errors,[]);console.log('PASS: removed offer panels, private tracking, live status, reorder at current price with separate accounts, calendar, opt-in, availability, cancellation, analytics, admin editing, 8 responsive/theme combinations, offline fallback; no page errors.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
