const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Mostafa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const mock=';KenoFirebase.init=async()=>null;KenoFirebase.fetchLiveCatalog=async()=>null;KenoFirebase.loadDesignSettings=async()=>null;KenoFirebase.listReviews=async()=>[];';
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{let data=fs.readFileSync(file);if(file.endsWith(path.join('js','firebase.js')))data=Buffer.from(data+mock);
   res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript; charset=utf-8','.woff':'font/woff','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch(_){res.writeHead(404);res.end();}
 }).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const width of [390,1024,1440]){
   for(const theme of ['light','dark']){
    const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:width===390?'reduce':'no-preference'});
    await ctx.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const resultsVisible=async()=>{try{await page.waitForFunction(()=>{
     const heading=document.querySelector('.results-meta').getBoundingClientRect(),header=document.querySelector('.site-header').getBoundingClientRect();
     const gap=heading.top-header.bottom;
     return gap>=12&&gap<=20&&document.querySelector('#serviceGrid .service-card').getBoundingClientRect().top<innerHeight;
    });}catch(error){console.log('Scroll diagnostic:',await page.evaluate(()=>({category:document.querySelector('#categoryTabs [aria-pressed=true]')?.dataset.category,heading:document.querySelector('.results-meta').getBoundingClientRect().toJSON(),header:document.querySelector('.site-header').getBoundingClientRect().toJSON(),scrollY,scrollHeight:document.documentElement.scrollHeight,innerHeight,zoom:getComputedStyle(document.body).zoom})));throw error;}};
    await page.goto(url);await page.locator('#serviceGrid .service-card').first().waitFor();
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    if(width>780){
     for(const tab of await page.locator('#categoryTabs button').all()){
      const before=await tab.locator('.category-count').textContent();await tab.click();
      await resultsVisible();
      assert.equal(await tab.locator('.category-count').textContent(),before);
      const contrast=await tab.locator('.category-count').evaluate(el=>{
       const s=getComputedStyle(el),lum=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(x=>Number(x)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];},a=lum(s.color),b=lum(s.backgroundColor);
       return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      });assert(contrast>=4.5,'count contrast '+contrast);
     }
     await page.locator('#categoryTabs [data-category="ai"]').focus();
     await page.locator('#categoryTabs [data-category="ai"]').press('Enter');await resultsVisible();
    }else{
     for(const category of ['games','entertainment','ai','apps','payments','marketing','social','all']){
      await page.locator('#mobileCategoryFilter').selectOption(category);await resultsVisible();
     }
     await page.locator('#mobileCategoryFilter').selectOption('ai');await resultsVisible();
    }
    await page.locator('#discoverService').click();
    const first=await page.locator('.discovery-result [data-open-service]').getAttribute('data-open-service');
    assert(await page.evaluate(id=>getStoreCatalog().services.find(s=>s.id===id).category==='ai',first));
    const expected=await page.evaluate(id=>Math.min(...getStoreCatalog().services.find(s=>s.id===id).plans.filter(p=>p.available).map(p=>p.price)),first);
    assert((await page.locator('.discovery-result-price').textContent()).includes(String(expected)));
    if(width===390)assert.equal(await page.locator('.discovery-result').evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.locator('#discoverService').click();
    const eligible=await page.evaluate(()=>getStoreCatalog().services.filter(s=>s.category==='ai'&&s.visible&&s.available!==false&&s.plans.some(p=>p.available&&p.price>0)).length);
    const next=await page.locator('.discovery-result [data-open-service]').getAttribute('data-open-service');if(eligible>1)assert.notEqual(first,next);
    await page.locator('.discovery-result [data-open-service]').click();await page.locator('#serviceDialog').waitFor({state:'visible'});
    await page.evaluate(()=>document.getElementById('serviceDialog').close());
    await page.locator('[data-dismiss-discovery]').click();assert.equal(await page.locator('.discovery-result').count(),0);
    await page.locator('#searchInput').evaluate(e=>{e.value='zzzzzz_no_match';e.dispatchEvent(new Event('input',{bubbles:true}));});
    assert(await page.locator('#discoverService').isDisabled());
    await page.locator('#searchInput').evaluate(e=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));});
    if(width>780)await page.locator('#categoryTabs [data-category="all"]').click();else await page.locator('#mobileCategoryFilter').selectOption('all');
    await page.locator('#discoverService').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.locator('#discoveryPlay').screenshot({path:path.join(root,'qa/discovery-'+width+'-'+theme+'.png')});
    if(width>780)await page.locator('#categoryTabs').screenshot({path:path.join(root,'qa/category-polish-'+width+'-'+theme+'.png')});
    assert.deepEqual(errors,[]);console.log('PASS:',width,theme,'counts readable, scoped suggestions, exact prices, CTA and reduced motion');
    await ctx.close();
   }
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

