import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=spawn('.venv/Scripts/python.exe',['run.py','--port','8003'],{stdio:'ignore'});
let browser;
try{
 let ready=false;
 for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:8003/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'Servidor de teste disponível');
 try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({headless:true,channel:'msedge'});}
 const page=await browser.newPage();
 const refs=[];
 await page.route('https://tile.openstreetmap.org/**',async route=>{refs.push((await route.request().allHeaders()).referer);await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/></svg>'});});
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 // An already-running server may still send the old policy until restarted.
 await page.route('http://127.0.0.1:8003/',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'referrer-policy':'no-referrer'}});});
 await page.goto('http://127.0.0.1:8003/');
 await page.locator('.leaflet-tile-loaded').first().waitFor();
 assert.ok(refs.length>0);
 assert.ok(refs.every(ref=>ref==='http://127.0.0.1:8003/'),JSON.stringify(refs));
 assert.equal(await page.locator('.leaflet-tile').first().getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
 console.log('OK: navegador envia a origem verdadeira do site às imagens do mapa, mesmo com o cabeçalho antigo. Nenhuma solicitação foi enviada ao OpenStreetMap neste teste.');
}finally{await browser?.close();server.kill();}
