// Regression tests for the 2026-11-03 system QA (playback findings PB1, PB2 and O2).
// Each test repeats the reviewer's reproduction and asserts the fixed behaviour.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Borrow the existing harness without registering its suite.
async function reuse(file,start,end,names){
  const url=new URL(file,import.meta.url),source=readFileSync(url,'utf8');
  const firstTest=source.indexOf('\ntest(');
  const imports=source.slice(0,Math.min(source.indexOf(start),firstTest<0?Infinity:firstTest))
    .replace(/from '([^']+)'/g,(_,specifier)=>`from '${specifier.startsWith('.')?new URL(specifier,url).href:import.meta.resolve(specifier)}'`);
  const helpers=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  return import('data:text/javascript;base64,'+Buffer.from(imports+helpers+`\nexport {${names}};`).toString('base64'));
}
const {harness,until,tick}=await reuse('./reliability.browser.mjs','const tick=','\nasync function elizaFixture','harness,until,tick');
const quiet=h=>Object.assign(h.store.get('chat:chat-a'),{enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false,skipMeta:false});
const status=h=>h.$('status').textContent;

test('an empty successful speech response is a failure and is never cached',async()=>{
  const h=await harness();
  try{
    quiet(h);h.message.content='One sentence.';await h.reload();await h.plan();
    h.state.synthesisError={body:'',status:200,type:'audio/mpeg'};h.state.failSynthesisAt=1;
    h.footer.querySelector('button').click();
    await until(()=>/empty audio/.test(status(h)));
    assert.equal(h.audioBlobs.filter(blob=>blob.size===0).length,0,'no zero-byte clip reaches a player');
    h.state.synthesisError=null;h.state.failSynthesisAt=0;
    await h.play();
    assert.equal(h.synthesis.length,2,'Play requests fresh speech');
  }finally{await h.close();}
});

test('speech the browser cannot decode is dropped, so the next Play requests it again',async()=>{
  const h=await harness();
  try{
    quiet(h);h.message.content='Decode and retry.';await h.reload();await h.plan();
    h.state.blockAudio=true;h.footer.querySelector('button').click();
    await until(()=>h.audios.some(audio=>!audio.paused));
    h.audios.find(audio=>!audio.paused).onerror();
    await until(()=>/could not decode/.test(status(h)));
    assert.equal(h.synthesis.length,1);
    h.state.blockAudio=false;await h.play();
    assert.equal(h.synthesis.length,2,'the undecodable clip is requested afresh');
    // The fresh clip is cached as usual: replay costs nothing.
    await h.play();assert.equal(h.synthesis.length,2);
  }finally{await h.close();}
});

test('a late playback-position failure from a chat the user left does not replace the current status',async()=>{
  const h=await harness();
  try{
    quiet(h);await h.reload();await h.plan();
    const set=h.ctx.settings.set;let reject;
    h.ctx.settings.set=(key,value)=>key==='position:chat-a' && !reject?new Promise((_,fail)=>reject=fail):set(key,value);
    await h.play();await until(()=>reject);
    h.state.active='chat-b';await h.subscriptions.get('chat.active')();await tick();
    const current=status(h);
    reject(new Error('Old chat storage unavailable'));await tick();await tick();
    assert.doesNotMatch(status(h),/Playback position could not be saved/);
    assert.equal(status(h),current);
  }finally{await h.close();}
});

test('companion playback reuses speech the full message already synthesized, and the reverse',async()=>{
  const h=await harness();
  try{
    quiet(h);h.message.content='One identical narration.';await h.reload();await h.plan();
    await h.play();assert.equal(h.synthesis.length,1);
    await globalThis.__CHOIR_API__.playParagraph({text:'One identical narration.',messageId:h.message.id});
    assert.equal(h.synthesis.length,1,'no second identical request');
    // Companion first: the full message then plays from that audio.
    h.message.id='message-b';h.message.content='Another identical narration.';await h.reload();await h.plan();
    await globalThis.__CHOIR_API__.playParagraph({text:'Another identical narration.',messageId:h.message.id});
    assert.equal(h.synthesis.length,2);
    await h.play();assert.equal(h.synthesis.length,2,'no second identical request');
  }finally{await h.close();}
});

// Retest of the same QA (NEW-A1, NEW-A2, NEW-A3).
const fluid=await reuse('./fluidity.browser.mjs','const tick=','\ntest(','harness,until,tick,observe');

test('a finished paragraph\'s caller cannot cancel the next-text speech its successor adopted',async()=>{
  const h=await fluid.harness({prefetch:1,concurrency:1,normalize:false});let first,next;const owner=new AbortController();
  try{
    first=fluid.observe(h.bridge.playParagraph({text:'Current paragraph.',nextText:'Future paragraph.',signal:owner.signal}));
    await fluid.until(()=>h.requests.length===1);h.requests[0].release();
    await fluid.until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.voices()[0].finish();await first.promise;
    next=fluid.observe(h.bridge.playParagraph({text:'Future paragraph.'}));
    await fluid.tick();await fluid.tick();
    owner.abort();await fluid.tick();
    assert.equal(h.state.aborted,0,'the successor\'s pending request survives');
    h.requests[1].release();await fluid.until(()=>h.voices()[1]?.started);
    h.voices()[1].finish();await next.promise;assert.equal(next.value.played,1);assert.equal(h.requests.length,2);
  }finally{await h.close();await first?.promise;await next?.promise;}
});

test('companion speech stops when its own message is edited or deleted, not when another message changes',async()=>{
  for(const [event,payload,stops] of [['MESSAGE_DELETED',{messageId:'message-a'},true],['MESSAGE_EDITED',{messageId:'message-a',message:{content:'Something else entirely.'}},true],
    ['MESSAGE_EDITED',{messageId:'message-a',message:{content:'Before. A held paragraph. After.'}},false],['MESSAGE_DELETED',{messageId:'other-message'},false]]){
    const h=await harness();
    try{
      quiet(h);await h.reload();h.state.holdSynthesisAt=1;
      const operation=globalThis.__CHOIR_API__.playParagraph({text:'A held paragraph.',messageId:'message-a'}).then(value=>({value}),error=>({error}));
      await until(()=>h.synthesis.length===1 && h.state.releaseSynthesis);
      h.events.get(event)({chatId:'chat-a',...payload});await tick();
      assert.equal(h.state.aborted,stops?1:0,`${event} ${JSON.stringify(payload)}`);
      if(!stops)h.state.releaseSynthesis();
      const outcome=await operation;
      assert.equal(outcome.error?.name,stops?'AbortError':undefined,`${event} ${JSON.stringify(payload)}`);
    }finally{await h.close();}
  }
});

async function databaseWrite(h,operation){
  const db=await new Promise((resolve,reject)=>{const request=globalThis.indexedDB.open('choir-recordings',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{
    const key=JSON.stringify([h.store.get('audio:namespace'),'chat-a',h.message.id]);
    await new Promise((resolve,reject)=>{const tx=db.transaction(['recordings'],'readwrite');operation(tx.objectStore('recordings'),key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }finally{db.close();}
}

test('a WAV download stops when another tab replaces the mix with one of the same size and length',async()=>{
  const original=globalThis.AudioContext;let releaseDecode;
  globalThis.AudioContext=class{sampleRate=48000;decodeAudioData(){return new Promise(resolve=>releaseDecode=()=>resolve({numberOfChannels:1,getChannelData:()=>Float32Array.of(0.2,-0.2)}));}async close(){}};
  const h=await harness(),downloads=[];
  const record=(revision,bytes)=>({content:h.message.content,createdAt:Date.now(),retention:'forever',expiresAt:null,playedAudio:{content:h.message.content,complete:true,duration:1,revision,blob:new Blob([bytes],{type:'audio/webm'})}});
  try{
    h.dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
    await databaseWrite(h,(store,key)=>store.put(record('old','OLD!'),key));
    h.events.get('MESSAGE_EDITED')({messageId:h.message.id});
    await until(()=>!h.footer.querySelector('[data-choir-download]').hidden);
    h.footer.querySelector('[data-choir-download]').click();await until(()=>releaseDecode);
    await databaseWrite(h,(store,key)=>store.put(record('new','NEW!'),key));
    releaseDecode();
    await until(()=>/deleted or replaced|no longer|Play this whole/i.test(h.$('status').textContent));
    assert.equal(downloads.length,0);
  }finally{await h.close();globalThis.AudioContext=original;}
});
