const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'C:/Users/Mostafa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const mock=`
KenoFirebase.init=async()=>null;
KenoFirebase.fetchLiveCatalog=async()=>null;
KenoFirebase.getOrders=()=>KenoOrderStore.getOrders();
KenoFirebase.getOrder=id=>KenoOrderStore.getOrder(id);
KenoFirebase.listReviews=async()=>[];
KenoFirebase.listReviewSubmissions=async()=>[];
KenoFirebase.createOrder=async order=>{window.__savedOrder=order;await KenoOrderStore.saveOrder(order);return{success:true,cloud:false}};
`;
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0] === '/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{let data=fs.readFileSync(file);if(file.endsWith(path.join('js','firebase.js')))data=Buffer.from(data+mock);
   res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.woff':'font/woff'})[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch(e){res.writeHead(404);res.end();}
 }).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const errors=[];const shots=path.join(root,'qa');fs.mkdirSync(shots,{recursive:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#serviceGrid .service-card').first().waitFor();
  assert.equal(await page.locator('#serviceGrid .service-card').count(),41);
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://keno-store.vercel.app/');
  assert.equal(await page.locator('.verified-tag').count(),0);
  for(const query of ['ببجي','Netflix']){
    await page.locator('#searchInput').fill(query);
    await page.waitForFunction(()=>document.querySelectorAll('#serviceGrid .service-card').length<41);
    assert.ok(await page.locator('#serviceGrid .service-card').count()>0);
    await page.locator('#clearSearch').click();await page.waitForFunction(()=>document.querySelectorAll('#serviceGrid .service-card').length===41);
  }
  await page.evaluate(()=>{KenoOrder.openWhatsApp=url=>{window.__wa=url;return true;};});
  const open=async()=>{await page.locator('#picksGrid [data-open-service="pubg"]').click();await page.locator('#serviceDialog').waitFor();};
  const fill=async id=>{await page.locator('#serviceNext').click();await page.locator('#fulfill-player-id').fill(id);await page.locator('#serviceNext').click();await page.locator('#reviewConfirmed').check();};
  await open();
  assert.equal(await page.locator('#accountInfoSection').isVisible(),false);
  assert.equal(await page.locator('#paymentSelectionSection').isVisible(),false);
  assert.equal(await page.locator('#orderButton').isVisible(),false);
  const collapsed=await page.locator('.plan-option:visible').count();
  await page.locator('#allPlans').click();assert.ok(await page.locator('.plan-option:visible').count()>collapsed);
  await page.locator('#planBudget').fill('1');assert.equal(await page.locator('.plan-option:visible').count(),0);assert.equal(await page.locator('#serviceNext').isDisabled(),true);
  await page.locator('#planBudget').fill('');await page.locator('#serviceNext').click();
  await page.locator('#serviceNext').click();assert.equal(await page.locator('#accountInfoSection').isVisible(),true);
  await page.locator('#fulfill-player-id').fill('5123456789');
  await page.locator('#servicePrev').click();await page.locator('#serviceNext').click();assert.equal(await page.locator('#fulfill-player-id').inputValue(),'5123456789');
  await page.locator('#serviceNext').click();assert.match(await page.locator('#serviceReview').textContent(),/5123456789/);
  for(const card of await page.locator('#dialogPaymentMethods .payment-card').all()){
    await card.locator('.payment-card-header').click();assert.equal(await card.locator('input').isChecked(),true);
    assert.ok(await page.locator('#dialogPaymentMethods .payment-details-drawer.open').count()<=1);
  }
  await page.locator('#orderButton').click();assert.equal(await page.evaluate(()=>window.__wa),undefined);
  await page.locator('#reviewConfirmed').check();
  await page.screenshot({path:path.join(shots,'desktop-review.png')});
  await page.locator('#orderButton').click();await page.waitForFunction(()=>window.__savedOrder);
  assert.match(await page.evaluate(()=>decodeURIComponent(window.__wa)),/5123456789/);
  assert.equal(await page.evaluate(()=>__savedOrder.items[0].fulfillment[0].value),'5123456789');
  assert.equal(await page.evaluate(()=>__savedOrder.reviewToken.length),48);
  // Duplicate package, different account: two independent cart lines, no merging.
  for(const id of ['11111111','22222222']){await open();await fill(id);await page.locator('#addToCartBtn').click();await page.locator('#closeCartBtn').click();}
  await page.locator('#headerCartBtn').click();assert.equal(await page.locator('.cart-item-card').count(),2);
  await page.locator('#cartNextStepBtn').click();assert.equal(await page.locator('#cart-0-player-id').inputValue(),'11111111');assert.equal(await page.locator('#cart-1-player-id').inputValue(),'22222222');
  await page.locator('#cart-1-player-id').fill('33333333');await page.locator('#cartPrevStepBtn').click();await page.locator('#cartNextStepBtn').click();assert.equal(await page.locator('#cart-1-player-id').inputValue(),'33333333');
  await page.locator('#cartNextStepBtn').click();assert.equal(await page.locator('#cartPaymentMethods').isVisible(),true);assert.equal(await page.locator('#invoiceItemsSummary').isVisible(),true);
  await page.locator('#cartReviewConfirmed').check();await page.locator('#cartSubmitOrderBtn').click();await page.waitForFunction(()=>__savedOrder.type==='cart');
  const order=await page.evaluate(()=>__savedOrder);assert.equal(order.items[0].fulfillment[0].value,'11111111');assert.equal(order.items[1].fulfillment[0].value,'33333333');
  const message=await page.evaluate(()=>decodeURIComponent(__wa));assert.match(message,/11111111/);assert.match(message,/33333333/);
  // Local admin fixture: no production identity or writes are used in this test.
  await page.evaluate(()=>location.hash='#admin');await page.waitForFunction(()=>window.KenoAdminAuth);
  await page.evaluate(async()=>{KenoAdminAuth.setSession('OWNER');await ensureAdminWorkspace();document.querySelector('#adminLogin').hidden=true;document.querySelector('#adminWorkspace').hidden=false;});
  await page.locator('[data-edit-service="pubg"]').click();
  await page.locator('#fulfillmentTitle').fill('بيانات شحن تجريبية');
  await page.locator('[data-prop="hint"]').first().fill('انسخ الرقم من ملف اللاعب');
  await page.locator('[data-prop="helpImage"]').first().fill('https://example.com/help.png');
  await page.locator('#serviceAudioEditor [data-audio-index="0"]').fill('https://example.com/step.mp3');
  await page.locator('#fulfillmentTitle').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(shots,'admin-service-fields.png')});
  await page.locator('#serviceForm button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#editorDialog').open);
  const config=await page.evaluate(()=>getAdminDraft().services.find(s=>s.id==='pubg').fulfillment);
  assert.equal(config.title,'بيانات شحن تجريبية');assert.equal(config.fields[0].helpImage,'https://example.com/help.png');assert.equal(config.audio[0],'https://example.com/step.mp3');
  await page.locator('#settingsTab').click();await page.locator('#contentSettingsEditor summary').click();
  await page.locator('#settingSiteUrl').fill('https://keno-store.vercel.app/');
  await page.locator('[data-content-setting]').first().fill('محتوى قابل للتعديل');
  await page.locator('#settingSiteUrl').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(shots,'admin-content.png')});
  await page.locator('#settingsForm button[type="submit"]').click();
  assert.ok(Object.values(await page.evaluate(()=>getAdminDraft().settings.content)).includes('محتوى قابل للتعديل'));
  // Preview uses draft schema and media; inputs are not thrown away by navigation.
  await page.locator('#previewDraft').click();await open();assert.equal(await page.locator('#serviceListen').isEnabled(),true);
  await page.locator('#serviceNext').click();assert.equal(await page.locator('#accountStepTitle').textContent(),'بيانات شحن تجريبية');assert.equal(await page.locator('.field-help summary').count(),1);
  await page.locator('[data-close-dialog="serviceDialog"]').first().click();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow '+width);
    await open();await fill('12345678');assert.equal(await page.evaluate(()=>{const el=document.querySelector('#serviceDialog');return el.scrollWidth>el.clientWidth+1}),false,'dialog overflow '+width);
    if(width===390)await page.screenshot({path:path.join(shots,'mobile-review.png')});
    await page.locator('[data-close-dialog="serviceDialog"]').first().click();
  }
  await page.locator('#themeToggle').click();await page.screenshot({path:path.join(shots,'light-home.png')});
  const theme=await page.getAttribute('html','data-theme');await page.reload();assert.equal(await page.getAttribute('html','data-theme'),theme);
  await page.evaluate(()=>location.hash='#admin');await page.waitForFunction(()=>window.KenoAdminAuth);
  await page.locator('#confirmAccept').click();await page.locator('#adminWorkspace').waitFor({state:'visible'});
  await page.evaluate(()=>{getAdminDraft().services[0].plans[0].price+=1;saveAdminDraft();KenoFirebase.publishCatalog=async()=>{throw Error('offline test')};KenoFirebase.getIdToken=async()=>null;});
  await page.locator('#publishButton').click();await page.locator('#confirmAccept').click();
  await page.waitForFunction(()=>document.querySelector('#adminMessage').textContent.includes('تعذر النشر'));
  assert.match(await page.locator('#draftStatus').textContent(),/لم تُنشر/);assert.equal(await page.locator('#publishButton').isEnabled(),true);
  const reduced=await browser.newContext({reducedMotion:'reduce',colorScheme:'dark'});
  await reduced.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  await reduced.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('blocked')};Storage.prototype.setItem=function(){throw Error('blocked')}});
  const rp=await reduced.newPage();rp.on('pageerror',e=>errors.push(e.message));await rp.goto('http://127.0.0.1:'+server.address().port);
  await rp.locator('#themeToggle').click();assert.equal(await rp.getAttribute('html','data-theme'),'light');
  assert.equal(await rp.locator('#heroFeature').evaluate(el=>getComputedStyle(el).animationName),'none');await reduced.close();
  assert.deepEqual(errors,[]);console.log('PASS: 3 steps, validation, budget, separate cart accounts, order payload, admin save, content, preview, 4 viewport sizes, no page errors.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();server.close();}
})();
