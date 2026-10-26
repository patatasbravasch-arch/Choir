import {playbackFixture} from './fixtures/playback.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const until=async predicate=>{const end=Date.now()+10000;while(!await predicate()){if(Date.now()>end)throw new Error('Timed out waiting for recording storage');await new Promise(resolve=>setTimeout(resolve,25));}};
const errors=[],server=createServer(async(request,response)=>{
 if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(playbackFixture);return;}
 if(!/^\/(src|dist)\/[a-z]+\.js$/.test(request.url)){response.writeHead(404);response.end();return;}
 try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL(`..${request.url}`,import.meta.url)));}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--disable-crash-reporter']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>{
  window.retentionRows=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
   const db=request.result,transaction=db.transaction('recordings'),rows=[],cursor=transaction.objectStore('recordings').openCursor();
   cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;const value=row.value;rows.push({key:row.key,retention:value.retention,expiresAt:value.expiresAt,createdAt:value.createdAt,speechBytes:value.blobs?.filter(blob=>blob instanceof Blob).reduce((sum,blob)=>sum+blob.size,0),mixBytes:value.playedAudio?.blob?.size || 0});row.continue();};
   transaction.oncomplete=()=>{db.close();resolve(rows);};transaction.onerror=()=>{db.close();reject(transaction.error);};
  };});
 });
 await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
 await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
 const play=async()=>{await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));};
 await play();let rows=await page.evaluate(()=>window.retentionRows());assert.equal(rows.length,1);assert.ok(rows[0].speechBytes>0 && rows[0].mixBytes>0);
 const key=rows[0].key;
 await page.locator('details').filter({has:page.locator('[data-et="retention"]')}).locator('summary').click();
 await page.locator('[data-et="retention"]').selectOption('1');
 await until(()=>page.evaluate(async key=>(await window.retentionRows()).find(row=>row.key===key)?.retention==='1',key));
 const before=(await page.evaluate(()=>window.retentionRows())).find(row=>row.key===key),calls=await page.evaluate(()=>window.calls.length);
 await page.locator('details').filter({has:page.locator('[data-et="messages"]')}).locator('summary').click();
 const replay=async()=>{await page.locator('[data-et="messages"]').getByRole('button',{name:'Replay',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent==='Replay finished.');};
 await replay();rows=await page.evaluate(()=>window.retentionRows());assert.equal(rows[0].expiresAt,before.expiresAt);assert.equal(rows[0].retention,'1');assert.equal(await page.evaluate(()=>window.calls.length),calls);
 // Begin Replay in the same event turn as a settings edit, before autosave.
 await page.evaluate(()=>{const select=document.querySelector('[data-et="retention"]');select.value='7';select.dispatchEvent(new Event('change'));[...document.querySelector('[data-et="messages"]').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();});
 await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent==='Replay finished.');
 rows=await page.evaluate(()=>window.retentionRows());assert.equal(rows[0].retention,'7');assert.equal(rows[0].expiresAt,before.createdAt+7*86400000);assert.equal(await page.evaluate(()=>window.calls.length),calls);
 await page.locator('[data-et="retention"]').selectOption('1');await until(()=>page.evaluate(async key=>(await window.retentionRows()).find(row=>row.key===key)?.retention==='1',key));
 await page.evaluate(async key=>new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',1);request.onsuccess=()=>{
  const db=request.result,transaction=db.transaction('recordings','readwrite'),store=transaction.objectStore('recordings'),get=store.get(key),identity=JSON.parse(key);
  get.onsuccess=()=>{const value=get.result;for(const [id,retention,expiresAt,namespace] of [['future','7',value.expiresAt+86400000,identity[0]],['forever','forever',null,identity[0]],['foreign','1',value.expiresAt-1,'another-installation']])store.put({...value,retention,expiresAt},JSON.stringify([namespace,identity[1],id]));};
  transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>{db.close();reject(transaction.error);};
 };}),key);
 await page.evaluate(deadline=>{window.originalNow=Date.now;Date.now=()=>deadline+1000;document.dispatchEvent(new Event('visibilitychange'));},before.expiresAt);
 await until(()=>page.evaluate(async key=>!(await window.retentionRows()).some(row=>row.key===key),key));
 rows=await page.evaluate(()=>window.retentionRows());assert.deepEqual(rows.map(row=>JSON.parse(row.key)[2]).sort(),['foreign','forever','future']);
 assert.ok(rows.every(row=>row.speechBytes>0 && row.mixBytes>0));
 console.log('PASS: Chrome physically deletes the expired speech, passage and played-mix record on return to Choir; Replay preserves the deadline; unexpired, indefinite and other-installation records remain.');
 await page.evaluate(()=>Date.now=window.originalNow);await play();
 await page.locator('[data-et="retention"]').selectOption('session');await until(()=>page.evaluate(async key=>!(await window.retentionRows()).some(row=>row.key===key),key));
 const sessionCalls=await page.evaluate(()=>window.calls.length);await replay();assert.equal(await page.evaluate(()=>window.calls.length),sessionCalls);
 assert.equal((await page.evaluate(()=>window.retentionRows())).some(row=>row.key===key),false);
 await page.evaluate(async()=>{await window.cleanup();window.cleanup=await window.mountChoir();});
 await page.locator('details').filter({has:page.locator('[data-et="messages"]')}).locator('summary').click();
 await page.locator('[data-et="messages"]').getByRole('button',{name:'Replay',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('No saved audio'));
 console.log('PASS: session-only conversion removes the Chrome disk copy immediately, permits replay without synthesis during the session, and leaves no replayable copy after Choir remounts.');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
