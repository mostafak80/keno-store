/* Local-only preview. Production Firebase is disabled in served responses. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff':'font/woff','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
  if(!/^(index\.html|style\.css|app\.js|manifest\.json|assets\/|js\/)/.test(relative))throw Error('Not found');
  const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('Not found');
  let data=fs.readFileSync(file);
  if(relative==='js/firebase.js')data=Buffer.from(data.toString()+'\nKenoFirebase.getConfig=()=>null;KenoFirebase.fetchLiveCatalog=async()=>null;KenoFirebase.listReviews=async()=>[];\n');
  if(relative==='index.html')data=Buffer.from(data.toString().replace('</body>',`<script>addEventListener('DOMContentLoaded',()=>{document.querySelector('#announcementText').textContent='معاينة محلية للتعديلات — لم تُنشر على الموقع بعد';});</script></body>`));
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
 }catch(_){res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+server.address().port));
