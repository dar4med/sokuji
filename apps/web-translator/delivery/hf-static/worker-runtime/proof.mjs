import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/,'');
const original=await readFile(root+'/delivery/local-ui-update/payload/assets/inference.worker-DK3oltoU.js');
const patched=await readFile(new URL('./inference.worker-DK3oltoU.js',import.meta.url));
const catalog=JSON.parse(await readFile(root+'/models.lock.json','utf8'));
const model=catalog.models.find(m=>m.id==='en-nl');
let mjs=0,wasm=0,strictCsp=false,badMjs=false;const external=[];
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  // No COI: exercise the existing one-thread path as in an HF iframe.
  if(pathname==='/' || (strictCsp && pathname==='/patched-worker.js')) res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:");
  if(pathname==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>ORT runtime proof</title>');return;}
  if(pathname.endsWith('.mjs')){
    mjs++;
    if(req.headers['sec-fetch-dest']==='script'){res.writeHead(403,{'Content-Type':'text/plain'});res.end('Intentional unavailable module import');return;}
    let body=await readFile(root+'/public/runtime/ort-wasm-simd-threaded.mjs');
    if(badMjs){body=Buffer.from(body);body[0]^=1;}
    res.setHeader('Content-Type','application/javascript');res.end(body);return;
  }
  if(pathname==='/baseline-worker.js'||pathname==='/patched-worker.js') {
    res.setHeader('Content-Type','application/javascript');res.end(pathname.startsWith('/baseline')?original:patched);return;
  }
  if(pathname==='/runtime/ort-wasm-simd-threaded.wasm')wasm++;
  if(!pathname.startsWith('/models/en-nl/')&&pathname!=='/runtime/ort-wasm-simd-threaded.wasm'){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',pathname.endsWith('.wasm')?'application/wasm':pathname.endsWith('.json')?'application/json':'application/octet-stream');
  const stream=createReadStream(root+'/public'+pathname);stream.on('error',()=>res.destroy());stream.pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage();page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
try {
  await page.goto(base);
  // Existing local, pinned files only. No Hugging Face downloads or new models.
  await page.evaluate(async({base,model})=>{
    const cache=await caches.open('medpartners-v2-%2F-models');
    for(const file of model.files){
      const url=base+'models/'+model.id+'/'+file.path;const response=await fetch(url);const buffer=await response.arrayBuffer();
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(buffer.byteLength!==file.bytes||hash!==file.sha256)throw Error('Existing local model hash mismatch');
      await cache.put(url,new Response(buffer));
    }
  },{base,model});
  async function trial(name){
    return page.evaluate(async({base,model,name})=>{
      const worker=new Worker(base+name,{type:'module'});let next=0;
      const call=(type,args)=>new Promise((resolve,reject)=>{
        const id=++next;const timer=setTimeout(()=>reject(Error('Proof timeout')),180000);
        worker.onmessage=({data})=>{if(data.id!==id)return;clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);};
        worker.onerror=()=>{clearTimeout(timer);reject(Error('Worker failed'));};worker.postMessage({id,type,...args});
      });
      try{await call('init',{base,models:[model],speech:false});const result=await call('translate',{text:'The blue bicycle is next to the house.',source:'en',target:'nl'});return {ok:true,result,isolated:crossOriginIsolated};}
      catch(error){return {ok:false,error:error.message,isolated:crossOriginIsolated};}
      finally{worker.terminate();}
    },{base,model,name});
  }
  const baseline=await trial('baseline-worker.js');const baselineMjs=mjs;const baselineWasm=wasm;
  assert.equal(baseline.ok,false);assert.match(baseline.error,/dynamically imported module/);assert.ok(baselineMjs>=1);
  mjs=0;wasm=0;const result=await trial('patched-worker.js');
  assert.equal(result.ok,true,JSON.stringify(result));assert.match(result.result.text,/fiets/i);
  assert.equal(mjs,1);assert.equal(wasm,1);assert.deepEqual(external,[]);
  const patchedMjs=mjs,patchedWasm=wasm;
  strictCsp=true;mjs=0;wasm=0;const blocked=await trial('patched-worker.js');
  assert.equal(blocked.ok,false);assert.match(blocked.error,/blob.*CSP/);assert.equal(wasm,0);
  strictCsp=false;badMjs=true;mjs=0;wasm=0;const corrupt=await trial('patched-worker.js');
  assert.equal(corrupt.ok,false);assert.match(corrupt.error,/SHA-256/);assert.equal(wasm,0);
  const evidence={passed:true,baseline,baselineMjs,baselineWasm,patched:result,patchedMjs,patchedWasm,strictWorkerCsp:blocked,corruptMjs:corrupt,
    source:'One assignment changed in the precompiled worker; existing EN→NL files loaded from local disk and SHA-256 verified',externalRequests:external};
  await writeFile(new URL('./proof.json',import.meta.url),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
