import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyFirebaseToken } from '../server/firebase-token.mjs';
import handler from '../api/publish.js';
import fs from 'node:fs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=publicKey.export({type:'spki',format:'pem'});
const now=Date.now(),t=Math.floor(now/1000);
const claims={aud:'keno-store',iss:'https://securetoken.google.com/keno-store',sub:'uid1',email:'test@example.test',email_verified:true,iat:t-10,auth_time:t-20,exp:t+3600};
function jwt(changes={},head={}){const a=Buffer.from(JSON.stringify({alg:'RS256',kid:'test',...head})).toString('base64url');const b=Buffer.from(JSON.stringify({...claims,...changes})).toString('base64url');return a+'.'+b+'.'+sign('RSA-SHA256',Buffer.from(a+'.'+b),privateKey).toString('base64url')}
const verify=token=>verifyFirebaseToken(token,{projectId:'keno-store',now,keys:{test:pem}});
test('valid signed Firebase identity accepted',async()=>assert.equal((await verify(jwt())).sub,'uid1'));
for(const [name,changes] of Object.entries({expired:{exp:t-1},wrongProject:{aud:'other'},wrongIssuer:{iss:'https://evil.test'},unverified:{email_verified:false},stringVerified:{email_verified:'true'},future:{iat:t+100},futureAuth:{auth_time:t+100},emptyUser:{sub:''}}))test('reject '+name,async()=>assert.rejects(verify(jwt(changes))));
test('reject unsigned algorithm and unknown key',async()=>{await assert.rejects(verify(jwt({},{alg:'none'})));await assert.rejects(verify(jwt({},{kid:'unknown'})))});
test('reject modified payload with original signature',async()=>{const parts=jwt().split('.');parts[1]=Buffer.from(JSON.stringify({...claims,email:'attacker@test.test'})).toString('base64url');await assert.rejects(verify(parts.join('.')))});
const source=fs.readFileSync(new URL('../assets/catalog.js',import.meta.url),'utf8');
function response(){return {statusCode:0,headers:{},data:null,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.data=v;return this},end(){return this}}}
test('publish enforces baseline, validates JSON and writes safe content',async()=>{
 const original=global.fetch;const oldEnv={...process.env};let puts=0;
 Object.assign(process.env,{ADMIN_EMAILS:'test@example.test',GITHUB_TOKEN:'test-only',GITHUB_REPO:'test/repo'});
 global.fetch=async(url,options={})=>{
  if(String(url).includes('/robot/'))return new Response(JSON.stringify({test:pem}),{headers:{'cache-control':'max-age=100'}});
  if(options.method==='PUT'){puts++;const body=JSON.parse(options.body);assert.equal(body.sha,'baseline');assert.ok(Buffer.from(body.content,'base64').toString().startsWith('window.KENO_CATALOG = '));return new Response(JSON.stringify({content:{sha:'new-sha'}}))}
  return new Response(JSON.stringify({sha:'baseline',content:Buffer.from(source).toString('base64')}));
 };
 try{
  let res=response();await handler({method:'POST',headers:{authorization:'Bearer '+jwt()},body:{catalogSource:source,expectedSha:'old'}},res);assert.equal(res.statusCode,409);assert.equal(puts,0);
  res=response();await handler({method:'POST',headers:{authorization:'Bearer '+jwt()},body:{catalogSource:source+';alert(1)',expectedSha:'baseline'}},res);assert.equal(res.statusCode,400);assert.equal(puts,0);
  res=response();await handler({method:'POST',headers:{authorization:'Bearer '+jwt()},body:{catalogSource:source,expectedSha:'baseline'}},res);assert.equal(res.statusCode,200);assert.equal(puts,1);
 }finally{global.fetch=original;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv)}
});
test('publish rejects missing login and non-POST methods',async()=>{let res=response();await handler({method:'POST',headers:{},body:{}},res);assert.equal(res.statusCode,401);res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.statusCode,405)});
