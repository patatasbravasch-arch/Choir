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
const duration=wav=>wav.readUInt32LE(40)/(wav.readUInt16LE(22)*2*wav.readUInt32LE(24));
const longestSilence=wav=>{
 const channels=wav.readUInt16LE(22),rate=wav.readUInt32LE(24);let longest=0,run=0;
 for(let offset=44;offset<wav.length;offset+=channels*2){let peak=0;for(let channel=0;channel<channels;channel++)peak=Math.max(peak,Math.abs(wav.readInt16LE(offset+channel*2)));if(peak<4){run++;longest=Math.max(longest,run);}else run=0;}
 return longest/rate;
};
const toneLevel=(wav,frequency)=>{
 const rate=wav.readUInt32LE(24),channels=wav.readUInt16LE(22),frames=wav.readUInt32LE(40)/(channels*2),size=8192;let peak=0;
 const windows=[];for(let start=0;start+size<frames;start+=size/2){let real=0,imag=0;for(let index=0;index<size;index++){const value=wav.readInt16LE(44+(start+index)*channels*2)/32768*(0.5-0.5*Math.cos(2*Math.PI*index/(size-1))),angle=2*Math.PI*frequency*index/rate;real+=value*Math.cos(angle);imag+=value*Math.sin(angle);}windows.push(4*Math.hypot(real,imag)/size);if(windows.length>=3)peak=Math.max(peak,Math.min(...windows.slice(-3)));}return peak;
};
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--disable-crash-reporter']});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 const open=async music=>{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
  await page.evaluate(async enabled=>{
   await window.cleanup();window.holdSpeechText='Welcome.';window.fixtureMusic=enabled;window.mixTones=true;window.fixtureMessage.content='Night fell. "Welcome." A new story begins.';
   window.fixtureStore.set('chat:fixture',{...window.fixtureStore.get('chat:fixture'),enableMusic:enabled,enableAmbience:false,enableSfx:false,loopMusic:false,normalizeLoudness:false,prefetch:1,concurrency:1});
   window.fixtureStore.set('settings:global',{enableMusic:enabled,enableAmbience:false,enableSfx:false,loopMusic:false,normalizeLoudness:false});
   window.fixtureStore.set('ui:mixer',{master:1,music:1,playbackRate:1,voiceGapMs:0});window.cleanup=await window.mountChoir();
  },music);
  await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
 };
 const play=()=>page.locator('[data-choir-action="playback"]').click();
 const finish=()=>page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
 const save=async()=>{const pending=page.waitForEvent('download');await page.locator('footer [data-choir-download]').click();const result=await pending;return readFile(await result.path());};
 const waitForSecond=async()=>{await page.waitForFunction(()=>typeof window.releaseSpeech==='function');await page.waitForFunction(()=>window.audios.some(audio=>!audio.loop && audio.ended));};
 await open(false);await play();await waitForSecond();await page.waitForTimeout(2500);await page.evaluate(()=>{window.holdSpeechText='';window.releaseSpeech();});await finish();
 const delayed=await save();assert.ok(duration(delayed)>2.8 && duration(delayed)<3.7,`silent synthesis wait leaked into ${duration(delayed)}s WAV`);assert.ok(longestSilence(delayed)<0.4);
 const calls=await page.evaluate(()=>window.calls.length),before=await page.evaluate(()=>window.audios.length);
 await play();await page.waitForFunction(count=>window.audios.slice(count).some(audio=>!audio.loop && audio.currentTime>0.2 && !audio.paused),before);await play();
 assert.equal(await page.evaluate(()=>window.audios.at(-1).paused),true);await page.waitForTimeout(2500);await play();await finish();
 const paused=await save();assert.ok(duration(paused)>2.8 && duration(paused)<3.7,`manual pause leaked into ${duration(paused)}s WAV`);assert.ok(longestSilence(paused)<0.4);assert.equal(await page.evaluate(()=>window.calls.length),calls);
 console.log('PASS: silent synthesis waits and manual pauses are absent from the downloaded WAV, with all three speech clips retained and cached replay making no TTS calls.');
 await open(true);await play();await waitForSecond();await page.waitForFunction(()=>window.audios.some(audio=>audio.loop && !audio.paused));await page.waitForTimeout(2500);await page.evaluate(()=>{window.holdSpeechText='';window.releaseSpeech();});await finish();
 const music=await save();assert.ok(duration(music)>5.2,`audible background music was removed during speech wait: ${duration(music)}s`);assert.ok(longestSilence(music)<0.4);
 // The middle of the wait must contain the fixture's 440 Hz music, with no
 // foreground speech. The background layer must keep the recorder running.
 const rate=music.readUInt32LE(24),channels=music.readUInt16LE(22),start=2*rate,size=8192;let real=0,imag=0;
 for(let index=0;index<size;index++){const value=music.readInt16LE(44+(start+index)*channels*2)/32768,angle=2*Math.PI*440*index/rate;real+=value*Math.cos(angle);imag+=value*Math.sin(angle);}
 assert.ok(2*Math.hypot(real,imag)/size>0.002,'music missing from the saved speech wait');
 console.log('PASS: music that remains audible during a synthesis wait stays in the WAV at the correct time.');
 await open(true);await page.evaluate(()=>window.holdSpeechText='');await page.locator('[data-et="loopMusic"]').check();await play();await finish();
 await page.evaluate(()=>window.fixtureMessage.content='The hall fell silent. "Welcome." A new story begins.');
 await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));await play();await finish();
 assert.ok(toneLevel(await save(),440)>0.002,'carried music must be present on the first play of a cue-free message');
 const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,rows=db.transaction('recordings').objectStore('recordings').getAll();rows.onsuccess=()=>{resolve(rows.result.map(row=>({content:row.content,carried:row.segments.some(segment=>segment.kind==='music' && segment.carried),musicBytes:row.blobs.find((_,index)=>row.segments[index].kind==='music')?.blob?.size})));db.close();};};}));
 assert.ok(saved.some(row=>row.content.startsWith('The hall') && row.carried && row.musicBytes>0),JSON.stringify(saved));
 const requests=await page.evaluate(()=>window.calls.length);
 await page.evaluate(async()=>{await window.cleanup();window.cleanup=await window.mountChoir();});
 await page.locator('details').filter({has:page.locator('[data-et="messages"]')}).locator('summary').click();
 await page.locator('[data-et="messages"]').getByRole('button',{name:'Replay',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent==='Replay finished.');
 assert.ok(toneLevel(await save(),440)>0.002,'music carried from a previous message must survive cached Replay after remount');assert.equal(await page.evaluate(()=>window.calls.length),requests);
 console.log('PASS: a cue-free message saves the music carried from the previous reply, restores it on cached Replay after remount, and includes it in the WAV without TTS.');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
