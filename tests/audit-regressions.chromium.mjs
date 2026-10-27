import {showDrawerControl,withDrawerControl} from './fixtures/drawer.mjs';
// Isolated regressions for partial replay, stable retention, stale tabs and casting.
import {playbackFixture} from './fixtures/playback.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),errors=[];
const server=createServer(async(request,response)=>{
 if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(playbackFixture);return;}
 if(!/^\/(src|dist)\/[a-z]+\.js$/.test(request.url)){response.writeHead(404);response.end();return;}
 try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL(`..${request.url}`,import.meta.url)));}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const until=async predicate=>{const end=Date.now()+12000;while(!await predicate()){if(Date.now()>end)throw new Error('Timed out waiting for recording state');await new Promise(resolve=>setTimeout(resolve,25));}};
const status=page=>page.locator('[data-et="status"]').textContent();
const openDetails=(page,name)=>showDrawerControl(page,name);
const mount=async(context,namespace)=>{
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 if(namespace)await page.evaluate(async namespace=>{await window.cleanup();window.fixtureStore.set('audio:namespace',namespace);window.cleanup=await window.mountChoir();},namespace);
 await page.evaluate(()=>{
  window.recordingRead=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
   const db=request.result,transaction=db.transaction('recordings'),cursor=transaction.objectStore('recordings').openCursor();let value;
   cursor.onsuccess=()=>{const row=cursor.result;if(row){value={key:row.key,value:row.value};}};transaction.oncomplete=()=>{db.close();resolve(value);};transaction.onerror=()=>{db.close();reject(transaction.error);};
  };});
  window.recordingEdit=async edit=>{const row=await window.recordingRead();if(!row)throw Error('No fixture recording');edit(row.value);await new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',2);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('recordings','readwrite');transaction.objectStore('recordings').put(row.value,row.key);transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>{db.close();reject(transaction.error);};};});};
 });
 await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();return page;
};
const summary=page=>page.evaluate(async()=>{const row=await window.recordingRead();if(!row)return null;const value=row.value;return {retention:value.retention,createdAt:value.createdAt,expiresAt:value.expiresAt,fullMessage:value.fullMessage,clips:value.blobs?.map(Boolean),mixBytes:value.playedAudio?.blob?.size || 0,mixComplete:value.playedAudio?.complete};});
const plan=async page=>{await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>/^Ready:|Saved attribution/.test(document.querySelector('[data-et="status"]').textContent));};
const play=async page=>{await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));};
const record=async page=>{await plan(page);await play(page);};
const replay=async page=>{await openDetails(page,'messages');await page.locator('[data-et="messages"]').getByRole('button',{name:'Replay',exact:true}).click();};
const finishReplay=page=>page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent==='Replay finished.');
const retention=async(page,value)=>{await openDetails(page,'retention');await withDrawerControl(page,'retention',()=>page.locator('[data-et="retention"]').selectOption(value));await page.waitForFunction(()=>document.querySelector('[data-et="saveState"]').textContent==='Saved automatically');};
// Keyboard activation also works when the freely positioned mixer overlaps the fixture footer.
const download=async page=>{const pending=page.waitForEvent('download');void pending.catch(()=>{});try{await page.locator('footer [data-choir-download]').press('Enter');const file=await pending;return readFile(await file.path());}catch(error){error.message+=`\nChoir status: ${await status(page)}\nRecording: ${JSON.stringify(await summary(page))}`;throw error;}};
const seconds=wav=>wav.readUInt32LE(40)/(wav.readUInt16LE(22)*2*wav.readUInt32LE(24));
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--disable-crash-reporter']});
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{const request=indexedDB.open('choir-recordings',1);request.onupgradeneeded=()=>request.result.createObjectStore('recordings');request.onsuccess=()=>{const db=request.result,transaction=db.transaction('recordings','readwrite');transaction.objectStore('recordings').put({createdAt:123,retention:'forever',expiresAt:null,blobs:[new Blob(['legacy-speech'])]},JSON.stringify(['legacy-installation','legacy-chat','legacy-message']));transaction.oncomplete=()=>db.close();};});
  const page=await mount(context);const migrated=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('recordings'),get=transaction.objectStore('recordings').get(JSON.stringify(['legacy-installation','legacy-chat','legacy-message']));get.onsuccess=()=>{resolve({version:db.version,state:db.objectStoreNames.contains('recording-state'),createdAt:get.result.createdAt,bytes:get.result.blobs[0].size});db.close();};};}));
  assert.deepEqual(migrated,{version:2,state:true,createdAt:123,bytes:13});console.log('PASS: the database upgrade preserves existing recording metadata and speech bytes.');await context.close();
 }
 {
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await mount(context);
  await plan(page);await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Playing 1/'));await withDrawerControl(page,'stop',()=>page.locator('[data-et="stop"]').click());
  await until(async()=>Boolean(await summary(page)));assert.ok((await summary(page)).clips.filter(Boolean).length<3);
  await replay(page);await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Some speech is missing'));assert.equal((await summary(page)).mixBytes,0);
  await page.locator('footer [data-choir-download]').waitFor({state:'hidden'});
  console.log('PASS: interrupted playback cannot become a silently truncated completed Replay/download.');await context.close();
 }
 {
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await mount(context);await record(page);
  const complete=await summary(page),baseline=await download(page);assert.ok(seconds(baseline)>=3 && seconds(baseline)<4.5);
  await page.evaluate(()=>window.recordingEdit(value=>{value.blobs[1]=undefined;for(const key of Object.keys(value.passages))if(key.includes('Welcome'))delete value.passages[key];}));
  await replay(page);await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Some speech is missing'));
  assert.equal((await summary(page)).mixBytes,complete.mixBytes);assert.deepEqual(await download(page),baseline,'a previously verified complete mix remains downloadable unchanged');
  await page.evaluate(async()=>{await window.recordingEdit(value=>{delete value.playedAudio.complete;});window.fixtureEvents.get('MESSAGE_EDITED')({messageId:'reply'});});await page.locator('footer [data-choir-download]').waitFor({state:'hidden'});
  console.log('PASS: a failed partial Replay preserves the complete mix; an unverified legacy partial mix is refused.');await context.close();
 }
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await mount(context);await record(page);await retention(page,'7');
  await page.evaluate(()=>window.recordingEdit(value=>{value.createdAt=Date.now()-6*86400000;value.expiresAt=value.createdAt+7*86400000;value.blobs[1]=undefined;for(const key of Object.keys(value.passages))if(key.includes('Welcome'))delete value.passages[key];}));
  const before=await summary(page),calls=await page.evaluate(()=>window.calls.length);await plan(page);await play(page);const after=await summary(page);
  assert.equal(after.createdAt,before.createdAt);assert.equal(after.expiresAt,before.expiresAt);assert.equal(after.fullMessage,true);assert.equal(await page.evaluate(()=>window.calls.length),calls+1);
  console.log('PASS: repairing one clip preserves the six-day-old recording creation date and original seven-day deadline.');await context.close();
 }
 for(const action of ['shorter','delete','clear','session']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),a=await mount(context);await record(a);await retention(a,'7');
  const namespace=await a.evaluate(()=>window.fixtureStore.get('audio:namespace')),b=await mount(context,namespace);
  if(action==='shorter')await a.evaluate(()=>window.recordingEdit(value=>{value.createdAt=Date.now()-2*86400000;value.expiresAt=value.createdAt+7*86400000;}));
  await replay(a);await a.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Replaying '));
  if(action==='shorter'){await retention(b,'1');await until(async()=>!await summary(b));await retention(b,'forever');}
  else if(action==='session'){await retention(b,'session');await until(async()=>!await summary(b));}
  else{await openDetails(b,'messages');if(action==='clear')await withDrawerControl(b,'deleteChatAudio',()=>b.locator('[data-et="deleteChatAudio"]').click());else await b.locator('[data-et="messages"]').getByRole('button',{name:'Delete audio',exact:true}).click();await until(async()=>!await summary(b));}
  await until(async()=>/^Replay finished\.|.*deleted or expired/.test(await status(a)));
  assert.equal(await summary(a),null,`${action}: stale Replay must not recreate the disk record`);
  console.log(`PASS: ${action} in a second tab cannot be undone by a completing stale Replay.`);await context.close();
 }
 {
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await mount(context);await plan(page);
  await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Playing 1/'));await withDrawerControl(page,'stop',()=>page.locator('[data-et="stop"]').click());await play(page);
  assert.match(await status(page),/This playback was resumed/);assert.equal((await summary(page)).mixBytes,0);
  await page.locator('footer [data-choir-download]').waitFor({state:'hidden'});
  const calls=await page.evaluate(()=>window.calls.length);await replay(page);await finishReplay(page);const wav=await download(page);assert.ok(seconds(wav)>=3 && seconds(wav)<4.5);assert.equal(await page.evaluate(()=>window.calls.length),calls);
  console.log('PASS: resumed export has explicit guidance; Replay from the start creates a complete WAV without new synthesis.');await context.close();
 }
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await mount(context);await openDetails(page,'npcPolicyRoot');
  const policy=page.locator('[data-et="npcPolicyRoot"]');await policy.locator('select').first().selectOption('preferred');const connection=policy.getByRole('combobox',{name:'Casting connection',exact:true});await connection.selectOption('native:c');
  for(const id of ['1'.repeat(32),'2'.repeat(32)]){await policy.getByRole('button',{name:'Paste Fish voice ID for Preferred voices',exact:true}).click();await policy.getByRole('textbox',{name:'Fish voice ID for Preferred voices',exact:true}).fill(id);await policy.getByRole('button',{name:'Use Fish voice ID for Preferred voices',exact:true}).click();}
  await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture').npcPolicy?.voices?.length===2);await connection.selectOption('native:a');await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture').npcPolicy.route==='native:a');
  await page.evaluate(async()=>{await window.cleanup();window.cleanup=await window.mountChoir();});await openDetails(page,'npcPolicyRoot');await page.locator('[data-et="npcPolicyRoot"]').getByRole('combobox',{name:'Casting connection',exact:true}).selectOption('native:c');
  await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture').npcPolicy.route==='native:c');assert.deepEqual(await page.evaluate(()=>window.fixtureStore.get('chat:fixture').npcPolicy.voices),['1'.repeat(32),'2'.repeat(32)]);
  console.log('PASS: preferred Fish IDs survive connection switching and remounting, without being assigned to the other provider.');await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
