import {showDrawerControl,withDrawerControl} from './fixtures/drawer.mjs';
// Deterministic timing regressions. No provider keys or live synthesis needed.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {playbackFixture} from './fixtures/playback.mjs';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),errors=[];
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(playbackFixture);return;}
  if(!/^\/(src|dist)\/[a-z]+\.js$/.test(req.url)){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('..'+req.url,import.meta.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  for(const options of [
    ...['main','companion'].flatMap(mode=>[.75,1,1.5,2,3,4].map(rate=>({mode,rate,delay:150}))),
    ...['main','companion'].map(mode=>({mode,rate:2,delay:80,decodeDelay:120})),
    {mode:'companion',rate:2,delay:350,beds:true},
    {mode:'companion',rate:2,delay:150,prefetch:2,concurrency:2,nextText:'A future paragraph.'},
    {mode:'main',rate:2,delay:150,gap:250},
    {mode:'companion',rate:2,delay:150,normalize:false}
  ]){
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
    await page.evaluate(async o=>{
      await window.cleanup();
      window.fixtureMessage.content=o.beds?'At dawn. Rain drummed on the roof. "Mira speaks. Hello." Later narration.':'At dawn. "Mira speaks. Hello." Later narration. "Mira speaks. Goodbye."';
      Object.assign(window.fixtureStore.get('chat:fixture'),{enableSfx:false,enableAmbience:Boolean(o.beds),freesoundApiKey:o.beds?'fixture-key':'',batchSpeech:false,normalizeLoudness:o.normalize??true,prefetch:o.prefetch??1,concurrency:o.concurrency??1});
      window.fixtureStore.set('ui:mixer',{playbackRate:o.rate,voiceGapMs:o.gap??0,enabled:true});
      window.timing=[];window.requests=[];window.decodes=[];let active=0;
      const fetch0=window.fetch;window.fetch=async(u,p={})=>{
        if(!String(u).endsWith('/tts/synthesize'))return fetch0(u,p);
        const entry={text:JSON.parse(p.body).text,start:performance.now(),active:++active};window.requests.push(entry);
        try{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,o.delay);p.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));},{once:true});});return await fetch0(u,p);}
        finally{entry.end=performance.now();active--;}
      };
      const decode0=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(...args){const entry={start:performance.now()};window.decodes.push(entry);if(o.decodeDelay)await new Promise(resolve=>setTimeout(resolve,o.decodeDelay));const value=await decode0.apply(this,args);entry.end=performance.now();return value;};
      const Audio0=window.Audio;window.Audio=function(url){const audio=new Audio0(url),index=window.audios.length-1;for(const event of ['playing','pause','ended','error'])audio.addEventListener(event,()=>window.timing.push({index,event,t:performance.now(),time:audio.currentTime,duration:audio.duration,loop:audio.loop}));return audio;};
      window.cleanup=await window.mountChoir();
    },options);
    if(options.mode==='companion')await page.evaluate(async o=>{window.started=performance.now();await window.__CHOIR_API__.playParagraph({text:window.fixtureMessage.content,nextText:o.nextText});},options);
    else{
      await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
      await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
      await page.evaluate(()=>window.started=performance.now());await page.locator('[data-choir-action="playback"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'),null,{timeout:30000});
    }
    const result=await page.evaluate(()=>{const events=window.timing.filter(e=>!e.loop),start=events.filter(e=>e.event==='playing'),end=events.filter(e=>e.event==='ended');return {firstSpeechMs:start[0].t-window.started,gapsMs:start.slice(1).map((s,i)=>s.t-end[i].t),clips:end.length,pauses:events.filter(e=>e.event==='pause'&&e.time<e.duration-.05),peakRequests:Math.max(...window.requests.map(r=>r.active)),firstRequest:window.requests[0].text,decodes:window.decodes.length};});
    assert.equal(result.clips,4);assert.deepEqual(result.pauses,[]);
    assert.ok(result.peakRequests<=(options.concurrency??1),'Configured synthesis concurrency must be respected.');
    assert.equal(result.firstRequest,'At dawn.','The current passage has priority.');
    if(options.normalize===false)assert.equal(result.decodes,0);
    if(options.beds)assert.equal(result.decodes,4,'Background beds do not need speech loudness analysis.');
    if(options.gap)assert.ok(result.gapsMs.every(gap=>gap>=options.gap-15&&gap<options.gap+150),'Chosen silence must be preserved.');
    // This generous bound accommodates CI scheduling, but catches the old
    // decode-at-handoff path (150–225 ms with the injected 120 ms decoder).
    else if(options.decodeDelay)assert.ok(result.gapsMs.every(gap=>gap<110),'Loudness preparation must finish during prior speech.');
    else assert.ok(result.gapsMs.every(gap=>gap<150),'Ready audio must not wait for another synthesis request.');
    console.log(JSON.stringify({options,...result}));
    await page.evaluate(()=>window.cleanup());await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: fluidity at 0.75–4×, bounded paragraph synthesis, lookahead through beds, loudness preparation, explicit gaps and matching off.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
