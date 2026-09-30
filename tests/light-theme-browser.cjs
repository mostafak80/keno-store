/* Regression scenarios; every external request is blocked and writes stay in memory. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Mostafa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'qa'),{recursive:true});
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
 for(const width of [320,390,1440]) {
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),url='http://127.0.0.1:'+server.address().port;await ctx.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await ctx.addInitScript(()=>localStorage.setItem('keno-theme','light'));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 await page.setViewportSize({width,height:1000});await page.goto(url);await page.locator('#serviceGrid .service-card').first().waitFor();
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 const reports=[];
 // Audit painted text against solid surfaces and gradient stops, then inspect the saved screenshots.
 // Raster artwork and text filled by a gradient need visual review rather than a CSS-only ratio.
 const scan=async phase=>{
  await page.waitForTimeout(500); const issues=await page.evaluate(()=>{
   const color=v=>{const p=v.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return [p[0],p[1],p[2],p[3]??1];},over=(f,b)=>{const a=f[3]+b[3]*(1-f[3]);return [0,1,2].map(i=>(f[i]*f[3]+b[i]*b[3]*(1-f[3]))/a).concat(a);},lum=c=>{const v=c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
   const seen=new Set(),out=[];
   for(const el of ((document.querySelector('dialog[open]')||document.querySelector(document.querySelector('#cartDrawer')?.hidden===false?'#cartDrawer':document.querySelector('#adminWorkspace')?.checkVisibility()?'#adminWorkspace':'body'))||document.body).querySelectorAll('*')){
    if(['SCRIPT','STYLE','SVG','PATH','OPTION'].includes(el.tagName)||el.closest('svg')||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||el.closest('[disabled]'))continue;
    const text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();if(!/[\p{L}\p{N}]/u.test(text))continue;
    const style=getComputedStyle(el);let bg=[255,255,255,1],backgrounds=[bg];
    const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
    for(const p of chain){const s=getComputedStyle(p),c=color(s.backgroundColor);backgrounds=backgrounds.map(b=>over(c,b));if(c[3]===1)backgrounds=[c];
     const layers=[];let depth=0,start=0;for(let i=0;i<s.backgroundImage.length;i++){const ch=s.backgroundImage[i];if(ch==='(')depth++;if(ch===')')depth--;if(ch===','&&depth===0){layers.push(s.backgroundImage.slice(start,i));start=i+1;}}layers.push(s.backgroundImage.slice(start));
     for(const layer of layers.reverse()){const stops=(layer.match(/rgba?\([^)]+\)/g)||[]).map(color);if(stops.length){backgrounds=backgrounds.flatMap(b=>stops.map(c=>over(c,b)));if(backgrounds.length>30){backgrounds.sort((a,b)=>lum(a)-lum(b));backgrounds=[backgrounds[0],backgrounds.at(-1)];}}}
    }bg=backgrounds[0];
    if(style.backgroundClip==='text'||style.webkitBackgroundClip==='text')continue;
    const fg=over(color(style.color),bg),a=lum(fg),b=lum(bg),ratio=Math.min((Math.max(a,b)+.05)/(Math.min(a,b)+.05),...backgrounds.map(bg2=>{const fg2=over(color(style.color),bg2),x=lum(fg2),y=lum(bg2);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}));
    const threshold=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700)?3:4.5;
    const selector=el.id?'#'+el.id:[el.parentElement,el].map(p=>p.id?'#'+p.id:p.tagName.toLowerCase()+'.'+String(p.className).trim().replace(/\s+/g,'.')).join(' > ');
    if(ratio<threshold&&!seen.has(selector)){seen.add(selector);out.push({selector,text:text.slice(0,75),ratio:+ratio.toFixed(2),fg:style.color,bg:bg.map(Math.round),threshold});}
   }
   return out;
  });reports.push({phase,issues});assert.deepEqual(issues,[],width+'px '+phase+' text contrast');
 };
 await scan('home');
 await page.locator('.hero').screenshot({path:path.join(root,'qa/light-home-'+width+'.png')});
 await page.locator('#reviewForm').screenshot({path:path.join(root,'qa/light-review-form-'+width+'.png')});
 const action=page.locator('.hero .button-red').first();await action.hover();await scan('home-hover');
 await action.focus();assert.notEqual(await action.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 const submit=page.locator('#reviewForm button[type=submit]');await submit.evaluate(e=>e.disabled=true);await page.waitForFunction(()=>getComputedStyle(document.querySelector('#reviewForm button[type=submit]')).color==='rgb(82, 96, 116)');await submit.evaluate(e=>e.disabled=false);
 await page.locator('#picksGrid [data-open-service="pubg"]').click();await scan('plans');
 await page.locator('#serviceNext').click();await scan('account');
 await page.locator('#fulfill-player-id').fill('5123456789');await page.locator('#serviceNext').click();await scan('review');
 for(const card of await page.locator('#dialogPaymentMethods .payment-card').all()){await card.locator('.payment-card-header').click();await scan('payment-selected');}
 await page.locator('#serviceDialog').screenshot({path:path.join(root,'qa/light-checkout-'+width+'.png')});
 await page.locator('#reviewConfirmed').check();await page.locator('#addToCartBtn').click();await scan('cart-1');
 await page.locator('#cartNextStepBtn').click();await scan('cart-2');
 await page.locator('#cartNextStepBtn').click();await scan('cart-3');await page.locator('#cartDrawer').screenshot({path:path.join(root,'qa/light-cart-'+width+'.png')});await page.locator('#closeCartBtn').click();
 await page.evaluate(async()=>{window.__user={email:'editor@example.test'};await __auth(__user);location.hash='#admin';});await page.locator('#adminWorkspace').waitFor({state:'visible'});
 for(const tab of await page.locator('[data-admin-tab]').all()){if(!await tab.isVisible())continue;await tab.click();const name=await tab.getAttribute('data-admin-tab');await scan(name);if(width===1440&&['adminServiceImages','adminTexts','adminDesign'].includes(name))await page.screenshot({path:path.join(root,'qa/light-'+name+'.png')});}
 await page.locator('[data-admin-tab=adminServices]').click();await page.locator('[data-edit-service=pubg]').click();await scan('service-editor');await page.locator('#tabMediaMobile').click();await scan('service-editor-mobile-image');await page.locator('#tabMediaDesktop').click();await page.locator('#editorDialog').screenshot({path:path.join(root,'qa/light-editor-'+width+'.png')});await page.locator('[data-close-dialog=editorDialog]').first().click();
 for(const dialog of ['planDialog','categoryDialog','paymentDialog','confirmDialog','orderDetailsDialog']){await page.evaluate(id=>document.getElementById(id).showModal(),dialog);await scan(dialog);await page.evaluate(id=>document.getElementById(id).close(),dialog);}
 await page.evaluate(()=>{location.hash='';});await page.locator('#storefront').waitFor({state:'visible'});if(width<780){await page.locator('#mobileMoreBtn').click();await scan('mobile-menu');await page.locator('#mobileThemeAction').click();await page.locator('#mobileMoreDialog').evaluate(e=>e.close());}else await page.locator('#themeToggle').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0,3).every(x=>Number(x)<35)));
 assert.equal(await page.evaluate(()=>localStorage.getItem('keno-theme')),'dark');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(errors,[]);console.log('PASS:',width,'light text contrast, checkout, cart, reviews, all admin tabs/editors, hover, disabled and focus; dark theme retained');await ctx.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
