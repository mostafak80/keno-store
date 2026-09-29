/* Regression scenarios; every external request is blocked and writes stay in memory. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Mostafa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const mock=`
KenoFirebase.init=async()=>null;KenoFirebase.loadDesignSettings=async()=>null;
KenoFirebase.fetchLiveCatalog=()=>new Promise(resolve=>window.__hydrate=resolve);
KenoFirebase.listReviews=async()=>[];KenoFirebase.listReviewSubmissions=async()=>[];
KenoFirebase.getCurrentUser=()=>window.__user||null;
KenoFirebase.checkAdminAuthorization=async()=>({authorized:true,role:'EDITOR'});
KenoFirebase.onAuthStateChanged=async callback=>{window.__auth=callback;return()=>{}};
KenoFirebase.getOrders=async()=>window.__orders||[];
KenoFirebase.createOrder=async order=>{window.__saved=order;return{success:true,cloud:false}};
KenoFirebase.saveDesignSettings=async()=>false;
`;
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{let body=fs.readFileSync(file);if(file.endsWith(path.join('js','firebase.js')))body=Buffer.from(body+mock);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff':'font/woff','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),url='http://127.0.0.1:'+server.address().port;await ctx.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 await page.goto(url);await page.locator('#serviceGrid .service-card').first().waitFor();
 await page.locator('#picksGrid [data-open-service="pubg"]').click();
 await page.locator('#serviceNext').click();await page.locator('#fulfill-player-id').fill('5123456789');await page.locator('#serviceNext').click();
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:960});
  const names=await page.locator('#dialogPaymentMethods .payment-info-title').evaluateAll(els=>els.map(e=>({ar:e.querySelector('strong').textContent,en:e.querySelector('.payment-name-en').textContent,below:e.querySelector('.payment-name-en').getBoundingClientRect().top>=e.querySelector('strong').getBoundingClientRect().bottom,overflow:e.scrollWidth>e.clientWidth+1})));
  assert.deepEqual(names.map(x=>x.en),['Vodafone Cash','InstaPay','Telda']);assert(names.every(x=>x.below&&!x.overflow));
  for(const card of await page.locator('#dialogPaymentMethods .payment-card').all()){await card.locator('.payment-card-header').click();assert(await card.locator('input').isChecked());}
  if(width===390)await page.locator('#dialogPaymentMethods').screenshot({path:path.join(root,'qa/payment-bilingual.png')});
 }
 await page.evaluate(()=>document.getElementById('serviceDialog').close());
 await page.evaluate(async()=>{window.__user={email:'editor@example.test'};await __auth(__user);location.hash='#admin';});
 await page.locator('#adminWorkspace').waitFor({state:'visible'});
 const openEditor=async()=>{await page.locator('[data-edit-service="pubg"]').click();};
 await openEditor();
 assert.equal(await page.locator('#serviceForm input:invalid').count(),0);
 await page.locator('#serviceForm [name="name"]').fill('ببجي — تعديل محفوظ');
 await page.locator('#saveServiceBtn').click();await page.waitForFunction(()=>!document.getElementById('editorDialog').open);
 assert.equal(await page.evaluate(()=>getAdminDraft().services.find(s=>s.id==='pubg').name),'ببجي — تعديل محفوظ');
 assert.equal(await page.evaluate(()=>getAdminDraft().services.find(s=>s.id==='pubg').image),'assets/services-glass-v2/pubg-desktop.webp');
 for(const image of ['https://example.com/custom.webp','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=']){
  await openEditor();await page.evaluate(value=>{const e=document.getElementById('editorImage');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},image);
  await page.locator('#saveServiceBtn').click();await page.waitForFunction(()=>!document.getElementById('editorDialog').open);
  assert.equal(await page.evaluate(()=>getAdminDraft().services.find(s=>s.id==='pubg').image),image);
 }
 await openEditor();await page.evaluate(()=>{document.getElementById('editorImage').value='javascript:alert(1)';});
 await page.locator('#saveServiceBtn').click();assert(await page.locator('#editorDialog').isVisible());assert.match(await page.locator('#editorError').textContent(),/HTTPS/);
 assert.notEqual(await page.evaluate(()=>getAdminDraft().services.find(s=>s.id==='pubg').image),'javascript:alert(1)');
 assert.deepEqual(errors,[]);console.log('PASS: bilingual payment names at 320/390/1440; selections work; real save button accepts local, HTTPS and uploaded images; unsafe URL rejected without losing draft.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});