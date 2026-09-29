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
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(url);await page.locator('#serviceGrid .service-card').first().waitFor();
 const login=async()=>{await page.evaluate(async()=>{window.__user={email:'editor@example.test'};await __auth(__user);location.hash='#admin';});await page.locator('#adminWorkspace').waitFor({state:'visible'});await page.locator('#featuredTab').click();};
 await login();
 await page.locator('#fcServiceSelect').selectOption('pubg');
 await page.locator('#fcPlanSelect').selectOption('pubg-3');
 await page.locator('#fcEnabledInput').check();
 assert(await page.locator('#adminHeroPreview').isVisible());
 const fullWidth=(await page.locator('#adminHeroPreview').boundingBox()).width;
 await page.locator('#fcSizeInput').selectOption('compact');
 await page.locator('#fcWidthInput').fill('60');await page.locator('#fcWidthInput').dispatchEvent('input');
 const small=await page.locator('#adminHeroPreview').boundingBox();assert(small.width<fullWidth);
 await page.locator('#fcSizeInput').selectOption('large');
 assert((await page.locator('#adminHeroPreview').boundingBox()).height>small.height);
 await page.locator('#saveFeaturedBtn').click();
 assert.deepEqual(await page.evaluate(()=>{const f=KenoCatalogParser.validate(JSON.parse(JSON.stringify(getAdminDraft()))).featuredCard;return [f.size,f.widthPercent];}),['large',60]);
 await page.locator('#fcVisibilityToggle').click();assert(!(await page.locator('#adminHeroPreview').isVisible()));
 await page.locator('#saveFeaturedBtn').click();await page.locator('#previewDraft').click();
 assert(await page.locator('#heroFeature').evaluate(e=>e.hidden));
 // A legacy visibility setting must never resurrect a disabled offer.
 await page.evaluate(()=>{const d=getAdminDraft();d.settings.sectionVisibility.heroFeature=true;saveAdminDraft();});
 assert(await page.locator('#heroFeature').evaluate(e=>e.hidden));
 await page.locator('#returnFromPreview').click();await page.locator('#featuredTab').click();
 await page.locator('#fcVisibilityToggle').click();await page.locator('#saveFeaturedBtn').click();
 await page.locator('#previewDraft').click();
 assert(!(await page.locator('#heroFeature').evaluate(e=>e.hidden)));
 assert.equal(await page.locator('#heroFeature').getAttribute('data-size'),'large');
 assert.equal(await page.locator('#heroActionButton').getAttribute('data-plan'),'pubg-3');
 await page.locator('#heroFeature').screenshot({path:path.join(root,'qa/featured-live.png')});
 // Unavailable plans and hidden services must remain hidden through content rendering.
 for(const kind of ['plan','service']){
  await page.evaluate(kind=>{const d=getAdminDraft(),s=d.services.find(s=>s.id==='pubg');if(kind==='plan')s.plans.find(p=>p.id==='pubg-3').available=false;else{s.plans.find(p=>p.id==='pubg-3').available=true;s.visible=false;}saveAdminDraft();},kind);
  assert(await page.locator('#heroFeature').evaluate(e=>e.hidden));
 }
 await page.evaluate(()=>{const d=getAdminDraft();d.services.find(s=>s.id==='pubg').visible=true;saveAdminDraft();});
 await page.locator('#returnFromPreview').click();await page.locator('#featuredTab').click();
 await page.reload();await page.locator('#serviceGrid .service-card').first().waitFor({state:'attached'});await login();
 assert.equal(await page.locator('#fcSizeInput').inputValue(),'large');assert.equal(await page.locator('#fcWidthInput').inputValue(),'60');
 await page.locator('#fcWidthInput').fill('100');await page.locator('#fcWidthInput').dispatchEvent('input');await page.locator('#fcSizeInput').selectOption('standard');
 await page.locator('#adminHeroPreview').screenshot({path:path.join(root,'qa/featured-preview.png')});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  assert(await page.locator('#adminHeroPreview').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 }
 assert.deepEqual(errors,[]);console.log('PASS: card sizing, toggle, conflicting visibility, unavailable offers, linked CTA and saved settings after reload.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
