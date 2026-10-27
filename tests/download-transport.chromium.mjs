// Real media/MediaRecorder regression: transport navigation cannot make a
// shortened or repeated playback look like a complete downloadable message.
import {playbackFixture} from './fixtures/playback.mjs';
import {withDrawerControl,showDrawerControl} from './fixtures/drawer.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),errors=[];
const server=createServer(async(request,response)=>{
 if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(playbackFixture);return;}
 if(!/^\/(src|dist)\/[a-z-]+\.js$/.test(request.url)){response.writeHead(404);response.end();return;}
 try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL(`..${request.url}`,import.meta.url)));}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const mix=page=>page.evaluate(()=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction('recordings'),cursor=tx.objectStore('recordings').openCursor();let value;
  cursor.onsuccess=()=>{const row=cursor.result;if(row)value=row.value;};
  tx.oncomplete=()=>{db.close();resolve({complete:value?.playedAudio?.complete,bytes:value?.playedAudio?.blob?.size,duration:value?.playedAudio?.duration,clips:value?.blobs?.filter(Boolean).length,total:value?.segments?.length});};tx.onerror=()=>{db.close();reject(tx.error);};
 };
}));
const startPlay=page=>page.locator('[data-choir-action="playback"]').click();
const finish=async page=>{try{await page.waitForFunction(()=>/^(?:Playback|Replay) finished\./.test(document.querySelector('[data-et="status"]').textContent));}catch(error){throw new Error(JSON.stringify(await page.evaluate(()=>({status:document.querySelector('[data-et="status"]').textContent,calls:window.calls.map(call=>call.text.slice(0,100)),audios:window.audios.map(audio=>({time:audio.currentTime,duration:audio.duration,paused:audio.paused,ended:audio.ended,error:audio.error?.message}))}))),{cause:error});}};
const replay=async page=>{await showDrawerControl(page,'messages');await page.locator('[data-et="messages"]').getByRole('button',{name:'Replay',exact:true}).click();};
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
 for(const source of process.argv.includes('--long-only')?[]:['play','replay'])for(const action of ['next','previous','seek','pause']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
  await page.evaluate(async()=>{await window.cleanup();Object.assign(window.fixtureStore.get('chat:fixture'),{sectionButtons:true,normalizeLoudness:false});window.fixtureMessage.content='The hall fell silent. "Welcome." A new story begins. "And another line." The end.';window.cleanup=await window.mountChoir();});
  await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
  await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  if(source==='replay'){await startPlay(page);await finish(page);assert.equal((await mix(page)).complete,true);await replay(page);}else await startPlay(page);
  const block=action==='previous'?2:1;
  await page.waitForFunction(block=>new RegExp(`^(?:Playing|Replaying) ${block}/`).test(document.querySelector('[data-et="status"]').textContent),block);
  await page.waitForFunction(()=>window.audios.at(-1)?.currentTime>0.1 && !window.audios.at(-1).paused);
  if(action==='seek')await page.locator('.cm-seek:not([hidden]) input').first().evaluate(node=>{node.value='0.7';node.dispatchEvent(new Event('input',{bubbles:true}));});
  else if(action==='pause'){
   await startPlay(page);await page.waitForFunction(()=>window.audios.at(-1)?.paused);
   await page.waitForTimeout(150);await startPlay(page);
  }else await page.locator(`[data-choir-action="${action}"]`).click();
  await finish(page);const saved=await mix(page),download=page.locator('footer [data-choir-download]');assert.ok(saved.bytes>0);
  assert.equal(saved.complete,action==='pause',`${source}/${action}: ${JSON.stringify(saved)}`);
  await download.waitFor({state:action==='pause'?'visible':'hidden'});
  if(action!=='pause'){
   assert.match(await page.locator('[data-et="status"]').textContent(),/Play the message from the start without navigation/);
   const calls=await page.evaluate(()=>window.calls.length);await replay(page);await finish(page);
   assert.equal((await mix(page)).complete,true);await download.waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.calls.length),calls,'complete Replay reuses cached speech');
  }
  console.log(`PASS: ${source}/${action} has correct full-message download eligibility and cached recovery.`);await context.close();
 }
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
  await page.evaluate(async()=>{await window.cleanup();Object.assign(window.fixtureStore.get('chat:fixture'),{sectionButtons:true,normalizeLoudness:false,prefetch:0,chunk:500});window.fixtureMessage.content='The hallway stretched past '+Array.from({length:100},(_,index)=>`door number ${index+1}`).join(' and ')+'. "Welcome." The end.';window.cleanup=await window.mountChoir();});
  await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
  await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  await startPlay(page);await page.waitForFunction(()=>window.audios.at(-1)?.currentTime>0.1 && !window.audios.at(-1).paused);await page.locator('[data-choir-action="next"]').click();await finish(page);
  const partial=await mix(page);assert.equal(partial.complete,false);assert.ok(partial.clips<partial.total,JSON.stringify(partial));
  await replay(page);await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Some speech is missing'));
  const calls=await page.evaluate(()=>window.calls.length);await startPlay(page);await finish(page);const repaired=await mix(page);
  assert.equal(repaired.complete,true);assert.equal(repaired.clips,repaired.total);assert.equal(await page.evaluate(()=>window.calls.length)-calls,partial.total-partial.clips,'Play synthesizes only the chunks actually skipped before generation');
  await page.locator('footer [data-choir-download]').waitFor({state:'visible'});
  console.log('PASS: skipping an uncached multi-chunk block stays incomplete; Play repairs only missing chunks.');await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
