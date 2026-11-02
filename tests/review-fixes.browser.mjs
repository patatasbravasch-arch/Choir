// Regression tests for the review of script@320f9b5 (fluidity and three-track follow-up).
// Each test repeats a reviewer reproduction and asserts the fixed behaviour.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Borrow the existing harnesses without registering their suites.
async function reuse(file,start,end,names){
  const url=new URL(file,import.meta.url),source=readFileSync(url,'utf8');
  const firstTest=source.indexOf('\ntest(');
  const imports=source.slice(0,Math.min(source.indexOf(start),firstTest<0?Infinity:firstTest))
    .replace(/from '([^']+)'/g,(_,specifier)=>`from '${specifier.startsWith('.')?new URL(specifier,url).href:import.meta.resolve(specifier)}'`);
  const helpers=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  return import('data:text/javascript;base64,'+Buffer.from(imports+helpers+`\nexport {${names}};`).toString('base64'));
}
const reliability=await reuse('./reliability.browser.mjs','const tick=','\nasync function elizaFixture','harness,until,tick,recordings');
const fluid=await reuse('./fluidity.browser.mjs','const tick=','\ntest(','harness,until,tick,observe');
const {harness,until}=reliability;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function edit(h,name,value,events=['change']){
  const node=h.$(name);if(typeof value==='boolean')node.checked=value;else node.value=String(value);
  for(const type of events)node.dispatchEvent(new h.dom.window.Event(type,{bubbles:true}));
}
async function switchTo(h,id){h.state.active=id;await h.subscriptions.get('chat.active')();}
function settingsPage(h,key){h.root.querySelector('[data-choir-tab="settings"]').click();h.root.querySelector(`[data-choir-open="${key}"]`).click();}
function button(root,text){const found=[...root.querySelectorAll('button')].find(node=>node.textContent.trim()===text);assert.ok(found,`Missing ${text}`);return found;}

// The real backend bundle answering the frontend, with counted model calls.
const bundle=readFileSync(new URL('../dist/backend.js',import.meta.url),'utf8');
function bridge(h,{raw,decision}={}){
  let handler;const counts={raw:0,decision:0};
  const connection={id:'planner',model:'mock-model',provider:'openai',is_default:true};
  vm.runInNewContext(bundle,{
    spindle:{onFrontendMessage:fn=>handler=fn,sendToFrontend:message=>h.emitBackend(message),
      generate:{raw:async request=>{counts.raw++;if(!raw)throw Error('Unexpected raw call');return raw(request);}},
      ...(decision?{decisions:{evaluate:async request=>{counts.decision++;return decision(request);}}}:{}),
      connections:{get:async()=>connection,list:async()=>[connection]}},
    console,Map,Set,AbortController,DOMException,TextEncoder,setTimeout,clearTimeout,URL,crypto:globalThis.crypto,atob,btoa,Uint8Array,DataView
  });
  h.ctx.sendToBackend=request=>{h.requests.push(structuredClone(request));handler(request,'user','session');};
  return counts;
}

test('a paragraph only partly matching the message plan is read whole, not cut to the matching sentence',async()=>{
  const h=await harness();
  try{
    Object.assign(h.store.get('chat:chat-a'),{enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false,skipMeta:false});
    await h.reload();await h.plan();
    const input='At dawn. New unrelated paragraph.';
    assert.equal(globalThis.__CHOIR_API__.planParagraph(input).segments.map(segment=>segment.text).join(' ').replace(/\s+/g,' '),input);
    await globalThis.__CHOIR_API__.playParagraph({text:input,messageId:'other-message'});
    assert.match(h.synthesis.map(request=>request.text).join(' '),/New unrelated paragraph\./);
  }finally{await h.close();}
});

test('the next paragraph takes over its pending prefetch instead of cancelling and requesting it again',async()=>{
  const h=await fluid.harness({prefetch:1,concurrency:1,normalize:false});let first,next;
  try{
    first=fluid.observe(h.bridge.playParagraph({text:'Current paragraph.',nextText:'Future paragraph.'}));
    await fluid.until(()=>h.requests.length===1);h.requests[0].release();
    await fluid.until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.voices()[0].finish();await first.promise;
    next=fluid.observe(h.bridge.playParagraph({text:'Future paragraph.'}));
    await fluid.tick();await fluid.tick();
    assert.deepEqual(h.requests.map(({text})=>text),['Current paragraph.','Future paragraph.']);assert.equal(h.state.aborted,0);
    h.requests[1].release();await fluid.until(()=>h.voices()[1]?.started);
    h.voices()[1].finish();await next.promise;assert.equal(next.value.played,1);
  }finally{await h.close();await first?.promise;await next?.promise;}
});

test('companion playback waits at most a second for an optional sound effect',async()=>{
  const h=await harness();let pending;
  try{
    Object.assign(h.store.get('chat:chat-a'),{enableSfx:true,enableAmbience:false,enableMusic:false,freesoundApiKey:'fixture-key',normalizeLoudness:false,prefetch:1,concurrency:1,skipMeta:false});
    await h.reload();
    h.message.content='She listened; the page snapped under her thumb. "Hello." The light faded.';
    await h.plan();h.state.blockAudio=true;h.state.holdPreview=true;
    pending=globalThis.__CHOIR_API__.playParagraph({text:h.message.content}).catch(error=>({error:error.name}));
    await until(()=>h.audios.length===1 && !h.audios[0].paused && h.state.previewFetches.length===1 && h.synthesis.length>=2);
    h.audios[0].paused=true;h.audios[0].onended();
    await wait(1300);
    assert.ok(h.audios.length>=2,'speech continues while the late effect keeps downloading');
    globalThis.__CHOIR_API__.stop();await pending;
  }finally{await h.close();await pending;}
});

test('a solo line and a unison member with the same request share one synthesis',async()=>{
  const original=globalThis.AudioContext;
  globalThis.AudioContext=class{sampleRate=24000;async resume(){}async close(){}async decodeAudioData(){return {numberOfChannels:1,getChannelData:()=>Float32Array.of(.1,.2)};}createGain(){return {gain:{value:1},connect(){},disconnect(){}};}createMediaElementSource(){return {connect(){},disconnect(){}};}};
  const h=await harness();
  try{
    Object.assign(h.store.get('chat:chat-a'),{plannerMode:'heuristic',useFastClassifier:true,useStyle:false,enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false,skipMeta:false,prefetch:4,concurrency:4});
    await h.reload();
    h.message.content='"Hello," You and Mira said in unison. You said, "Hello,"';
    await h.plan();h.state.delay=60;await h.play();
    assert.equal(h.synthesis.filter(request=>request.voice==='y' && request.text==='"Hello,"').length,1);
    assert.equal(h.synthesis.length,3);
  }finally{await h.close();globalThis.AudioContext=original;}
});

test('a note covering every quote with voiced cast members plans without card analysis, and a failed analysis does not block',async()=>{
  const h=await harness();
  try{
    h.state.character={name:'Mira',description:'Mira is the captain, with a warm voice. No formatted profiles.'};
    await h.reload();edit(h,'injectPlan','auto');
    h.message.content='Mira smiled. "Hello."\n<!--choir\nQ1|Mira|warm|Hello\n-->';
    const counts=bridge(h,{raw:async()=>{throw Error('generate failed (401): Incorrect API key');}});
    await h.plan();
    assert.equal(counts.raw,0);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
    assert.match(h.$('status').textContent,/^Ready:/);
  }finally{await h.close();}
});

test('the Ready status lists the LLM and Decision calls actually made',async()=>{
  const h=await harness();
  try{
    edit(h,'useStyle',false);edit(h,'plannerMode','jev');
    bridge(h,{raw:async()=>({content:'0 K'}),decision:async request=>({answers:Object.fromEntries(Object.keys(request.questions).map((key,index)=>[key,{choice:index?'Guard':'Mira'}]))})});
    await h.plan();
    assert.match(h.$('status').textContent,/Non-story check \(LLM\)/);assert.match(h.$('status').textContent,/Jev speakers \(Decision\)/);
    assert.doesNotMatch(h.$('status').textContent,/no LLM request/);
  }finally{await h.close();}
});

test('muting the narrator during companion playback skips the narration playing now',async()=>{
  const h=await fluid.harness({normalize:false,prefetch:1});let operation;
  try{
    operation=fluid.observe(h.bridge.playParagraph({text:'Current narration. "Next dialogue."',speaker:'Mira'}));
    await fluid.until(()=>h.requests.length===1);h.requests[0].release();
    await fluid.until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.requests[1].release();await fluid.tick();
    h.bridge.setNarratorMuted(true);
    await fluid.until(()=>h.voices()[1]?.started);
    assert.equal(h.voices()[0].paused,true);
    h.voices()[1].finish();await operation.promise;
  }finally{h.bridge.setNarratorMuted(false);await h.close();await operation?.promise;}
});

test('a muted speaker\'s failing request no longer fails the companion paragraph',async()=>{
  const h=await fluid.harness({normalize:false,prefetch:4,concurrency:1});let operation;
  try{
    operation=fluid.observe(h.bridge.playParagraph({text:'Pending narration. "Next dialogue."',speaker:'Mira'}));
    await fluid.until(()=>h.requests.length===1);
    h.bridge.setNarratorMuted(true);await fluid.tick();
    h.requests[0].fail();
    await fluid.until(()=>h.requests.length===2);h.requests[1].release();
    await fluid.until(()=>h.voices()[0]?.started);h.voices()[0].finish();
    await operation.promise;assert.equal(operation.error,undefined);assert.equal(operation.value.played,1);
  }finally{h.bridge.setNarratorMuted(false);await h.close();await operation?.promise;}
});

test('saved Replay skips a saved effect the browser cannot play and continues with the speech',async()=>{
  const h=await harness();
  try{
    edit(h,'normalizeLoudness',false);edit(h,'enableSfx',true);edit(h,'enableAmbience',false);edit(h,'freesoundApiKey','fixture-key');
    h.message.content='Opening narration. The glass shattered. "Hello."';
    await h.plan();await h.play();
    const before=h.audios.length,tts=h.synthesis.length;h.state.blockAudio=true;
    [...h.$('messages').querySelectorAll('button')].find(node=>node.textContent==='Replay').click();
    await until(()=>h.audios.length>before && h.audios.at(-1).paused===false);
    while(!document.querySelector('[data-choir-mixer]')?.textContent.includes('Speaking: SFX')){
      const count=h.audios.length;h.audios.at(-1).onended();
      await until(()=>h.audios.length>count && h.audios.at(-1).paused===false);
    }
    const failed=h.audios.length;h.audios.at(-1).onerror();
    await until(()=>h.audios.length>failed && h.audios.at(-1).paused===false);
    assert.equal(h.synthesis.length,tts,'no new speech request');
  }finally{await h.close();}
});

test('Ignore style is a choice of its own; Automatic keeps sending delivery',async()=>{
  const h=await harness();
  try{
    const options=[...h.$('styleParam').options].map(option=>[option.value,option.textContent]);
    assert.deepEqual(options.slice(0,2),[['','Automatic'],['none','Ignore style']]);
    edit(h,'styleParam','none');edit(h,'normalizeLoudness',false);edit(h,'enableSfx',false);edit(h,'enableAmbience',false);
    await h.plan();await h.play();
    assert.ok(h.synthesis.every(request=>!/Calm|Warm/.test(request.parameters?.instructions || '')),JSON.stringify(h.synthesis.map(request=>request.parameters)));
  }finally{await h.close();}
});

async function fish(h){
  h.connections[1].provider='fish_audio';
  h.state.providers=[{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}},{id:'fish_audio',capabilities:{parameters:{}}}];
  h.state.voiceSearchResults=[{id:'community_test_id',name:'Review community voice',description:'A test voice',sampleAudio:'https://mock.test/sample.mp3'}];
  await h.reload();
}
async function rowLibrary(h){
  const row=[...h.root.querySelectorAll('.et-cast-row')].find(row=>row.querySelector('strong')?.textContent==='Mira');
  assert.ok(row);row.querySelector('[data-choir-edit]').click();button(row,'Find a voice').click();
  row.querySelector('[title="Search Fish Audio community models"]').click();
  await until(()=>h.dom.window.document.querySelector('.et-voice-card'));
  return h.dom.window.document.querySelector('[data-et="voiceLibraryModal"]');
}

test('a voice library opened in one chat closes when another chat opens, and with the frontend',async()=>{
  const h=await harness();
  try{
    await fish(h);h.store.set('chat:chat-b',structuredClone(h.store.get('chat:chat-a')));
    const modal=await rowLibrary(h);const bBefore=structuredClone(h.store.get('chat:chat-b'));
    await switchTo(h,'chat-b');
    assert.equal(modal.isConnected,false);assert.deepEqual(h.store.get('chat:chat-b'),bBefore);
    await switchTo(h,'chat-a');h.state.blockAudio=true;
    const again=await rowLibrary(h);button(again,'Listen').click();const sample=h.audios.at(-1);
    await h.reload();
    assert.equal(again.isConnected,false);assert.equal(sample.paused,true);
  }finally{await h.close();}
});

test('an edit whose save failed survives leaving the chat and is offered again with Retry save',async()=>{
  const h=await harness();
  try{
    settingsPage(h,'performance');
    h.state.failConfigSave=true;edit(h,'chunk',700,['input','change']);
    await until(()=>h.$('saveState').textContent==='Save failed · Retry save');
    await switchTo(h,'chat-b');
    h.state.failConfigSave=false;await switchTo(h,'chat-a');
    assert.equal(h.$('chunk').value,'700');assert.equal(h.$('save').hidden,false);
    h.$('save').click();await until(()=>h.store.get('chat:chat-a').chunk===700);
  }finally{await h.close();}
});

test('an edit during a slow chat load never saves an empty cast into that chat',async()=>{
  const h=await harness();let release;
  try{
    settingsPage(h,'performance');
    const b=structuredClone(h.store.get('chat:chat-a'));b.fixed[2].voice='new';b.chunk=900;h.store.set('chat:chat-b',b);
    const get=h.ctx.settings.get;let held=false;
    h.ctx.settings.get=async key=>{if(key==='chat:chat-b' && !held){held=true;await new Promise(resolve=>release=resolve);}return get(key);};
    h.state.active='chat-b';const switching=h.subscriptions.get('chat.active')();
    await until(()=>release);
    edit(h,'chunk',700,['input','change']);await reliability.tick();
    assert.equal(h.store.get('chat:chat-b').fixed.length,b.fixed.length);
    release();release=null;await switching;await until(()=>h.root.querySelectorAll('.et-cast-row').length>0);
    assert.ok(h.store.get('chat:chat-b').fixed.some(actor=>actor.speaker==='Mira' && actor.voice==='new'));
  }finally{release?.();await h.close();}
});

test('Reload after a failed chat read loads the chat again instead of saving an empty cast',async()=>{
  const h=await harness();
  try{
    settingsPage(h,'connections');
    const b=structuredClone(h.store.get('chat:chat-a'));b.fixed[2].voice='new';b.chunk=900;h.store.set('chat:chat-b',b);
    const get=h.ctx.settings.get;let fail=true;
    h.ctx.settings.get=async key=>{if(fail && key==='chat:chat-b')throw Error('Injected transient settings read failure');return get(key);};
    await switchTo(h,'chat-b');assert.match(h.$('status').textContent,/Injected transient/);
    fail=false;h.$('load').click();
    await until(()=>h.root.querySelectorAll('.et-cast-row').length>0);
    assert.equal(h.store.get('chat:chat-b').fixed.length,b.fixed.length);assert.equal(h.store.get('chat:chat-b').chunk,900);
    assert.equal(h.$('chunk').value,'900');
  }finally{await h.close();}
});

async function databaseWrite(h,operation){
  const db=await new Promise((resolve,reject)=>{const request=globalThis.indexedDB.open('choir-recordings',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{
    const key=JSON.stringify([h.store.get('audio:namespace'),'chat-a',h.message.id]);
    await new Promise((resolve,reject)=>{const tx=db.transaction(['recordings','recording-state'],'readwrite');operation(tx.objectStore('recordings'),tx.objectStore('recording-state'),key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }finally{db.close();}
}

test('a single WAV download stops when its recording is deleted while it is prepared',async()=>{
  const original=globalThis.AudioContext;let releaseDecode;
  globalThis.AudioContext=class{sampleRate=48000;decodeAudioData(){return new Promise(resolve=>releaseDecode=()=>resolve({numberOfChannels:1,getChannelData:()=>Float32Array.of(0.2,-0.2)}));}async close(){}};
  const h=await harness(),downloads=[];
  try{
    h.dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
    await databaseWrite(h,(store,_,key)=>store.put({content:h.message.content,createdAt:Date.now(),retention:'forever',expiresAt:null,playedAudio:{content:h.message.content,complete:true,duration:1,blob:new Blob(['TEST'],{type:'audio/webm'})}},key));
    h.events.get('MESSAGE_EDITED')({messageId:h.message.id});
    await until(()=>!h.footer.querySelector('[data-choir-download]').hidden);
    h.footer.querySelector('[data-choir-download]').click();await until(()=>releaseDecode);
    await databaseWrite(h,(store,state,key)=>{store.delete(key);state.put(1,JSON.stringify(['generation',...JSON.parse(key)]));});
    releaseDecode();
    await until(()=>/deleted or replaced|no longer|Play this whole/i.test(h.$('status').textContent));
    assert.equal(downloads.length,0);
  }finally{await h.close();globalThis.AudioContext=original;}
});

test('a cast import started in one chat never writes into the chat opened while it waited',async()=>{
  const h=await harness();let release;const fetch=globalThis.fetch;
  try{
    h.connections.push({id:'c',name:'Third provider',provider:'accent_tts',model:'model-c'});await h.reload();
    settingsPage(h,'castTools');
    h.$('exportCast').click();const imported=JSON.parse(h.$('castJson').value);
    imported.fixed[2].route='native:c';imported.fixed[2].style='Imported from A';h.$('castJson').value=JSON.stringify(imported);
    const b=structuredClone(h.store.get('chat:chat-a'));b.fixed[2].route='native:c';b.fixed[2].style='Chat B original';h.store.set('chat:chat-b',b);
    let held=false;
    globalThis.fetch=async(url,options)=>{if(url.endsWith('/tts-connections/c/voices') && !held){held=true;await new Promise(resolve=>release=resolve);}return fetch(url,options);};
    h.$('importCast').click();await until(()=>release);
    const aBefore=structuredClone(h.store.get('chat:chat-a'));
    await switchTo(h,'chat-b');release();release=null;
    await until(()=>/chat changed during the import/.test(h.$('status').textContent));
    assert.equal(h.store.get('chat:chat-b').fixed[2].style,'Chat B original');assert.deepEqual(h.store.get('chat:chat-a'),aBefore);
  }finally{release?.();globalThis.fetch=fetch;await h.close();}
});

test('the change event after an input that already saved the same value reads and writes nothing',async()=>{
  const h=await harness();
  try{
    settingsPage(h,'performance');
    const get=h.ctx.settings.get,set=h.ctx.settings.set,operations=[];
    h.ctx.settings.get=async key=>{if(/^(chat:|settings:global)/.test(key))operations.push(['get',key]);return get(key);};
    h.ctx.settings.set=async(key,value)=>{if(/^(chat:|settings:global)/.test(key))operations.push(['set',key]);return set(key,value);};
    h.$('chunk').value='700';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    await until(()=>h.$('saveState').textContent==='Saved automatically');
    operations.length=0;
    h.$('chunk').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await wait(400);
    assert.deepEqual(operations,[]);assert.equal(h.store.get('chat:chat-a').chunk,700);
  }finally{await h.close();}
});
