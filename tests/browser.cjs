const fs=require('fs'),http=require('http'),path=require('path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=path.resolve(__dirname,'..');
const shots=process.env.QA_SCREENSHOTS;
if(shots)fs.mkdirSync(shots,{recursive:true});
(async()=>{
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(file===root+'/')file+='index.html';if(!file.startsWith(root+'/')){res.writeHead(403);return res.end()};try{const data=fs.readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff':'font/woff'})[path.extname(file)]||'application/octet-stream');res.end(data)}catch{res.writeHead(404);res.end()}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
try{
 const ctx=await b.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
 await ctx.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 await p.locator('#serviceGrid .service-card').first().waitFor();
 const states=[];
 for(const theme of ['dark','light']){
 if(await p.getAttribute('html','data-theme')!==theme)await p.locator('#themeToggle').click();
 states.push(await p.evaluate(()=>({theme:document.documentElement.dataset.theme,body:getComputedStyle(document.body).backgroundColor,heading:getComputedStyle(document.querySelector('#testimonialsTitle')).color,reviews:getComputedStyle(document.querySelector('#testimonials')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,count:document.querySelectorAll('#serviceGrid .service-card').length})));
 await p.locator('#testimonials').scrollIntoViewIfNeeded();if(shots)await p.screenshot({path:path.join(shots,theme+'-reviews.png')});
 await p.evaluate(()=>scrollTo(0,0));if(shots)await p.screenshot({path:path.join(shots,theme+'-home.png')});
 }

 assert.equal(await p.locator('[data-motion-toggle]').count(),0);
 await p.reload(); assert.equal(await p.getAttribute('html','data-theme'),'light');
 for(const query of ['ببجي','Netflix']) {
   await p.locator('#searchInput').fill(query);
   await p.waitForFunction(()=>document.querySelectorAll('#serviceGrid .service-card').length<41);
   assert.ok(await p.locator('#serviceGrid .service-card').count()>0);
   await p.locator('#clearSearch').click();
   await p.waitForFunction(()=>document.querySelectorAll('#serviceGrid .service-card').length===41);
 }
 await p.locator('#picksGrid button').first().click();
 await p.locator('#serviceDialog').waitFor({state:'visible'});
 const methods=p.locator('#dialogPaymentMethods .payment-card');
 assert.equal(await methods.count(),3);
 for(let i=0;i<3;i++){
   await methods.nth(i).locator('.payment-card-header').click();
   assert.equal(await methods.nth(i).locator('input').isChecked(),true);
   assert.ok(await p.locator('#dialogPaymentMethods .payment-details-drawer.open').count()<=1);
 }
 if(shots)await p.screenshot({path:path.join(shots,'light-order.png')});
 await p.locator('#pubgPlayerIdInput').fill('5123456789');
 await p.evaluate(()=>{window.KenoFirebase.createOrder=async()=>({success:true,cloud:false});window.KenoOrder.openWhatsApp=url=>{window.__orderUrl=url;return true}});
 await p.locator('#orderButton').click();
 await p.waitForFunction(()=>!!window.__orderUrl);
 assert.match(await p.evaluate(()=>decodeURIComponent(window.__orderUrl)),/5123456789/);
 await p.locator('#picksGrid button').first().click();
 await p.locator('#addToCartBtn').click();
 await p.locator('.cart-item-card').waitFor();
 await p.locator('[data-cart-action=inc]').click();
 assert.equal(await p.locator('.cart-qty-val').textContent(),'2');
 await p.keyboard.press('Escape');
 assert.equal(await p.locator('#cartDrawer').isVisible(),false);
 await p.evaluate(()=>{const key='keno.cart.v1';const cart=JSON.parse(localStorage.getItem(key));cart.unshift({serviceId:'deleted',planId:'missing',quantity:1});localStorage.setItem(key,JSON.stringify(cart))});
 await p.locator('#headerCartBtn').click();
 await p.locator('[data-cart-action=remove]').click();
 assert.equal(await p.locator('.cart-item-card').count(),0);
 assert.equal(await p.locator('#cartEmptyState').isVisible(),true);
 await p.keyboard.press('Escape');
 for(const width of [320,390,768,1440]){
   await p.setViewportSize({width,height:900});
   if(width===320 && shots)await p.screenshot({path:path.join(shots,'mobile320.png')});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow at '+width);
   assert.equal(await p.locator('#themeToggle').isVisible(),true);
 }
 await p.locator('#themeToggle').click();
 assert.equal(await p.getAttribute('html','data-theme'),'dark');
 await p.locator('#picksGrid button').first().click();
 if(shots)await p.screenshot({path:path.join(shots,'dark-order.png')});
 await p.locator('[data-close-dialog="serviceDialog"]').first().click();
 await p.evaluate(()=>location.hash='#admin');
 await p.locator('#adminLogin').waitFor({state:'visible'});
 await p.waitForFunction(()=>Boolean(window.KenoAdminAuth));
 await p.evaluate(async()=>{KenoAdminAuth.setSession('OWNER');await ensureAdminWorkspace();document.querySelector('#adminLogin').hidden=true;document.querySelector('#adminWorkspace').hidden=false;const d=getAdminDraft();d.services[0].plans[0].price+=1;saveAdminDraft(d);KenoFirebase.publishCatalog=async()=>{throw new Error('Test offline')};KenoFirebase.getIdToken=async()=>null;});
 await p.waitForFunction(()=>document.querySelector('#kpiRevenue').textContent === '0 ج.م');
 if(shots)await p.screenshot({path:path.join(shots,'dark-admin.png')});
 await p.locator('#publishButton').click();
 await p.locator('#confirmAccept').click();
 await p.waitForFunction(()=>document.querySelector('#adminMessage').textContent.includes('تعذر النشر'));
 assert.equal(await p.locator('#publishButton').isEnabled(),true);
 assert.match(await p.locator('#draftStatus').textContent(),/لم تُنشر/);
 await ctx.close();
 const reduced=await b.newContext({reducedMotion:'reduce',colorScheme:'dark'});
 await reduced.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 await reduced.addInitScript(()=>{Storage.prototype.getItem=function(){throw new Error('blocked')};Storage.prototype.setItem=function(){throw new Error('blocked')}});
 const rp=await reduced.newPage();rp.on('pageerror',e=>errors.push(e.message));
 await rp.goto('http://127.0.0.1:'+server.address().port);
 await rp.locator('#themeToggle').click();
 assert.equal(await rp.getAttribute('html','data-theme'),'light');
 assert.equal(await rp.locator('#heroFeature').evaluate(el=>getComputedStyle(el).animationName),'none');
 await reduced.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({states,errors}));
}catch(e){console.error(e);process.exitCode=1}finally{await b.close();server.close()}
})();
