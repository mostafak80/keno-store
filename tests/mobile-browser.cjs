/* Local fixtures only. No production authentication, orders, or writes. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'C:/Users/Mostafa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const mock=`
KenoFirebase.init=async()=>null;KenoFirebase.fetchLiveCatalog=async()=>null;
KenoFirebase.loadDesignSettings=async()=>null;
KenoFirebase.listReviews=async()=>[];KenoFirebase.listReviewSubmissions=async()=>[];
KenoFirebase.getOrders=()=>KenoOrderStore.getOrders();
KenoFirebase.getCurrentUser=()=>sessionStorage.getItem('test-owner')?{email:KenoConfig.ADMIN_EMAILS?.[0]||Object.keys(KenoConfig.AUTHORIZED_ADMINS)[0]}:null;
`;
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  try{let data=fs.readFileSync(file);if(file.endsWith(path.join('js','firebase.js')))data=Buffer.from(data+mock);
   res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript; charset=utf-8','.woff':'font/woff','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch(_){res.writeHead(404);res.end()}
 }).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const errors=[],url='http://127.0.0.1:'+server.address().port;
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await ctx.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
  await page.goto(url+'/#admin');await page.locator('#serviceGrid .service-card').first().waitFor();
  assert.equal(await page.locator('#adminView').isVisible(),false,'visitor cannot enter admin');
  const overflow=async label=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label);
  const dialogOverflow=async()=>assert.equal(await page.locator('#serviceDialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'dialog horizontal overflow');
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[844,390]]){
   await page.setViewportSize({width,height});await overflow('storefront '+width);
   if(width<=780){
    assert.ok((await page.locator('.site-header').boundingBox()).height<=130,'compact phone header');
    const cols=await page.locator('#serviceGrid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
    assert.ok(cols<=2,'readable card columns');
    assert.ok(await page.locator('#serviceGrid h3').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=15),'readable service name');
   }
   await page.locator('#picksGrid [data-open-service="pubg"]').click();await dialogOverflow();
   await page.locator('#serviceNext').click();await page.locator('#fulfill-player-id').fill('5123456789');
   if(width===390){
    await page.setViewportSize({width,height:360});
    await page.locator('#fulfill-player-id').click();await page.locator('#serviceNext').click();
    await page.locator('#servicePrev').click();assert.equal(await page.locator('#fulfill-player-id').inputValue(),'5123456789');
    await page.setViewportSize({width,height});
   }
   await page.locator('#serviceNext').click();await dialogOverflow();
   for(const header of await page.locator('#dialogPaymentMethods .payment-card-header').all())await header.click();
   await page.locator('#reviewConfirmed').check();
   await page.locator('#orderButton').scrollIntoViewIfNeeded();
   const bounds=await page.locator('#orderButton').boundingBox();assert.ok(bounds.width>100&&bounds.height>=44);
   if(width===390)await page.screenshot({path:path.join(root,'qa','mobile-checkout-final.png')});
   await page.locator('#addToCartBtn').click();
   await page.locator('#cartNextStepBtn').click();
   await page.locator('#cart-0-player-id').fill('987654321');
   await page.locator('#cartNextStepBtn').click();await page.locator('#cartReviewConfirmed').check();
   await overflow('cart '+width);await page.locator('#closeCartBtn').click();
   // Reset cart fixture for the next device, without submitting any order.
   await page.evaluate(()=>localStorage.removeItem('keno.cart.v1'));
   await page.reload();await page.locator('#serviceGrid .service-card').first().waitFor();
  }
  await page.setViewportSize({width:390,height:844});
  // Saved extreme design settings must not make phone cards illegible.
  for(const style of ['default','list','wide','magazine','compact']){
   await page.evaluate(style=>KenoDesign.apply({...KenoDesign.current(),cardStyle:style,mobileColumns:10,mobileCardScale:1,mobileFontScale:80}),style);
   await overflow(style);assert.ok(await page.locator('#serviceGrid h3').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=15));
   assert.equal(await page.locator('#serviceGrid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),2);
  }
  await page.evaluate(()=>KenoDesign.apply({...KenoDesign.DEFAULTS,mobileLayout:'vertical'}));
  assert.equal(await page.locator('#serviceGrid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1);
  await page.evaluate(()=>KenoDesign.apply(KenoDesign.DEFAULTS));
  await page.locator('#themeToggle').click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(245, 246, 248)');
  assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(245, 246, 248)','light background is not overridden by saved dark design');
  await page.locator('#themeToggle').click();
  await page.evaluate(()=>{location.hash='#catalog'});await page.locator('#serviceGrid').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'qa','mobile-catalog-final.png')});
  await page.evaluate(()=>{sessionStorage.setItem('test-owner','1');location.hash='#admin'});
  await page.locator('#adminWorkspace').waitFor({state:'visible'});
  await page.evaluate(async()=>{KenoAdminAuth.setSession('OWNER',{email:KenoFirebase.getCurrentUser().email});await ensureAdminWorkspace()});
  await overflow('admin');
  await page.locator('[data-edit-service="pubg"]').click();
  await page.locator('#fulfillmentTitle').fill('بيانات شحن');
  assert.equal(await page.locator('#editorDialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'editor overflow');
  await page.locator('#serviceForm button[type="submit"]').click();
  await page.locator('#designTab').click();await overflow('design admin');
  await page.locator('#designMobileSection').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'qa','mobile-admin-final.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS: 6 viewport sizes, touch checkout/cart, keyboard-height viewport, readable saved layouts, light theme, visitor guard and mobile admin.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
