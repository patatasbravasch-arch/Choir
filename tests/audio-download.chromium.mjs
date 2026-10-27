import {showDrawerControl,withDrawerControl} from './fixtures/drawer.mjs';
import {playbackFixture} from './fixtures/playback.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const errors=[],server=createServer(async(request,response)=>{
 if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(playbackFixture);return;}
 if(!/^\/(src|dist)\/[a-z]+\.js$/.test(request.url)){response.writeHead(404);response.end();return;}
 try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL(`..${request.url}`,import.meta.url)));}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--disable-crash-reporter']});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 assert.equal(await page.getByRole('heading',{name:'Characters',exact:true}).isVisible(),true);
 assert.equal(await page.getByRole('heading',{name:'NPC Cast',exact:true}).count(),0);
 const download=page.locator('footer [data-choir-download]');assert.equal(await download.isVisible(),false);
 await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
 await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
 await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
 const calls=await page.evaluate(()=>window.calls.length);assert.equal(calls,3);
 let windowFilename='Choir - M - fixture - 001.wav';
 const save=async()=>{const pending=page.waitForEvent('download');await download.press('Enter');const result=await pending;assert.equal(result.suggestedFilename(),windowFilename);return readFile(await result.path());};
 const wav=await save();assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
 assert.equal(wav.readUInt32LE(4),wav.length-8);assert.equal(wav.readUInt16LE(22),2);assert.equal(wav.readUInt32LE(24),48000);assert.ok(wav.readUInt32LE(40)>=3*48000*4);
 assert.equal(await page.evaluate(()=>window.calls.length),calls);
 // Decode the downloaded container again in Chrome, rather than only checking its name/header.
 const decoded=await page.evaluate(async bytes=>{const context=new AudioContext();try{const audio=await context.decodeAudioData(Uint8Array.from(bytes).buffer);return {duration:audio.duration,channels:audio.numberOfChannels};}finally{await context.close();}},[...wav]);
 assert.ok(decoded.duration>=3 && decoded.duration<4.5,JSON.stringify(decoded));assert.equal(decoded.channels,2);
 // A legacy resumed recording may have its audio only in the passage cache.
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result,transaction=db.transaction('recordings','readwrite'),cursorRequest=transaction.objectStore('recordings').openCursor();let changed=false;
   cursorRequest.onsuccess=()=>{const cursor=cursorRequest.result;if(!cursor)return;const value=cursor.value;
    if(value.fullMessage && value.blobs?.length){value.blobs[0]=undefined;cursor.update(value);changed=true;}else cursor.continue();
   };
   transaction.oncomplete=()=>{db.close();changed?resolve():reject(Error('No completed recording found'));};
   transaction.onerror=()=>{db.close();reject(transaction.error);};
  };
 }));
 assert.deepEqual(await save(),wav,'recovering a missing clip index must preserve every sample of the complete WAV');
 assert.equal(await page.evaluate(()=>window.calls.length),calls);
 await withDrawerControl(page,'voiceGapMsEntry',()=>page.locator('[data-et="voiceGapMsEntry"]').fill('500'));await page.locator('[data-et="voiceGapMsEntry"]').press('Tab');
 assert.deepEqual(await save(),wav,'changing settings after playback must not alter what was already heard');
 const playAgain=async()=>{const count=await page.evaluate(()=>window.audios.length);await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(before=>window.audios.length>before,count);await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));};
 await playAgain();const spaced=await save();assert.ok(spaced.readUInt32LE(40)>wav.readUInt32LE(40)+0.7*48000*4);assert.equal(await page.evaluate(()=>window.calls.length),calls);
 await withDrawerControl(page,'voiceGapMsEntry',()=>page.locator('[data-et="voiceGapMsEntry"]').fill('0'));await page.locator('[data-et="voiceGapMsEntry"]').press('Tab');
 await withDrawerControl(page,'playbackRateEntry',()=>page.locator('[data-et="playbackRateEntry"]').fill('2'));await page.locator('[data-et="playbackRateEntry"]').press('Tab');
 await playAgain();const fast=await save();assert.ok(fast.readUInt32LE(40)<wav.readUInt32LE(40)*0.75,'the download keeps the speed heard');assert.equal(await page.evaluate(()=>window.calls.length),calls);
 // Give each scene channel a distinct tone, then inspect the samples in the
 // downloaded WAV. This proves inclusion/exclusion at the actual output.
 const spectrum=bytes=>{
  const channels=bytes.readUInt16LE(22),frames=bytes.readUInt32LE(40)/(channels*2),size=8192,result={};
  // Require the tone in three adjacent windows: a clip's abrupt start/end
  // creates brief broadband transients even when no scene audio is present.
  for(const frequency of [220,440,660,880]){let peak=0;const windows=[];
   for(let start=0;start+size<=frames;start+=size/2){let real=0,imag=0;
    for(let index=0;index<size;index++){const weight=0.5-0.5*Math.cos(2*Math.PI*index/(size-1)),value=bytes.readInt16LE(44+(start+index)*channels*2)/32768*weight,angle=2*Math.PI*frequency*index/48000;real+=value*Math.cos(angle);imag+=value*Math.sin(angle);}
    windows.push(4*Math.hypot(real,imag)/size);
    if(windows.length>=3)peak=Math.max(peak,Math.min(...windows.slice(-3)));
   }result[frequency]=peak;
  }return result;
 };
 await page.evaluate(async()=>{
  await window.cleanup();window.mixTones=true;window.fixtureMusic=true;window.fixtureMessage.index_in_chat=41;window.fixtureMessage.content='Rain drummed. Night fell. A page snapped.';
  window.fixtureStore.set('chat:fixture',{...window.fixtureStore.get('chat:fixture'),enableMusic:true,enableAmbience:true,enableSfx:true,loopMusic:true,freesoundApiKey:'fixture-key',normalizeLoudness:false});
  window.fixtureStore.set('settings:global',{enableMusic:true,enableAmbience:true,enableSfx:true,loopMusic:true,freesoundApiKey:'fixture-key',normalizeLoudness:false});
  window.fixtureStore.set('ui:mixer',{master:1,music:1,ambience:1,sfx:1,playbackRate:1,voiceGapMs:0});window.cleanup=await window.mountChoir();
 });
 windowFilename='Choir - M - fixture - 042.wav';
 await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
 await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();await playAgain();
 const withScene=spectrum(await save());for(const frequency of [220,440,660,880])assert.ok(withScene[frequency]>0.002,JSON.stringify(withScene));
 assert.equal(await page.evaluate(()=>window.audios.some(audio=>audio.loop && !audio.paused)),true,'continuous music still plays, but the message download is already complete');
 let sceneCalls=await page.evaluate(()=>window.calls.length);
 await withDrawerControl(page,'enableMusic',()=>page.locator('[data-et="enableMusic"]').uncheck());await withDrawerControl(page,'enableAmbience',()=>page.locator('[data-et="enableAmbience"]').uncheck());await withDrawerControl(page,'enableSfx',()=>page.locator('[data-et="enableSfx"]').uncheck());
 await playAgain();const withoutScene=spectrum(await save());assert.ok(withoutScene[220]>0.01,JSON.stringify(withoutScene));for(const frequency of [440,660,880])assert.ok(withoutScene[frequency]<0.0003,JSON.stringify(withoutScene));assert.equal(await page.evaluate(()=>window.calls.length),sceneCalls);
 await page.evaluate(async()=>{
  await window.cleanup();window.fixtureStore.set('settings:global',{...window.fixtureStore.get('settings:global'),enableMusic:true,enableAmbience:true,enableSfx:true});
  window.fixtureStore.set('chat:fixture',{...window.fixtureStore.get('chat:fixture'),enableMusic:true,enableAmbience:true,enableSfx:true});
  window.fixtureStore.set('ui:mixer',{...window.fixtureStore.get('ui:mixer'),master:1,music:0,ambience:0,sfx:0});window.cleanup=await window.mountChoir();
 });
 await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();await playAgain();const muted=spectrum(await save());
 assert.ok(muted[220]>0.01,JSON.stringify(muted));for(const frequency of [440,660,880])assert.ok(muted[frequency]<0.0003,JSON.stringify(muted));assert.equal(await page.evaluate(()=>window.calls.length),sceneCalls);
 console.log('PASS: downloaded WAV samples contain enabled music, ambience and SFX; disabled and muted channels are absent; speed and gaps match playback; continuous music ends at the message boundary in the download; filenames use the actual message number.');
 // Emulate an existing installation's old speech cache, before mix capture
 // existed, with one sparse index entry. Replay must recover it without TTS.
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
   const db=request.result,transaction=db.transaction('recordings','readwrite'),cursor=transaction.objectStore('recordings').openCursor();
   cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;const value=row.value;delete value.playedAudio;const index=value.segments?.findIndex(segment=>!segment.kind);if(index>=0)value.blobs[index]=undefined;for(const [index,segment] of (value.segments || []).entries())if(segment.kind==='sfx')value.blobs[index]=undefined;for(const key of Object.keys(value.passages || {}))if(key.includes('page turn'))delete value.passages[key];row.update(value);row.continue();};
   transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>{db.close();reject(transaction.error);};
  };
 }));
 await page.evaluate(()=>window.fixtureEvents.get('MESSAGE_EDITED')({messageId:'reply'}));await download.waitFor({state:'hidden'});
 await showDrawerControl(page,'messages');
 await page.locator('[data-et="messages"]').getByRole('button',{name:'Replay',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent==='Replay finished.');
 const migrated=spectrum(await save());assert.ok(migrated[220]>0.01);for(const frequency of [440,660,880])assert.ok(migrated[frequency]<0.0003,JSON.stringify(migrated));assert.equal(await page.evaluate(()=>window.calls.length),sceneCalls);
 console.log('PASS: an older recording without a saved mix and with a missing speech clip index is replayed from cached passages and downloaded without new synthesis; absent optional effects cannot block exporting the audio actually played.');
 // Music that arrives after speech must not overwrite the completed mix
 // when its late cache save runs. It was not heard during this message.
 await page.evaluate(async()=>{
  await window.cleanup();window.holdMusicSelection=true;window.fixtureMessage.content='Night fell. The hall fell silent.';
  window.fixtureStore.set('chat:fixture',{...window.fixtureStore.get('chat:fixture'),enableMusic:true,enableAmbience:false,enableSfx:false,loopMusic:true});
  window.fixtureStore.set('settings:global',{...window.fixtureStore.get('settings:global'),enableMusic:true,enableAmbience:false,enableSfx:false,loopMusic:true});
  await new Promise((resolve,reject)=>{
   const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
    const db=request.result,transaction=db.transaction('recordings','readwrite');transaction.objectStore('recordings').clear();transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>{db.close();reject(transaction.error);};
   };
  });
  window.fixtureStore.set('ui:mixer',{...window.fixtureStore.get('ui:mixer'),music:1});window.cleanup=await window.mountChoir();
 });
 await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
 await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();await playAgain();
 await page.waitForFunction(()=>typeof window.releaseMusicSelection==='function');
 const beforeLateMusic=await save();await page.evaluate(()=>window.releaseMusicSelection());await page.waitForFunction(()=>window.audios.some(audio=>audio.loop && !audio.paused));
 await page.waitForTimeout(100);assert.deepEqual(await save(),beforeLateMusic,'a late music cache save must not erase or change the audio that was played');
 sceneCalls=await page.evaluate(()=>window.calls.length);
 console.log('PASS: late continuous-music loading preserves the completed played-audio download byte for byte.');
 // Verify that the active chat can add multiple Fish IDs without using Set default.
 await showDrawerControl(page,'npcPolicyRoot');const policy=page.locator('[data-et="npcPolicyRoot"]');await policy.locator('select').first().selectOption('preferred');
 await policy.getByRole('combobox',{name:'Casting connection',exact:true}).selectOption('native:c');
 for(const id of ['1'.repeat(32),'2'.repeat(32)]){
  await policy.getByRole('button',{name:'Paste Fish voice ID for Preferred voices',exact:true}).click();
  await policy.getByRole('textbox',{name:'Fish voice ID for Preferred voices',exact:true}).fill(id);
  await policy.getByRole('button',{name:'Use Fish voice ID for Preferred voices',exact:true}).click();
 }
 await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture').npcPolicy?.voices?.length===2);
 assert.deepEqual(await policy.getByRole('listbox',{name:'Preferred voices',exact:true}).locator('option:checked').evaluateAll(options=>options.map(option=>option.value)),['1'.repeat(32),'2'.repeat(32)]);
 assert.equal(await page.evaluate(()=>window.calls.length),sceneCalls);assert.deepEqual(errors,[]);
 await page.setViewportSize({width:320,height:900});
 assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'Download actions and preferred IDs must fit on mobile');
 if(process.env.CHOIR_DOWNLOAD_SCREENSHOT)await page.locator('main').screenshot({path:process.env.CHOIR_DOWNLOAD_SCREENSHOT});
 console.log('PASS: Chrome downloads and decodes one complete message WAV, preserves the played mix, recovers from sparse clip indexes and reuses saved speech without TTS, exposes one cast, and saves two preferred Fish IDs in the active chat.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
