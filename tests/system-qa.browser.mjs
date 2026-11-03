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
