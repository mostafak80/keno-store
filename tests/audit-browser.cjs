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
 const load=async()=>{await page.goto(url);await page.locator('#serviceGrid .service-card').first().waitFor();await page.evaluate(()=>{KenoOrder.openWhatsApp=()=>true;});};
 const open=async()=>page.locator('#serviceGrid [data-service="pubg"],#picksGrid [data-open-service="pubg"]').last().click();
 const review=async()=>{await page.locator('#serviceNext').click();await page.locator('#fulfill-player-id').fill('٥١٢٣٤٥٦٧٨٩');await page.locator('#serviceNext').click();await page.locator('#reviewConfirmed').check();};
 await load();await open();await review();
 await page.evaluate(()=>{const next=structuredClone(KENO_CATALOG);next.updatedAt='2099-01-01T00:00:00.000Z';next.services.find(s=>s.id==='pubg').plans[0].price=999;__hydrate(next);});
 await page.waitForFunction(()=>document.querySelector('#serviceDialog').dataset.step==='1');
 await page.locator('#serviceNext').click();assert.equal(await page.locator('#fulfill-player-id').inputValue(),'5123456789');await page.locator('#serviceNext').click();
 assert.equal(await page.locator('#reviewConfirmed').isChecked(),false);await page.locator('#orderButton').click();assert.equal(await page.evaluate(()=>window.__saved),undefined);
 await page.locator('#reviewConfirmed').check();await page.locator('#orderButton').click();await page.waitForFunction(()=>window.__saved);assert.equal(await page.evaluate(()=>__saved.total),999);
 await load();await open();await review();await page.locator('#addToCartBtn').click();
 await page.evaluate(()=>{const next=structuredClone(KENO_CATALOG);next.updatedAt='2099-01-01T00:00:00.000Z';next.services.find(s=>s.id==='pubg').available=false;__hydrate(next);});
 await page.waitForFunction(()=>document.querySelectorAll('.cart-item-card').length===0);assert.equal(await page.locator('#cartSubmitOrderBtn').isVisible(),false);await page.locator('#closeCartBtn').click();
 // Dynamic admin is authorized by the cloud response, not the static email list.
 await page.evaluate(async()=>{window.__user={email:'editor@example.test'};await __auth(__user);location.hash='#admin';});await page.waitForFunction(()=>window.KenoAdminAuth);await page.locator('#adminWorkspace').waitFor({state:'visible'});
 await page.evaluate(async()=>{KenoAdminAuth.setSession('OWNER',{email:'editor@example.test'});await ensureAdminWorkspace();});
 // Payment edits survive parser normalization.
 await page.evaluate(()=>{document.querySelector('[data-admin-tab="adminPayments"]').click();});
 await page.locator('[data-edit-pm="vodafone-cash"]').click();
 await page.locator('#pmNumberInput').fill('01012345678');await page.locator('#paymentForm button[type="submit"]').click();
 assert.equal(await page.evaluate(()=>getAdminDraft().paymentMethods.find(p=>p.id==='vodafone-cash').number),'01012345678');
 // General design must return false when the cloud refuses the write.
 assert.equal(await page.evaluate(()=>KenoDesign.save({accentColor:'#123456'})),false);
 await page.evaluate(async()=>{window.__orders=[{id:'KENO-TEST',timestamp:Date.now(),total:55,status:'pending',hasReceipt:true,receipt:{dataUrl:'x" onerror="window.__injected=1'},items:[{serviceName:'test',quantity:1,price:'<img src=x onerror="window.__injected=1">'}]}];await renderAdminStore();});
 assert.equal(await page.locator('#adminOrders [onerror]').count(),0);assert.equal(await page.evaluate(()=>window.__injected),undefined);
 assert.deepEqual(errors,[]);console.log('PASS: price refresh requires reconfirmation, unavailable cart blocked, dynamic admin, payment editing, design failures, untrusted receipts.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
