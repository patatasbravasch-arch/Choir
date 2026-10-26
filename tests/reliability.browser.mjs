import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {setup} from '../dist/frontend.js';
import {validatePlan,speechSourceUnits,transcriptFromMessage} from '../src/core.js';
import {speechPanel} from './fixtures/speech-panel.mjs';
import {phoneWidget} from './fixtures/phone-widget.mjs';

function mockMixRecorder(){
 const original=globalThis.MediaRecorder;
 globalThis.MediaRecorder=class{
  static isTypeSupported=()=>true;state='inactive';mimeType='audio/webm';
  start(){this.state='recording';}
  pause(){this.state='paused';}
  resume(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['mix'],{type:this.mimeType})});this.onstop?.();});}
 };
 return ()=>globalThis.MediaRecorder=original;
}

test('inactive cast collapses without losing fixed or discovered voice settings and returns on an alias in the next reply',async()=>{
 for(const mode of ['one','several']){
  const h=await harness();try{
   const saved=h.store.get('chat:chat-a');saved.connectionMode=mode;saved.fixed.push({speaker:'Kova',voice:'new',route:'native:a',aliases:['Armand'],sayAs:'KO-vah',accent:'Irish'});saved.casts['native:a'].push({speaker:'Viktor',voice:'g',aliases:['The visitor']});h.store.set('chat:chat-a',saved);await h.reload();
   h.message.content='At dawn, Kovacs arrived. "Hello." "Wait." The gate closed.';await h.plan();
   const inOther=name=>[...h.$('otherCastRows').querySelectorAll('.et-cast-row')].some(row=>row.querySelector('strong').textContent===name);
   assert.equal(h.$('otherCast').hidden,false);assert.equal(h.$('otherCast').open,false);assert.ok(inOther('Kova'),'a partial name match must not keep Kova active');assert.ok(inOther('Viktor'));
   h.$('chunk').value='1700';h.$('chunk').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
   const kept=h.store.get('chat:chat-a');assert.equal(kept.fixed.find(actor=>actor.speaker==='Kova').voice,'new');assert.equal(kept.fixed.find(actor=>actor.speaker==='Kova').sayAs,'KO-vah');assert.ok(kept.casts['native:a'].some(actor=>actor.speaker==='Viktor' && actor.voice==='g'));
   await h.reload();assert.ok(inOther('Kova'));const calls=h.requests.length;
   h.message.id='next-reply';h.message.content='At dawn, ARMAND arrived. "Hello." "Wait." The gate closed.';h.subscriptions.get('chat.messageCount')();assert.equal(inOther('Kova'),false);assert.ok([...h.$('fixed').querySelectorAll('strong')].some(node=>node.textContent==='Kova'));assert.ok(inOther('Viktor'));assert.equal(h.requests.length,calls,'grouping must not ask the planner or speech provider');
   const edit=h.$('fixed').querySelector('[aria-label="Edit Kova"]');edit.focus();edit.click();
   h.message.id='later-reply';h.message.content='At dawn. "Hello." "Wait." The gate closed.';h.subscriptions.get('chat.messageCount')();assert.equal(inOther('Kova'),false,'an open editor stays available across replies');
   edit.focus();edit.click();assert.ok(inOther('Kova'),'closing the focused editor must still fold an absent character away');assert.equal(document.activeElement,h.$('otherCast').querySelector('summary'),'keyboard focus moves to the collapsed group');
  }finally{await h.close();}
 }
});

test('mixer layout hides and reorders controls across reload without changing sound settings and reset preserves levels',async()=>{
 const h=await harness({master:0.7,playbackRate:1.75,voiceGapMs:250,layout:{speedPresets:'invalid'},quickButtonOrder:['music','music','unknown','sfx']});try{
  const check=key=>document.querySelector(`[data-choir-layout="${key}"]`),change=(key,value)=>{const input=check(key);input.checked=value;input.dispatchEvent(new h.dom.window.Event('change'));};
  const mixer=()=>document.querySelector('[data-choir-mixer]');assert.equal(mixer().querySelector('.cm-speed-options').hidden,false);assert.deepEqual([...mixer().querySelectorAll('.cm-auto-plan button')].map(button=>button.dataset.choirAction),['music','sfx','auto-plan','auto-play','ambience','follow']);
  assert.equal(mixer().querySelector('[data-choir-customize]'),null);assert.equal(h.$('mixerLayout').hidden,true);h.$('customizeMixer').click();assert.equal(h.$('mixerLayout').hidden,false);assert.equal(h.$('customizeMixer').getAttribute('aria-expanded'),'true');assert.equal(mixer().dataset.collapsed,'true','customization works while the mixer is closed');
  h.$('enableMusic').checked=true;h.$('enableMusic').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  change('speedPresets',false);change('speedSlider',true);change('gapSlider',true);change('music',false);document.querySelector('[aria-label="Move SFX earlier"]').click();await until(()=>h.store.get('ui:mixer')?.quickButtonOrder[0]==='sfx');
  assert.equal(h.$('enableMusic').checked,true);assert.equal(h.store.get('chat:chat-a').enableMusic,true);assert.equal(h.synthesis.length,0);assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
  await h.reload();assert.equal(mixer().querySelector('.cm-speed-options').hidden,true);assert.equal(mixer().querySelector('[data-choir-action="music"]').hidden,true);assert.equal(mixer().querySelector('[aria-label="Playback speed in mixer value"]').value,'1.75');assert.equal(mixer().querySelector('[aria-label="Gap between voices in mixer value"]').value,'250');
  for(const key of ['auto-plan','auto-play','sfx','ambience','music','follow'])change(key,false);assert.equal(mixer().querySelector('.cm-auto-plan').hidden,true);document.querySelector('.cm-reset-layout').click();await until(()=>h.store.get('ui:mixer')?.layout.speedPresets===true);
  assert.equal(mixer().querySelector('.cm-speed-options').hidden,false);assert.deepEqual([...mixer().querySelectorAll('.cm-auto-plan button')].map(button=>button.dataset.choirAction),['auto-plan','auto-play','sfx','ambience','music','follow']);assert.equal(h.store.get('ui:mixer').master,0.7);assert.equal(h.store.get('ui:mixer').playbackRate,1.75);assert.equal(h.store.get('ui:mixer').voiceGapMs,250);
 }finally{await h.close();}
});

test('drawer mixer customization preserves channel levels and optional Follow narration stays synchronized across reloads',async()=>{
 const h=await harness({levelsCollapsed:false,master:.7,channels:{Narrator:{volume:1.8,mute:false}}});try{
  const mixer=()=>document.querySelector('[data-choir-mixer]'),follow=()=>mixer().querySelector('[data-choir-action="follow"]');
  const show=(key,value)=>{const check=document.querySelector(`[data-choir-layout="${key}"]`);check.checked=value;check.dispatchEvent(new h.dom.window.Event('change'));};
  h.$('customizeMixer').click();show('channelLevels',false);show('follow',true);assert.equal(mixer().querySelector('.cm-levels').hidden,true);assert.equal(follow().hidden,false);assert.equal(follow().getAttribute('aria-pressed'),'false');
  follow().click();await until(()=>h.store.get('chat:chat-a')?.followNarration===true);assert.equal(h.$('followNarration').checked,true);assert.equal(follow().getAttribute('aria-pressed'),'true');assert.equal(h.$('readAlong').value,'off');
  h.$('followNarration').checked=false;h.$('followNarration').dispatchEvent(new h.dom.window.Event('change'));assert.equal(follow().getAttribute('aria-pressed'),'false');await until(()=>h.store.get('chat:chat-a')?.followNarration===false);
  follow().click();await until(()=>h.store.get('chat:chat-a')?.followNarration===true);show('follow',false);assert.equal(h.$('followNarration').checked,true,'hiding Follow must not stop following');show('follow',true);
  await until(()=>h.store.get('ui:mixer')?.layout?.follow===true);await h.reload();assert.equal(follow().hidden,false);assert.equal(follow().getAttribute('aria-pressed'),'true');assert.equal(mixer().querySelector('.cm-levels').hidden,true);
  h.$('customizeMixer').click();show('channelLevels',true);assert.equal(mixer().querySelector('.cm-levels').hidden,false);assert.equal(mixer().querySelector('.cm-levels-body').hidden,false);assert.equal(h.store.get('ui:mixer').channels.Narrator.volume,1.8);assert.equal(h.store.get('ui:mixer').master,.7);
  h.$('mixerLayout').dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.$('mixerLayout').hidden,true);assert.equal(document.activeElement,h.$('customizeMixer'));
  assert.equal(h.synthesis.length,0);assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
 }finally{await h.close();}
});

test('optional mixer character speeds synchronize with drawer controls and change live speech without extra synthesis',async()=>{
 const h=await harness({playbackRate:2,layout:{voiceSpeeds:true,speedSlider:true}});try{
  await h.plan();const entry=()=>document.querySelector('[aria-label="Narrator speed in mixer value"]');assert.ok(entry());assert.equal(entry().value,'2.00');
  h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.some(audio=>!audio.paused));const audio=h.audios.find(audio=>!audio.paused),requests=h.synthesis.length;
  entry().value='0.75';entry().dispatchEvent(new h.dom.window.Event('input'));assert.equal(audio.playbackRate,0.75);assert.equal(document.querySelector('[aria-label="Narrator speed value"]').value,'0.75');await until(()=>h.store.get('ui:mixer')?.channels.Narrator?.speed===0.75);
  document.querySelector('[aria-label="Follow playback speed for Narrator in mixer"]').click();assert.equal(audio.playbackRate,2);assert.equal(entry().value,'2.00');assert.equal(h.synthesis.length,requests);
  const flag=document.querySelector('[data-choir-layout="voiceSpeeds"]');flag.checked=false;flag.dispatchEvent(new h.dom.window.Event('change'));assert.equal(entry(),null);assert.equal(audio.paused,false);h.$('stop').click();
 }finally{await h.close();}
});

test('Fish preferred voices can be pasted into the chat, persist and constrain synthesis with an empty catalogue',async()=>{
 for(const relay of [false,true]){
  const h=await fishGroupingHarness();try{
   if(relay){h.connections[0].provider='openrouter_tts';h.connections[0].model='fish-audio/s2.1-pro';}
   const saved=h.store.get('chat:chat-a');saved.connectionMode='several';saved.fixed.forEach((actor,index)=>{actor.voice=['a','b','c'][index].repeat(32);actor.route='native:a';});saved.batchSpeech=false;h.store.set('chat:chat-a',saved);h.state.catalogues={a:{voices:[]}};await h.reload();
   const root=h.$('npcPolicyRoot'),mode=root.querySelector('select');mode.value='preferred';mode.dispatchEvent(new h.dom.window.Event('change'));
   const paste=root.querySelector('[aria-label="Paste Fish voice ID for Preferred voices"]');assert.ok(paste,'Preferred Fish voices need a paste control in the active chat');
   for(const id of ['11111111111111111111111111111111','22222222222222222222222222222222']){
    paste.click();root.querySelector('[aria-label="Fish voice ID for Preferred voices"]').value=id;root.querySelector('[aria-label="Use Fish voice ID for Preferred voices"]').click();
   }
   await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();
   const policy=h.store.get('chat:chat-a').npcPolicy;assert.equal(policy.voices.length,2);
   assert.equal(h.$('npcPolicyRoot').querySelector('[aria-label="Preferred voices"]').selectedOptions.length,2);
   const connection=h.$('npcPolicyRoot').querySelector('[aria-label="Casting connection"]');connection.value='native:b';connection.dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
   await h.reload();const restoredConnection=h.$('npcPolicyRoot').querySelector('[aria-label="Casting connection"]');restoredConnection.value='native:a';restoredConnection.dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
   assert.deepEqual(h.store.get('chat:chat-a').npcPolicy.voices,policy.voices);
   h.state.planForCatalogue=true;await h.plan().catch(error=>{throw new Error(h.$('status').textContent,{cause:error});});await h.play();
   const guard=h.synthesis.find(request=>request.text.includes('Wait'));assert.ok(guard);assert.ok(policy.voices.includes(guard.voice));assert.equal(guard.connectionId,'a');
   assert.equal(h.requests.filter(request=>request.action==='searchVoices').length,0);
  }finally{await h.close();}
 }
});

test('audio download refuses unplayed and edited messages and reuses the completed played mix without TTS',async()=>{
 const originalContext=globalThis.AudioContext,restoreRecorder=mockMixRecorder();let decoded=0;
 globalThis.AudioContext=class{
  sampleRate=24000;currentTime=0;async resume(){}async close(){}
  createMediaStreamDestination(){return {stream:{getTracks:()=>[{stop(){}}]}};}
  createMediaElementSource(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
  async decodeAudioData(){decoded++;return {numberOfChannels:1,length:2,getChannelData:()=>Float32Array.of(0.25,-0.25)};}
 };
 const h=await harness();const downloads=[];h.dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
 try{
  const download=()=>h.footer.querySelector('[data-choir-download]').click();
  download();await until(()=>h.$('status').textContent.includes('Play this whole message first'));assert.equal(decoded,0);assert.equal(downloads.length,0);
  await h.plan();await h.play();const requests=h.synthesis.length;decoded=0;await h.reload();const backendRequests=h.requests.length;
  download();await until(()=>h.$('status').textContent.startsWith('Audio downloaded'));assert.equal(h.synthesis.length,requests);assert.equal(h.requests.length,backendRequests);assert.equal(downloads.length,1);assert.match(downloads[0],/\.wav$/);assert.equal(decoded,1);
  const wav=h.audioBlobs.at(-1);assert.equal(wav.type,'audio/wav');assert.equal(new DataView(await wav.arrayBuffer()).getUint32(40,true),4);
  h.message.content='An edited reply.';download();await until(()=>h.$('status').textContent.includes('Play this whole message first'));assert.equal(downloads.length,1);
  h.message.content='Another dawn. "Hello." "Wait." The gate closed.';h.$('sectionButtons').checked=true;h.$('sectionButtons').dispatchEvent(new h.dom.window.Event('change'));await h.plan();await until(()=>h.footer.querySelector('[data-choir-section]'));
  const partial=h.footer.querySelector('[data-choir-section]');assert.ok(partial);partial.click();await until(()=>h.$('status').textContent.includes('Playback finished'));
  download();await until(()=>h.$('status').textContent.includes('Play this whole message first'));assert.equal(downloads.length,1);
 }finally{await h.close();globalThis.AudioContext=originalContext;restoreRecorder();}
});

test('completed audio mix survives resumed playback and sparse speech indexes without new requests',async()=>{
 const originalContext=globalThis.AudioContext,restoreRecorder=mockMixRecorder();
 globalThis.AudioContext=class{
  sampleRate=24000;currentTime=0;async resume(){}async close(){}
  createMediaStreamDestination(){return {stream:{getTracks:()=>[{stop(){}}]}};}
  createMediaElementSource(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
  async decodeAudioData(){return {numberOfChannels:1,length:2,getChannelData:()=>Float32Array.of(0.25,-0.25)};}
 };
 try{for(const resume of [false,true]){
  const h=await harness(),downloads=[];h.dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
  try{
   await h.plan();await h.play();assert.equal(h.synthesis.length,4);
   if(resume){
    h.store.set('position:chat-a',{messageId:h.message.id,content:h.message.content,passage:2,chunk:0,seconds:0,complete:false});
    h.$('play').click();await tick();await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.equal(h.audios.length,6,'resume plays the final two sections, while retaining the earlier saved speech');
   }else{
    const row=(await recordings()).find(row=>row.value.content===h.message.content);row.value.blobs[0]=undefined;
    const db=await openRecordings();await new Promise((resolve,reject)=>{
     const transaction=db.transaction('recordings','readwrite');transaction.objectStore('recordings').put(row.value,row.key);
     transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
    });db.close();await h.reload();
   }
   const requests=h.requests.length;h.footer.querySelector('[data-choir-download]').click();
   await until(()=>h.$('status').textContent.startsWith('Audio downloaded'));
   assert.equal(downloads.length,1);assert.equal(h.synthesis.length,4);assert.equal(h.requests.length,requests);
   const wav=h.audioBlobs.at(-1);assert.equal(new DataView(await wav.arrayBuffer()).getUint32(40,true),4,'the saved played mix is decoded once, independently of speech clip indexes');
   const missing=(await recordings()).find(row=>row.value.content===h.message.content);missing.value.blobs[2]=undefined;
   for(const key of Object.keys(missing.value.passages))if(key.includes('Wait.'))delete missing.value.passages[key];
   const db=await openRecordings();await new Promise((resolve,reject)=>{
    const transaction=db.transaction('recordings','readwrite');transaction.objectStore('recordings').put(missing.value,missing.key);
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
   });db.close();await h.reload();h.footer.querySelector('[data-choir-download]').click();
   await until(()=>h.$('status').textContent.startsWith('Audio downloaded'));
   assert.equal(downloads.length,2,'the already recorded mix remains intact even if a separate speech cache clip is removed');assert.equal(h.synthesis.length,4);
  }finally{await h.close();}
 }}finally{globalThis.AudioContext=originalContext;restoreRecorder();}
});

test('Freesound key saved by another tab survives unrelated preference edits',async()=>{
  const h=await harness();try{
    assert.equal(h.$('freesoundApiKey').value,'');
    h.store.set('settings:global',{freesoundApiKey:'another-tab-key',plannerTokens:8192});
    h.$('chunk').value='700';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    await until(()=>h.$('saveState').textContent==='Saved automatically');
    assert.equal(h.store.get('settings:global').freesoundApiKey,'another-tab-key');
    assert.equal(h.store.get('settings:global').plannerTokens,8192);
    assert.equal(h.store.get('chat:chat-a').freesoundApiKey,'another-tab-key');
    await h.reload();assert.equal(h.$('freesoundApiKey').value,'another-tab-key');
    h.state.active='chat-new';h.subscriptions.get('chat.active')();
    await until(()=>h.$('saveState').textContent==='Connection preferences restored');
    assert.equal(h.$('freesoundApiKey').value,'another-tab-key');
  }finally{await h.close();}
});

test('Freesound key supports intentional replacement and clearing',async()=>{
  const h=await harness();try{
    for(const key of ['first-test-key','replacement-test-key','']){
      h.$('freesoundApiKey').value=key;h.$('freesoundApiKey').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
      await until(()=>h.$('saveState').textContent==='Saved automatically');
      assert.equal(h.store.get('settings:global').freesoundApiKey,key);
      await h.reload();assert.equal(h.$('freesoundApiKey').value,key);
    }
  }finally{await h.close();}
});

test('queued preference edits can revert a value while the previous save is pending',async()=>{
  const h=await harness();try{
    h.state.configDelay=180;
    h.$('chunk').value='700';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,280));
    h.$('chunk').value='500';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    await until(()=>h.$('saveState').textContent==='Saved automatically');
    assert.equal(h.store.get('settings:global').chunk,500);
  }finally{await h.close();}
});

const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const until=async(predicate)=>{for(let i=0;i<250;i++){if(predicate())return;await tick();}throw Error('Timed out waiting for regression state');};
let failIdbOpen=0;
const openRecordings=()=>new Promise((resolve,reject)=>{const request=globalThis.indexedDB.open('choir-recordings',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function recordings(){
  const database=await openRecordings();
  const rows=await new Promise((resolve,reject)=>{
    const transaction=database.transaction('recordings','readonly'),request=transaction.objectStore('recordings').openCursor(),items=[];
    request.onsuccess=()=>{const cursor=request.result;if(cursor){items.push({key:cursor.key,value:cursor.value});cursor.continue();}};
    transaction.oncomplete=()=>resolve(items);transaction.onerror=()=>reject(transaction.error);
  });
  database.close();return rows;
}
const recordingFor=async content=>(await recordings()).find(row=>row.value?.content===content)?.value || null;

async function harness(mixerPreferences,mobile=false){
  const dom=new JSDOM('<body><nav><button>Another extension</button><div data-choir-toolbar></div></nav><main></main><footer></footer></body>',{url:'https://lumiverse.test'});
  const layoutListeners=new Set(),channelLayout={matches:mobile,addEventListener:(_,fn)=>layoutListeners.add(fn),removeEventListener:(_,fn)=>layoutListeners.delete(fn)};dom.window.matchMedia=()=>channelLayout;
  const original={document:globalThis.document,Audio:globalThis.Audio,fetch:globalThis.fetch,indexedDB:globalThis.indexedDB};
  const factory=new IDBFactory(),open=factory.open.bind(factory);
  factory.open=(...args)=>{
    if(failIdbOpen>0){
      failIdbOpen--;
      const request={error:Object.assign(new Error('Device audio storage is blocked.'),{name:'UnknownError'})};
      setTimeout(()=>request.onerror?.(),0);
      return request;
    }
    return open(...args);
  };
  globalThis.document=dom.window.document;globalThis.indexedDB=factory;
  const root=document.querySelector('main'),footer=document.querySelector('footer'),toolbar=document.querySelector('[data-choir-toolbar]');
  const state={active:'chat-a',blockAudio:false,failVoice:null,delay:0,held:false,aborted:0,previewFetches:[],bedFetches:[],previewAborted:0},store=new Map(),requests=[],synthesis=[],audios=[],audioBlobs=[],events=new Map(),subscriptions=new Map(),heldPlans=[],toolbarActions=new Map();
  const createObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{audioBlobs.push(blob);return createObjectURL(blob);};
  if(mixerPreferences)store.set('ui:mixer',mixerPreferences);
  const message={id:'message-a',index_in_chat:0,content:'At dawn. "Hello." "Wait." The gate closed.',name:'Mira',is_user:false};
  store.set('chat:chat-a',{connection:'a',styleParam:'instructions',chunk:500,concurrency:1,prefetch:0,
    fixed:[{speaker:'Narrator',voice:'n',style:'Calm'},{speaker:'You',voice:'y',style:''},{speaker:'Mira',voice:'m',route:'native:b',style:'',aliases:['Captain'],pronunciation:'Mira: mee-rah',accent:'Irish'}],
    casts:{'native:a':[{speaker:'Guard',voice:'g',style:''}]}});
  class FakeAudio{
    constructor(src){this.src=src;this.paused=true;this.currentTime=0;this.duration=20;this.rates=[];this._rate=1;this.preservesPitch=false;audios.push(this);this.playbackRate=1;}
    // A browser plays only inside its own range. state.audioLimits narrows that range for a test that needs a refusal.
    get playbackRate(){return this._rate;}
    set playbackRate(value){const limit=state.audioLimits||{min:0.0625,max:16};if(!(value>=limit.min && value<=limit.max))throw new RangeError(`playbackRate ${value} is not supported`);this._rate=value;this.rates.push(value);}
    play(){
      if(this.loop && state.bedPlayError)return Promise.reject(Object.assign(new Error('Playback requires a user gesture'),{name:'NotAllowedError'}));
      this.paused=false;this.playedAt=Date.now();this.onloadedmetadata?.();
      if(this.loop && state.bedDecodeError)setTimeout(()=>{this.paused=true;this.onerror?.();},2);
      if(!state.blockAudio)setTimeout(()=>{this.currentTime=20;this.endedAt=Date.now();this.onended?.();},2);return Promise.resolve();
    }
    pause(){this.paused=true;}
    removeAttribute(name){delete this[name];}
    load(){this.loads=(this.loads || 0)+1;}
  }
  globalThis.Audio=FakeAudio;
  const connections=[{id:'a',name:'Narration provider',provider:'openai_tts',model:'model-a'},{id:'b',name:'Character provider',provider:'accent_tts',model:'model-b'}];
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/spindle')){
      state.branchLookups=(state.branchLookups || 0)+1;if(state.branchLookupFails)throw Error('Branch information unavailable');
      return Response.json({extensions:[{identifier:'other-extension',metadata:{branch:'staging'}},{identifier:'choir',metadata:{branch:state.extensionBranch===undefined?'staging':state.extensionBranch}}]});
    }
    if(url.endsWith('/tts/synthesize')){
      const input=JSON.parse(options.body);synthesis.push(input);const requestNumber=synthesis.length;
      if(requestNumber===state.holdSynthesisAt){
        const stopped=()=>new DOMException('Stopped','AbortError');
        if(state.holdSynthesisBody)return new Response(new ReadableStream({start(stream){options.signal.addEventListener('abort',()=>{state.aborted++;stream.error(stopped());},{once:true});}}),{headers:{'Content-Type':'audio/mpeg'}});
        await new Promise((resolve,reject)=>{
          const cancel=()=>{state.aborted++;reject(stopped());};options.signal.addEventListener('abort',cancel,{once:true});
          state.releaseSynthesis=()=>{options.signal.removeEventListener('abort',cancel);resolve();};
        });
      }
      if(state.synthesisError && (!state.failSynthesisAt || requestNumber===state.failSynthesisAt))return new Response(state.synthesisError.body,{status:state.synthesisError.status,headers:{'Content-Type':state.synthesisError.type || 'text/plain'}});
      if(state.allowedVoices && !state.allowedVoices[input.connectionId]?.includes(input.voice))return Response.json({error:'Invalid provider voice ID'},{status:400});
      if(state.delay)await new Promise((resolve,reject)=>{
        const timeout=setTimeout(resolve,state.delay);
        options.signal.addEventListener('abort',()=>{clearTimeout(timeout);state.aborted++;reject(new DOMException('Stopped','AbortError'));},{once:true});
      });
      if(input.voice===state.failVoice || requestNumber===state.failSynthesisAt)return new Response('Provider quota exhausted',{status:429});
      return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}});
    }
    let value;
    if(url.includes('/providers'))value={providers:state.providers || [{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}},{id:'accent_tts',capabilities:{parameters:{instructions:{type:'string'},accent:{enum:['Irish','French']}}}}]};
    else if(url.endsWith('/voices')){if(state.failCatalogue)throw Error('Voice catalogue unavailable');value=state.catalogues?.[url.split('/').at(-2)] || {voices:['n','y','m','g','new'].map(id=>({id,name:id,description:id==='m'?'A mature, husky Irish voice.':'A light, youthful voice.'}))};}
    else if(url.includes('/chats/') && url.includes('/messages?')){state.canonicalReads=(state.canonicalReads || 0)+1;value={data:state.savedMessages || []};}
    else if(url.includes('/personas/'))value=state.personas?.[decodeURIComponent(url.split('/personas/')[1])] ?? state.persona;
    else if(url.endsWith('?messages=false'))value={metadata:state.chatPersona?{active_persona_id:state.chatPersona}:{}};
    else if(url.includes('/decision-connections?'))value={data:[{id:'decision-a',name:'Decision A',provider:'typesafe',model:'jev'},{id:'decision-b',name:'Decision B',provider:'typesafe',model:'jev'}]};
    else if(url.includes('/connections?'))value={data:[{id:'planner',name:'Planner',model:'text-model'}]};
    else value={data:connections};
    return Response.json(value);
  };
  // Stands in for the backend's freesoundPreview action, which downloads through Lumiverse's CORS proxy.
  const previewControllers=new Map();
  const freesoundPreview=async(url,signal)=>{
    if(url.startsWith('https://freesound.test/ambience.mp3?')){state.bedFetches.push(url);if(state.holdBeds)await new Promise(resolve=>state.releaseBed=resolve);return {base64:btoa(`AMBIENCE:${new URL(url).searchParams.get('q')}`),mimeType:'audio/mpeg'};}
    state.previewFetches.push(url);
    if(state.holdPreview)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{state.previewAborted++;reject(new DOMException('Stopped','AbortError'));},{once:true}));
    if(state.previewStatus && state.previewStatus!==200)throw Error(`Freesound preview HTTP ${state.previewStatus}`);
    if(state.previewType && !state.previewType.startsWith('audio/'))throw Error(`CORS proxy transparent proxy only serves audio data (received Content-Type: ${state.previewType})`);
    return {base64:btoa('FREESOUND_PREVIEW'),mimeType:'audio/mpeg'};
  };
  let backend,decorationCleanup;
  const ctx={settings:{get:async key=>structuredClone(store.get(key) ?? null),set:async(key,value)=>{const snapshot=structuredClone(value);if(state.failPlanSave && /^(plan:|activeplan:)/.test(key) || state.failConfigSave && /^(chat:|settings:)/.test(key) || state.failDefaultsSave && key==='settings:captured-defaults')throw Error('Settings storage failed');if(state.configDelay && /^(chat:|settings:)/.test(key))await new Promise(resolve=>setTimeout(resolve,state.configDelay));store.set(key,snapshot);}},
    messages:{getRecent:()=>state.active==='chat-a'?(state.messages || [message]):[],getContent:id=>state.active==='chat-a'?(state.messages || [message]).find(item=>item.id===id)?.content ?? null:null},
    state:{get:key=>key==='persona.activeId'?state.persona?.id:undefined,subscribe:(key,fn)=>{subscriptions.set(key,fn);return()=>subscriptions.delete(key);}},events:{on:(key,fn)=>{events.set(key,fn);return()=>events.delete(key);}},
    characters:{get:async()=>{if(state.failProfile)throw Error('Character unavailable');return state.character || {name:'Mira'};}},getActiveChat:()=>({chatId:state.active,characterId:'mira'}),dom:{addStyle:()=>()=>{}},
    ui:{mount:point=>point==='chat_actions'?toolbar:undefined,registerDrawerTab:()=>({root,activate(){},destroy(){root.replaceChildren();}}),registerInputBarAction:options=>{const action={...options,onClick(handler){this.click=handler;},destroy(){if(toolbarActions.get(options.id)===action)toolbarActions.delete(options.id);}};toolbarActions.set(options.id,action);return action;},
      registerDomDecorator:options=>{decorationCleanup=options.render(footer,{messageId:message.id});return decorationCleanup;}},
    onBackendMessage:fn=>{backend=fn;return()=>backend=null;},sendToBackend:request=>{
      requests.push(structuredClone(request));if(request.action==='cancel'){previewControllers.get(request.id)?.abort();return;}
      if(request.action==='freesoundPreview'){
        const ctrl=new AbortController();previewControllers.set(request.id,ctrl);
        freesoundPreview(request.input.url,ctrl.signal).then(result=>backend?.({namespace:'choir',id:request.id,result}),error=>{if(!ctrl.signal.aborted)backend?.({namespace:'choir',id:request.id,error:error.message});});
        return;
      }
      setTimeout(()=>{
        if(!backend)return;
        if(request.action==='plan' && state.held || request.action==='freesound' && state.holdFoley || request.action==='sfx' && state.holdSfx){heldPlans.push(request);return;}
        if(request.action==='plan' && state.failPlanAt===requests.filter(r=>r.action==='plan').length){backend({namespace:'choir',id:request.id,error:'Planner quota exhausted'});return;}
        let result;
        if(request.action==='ping')result={ready:true};
        else if(request.action==='freesound'){
          if(state.foleyError){backend({namespace:'choir',id:request.id,error:state.foleyError});return;}
          const {query,filter}=request.input,bed=filter==='duration:[10 TO 120]';
          result={results:state.noFoleyResults || query.split(' ').length>(state.foleyWords || 9)?[]:[{id:123,name:query,previewUrl:bed?`https://freesound.test/ambience.mp3?q=${encodeURIComponent(query)}`:'https://freesound.test/preview.mp3'}]};
        }
        else if(request.action==='sfx'){
          if(state.sfxError){backend({namespace:'choir',id:request.id,error:state.sfxError});return;}
          const anchored=entries=>request.input.segments.flatMap((segment,index)=>Object.entries(entries).filter(([trigger])=>segment.text.includes(trigger)).map(([trigger,query])=>({segment:index,trigger,...(query?{query}:{stop:true})})));
          result=state.soundCues || {cues:anchored({'page snapped':'page turn','glass shattered':'glass shatter'}),ambience:anchored({'Rain drummed':'rain','The tavern':'tavern crowd','Silence fell':''}),
            music:request.input.music?anchored({'Night fell':'Dark','The storm broke':'Intense','Dawn broke':'Bright','Music stopped':''}).map(({query,...entry})=>query?({...entry,feels:[query],genres:['Soundtrack'],keywords:['organ']}):entry):[]};
        }
        else if(request.action==='musicAudio')result={base64:'QUJD',mimeType:'audio/mpeg'};
        else if(request.action==='music'){
          if(state.musicError){backend({namespace:'choir',id:request.id,error:state.musicError});return;}
          const title=state.musicTitles?.[request.input.feels?.[0]] || state.musicTitle || 'Crypto',reply=()=>backend?.({namespace:'choir',id:request.id,result:{title,url:`https://incompetech.com/music/royalty-free/mp3-royaltyfree/${title}.mp3`}});
          if(state.holdMusic){state.releaseMusic=reply;return;}result={title,url:`https://incompetech.com/music/royalty-free/mp3-royaltyfree/${title}.mp3`};
        }
        else if(request.action==='searchVoices')result={results:state.voiceSearchResults || [{id:'community_fish_voice',name:'Community narrator',description:'A warm, steady storyteller.'}]};
        else if(request.action==='cardCast')result={roles:state.cardRoles || []};
        else if(request.action==='testPlanner')result={provider:'Planner',model:'text-model',response:'READY'};
        else if(request.action==='skipCheck'){
          if(state.skipError){backend({namespace:'choir',id:request.id,error:state.skipError});return;}
          result={skip:request.input.lines.flatMap((line,index)=>state.skipLines?.test(line)?[index]:[])};
        }
        else if(request.action==='planJev'){backend({namespace:'choir',id:request.id,...(state.jevInvalid?{result:{}}:{error:'Jev classification failed: The object cannot be cloned'})});return;}
        else if(request.action==='plan' && state.cardTitlePlan){
          result=validatePlan({segments:speechSourceUnits(request.input.transcript).map(unit=>({text:unit.text,speaker:unit.kind==='narration'?'Narrator':unit.text.includes('Hello')?'Kellin Beckett || Toxic Fans':'Mikey Ross',voice:unit.kind==='narration'?'n':'g',style:unit.kind==='dialogue'?'Warm':''}))},request.input.transcript,request.input.config);
        }
        else if(request.action==='plan' && state.multiCard){
          const cast=request.input.config;
          result=validatePlan({segments:speechSourceUnits(request.input.transcript).map(unit=>({text:unit.text,speaker:unit.kind==='narration'?'Narrator':unit.text.includes('Hello')?'Adrian':'Ethan',voice:unit.kind==='narration'?'n':unit.text.includes('Hello')?'m':'new'}))},request.input.transcript,cast);
        }
        else if(request.action==='plan' && state.communityVoice && request.input.config.communityRoutes){
          const cast=request.input.config,voice={...state.communityVoice,route:'native:b'};
          result={...validatePlan({segments:speechSourceUnits(request.input.transcript).map(unit=>({text:unit.text,speaker:unit.kind==='narration'?'Narrator':unit.text.includes('Wait')?'Guard':'Mira',
            voice:unit.kind==='narration'?'n':unit.text.includes('Wait')?'g':voice.id}))},request.input.transcript,{...cast,voices:[...cast.voices,voice]}),communityVoices:[voice]};
        }
        else if(request.action==='plan' && state.planForCatalogue){
          const cast=request.input.config;
          result=validatePlan({segments:speechSourceUnits(request.input.transcript).map(unit=>{
            const speaker=unit.kind==='narration'?'Narrator':unit.text.includes('Wait')?'Guard':'Mira';
            const actor=[...cast.fixed,...cast.npcs].find(actor=>actor.speaker===speaker),route=actor?.route || cast.defaultRoute;
            const voice=cast.voices.filter(voice=>voice.route===route && (cast.fixed.includes(actor) || cast.npcPolicy?.mode!=='preferred' || cast.npcPolicy.voices.includes(voice.id))).at(-1).id;
            return {speaker,voice,route,text:unit.text};
          })},request.input.transcript,cast);
        }
        else if(request.action==='plan')result=validatePlan({segments:speechSourceUnits(request.input.transcript).map(unit=>({
          text:unit.text,speaker:unit.kind==='narration'?'Narrator':unit.text.includes('Wait')?'Guard':state.leadSpeaker || 'Mira',voice:unit.kind==='narration'?'n':unit.text.includes('Wait')?'g':'m',style:unit.kind==='dialogue'?'Warm':''
        }))},request.input.transcript,request.input.config);
        backend({namespace:'choir',id:request.id,result});
      },2);
    }};
  let cleanup=await setup(ctx);
  const $=name=>(root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`));
  const click=async(name,done)=>{$(name).click();await until(()=>done($('status').textContent));};
  const plan=async()=>{$('latest').click();await tick();await until(()=>!$('latest').disabled && ($('status').textContent.startsWith('Ready:') || $('status').textContent.includes('Saved attribution')));};
  const play=async()=>{footer.querySelector('button').click();await tick();await until(()=>$('status').textContent.includes('Playback finished'));};
  const reload=async()=>{cleanup();cleanup=await setup(ctx);};
  return {ctx,dom,state,store,requests,synthesis,audios,audioBlobs,message,events,subscriptions,toolbarActions,connections,root,footer,toolbar,$,click,plan,play,reload,async remount(){cleanup=await setup(ctx);},
    setMobile(matches){channelLayout.matches=matches;for(const listener of layoutListeners)listener();},
    releaseHeld(){for(const request of heldPlans.splice(0))backend?.({namespace:'choir',id:request.id,result:{segments:[{speaker:'Narrator',voice:'n',text:request.input.transcript,style:''}]}});},
    async close(){cleanup();await tick();URL.createObjectURL=createObjectURL;Object.assign(globalThis,original);dom.window.close();}};
}

async function elizaFixture(h,{sayAs='',grouped=false}={}){
  h.state.character={name:'Eliza'};h.state.leadSpeaker='Eliza';h.message.name='Eliza';
  h.message.content='Eliza arrived. "Hello, Eliza." "Wait, Eliza." The gate closed.';
  for(const connection of h.connections){connection.provider='fish_audio';connection.model='s2.1-pro';}
  h.state.providers=[{id:'fish_audio',capabilities:{parameters:{},multiSpeaker:{maxSpeakers:5}}}];
  const saved=h.store.get('chat:chat-a');
  Object.assign(saved,{useStyle:false,skipMeta:false,enableSfx:false,enableAmbience:false,batchSpeech:grouped,connectionMode:grouped?'one':'several'});
  saved.fixed[2]={...saved.fixed[2],speaker:'Eliza',aliases:[],pronunciation:'',accent:'',sayAs};h.store.set('chat:chat-a',saved);await h.reload();
}
async function editNamePronunciation(h,value){
  const input=h.$('fixed').querySelectorAll('[data-choir-say-as]')[2];assert.ok(input);input.value=value;input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  await until(()=>h.$('saveState').textContent==='Saved automatically');
}

test('name pronunciation reaches every native Fish voice and editing it regenerates only affected speech',async()=>{
  const h=await harness();try{
    await elizaFixture(h);const legacy=h.store.get('chat:chat-a');legacy.fixed[2].pronunciation='Eliza: Eh-Lee-Zah';delete legacy.fixed[2].sayAs;h.store.set('chat:chat-a',legacy);await h.reload();
    assert.equal(h.$('fixed').querySelectorAll('[data-choir-say-as]')[2].value,'Eh-Lee-Zah');const original=h.message.content;
    await h.plan();await h.play();assert.equal(h.synthesis.length,4);
    for(const voice of ['n','m','g']){const input=h.synthesis.find(input=>input.voice===voice);assert.match(input.text,/Eh-Lee-Zah/);assert.doesNotMatch(input.text,/Eliza/);}
    assert.equal(h.message.content,original);assert.equal(h.requests.find(request=>request.action==='plan').input.transcript,original);
    assert.match(h.$('planJson').value,/Eliza/);assert.doesNotMatch(h.$('planJson').value,/Eh-Lee-Zah/);
    await editNamePronunciation(h,'Eh Lee Zah');await h.play();assert.equal(h.synthesis.length,7);assert.ok(h.synthesis.slice(4).every(input=>input.text.includes('Eh Lee Zah')));
    assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
    await h.reload();await h.play();assert.equal(h.synthesis.length,7);
    await editNamePronunciation(h,'');await h.play();assert.equal(h.synthesis.length,10);assert.ok(h.synthesis.slice(7).every(input=>input.text.includes('Eliza')));
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Connection preferences restored');
    assert.equal(h.$('fixed').querySelectorAll('[data-choir-say-as]')[2].value,'');
  }finally{await h.close();}
});

test('name pronunciation reaches grouped Fish turns and the actual-name audition',async()=>{
  const h=await harness();try{
    await elizaFixture(h,{sayAs:'Eh-Lee-Zah',grouped:true});await h.plan();await h.play();
    const grouped=h.synthesis.find(input=>input.parameters.turns?.length>1);assert.ok(grouped);
    assert.ok(grouped.parameters.turns.filter(turn=>turn.text.includes('Eh-Lee-Zah')).length>=3);
    assert.ok(h.synthesis.every(input=>!input.text.includes('Eliza')));
    const test=h.$('fixed').querySelector('[aria-label="Test pronunciation of Eliza"]');test.click();await until(()=>h.$('status').textContent==='Audition finished.');
    assert.match(h.synthesis.at(-1).text,/Eh-Lee-Zah opened the door/);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
  }finally{await h.close();}
});

test('name pronunciation applies in companion narration and dialogue and updates its audio cache',async()=>{
  const h=await harness();try{
    await elizaFixture(h,{sayAs:'Eh-Lee-Zah'});const text='Eliza smiled. "Hello, Eliza."';
    await globalThis.__CHOIR_API__.playParagraph({text,speaker:'Eliza'});assert.equal(h.synthesis.length,2);assert.ok(h.synthesis.every(input=>input.text.includes('Eh-Lee-Zah')));
    await globalThis.__CHOIR_API__.playParagraph({text,speaker:'Eliza'});assert.equal(h.synthesis.length,2);
    await editNamePronunciation(h,'Eh Lee Zah');await globalThis.__CHOIR_API__.playParagraph({text,speaker:'Eliza'});assert.equal(h.synthesis.length,4);assert.ok(h.synthesis.slice(2).every(input=>input.text.includes('Eh Lee Zah')));
    assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
  }finally{await h.close();}
});

test('name pronunciation updates legacy Replay without seeding stale audio under new cache keys or calling a planner',async()=>{
  const h=await harness();try{
    await elizaFixture(h);await h.plan();await h.play();assert.equal(h.synthesis.length,4);
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const transaction=db.transaction('recordings','readwrite'),cursor=transaction.objectStore('recordings').openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){const value=row.value;delete value.speechTexts;delete value.passages;row.update(value);row.continue();}};transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});db.close();
    await editNamePronunciation(h,'Eh-Lee-Zah');
    [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('Name pronunciation updated'));
    assert.equal(h.synthesis.length,7);assert.ok(h.synthesis.slice(4).every(input=>input.text.includes('Eh-Lee-Zah')));assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
    [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent==='Replay finished.');assert.equal(h.synthesis.length,7);
  }finally{await h.close();}
});

test('pronunciation regression: shared-connection companion uses inherited NPC name spelling and delivery preferences',async()=>{
  const h=await harness();try{
    const saved=h.store.get('chat:chat-a');
    Object.assign(saved,{connection:'b',connectionMode:'one',useStyle:false,skipMeta:false,enableSfx:false,enableAmbience:false,plannerMode:'heuristic',useFastClassifier:true});
    saved.casts={'native:a':[{speaker:'Guard',voice:'g',style:'',sayAs:'Gahrd',pronunciation:'Speak softly.',accent:'Irish'}],'native:b':[]};
    h.store.set('chat:chat-a',saved);await h.reload();
    assert.deepEqual(globalThis.__CHOIR_API__.getConfig().casts['native:b'],[]);
    const text='Guard opened the gate. "Hello, Guard."';
    await globalThis.__CHOIR_API__.playParagraph({text,speaker:'Guard'});
    assert.ok(h.synthesis.length>=2);assert.ok(h.synthesis.every(input=>input.text.includes('Gahrd')),JSON.stringify(h.synthesis));
    const npc=h.synthesis.find(input=>input.voice==='g');assert.ok(npc);assert.equal(npc.connectionId,'b');assert.equal(npc.parameters.accent,'Irish');assert.match(npc.parameters.instructions,/Speak softly/);
    const count=h.synthesis.length;await globalThis.__CHOIR_API__.playParagraph({text,speaker:'Guard'});assert.equal(h.synthesis.length,count);
    assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
  }finally{await h.close();}
});

test('pronunciation regression: equivalent accented multiword names update cached lead speech without replanning',async()=>{
  const h=await harness();try{
    const name='Zoë Jane';h.state.character={name};h.state.leadSpeaker=name;h.message.name=name;
    h.message.content='Zoe\u0308\u00a0Jane arrived. "Hello, Zoe\u0308 Jane." "Wait, Zoë  Jane." The gate closed.';
    const saved=h.store.get('chat:chat-a');Object.assign(saved,{useStyle:false,skipMeta:false,enableSfx:false,enableAmbience:false,batchSpeech:false});
    saved.fixed[2]={...saved.fixed[2],speaker:name,sayAs:'Zoh-ee Jayne',pronunciation:'',aliases:[],accent:''};h.store.set('chat:chat-a',saved);await h.reload();
    const original=h.message.content;await h.plan();await h.play();assert.equal(h.synthesis.length,4);
    assert.ok(h.synthesis.slice(0,3).every(input=>input.text.includes('Zoh-ee Jayne')),JSON.stringify(h.synthesis));
    await editNamePronunciation(h,'Zo Ee Jeyn');await h.play();assert.equal(h.synthesis.length,7);assert.ok(h.synthesis.slice(4).every(input=>input.text.includes('Zo Ee Jeyn')));
    assert.equal(h.message.content,original);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
    await h.reload();await h.play();assert.equal(h.synthesis.length,7);
  }finally{await h.close();}
});

test('pronunciation regression: editing an NPC name spelling refreshes Replay for every voice that says it',async()=>{
  const h=await harness();try{
    h.message.content='Guard arrived. "Hello, Guard." "Wait, Guard." The gate closed.';
    const saved=h.store.get('chat:chat-a');Object.assign(saved,{useStyle:false,skipMeta:false,enableSfx:false,enableAmbience:false,batchSpeech:false});
    saved.casts['native:a'][0].sayAs='Gahrd';h.store.set('chat:chat-a',saved);await h.reload();await h.plan();await h.play();assert.equal(h.synthesis.length,4);
    assert.ok(h.synthesis.slice(0,3).every(input=>input.text.includes('Gahrd')));
    const input=h.$('npcs').querySelector('[data-choir-say-as]');assert.ok(input);input.value='Garrd';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
    [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('Name pronunciation updated'));
    assert.equal(h.synthesis.length,7);assert.ok(h.synthesis.slice(4).every(input=>input.text.includes('Garrd')));assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
    [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent==='Replay finished.');assert.equal(h.synthesis.length,7);
    assert.equal(h.store.get('chat:chat-a').casts['native:a'][0].sayAs,'Garrd');
  }finally{await h.close();}
});

test('pronunciation regression: editing a legacy speaking mapping promotes it to Say name as and clearing stays deliberate',async()=>{
  const h=await harness();try{
    await elizaFixture(h);
    const input=h.$('fixed').querySelectorAll('[data-choir-say-as]')[2];assert.ok(input);assert.equal(input.value,'');
    const row=input.closest('.et-card');assert.ok(row);const instruction=[...row.querySelectorAll('label')].find(label=>label.firstChild.textContent==='Speaking instruction')?.querySelector('input');assert.ok(instruction);
    instruction.value='Pronounce Eliza as Eh-Lee-Zah';instruction.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));instruction.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(input.value,'Eh-Lee-Zah');
    row.querySelector('[data-choir-pronunciation-test]').click();await until(()=>h.$('status').textContent==='Audition finished.');assert.match(h.synthesis.at(-1).text,/Eh-Lee-Zah opened the door/);
    await editNamePronunciation(h,'');await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-say-as]')[2].value,'');
    h.$('fixed').querySelector('[aria-label="Test pronunciation of Eliza"]').click();await until(()=>h.$('status').textContent==='Audition finished.');assert.match(h.synthesis.at(-1).text,/Eliza opened the door/);
  }finally{await h.close();}
});

test('pronunciation regression: selecting Richter targets the displayed alias and refreshes narration dialogue Replay and audition',async()=>{
  const h=await harness();try{
    const name='Richter Vane (Callsign: Grim)';h.state.character={name};h.state.leadSpeaker=name;h.message.name=name;
    h.message.content='Richter Vane arrived. "Hello, Richter." "Wait, Richter." The gate closed.';
    const original=h.message.content,saved=h.store.get('chat:chat-a');Object.assign(saved,{useStyle:false,skipMeta:false,enableSfx:false,enableAmbience:false,batchSpeech:false});
    saved.fixed[2]={...saved.fixed[2],speaker:name,aliases:['Richter'],sayAs:'Rish-ter',pronunciation:'',accent:''};h.store.set('chat:chat-a',saved);await h.reload();
    let target=h.$('fixed').querySelectorAll('[data-choir-say-as-name]')[2];assert.ok(target);assert.equal(target.value,'');assert.ok([...target.options].some(option=>option.value==='Richter'));
    await h.plan();await h.play();assert.equal(h.synthesis.length,4);assert.ok(h.synthesis.slice(0,3).every(input=>input.text.includes('Richter')));
    target=h.$('fixed').querySelectorAll('[data-choir-say-as-name]')[2];
    target.value='Richter';target.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
    await h.play();assert.equal(h.synthesis.length,7);assert.ok(h.synthesis.slice(4).every(input=>input.text.includes('Rish-ter')));assert.match(h.synthesis[4].text,/Rish-ter Vane arrived/);
    const actor=h.store.get('chat:chat-a').fixed[2];assert.equal(actor.speaker,name);assert.deepEqual(actor.aliases,['Richter']);assert.equal(actor.sayAsName,'Richter');assert.match(h.$('planJson').value,/Richter Vane \(Callsign: Grim\)/);
    [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent==='Replay finished.');assert.equal(h.synthesis.length,7);
    h.$('fixed').querySelectorAll('[data-choir-say-as]')[2].closest('.et-card').querySelector('[data-choir-pronunciation-test]').click();await until(()=>h.$('status').textContent==='Audition finished.');assert.equal(h.synthesis.at(-1).text,'Rish-ter opened the door.');assert.equal(h.synthesis.length,8);
    await editNamePronunciation(h,'Rish-turr');
    [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('Name pronunciation updated'));
    assert.equal(h.synthesis.length,11);assert.ok(h.synthesis.slice(8).every(input=>input.text.includes('Rish-turr')));assert.match(h.synthesis[8].text,/Rish-turr Vane arrived/);
    await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-say-as-name]')[2].value,'Richter');await h.play();assert.equal(h.synthesis.length,11);
    h.$('fixed').querySelectorAll('[data-choir-say-as]')[2].closest('.et-card').querySelector('[data-choir-pronunciation-test]').click();await until(()=>h.$('status').textContent==='Audition finished.');assert.equal(h.synthesis.at(-1).text,'Rish-turr opened the door.');
    assert.equal(h.message.content,original);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);assert.equal(h.store.get('chat:chat-a').fixed[2].speaker,name);
    target=h.$('fixed').querySelectorAll('[data-choir-say-as-name]')[2];target.value='';target.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
    const aliases=[...target.closest('.et-card').querySelectorAll('label')].find(label=>label.firstChild.textContent==='Aliases (comma separated)')?.querySelector('input');assert.ok(aliases);
    aliases.value='Richter, Grim';aliases.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(target.value,'');assert.equal(h.store.get('chat:chat-a').fixed[2].sayAsName,'');
    await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-say-as-name]')[2].value,'');
  }finally{await h.close();}
});

test('reading skip preview uses visible custom rules while preserving story text and making no planner or speech call',async()=>{
  const h=await harness();try{
    h.message.content='<p>Eliza arrived.</p><aside class="skip-this">Hidden tracker.</aside><p>The story continues.</p>';
    assert.equal(h.$('ignoredTags').closest('label').hidden,false);
    h.$('ignoredTags').value='.skip-this';h.$('ignoredTags').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    h.$('previewReading').click();assert.equal(h.$('readingPreview').hidden,false);assert.match(h.$('readingPreview').textContent,/Eliza arrived/);assert.match(h.$('readingPreview').textContent,/story continues/);assert.doesNotMatch(h.$('readingPreview').textContent,/Hidden tracker/);
    assert.match(h.message.content,/Hidden tracker/);assert.equal(h.synthesis.length,0);assert.equal(h.requests.filter(request=>['plan','skipCheck','sfx'].includes(request.action)).length,0);
    await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();assert.equal(h.$('ignoredTags').value,'.skip-this');
  }finally{await h.close();}
});

test('HTTP hosts without secure crypto APIs keep the drawer, mixer, RPC, saved plans and cached replay working',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),nativeCrypto=globalThis.crypto;
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:nativeCrypto.getRandomValues.bind(nativeCrypto)}});
  let h;
  try{
    h=await harness({enabled:true});
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const namespace=h.store.get('audio:namespace');assert.match(namespace,uuid);
    assert.ok(h.root.querySelector('.ensemble-tts'));assert.equal(h.dom.window.document.querySelectorAll('[data-choir-mixer]').length,1);
    await h.plan();await h.play();
    const expectedKey='plan:'+createHash('sha256').update(JSON.stringify(['chat-a',h.message.id])).digest('hex');
    assert.ok(h.store.has(expectedKey));assert.ok(h.synthesis.length>0);
    const plans=h.requests.filter(request=>request.action==='plan').length,synthesis=h.synthesis.length;
    for(const cryptoApi of [nativeCrypto,{getRandomValues:nativeCrypto.getRandomValues.bind(nativeCrypto)}]){
      Object.defineProperty(globalThis,'crypto',{configurable:true,value:cryptoApi});
      await h.reload();await h.play();
      assert.equal(h.requests.filter(request=>request.action==='plan').length,plans);
      assert.equal(h.synthesis.length,synthesis);assert.equal(h.store.get('audio:namespace'),namespace);
    }
    assert.ok(h.root.querySelector('.ensemble-tts'));assert.equal(h.dom.window.document.querySelectorAll('[data-choir-mixer]').length,1);
    const ids=h.requests.filter(request=>request.action!=='cancel').map(request=>request.id);
    assert.ok(ids.length>1);assert.equal(new Set(ids).size,ids.length);for(const id of ids)assert.match(id,uuid);
  }finally{if(h)await h.close();Object.defineProperty(globalThis,'crypto',descriptor);}
});

test('teardown releases playback after the host invalidates the message bridge',async()=>{
 const h=await harness();let closed=false;try{
  const mixer=h.dom.window.document.querySelector('[data-choir-mixer]');
  await h.plan();h.state.blockAudio=true;h.footer.querySelector('button').click();
  await until(()=>h.audios.some(audio=>!audio.paused));
  h.ctx.messages.getRecent=()=>{throw new Error('SPINDLE_FRONTEND_INACTIVE: domain bridge is disposed');};
  await h.close();closed=true;
  assert.ok(h.audios.every(audio=>audio.paused));
  assert.equal(mixer.isConnected,false);
  assert.equal(h.toolbarActions.size,0);
 }finally{if(!closed)await h.close();}
});

test('the staging badge follows the installed Choir branch and unavailable branch information never breaks the drawer',async()=>{
 const h=await harness();try{
  await until(()=>!h.$('branchBadge').hidden);assert.equal(h.$('branchBadge').textContent,'Staging');
  for(const branch of ['main',null,'feature-test']){
   h.state.extensionBranch=branch;const lookups=h.state.branchLookups;await h.reload();await until(()=>h.state.branchLookups>lookups);await tick();
   assert.equal(h.$('branchBadge').hidden,true);assert.ok(h.root.querySelector('.ensemble-tts'));
  }
  h.state.extensionBranch='staging';await h.reload();await until(()=>!h.$('branchBadge').hidden);
  h.state.branchLookupFails=true;await h.reload();await tick();assert.equal(h.$('branchBadge').hidden,true);assert.ok(h.root.querySelector('.ensemble-tts'));await h.plan();
  assert.equal(h.synthesis.length,0);
 }finally{await h.close();}
});

test('autosave hides the manual save button and exposes a working retry only after storage failure',async()=>{
  const h=await harness();try{
    assert.equal(h.$('save').hidden,true);assert.equal(h.$('save').textContent,'Retry save');
    h.state.failConfigSave=true;h.$('prefetch').value='2';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    await until(()=>h.$('saveState').textContent.includes('Save failed'));assert.equal(h.$('save').hidden,false);
    h.state.failConfigSave=false;await h.click('save',text=>text.includes('retention saved'));
    assert.equal(h.store.get('chat:chat-a').prefetch,2);assert.equal(h.$('save').hidden,true);
    h.$('chunk').value='10001';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    assert.equal(h.$('save').hidden,true);assert.match(h.$('saveState').textContent,/Not saved/);
  }finally{await h.close();}
});

const configureFoley=async(h,key='test-freesound-key')=>{h.$('freesoundApiKey').value=key;h.$('freesoundApiKey').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');};
const playedFoley=async h=>(await Promise.all(h.audioBlobs.map(blob=>blob.text()))).filter(text=>text==='FREESOUND_PREVIEW').length;

const captureDefault=h=>{h.$('captureDefaults').click();const dialog=()=>document.querySelector('[role="dialog"][aria-label="Set default"]');[...dialog().querySelectorAll('button')].find(button=>button.textContent==='Use current chat settings').click();[...dialog().querySelectorAll('button')].find(button=>button.textContent==='Save default').click();};

test('legacy voice styles are bounded across saved leads and Casting connections before planning and playback',async()=>{
 const h=await harness();try{
  const saved=h.store.get('chat:chat-a'),longStyle='Warm and measured. '.repeat(50),bounded=longStyle.slice(0,600);
  saved.fixed[0].style=longStyle;saved.fixed[2].style=longStyle;
  saved.casts['native:a'][0].style=longStyle;saved.casts['native:b']=[{speaker:'Other guard',voice:'g',style:longStyle}];
  await h.reload();await h.plan();await h.play();
  const cast=h.requests.filter(request=>request.action==='plan').at(-1).input.config;
  assert.equal(cast.fixed[0].style,bounded);assert.equal(cast.fixed[2].style,bounded);assert.equal(cast.npcs[0].style,bounded);
  const persisted=h.store.get('chat:chat-a');assert.equal(persisted.casts['native:b'][0].style,bounded);
  assert.equal(persisted.fixed[1].style,'');assert.equal(persisted.fixed[2].pronunciation,'Mira: mee-rah');assert.equal(persisted.fixed[2].voice,'m');
  assert.equal(h.synthesis.length,4);assert.equal(h.message.content,'At dawn. "Hello." "Wait." The gate closed.');
 }finally{await h.close();}
});

test('legacy default voice styles can be saved and applied without clearing omitted styles',async()=>{
 const h=await harness();try{
  const saved=h.store.get('chat:chat-a'),longStyle='Clear narration. '.repeat(50),exactStyle='s'.repeat(600);
  saved.fixed[2].style='Independent character style';
  h.store.set('settings:captured-defaults',{version:2,leadVoices:saved.fixed.map((actor,index)=>({voice:actor.voice,route:actor.route || '',...(index===0?{style:longStyle}:index===1?{style:exactStyle}:{})}))});
  await h.reload();h.$('captureDefaults').click();
  const dialog=document.querySelector('[role="dialog"][aria-label="Set default"]');[...dialog.querySelectorAll('button')].find(button=>button.textContent==='Save default').click();
  await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));
  assert.equal(h.store.get('settings:captured-defaults').leadVoices[0].style,longStyle.slice(0,600));
  h.$('applyDefaults').click();await until(()=>h.$('defaultStatus').textContent.startsWith('Default applied'));
  const applied=h.store.get('chat:chat-a');assert.equal(applied.fixed[0].style,longStyle.slice(0,600));assert.equal(applied.fixed[1].style,exactStyle);assert.equal(applied.fixed[2].style,'Independent character style');
  await h.plan();await h.play();assert.equal(h.synthesis.length,4);
 }finally{await h.close();}
});

test('cast defaults contain only lead and NPC choices; cancel and navigation discard drafts',async()=>{
 const h=await harness();try{
  const current=structuredClone(h.store.get('chat:chat-a')),get=()=>document.querySelector('[role="dialog"][aria-label="Set default"]'),button=name=>[...get().querySelectorAll('button')].find(item=>item.textContent===name);
  h.$('captureDefaults').click();assert.ok(get());assert.equal(get().querySelectorAll('[role="tab"]').length,2);assert.equal(get().querySelector('[data-default-field]'),null);
  assert.equal(h.$('captureDefaults').closest('.et-section-header').querySelector('h3').textContent,'Cast');
  assert.equal(h.$('captureNpcDefaults'),null);
  const voice=get().querySelector('[aria-label="Default {{char}} voice"]');voice.value='';voice.dispatchEvent(new h.dom.window.Event('change'));
  button('Voices').focus();get().dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true}));assert.equal(document.activeElement,button('Save default'));
  get().dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));assert.equal(document.activeElement,button('Voices'));
  button('Cancel').click();assert.equal(get(),null);assert.equal(h.store.has('settings:captured-defaults'),false);assert.deepEqual(h.store.get('chat:chat-a'),current);
  h.$('captureDefaults').click();const automatic=get().querySelector('[aria-label="Default {{char}} voice"]');automatic.value='';automatic.dispatchEvent(new h.dom.window.Event('change'));button('Save default').click();
  await until(()=>!get());const preset=structuredClone(h.store.get('settings:captured-defaults'));assert.equal(preset.version,2);assert.equal(preset.preferences,undefined);assert.equal(preset.leadVoices[2].voice,'');assert.deepEqual(h.store.get('chat:chat-a'),current);
  h.$('captureDefaults').click();assert.equal(get().querySelector('[aria-selected="true"]').textContent,'Voices');
  h.state.active='chat-new';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded');assert.equal(get(),null);
  assert.deepEqual(h.store.get('settings:captured-defaults'),preset);assert.equal(h.synthesis.length,0);
 }finally{await h.close();}
});

test('Fish voice IDs in Set default stay in the draft until Save and persist across apply, reload and new chats',async()=>{
 const h=await fishGroupingHarness();try{
  const before=structuredClone(h.store.get('chat:chat-a')),dialog=()=>document.querySelector('[aria-label="Set default"]');
  const button=name=>[...dialog().querySelectorAll('button')].find(button=>button.textContent===name);
  const choose=id=>{dialog().querySelector('[aria-label="Paste Fish voice ID for Default {{char}} voice"]').click();dialog().querySelector('[aria-label="Fish voice ID for Default {{char}} voice"]').value=id;dialog().querySelector('[aria-label="Fish voice description for Default {{char}} voice"]').value='A calm, warm voice.';dialog().querySelector('[aria-label="Use Fish voice ID for Default {{char}} voice"]').click();};
  h.$('captureDefaults').click();choose('discarded_fish_voice');button('Cancel').click();
  assert.deepEqual(h.store.get('chat:chat-a'),before);assert.equal(h.store.has('settings:captured-defaults'),false);
  h.$('captureDefaults').click();choose('fish_custom_default');button('Save default').click();await until(()=>!dialog());
  const preset=h.store.get('settings:captured-defaults');assert.equal(preset.leadVoices[2].voice,'fish_custom_default');assert.equal(preset.voiceCatalogue.find(voice=>voice.id==='fish_custom_default').description,'A calm, warm voice.');
  assert.deepEqual(h.store.get('chat:chat-a'),before);
  h.$('applyDefaults').click();await until(()=>h.$('defaultStatus').textContent.startsWith('Default applied'));
  assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'fish_custom_default');
  await h.reload();assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'fish_custom_default');
  h.state.active='chat-new';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded');
  assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'fish_custom_default');assert.equal(h.synthesis.length,0);
 }finally{await h.close();}
});

test('Set default browses Fish voices for the selected route, rejects invalid IDs and closes its child browser on navigation',async()=>{
 const h=await harness();try{
  h.connections[1].provider='fish_audio';await h.reload();const before=structuredClone(h.store.get('chat:chat-a'));
  h.$('captureDefaults').click();const dialog=document.querySelector('[aria-label="Set default"]');
  const narrator=dialog.querySelector('[aria-label="Browse Fish voice catalogue for Default Narrator voice"]');assert.equal(narrator.parentElement.hidden,true);
  const paste=dialog.querySelector('[aria-label="Paste Fish voice ID for Default {{char}} voice"]');assert.equal(paste.parentElement.hidden,false);paste.click();
  dialog.querySelector('[aria-label="Fish voice ID for Default {{char}} voice"]').value='invalid/voice';dialog.querySelector('[aria-label="Use Fish voice ID for Default {{char}} voice"]').click();
  assert.match(dialog.querySelector('[data-default-feedback]').textContent,/letters, numbers/);
  dialog.querySelector('[aria-label="Browse Fish voice catalogue for Default {{char}} voice"]').click();
  await until(()=>document.querySelector('[data-et="voiceLibraryModal"] .et-voice-card button.et-btn-primary'));
  document.querySelector('[data-et="voiceLibraryModal"] .et-voice-card button.et-btn-primary').click();
  assert.equal(dialog.querySelector('[aria-label="Default {{char}} voice"]').value,'community_fish_voice');assert.deepEqual(h.store.get('chat:chat-a'),before);
  [...dialog.querySelectorAll('button')].find(button=>button.textContent==='Save default').click();await until(()=>!dialog.isConnected);
  assert.equal(h.store.get('settings:captured-defaults').voiceCatalogue.find(voice=>voice.id==='community_fish_voice').route,'native:b');
  h.$('captureDefaults').click();document.querySelector('[aria-label="Browse Fish voice catalogue for Default {{char}} voice"]').click();
  assert.ok(document.querySelector('[data-et="voiceLibraryModal"]'));h.state.active='chat-new';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded');
  assert.equal(document.querySelector('[data-et="voiceLibraryModal"]'),null);assert.equal(document.querySelector('[aria-label="Set default"]'),null);
 }finally{await h.close();}
});

test('Fish NPC default IDs support shared and preferred voices without altering the active chat',async()=>{
 for(const mode of ['single','preferred']){
  const h=await fishGroupingHarness();try{
   const before=structuredClone(h.store.get('chat:chat-a'));h.$('captureDefaults').click();const dialog=document.querySelector('[aria-label="Set default"]'),selection=dialog.querySelector('[aria-label="Default Automatic casting"]');
   selection.value=mode;selection.dispatchEvent(new h.dom.window.Event('change'));const name=mode==='single'?'Default Shared voice':'Default Preferred voices';
   dialog.querySelector(`[aria-label="Paste Fish voice ID for ${name}"]`).click();dialog.querySelector(`[aria-label="Fish voice ID for ${name}"]`).value='fish_npc_default';dialog.querySelector(`[aria-label="Use Fish voice ID for ${name}"]`).click();
   [...dialog.querySelectorAll('button')].find(button=>button.textContent==='Save default').click();await until(()=>!dialog.isConnected);
   const preset=h.store.get('settings:captured-defaults');assert.equal(mode==='single'?preset.npcPolicy.voice:preset.npcPolicy.voices[0],'fish_npc_default');assert.deepEqual(h.store.get('chat:chat-a'),before);
   h.$('applyDefaults').click();await until(()=>h.$('defaultStatus').textContent.startsWith('Default applied'));await h.reload();
   const picker=h.$('npcPolicyRoot').querySelector(`[aria-label="${name.replace('Default ','')}"]`);assert.ok([...picker.selectedOptions].some(option=>option.value==='fish_npc_default'));
  }finally{await h.close();}
 }
});

test('NPC default modes can be applied per chat, skip synthesis or enforce shared and preferred voices, and persist independently',async()=>{
 for(const routing of ['several','one'])for(const mode of ['skip','single','preferred','llm']){
  const h=await harness();try{
   if(routing==='one'){h.$('connectionMode').value='one';h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Settings saved');}
   const before=structuredClone(h.store.get('chat:chat-a'));
   h.$('captureDefaults').click();const dialog=document.querySelector('[role="dialog"][aria-label="Set default"]'),change=(name,value)=>{const input=dialog.querySelector(`[aria-label="${name}"]`);input.value=value;input.dispatchEvent(new h.dom.window.Event('change'));return input;};
   [...dialog.querySelectorAll('button')].find(button=>button.textContent==='Automatic casting').click();change('Default Automatic casting',mode);
   if(mode==='single')change('Default Shared voice','m');
   if(mode==='preferred'){const pool=dialog.querySelector('[aria-label="Default Preferred voices"]');[...pool.options].forEach(option=>option.selected=['m','new'].includes(option.value));pool.dispatchEvent(new h.dom.window.Event('change'));}
   [...dialog.querySelectorAll('button')].find(button=>button.textContent==='Save default').click();await until(()=>!dialog.isConnected);
   const preset=structuredClone(h.store.get('settings:captured-defaults'));assert.equal(preset.npcPolicy.mode,mode);assert.deepEqual(h.store.get('chat:chat-a'),before);
   h.$('applyDefaults').click();await until(()=>h.$('defaultStatus').textContent.startsWith('Default applied'));
   if(routing==='one'){const stored=structuredClone(h.store.get('chat:chat-a'));stored.npcPolicy.route='native:b';h.store.set('chat:chat-a',stored);await h.reload();}
   h.state.planForCatalogue=mode==='preferred';h.message.content='At dawn. "Hello." "Wait."';await h.plan();await h.play();
   if(mode==='skip')assert.ok(!h.synthesis.some(request=>request.text.includes('Wait')));
   else{const npc=h.synthesis.find(request=>request.text.includes('Wait'));assert.ok(npc);assert.equal(npc.voice,mode==='single'?'m':mode==='preferred'?'new':'g');}
   assert.equal(h.synthesis.find(request=>request.text.includes('Hello')).voice,'m');assert.equal(h.synthesis.find(request=>request.text.includes('At dawn')).voice,'n');
   assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
   h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
   const paragraph='Guard said, "A new sentence."',bridge=globalThis.__CHOIR_API__,cuePlan=bridge.planParagraph(paragraph);assert.equal(cuePlan.segments.at(-1).speaker,'Guard');
   const start=h.synthesis.length;await bridge.playParagraph({text:paragraph});const cue=h.synthesis.slice(start).find(request=>request.text.includes('A new sentence'));
   if(mode==='skip')assert.equal(cue,undefined);else{assert.ok(cue);assert.equal(cue.voice,mode==='single'?'m':mode==='preferred'?'new':'g');assert.equal(cue.connectionId,'a');}
   await h.reload();assert.equal(h.$('npcPolicyRoot').querySelector('[aria-label="Automatic casting"]').value,mode);
   const selection=h.$('npcPolicyRoot').querySelector('[aria-label="Automatic casting"]');selection.value=mode==='llm'?'skip':'llm';selection.dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
   assert.deepEqual(h.store.get('settings:captured-defaults'),preset);await h.reload();assert.equal(h.$('npcPolicyRoot').querySelector('[aria-label="Automatic casting"]').value,mode==='llm'?'skip':'llm');
   if(mode==='skip'){await h.play();assert.ok(h.synthesis.some(request=>request.text.includes('Wait')));}
  }finally{await h.close();}
 }
});

test('captured defaults stay stable across chats and carry lead voices by role with fresh character identities',async()=>{
 for(const mode of ['one','several']){
  const h=await harness();try{
   h.$('connectionMode').value=mode;h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Settings saved');
   h.$('planner').value='planner';h.$('chunk').value='8000';h.$('enableSfx').checked=false;h.$('normalizeLoudness').checked=false;h.$('auto-plan').click();
   captureDefault(h);await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));
   await until(()=>h.store.get('settings:global').chunk===8000);
   const preset=structuredClone(h.store.get('settings:captured-defaults'));
   assert.equal(preset.preferences,undefined);assert.equal(h.store.get('settings:global').chunk,8000);assert.equal(h.store.get('settings:global').planner,'planner');assert.equal(h.store.get('settings:global').autoPlan,true);assert.equal(h.store.get('settings:global').enableSfx,false);
   assert.deepEqual(preset.leadVoices.map(actor=>actor.voice),['n','y','m']);assert.ok(!JSON.stringify(preset).includes('Mira'));assert.ok(!JSON.stringify(preset).includes('Guard'));
   const existing=structuredClone(h.store.get('chat:chat-a'));existing.chunk=9999;existing.fixed[2].speaker='Existing character';h.store.set('chat:existing',existing);
   h.$('chunk').value='1200';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
   assert.deepEqual(h.store.get('settings:captured-defaults'),preset);
   h.state.persona={id:'persona-new',name:'Lunch'};h.state.character={name:'Laiyah'};h.state.active='chat-new';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded');
   assert.equal(h.$('chunk').value,'1200');assert.equal(h.$('planner').value,'planner');assert.equal(h.$('enableSfx').checked,false);assert.equal(h.$('normalizeLoudness').checked,false);
   assert.deepEqual([...h.$('fixed').children].map(row=>row.querySelector('input').value),['Narrator','Lunch','Laiyah']);
   assert.deepEqual([...h.$('fixed').querySelectorAll('[data-choir-voice]')].map(node=>node.value),['n','y','m']);assert.equal(h.$('npcs').querySelectorAll('.et-card').length,0);
   const characterVoice=h.$('fixed').children[2].querySelector('[data-choir-voice]');characterVoice.value='new';characterVoice.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
   assert.equal(mode==='one'?h.store.get('chat:chat-new').singleVoices['native:a'].Laiyah:h.store.get('chat:chat-new').fixed[2].voice,'new');
   await h.reload();assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'new');assert.deepEqual(h.store.get('settings:captured-defaults'),preset);
   h.state.active='existing';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Saved settings restored' && h.$('fixed').children[2]?.querySelector('input').value==='Existing character');assert.equal(h.$('chunk').value,'1200');
   h.state.character={name:'Jev'};h.state.active='chat-next';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded');assert.equal(h.$('fixed').children[2].querySelector('input').value,'Jev');assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'m');
   h.$('fixed').children[2].querySelector('[data-choir-voice]').value='';captureDefault(h);await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));assert.equal(h.store.get('settings:captured-defaults').leadVoices[2].voice,'');
   h.state.character={name:'Sable'};h.state.active='chat-automatic';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded' && h.$('fixed').children[2]?.querySelector('input').value==='Sable');assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'');
   assert.equal(h.synthesis.length,0);assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
  }finally{await h.close();}
 }
});

test('applying a captured default restores lead voices without overwriting global preferences while retaining this chat cast and independent edits',async()=>{
 for(const mode of ['one','several']){
  const h=await harness();try{
   h.$('connectionMode').value=mode;h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Settings saved');
   captureDefault(h);await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));const preset=structuredClone(h.store.get('settings:captured-defaults'));
   const name=h.$('fixed').children[2].querySelector('input');name.value='Captain Mira';name.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
   const voice=h.$('fixed').children[2].querySelector('[data-choir-voice]');voice.value='new';voice.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
   h.$('chunk').value='10000';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
   h.$('applyDefaults').click();await until(()=>h.$('defaultStatus').textContent.startsWith('Default applied'));
   assert.equal(h.$('chunk').value,'10000');assert.equal(h.$('fixed').children[2].querySelector('input').value,'Captain Mira');assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'m');
   const saved=h.store.get('chat:chat-a');assert.equal(saved.fixed[2].pronunciation,'Mira: mee-rah');assert.deepEqual(saved.fixed[2].aliases,['Captain']);assert.equal(saved.casts['native:a'][0].speaker,'Guard');assert.equal(saved.casts['native:a'][0].voice,'g');assert.deepEqual(h.store.get('settings:captured-defaults'),preset);
   await h.reload();assert.equal(h.$('fixed').children[2].querySelector('input').value,'Captain Mira');assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'m');assert.equal(h.$('chunk').value,'10000');assert.equal(h.synthesis.length,0);
   assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
  }finally{await h.close();}
 }
});

test('default capture rejects invalid settings and retains the previous snapshot when storage fails',async()=>{
 const h=await harness();try{
  h.$('jevKey').value='session-jev-secret';captureDefault(h);await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));
  const preset=structuredClone(h.store.get('settings:captured-defaults'));assert.ok(!JSON.stringify(preset).includes('session-'));
  h.$('chunk').value='10001';captureDefault(h);await until(()=>document.querySelector('[data-default-feedback]')?.textContent.includes('whole number from'));assert.deepEqual(h.store.get('settings:captured-defaults'),preset);
  h.$('chunk').value='8000';h.state.failDefaultsSave=true;captureDefault(h);await until(()=>h.$('defaultStatus').textContent.includes('save failed'));assert.deepEqual(h.store.get('settings:captured-defaults'),preset);assert.equal(h.$('captureDefaults').disabled,false);
  h.state.failDefaultsSave=false;captureDefault(h);await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));assert.equal(h.store.get('settings:captured-defaults').preferences,undefined);
 }finally{await h.close();}
});

test('applying defaults reports save failure and never changes another chat during a slow navigation',async()=>{
 const h=await harness();try{
  captureDefault(h);await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));
  h.$('chunk').value='8000';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
  h.state.failConfigSave=true;h.$('applyDefaults').click();await until(()=>h.$('defaultStatus').textContent.includes('could not be applied'));assert.match(h.$('saveState').textContent,/Save failed/);assert.equal(h.store.get('chat:chat-a').chunk,8000);
  h.state.failConfigSave=false;await h.click('save',text=>text.includes('retention saved'));assert.equal(h.store.get('chat:chat-a').chunk,8000);
  h.state.configDelay=200;h.$('chunk').value='1200';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));h.$('applyDefaults').click();
  h.state.active='chat-b';h.state.character={name:'Different character'};h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded');
  assert.equal(h.store.get('chat:chat-a').chunk,1200);assert.equal(h.store.has('chat:chat-b'),false);assert.equal(h.$('fixed').children[2].querySelector('input').value,'Different character');assert.equal(h.$('chunk').value,'1200');assert.equal(h.synthesis.length,0);
 }finally{await h.close();}
});

test('global Speech and Planner edits override historical chat preferences while cast choices remain independent',async()=>{
 const h=await harness();try{
  const original=structuredClone(h.store.get('chat:chat-a'));
  h.store.set('chat:chat-b',{...original,plannerMode:'heuristic',chunk:9999,enableMusic:false,fixed:original.fixed.map(actor=>({...actor,speaker:actor.speaker==='Mira'?'Other lead':actor.speaker}))});
  const edit=(name,value)=>{const node=h.$(name);if(typeof value==='boolean')node.checked=value;else node.value=value;node.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));};
  edit('chunk','8000');edit('planner','planner');edit('decisionConnection','decision-b');edit('plannerMode','jev');edit('auto',true);edit('enableSfx',false);edit('enableAmbience',false);edit('enableMusic',true);edit('sectionButtons',true);edit('enableMixer',true);edit('normalizeLoudness',false);edit('ignoredTags','summary, private-note');
  h.$('jevKey').value='jev-session-secret';await until(()=>h.$('saveState').textContent==='Saved automatically');
  const global=structuredClone(h.store.get('settings:global'));assert.equal(global.npcPolicy,undefined);assert.ok(!JSON.stringify(global).includes('session-secret'));
  h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Saved settings restored' && h.$('fixed').children[2]?.querySelector('input').value==='Other lead');
  for(const [name,value] of Object.entries(global))if(h.$(name) && h.$(name).type==='checkbox')assert.equal(h.$(name).checked,value,name);
  assert.equal(h.$('chunk').value,'8000');assert.equal(h.$('plannerMode').value,'jev');assert.equal(h.$('decisionConnection').value,'decision-b');assert.equal(h.$('ignoredTags').value,'summary, private-note');assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'m');
  edit('enableMusic',false);edit('plannerMode','llm');await until(()=>h.$('saveState').textContent==='Saved automatically');
  h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Saved settings restored' && h.$('fixed').children[2]?.querySelector('input').value==='Mira');
  assert.equal(h.$('enableMusic').checked,false);assert.equal(h.$('plannerMode').value,'llm');assert.equal(h.$('chunk').value,'8000');await h.reload();assert.equal(h.$('ignoredTags').value,'summary, private-note');assert.equal(h.synthesis.length,0);
 }finally{await h.close();}
});

test('legacy defaults migrate cast choices and cannot replace newer global preferences',async()=>{
 const h=await harness();try{
  const saved=h.store.get('chat:chat-a');h.store.set('settings:captured-defaults',{version:1,preferences:{chunk:500,enableMusic:false,npcPolicy:{mode:'skip',route:'',voice:'',voices:[]}},leadVoices:saved.fixed.map(actor=>({voice:actor.voice,route:actor.route || ''}))});
  h.store.set('settings:global',{chunk:8000,enableMusic:true});h.state.active='chat-new';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Default setup loaded');
  assert.equal(h.$('chunk').value,'8000');assert.equal(h.$('enableMusic').checked,true);assert.equal(h.$('npcPolicyRoot').querySelector('[aria-label="Automatic casting"]').value,'skip');assert.equal(h.$('fixed').children[2].querySelector('[data-choir-voice]').value,'m');
  captureDefault(h);await until(()=>h.$('defaultStatus').textContent.startsWith('Default saved.'));assert.equal(h.store.get('settings:captured-defaults').version,2);assert.equal(h.store.get('settings:captured-defaults').preferences,undefined);
 }finally{await h.close();}
});

test('automatic HTML panel and phone filtering reaches LLM and Jev input, context, TTS and Cue without ignoring story divs',async()=>{
 for(const widget of [speechPanel,phoneWidget]){
 const h=await harness();try{
  h.message.content=`<div><p>At dawn.</p>${widget}<p>"Hello." "Wait."</p></div>`;
  h.state.messages=[{id:'previous',name:'Mira',content:`Earlier. ${widget}`,is_user:false},h.message];
  assert.equal(h.$('ignoredTags').value,'');await h.plan();
  const input=h.requests.find(request=>request.action==='plan').input;
  assert.equal(input.transcript.replace(/\s+/g,' '),'At dawn. "Hello." "Wait."');assert.ok(!/UI message|First panel|Synthetic|DND ACTIVE/.test(input.context));
  await h.play();assert.ok(h.synthesis.length>0);assert.ok(h.synthesis.every(request=>!/UI message|panel content|notification|Battery|84%|Synthetic|DND ACTIVE/.test(request.text)));
  const bridge=globalThis.__CHOIR_API__,generated=h.synthesis.length;
  assert.deepEqual(bridge.planParagraph(widget).segments,[]);await bridge.playParagraph({text:widget});assert.equal(h.synthesis.length,generated);
  await bridge.playParagraph({text:'<div class="kb-content-wrap">Ordinary narration.</div>'});assert.ok(h.synthesis.at(-1).text.includes('Ordinary narration'));
  h.$('plannerMode').value='jev';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
  await h.click('latest',text=>text.includes('The object cannot be cloned'));
  const jev=h.requests.find(request=>request.action==='planJev').input;assert.ok(!/panel content|Synthetic|DND ACTIVE/.test(jev.transcript));assert.ok(!/UI message|Synthetic|DND ACTIVE/.test(jev.context));assert.ok(jev.transcript.includes('Hello'));
 }finally{await h.close();}
 }
});

test('phone widget filtering invalidates an older saved plan and recording before replay',async()=>{
 const h=await harness();try{
  h.message.content=`At dawn. ${phoneWidget.replace(':checked',':disabled')} "Hello." "Wait."`;
  await h.plan();await h.play();assert.ok(h.synthesis.some(request=>request.text.includes('Synthetic')));
  const generated=h.synthesis.length,planned=h.requests.filter(request=>request.action==='plan').length;
  h.message.content=`At dawn. ${phoneWidget} "Hello." "Wait."`;
  // Simulate a plan saved by a version that unwrapped the original widget.
  for(const [key,saved] of h.store)if(key.startsWith('plan:'))saved.content=h.message.content;
  await new Promise((resolve,reject)=>{
    const open=indexedDB.open('choir-recordings',2);open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,transaction=db.transaction('recordings','readwrite'),request=transaction.objectStore('recordings').openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.update({...cursor.value,content:h.message.content});cursor.continue();}};
      transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>{db.close();reject(transaction.error);};
    };
  });
  await h.reload();await h.play();
  assert.equal(h.requests.filter(request=>request.action==='plan').length,planned+1);
  assert.ok(h.synthesis.slice(generated).every(request=>!/Synthetic|DND ACTIVE|IMESSAGE/.test(request.text)));
  assert.equal(h.requests.filter(request=>request.action==='plan').at(-1).input.transcript.replace(/\s+/g,' '),'At dawn. "Hello." "Wait."');
  const rebuilt=h.synthesis.length;await h.reload();await h.play();assert.equal(h.synthesis.length,rebuilt);
 }finally{await h.close();}
});

test('precise class and ID exclusions replace old panel attribution and audio while keeping reusable story passages',async()=>{
 const h=await harness();try{
  h.message.content='At dawn. UI message that must not be spoken. "Hello." "Wait."';await h.plan();await h.play();
  const old=h.synthesis.length,plans=h.requests.filter(request=>request.action==='plan').length;
  h.message.content='At dawn. <aside class="bespoke-note">UI message that must not be spoken.</aside> "Hello." "Wait."';
  for(const [key,saved] of h.store)if(key.startsWith('plan:'))saved.content=h.message.content;
  h.$('ignoredTags').value='.bespoke-note, #phone-status';h.$('ignoredTags').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
  h.state.messages=[{id:'previous',name:'Mira',is_user:false,content:'Earlier. <div id="phone-status">UI context.</div>'},h.message];
  await h.play();assert.equal(h.requests.filter(request=>request.action==='plan').length,plans+1);
  assert.ok(h.synthesis.slice(old).every(request=>!request.text.includes('UI message')));assert.ok(!h.requests.filter(request=>request.action==='plan').at(-1).input.context.includes('UI context'));
  assert.equal(h.synthesis.filter(request=>request.text.includes('Hello')).length,1);assert.equal(h.synthesis.filter(request=>request.text.includes('Wait')).length,1);
  const generated=h.synthesis.length;await h.reload();await h.play();assert.equal(h.synthesis.length,generated);assert.equal(h.$('ignoredTags').value,'.bespoke-note, #phone-status');
  const bridge=globalThis.__CHOIR_API__;await bridge.playParagraph({text:'<aside class="bespoke-note">Ignore this paragraph.</aside>'});assert.equal(h.synthesis.length,generated);
 }finally{await h.close();}
});

test('ignored tags invalidate cached speech and cannot reappear in Cue paragraphs or planner context',async()=>{
 const h=await harness();try{
  h.message.content='At dawn. <private-note>Secret narration.</private-note> "Hello." "Wait."';await h.plan();await h.play();assert.ok(h.synthesis.some(input=>input.text.includes('Secret narration')));
  h.$('ignoredTags').value='private-note';h.$('ignoredTags').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
  h.state.messages=[{id:'previous',name:'Mira',content:'Earlier. <private-note>Secret context.</private-note>',is_user:false},h.message];
  const before=h.synthesis.length,planned=h.requests.filter(request=>request.action==='plan').length;await h.play();assert.equal(h.requests.filter(request=>request.action==='plan').length,planned+1);
  const input=h.requests.filter(request=>request.action==='plan').at(-1).input;assert.ok(!input.transcript.includes('Secret narration'));assert.ok(!input.context.includes('Secret context'));assert.ok(!h.synthesis.slice(before).some(input=>input.text.includes('Secret')));
  const bridge=globalThis.__CHOIR_API__;assert.deepEqual(bridge.planParagraph('<private-note>Do not speak.</private-note>').segments,[]);const generated=h.synthesis.length;await bridge.playParagraph({text:'<private-note>Do not speak.</private-note>'});assert.equal(h.synthesis.length,generated);
  await h.reload();await h.play();assert.equal(h.synthesis.length,generated);assert.equal(h.requests.filter(request=>request.action==='plan').length,planned+1);
 }finally{await h.close();}
});

const kellinCard='Kellin Beckett || Toxic Fans';
function kellinCast(h,duplicate=true){
  const value=structuredClone(h.store.get('chat:chat-a'));value.fixed[1].speaker='Laiyah';value.fixed[2].speaker='Kellin Beckett';value.fixed[2].aliases=[];
  value.casts={'native:a':[{speaker:'Mikey Ross',voice:'g',style:''},...(duplicate?[{speaker:kellinCard,voice:'g',style:''}]:[])],'native:b':duplicate?[{speaker:kellinCard,voice:'g',style:''}]:[]};return value;
}

test('decorated card titles migrate duplicate NPCs and restore old title attribution to the lead voice without replanning',async()=>{
 const h=await harness();try{
  h.state.character={name:kellinCard,description:'# Kellin Beckett\nThe singer.'};h.store.set('chat:chat-a',kellinCast(h));
  const key='plan:'+createHash('sha256').update(JSON.stringify(['chat-a',h.message.id])).digest('hex');
  h.store.set(key,{chatId:'chat-a',messageId:h.message.id,content:h.message.content,transcript:h.message.content,attribution:{segments:speechSourceUnits(h.message.content).map(unit=>({speaker:unit.kind==='narration'?'Narrator':unit.text.includes('Hello')?kellinCard:'Mikey Ross',text:unit.text,style:''}))}});h.store.set('activeplan:chat-a',h.message.id);
  await h.reload();await until(()=>h.store.get('chat:chat-a').fixed[2].aliases.includes(kellinCard));
  const saved=h.store.get('chat:chat-a');assert.equal(saved.fixed[2].voice,'m');assert.deepEqual(saved.casts['native:a'].map(actor=>actor.speaker),['Mikey Ross']);assert.deepEqual(saved.casts['native:b'],[]);
  assert.deepEqual([...h.$('fixed').children].map(row=>row.querySelector('input').value),['Narrator','Laiyah','Kellin Beckett']);
  await h.play();assert.equal(h.requests.filter(request=>request.action==='plan').length,0);assert.equal(h.synthesis.find(input=>input.text.includes('Hello')).voice,'m');assert.equal(h.synthesis.find(input=>input.text.includes('Hello')).connectionId,'b');
  const paragraph=globalThis.__CHOIR_API__.planParagraph('"Hello again."',kellinCard);assert.equal(paragraph.segments[0].speaker,'Kellin Beckett');assert.equal(paragraph.segments[0].voice,'m');
  await h.reload();assert.deepEqual(h.store.get('chat:chat-a').casts['native:a'].map(actor=>actor.speaker),['Mikey Ross']);
  const editName=async speaker=>{h.$('otherCast').open=true;const row=[...h.$('fixed').children,...h.$('otherCastRows').children].find(row=>row.querySelector('input').value===h.store.get('chat:chat-a').fixed[2].speaker);assert.ok(row);const input=row.querySelector('input');input.value=speaker;input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.store.get('chat:chat-a').fixed[2].speaker===speaker);};
  await editName(kellinCard);assert.deepEqual(h.store.get('chat:chat-a').fixed[2].aliases,['Kellin Beckett']);
  await editName('Kellin Beckett');assert.deepEqual(h.store.get('chat:chat-a').fixed[2].aliases,[kellinCard]);
  await h.play();assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
 }finally{await h.close();}
});

test('a new LLM plan using a decorated card title keeps one lead identity and preserves a different NPC voice',async()=>{
 const h=await harness();try{
  h.state.character={name:kellinCard};h.state.cardTitlePlan=true;h.store.set('chat:chat-a',kellinCast(h,false));await h.reload();await h.plan();await h.play();
  const input=h.requests.find(request=>request.action==='plan').input;assert.ok(input.config.fixed[2].aliases.includes(kellinCard));
  const segments=JSON.parse(h.$('planJson').value).segments;assert.equal(segments.find(segment=>segment.text.includes('Hello')).speaker,'Kellin Beckett');assert.equal(segments.find(segment=>segment.text.includes('Hello')).voice,'m');
  assert.equal(h.synthesis.find(input=>input.text.includes('Wait')).voice,'g');assert.deepEqual(h.store.get('chat:chat-a').casts['native:a'].map(actor=>actor.speaker),['Mikey Ross']);
 }finally{await h.close();}
});

test('old recordings with a duplicate card-title voice are corrected instead of replaying the NPC voice',async()=>{
 const h=await harness();try{
  h.state.character={name:'An unrelated scenario title'};h.state.cardTitlePlan=true;h.store.set('chat:chat-a',kellinCast(h));await h.reload();await h.plan();await h.play();
  assert.equal(h.synthesis.find(input=>input.text.includes('Hello')).voice,'g');const generated=h.synthesis.length,planned=h.requests.filter(request=>request.action==='plan').length;
  for(const key of [...h.store.keys()])if(/^(plan:|activeplan:|progress:)/.test(key))h.store.delete(key);
  h.state.character={name:kellinCard};await h.reload();await h.play();
  assert.equal(h.requests.filter(request=>request.action==='plan').length,planned+1);assert.equal(h.synthesis.length,generated+1);assert.equal(h.synthesis.at(-1).voice,'m');assert.equal(h.synthesis.at(-1).connectionId,'b');
  assert.deepEqual(h.store.get('chat:chat-a').casts['native:a'].map(actor=>actor.speaker),['Mikey Ross']);
 }finally{await h.close();}
});

test('Levi and Cole profile headings migrate the cast and unison creates one overlapping cached clip',async()=>{
 const originalContext=globalThis.AudioContext;let decoded=0;
 globalThis.AudioContext=class{
   sampleRate=24000;currentTime=0;async resume(){}async close(){}
  createMediaStreamDestination(){return {stream:{getTracks:()=>[{stop(){}}]}};}
   async decodeAudioData(){const channel=decoded++%2?Float32Array.of(0,0.2,0.3,0.4):Float32Array.of(0,0,0.4,0.2);return {numberOfChannels:1,getChannelData:()=>channel};}
   createMediaElementSource(){return {connect(){},disconnect(){}};}
   createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
 };
 const h=await harness({enabled:true});try{
  h.state.character={name:'Levi & Cole',description:'<{{char}}>\n<levi_cline>\n# _Levi\'s Data_\n- Name: Levi Cline\n# Speech\nGentle.\n</levi_cline>\n<cole_lane>\n# _Cole\'s Data_\n- Name: Cole Lane\n# Speech\nLow and raspy.\n</cole_lane>\n</{{char}}>'};
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.fixed[2].speaker='Levi & Cole';saved.fixed[2].aliases=[];saved.fixed[2].pronunciation='';saved.fixed[2].accent='';saved.batchSpeech=true;saved.sectionButtons=true;saved.plannerMode='heuristic';saved.normalizeLoudness=false;h.store.set('chat:chat-a',saved);
  h.message.content='Levi’s hand finds the counter. Cole’s hand finds his pocket. "User," they say in unison.';
  await h.reload();assert.deepEqual([...h.$('fixed').children].map(row=>row.querySelector('input').value),['Narrator','You','Levi','Cole']);
  const voices=h.$('fixed').querySelectorAll('[data-choir-voice]');voices[3].value='new';voices[3].dispatchEvent(new h.dom.window.Event('change'));
  await h.plan();assert.match(h.$('preview').textContent,/Levi & Cole · in unison/);
  await until(()=>[...h.footer.querySelectorAll('[data-choir-clip]')].some(button=>button.title.includes('simultaneous clip')));
  const control=[...h.footer.querySelectorAll('[data-choir-clip]')].find(button=>button.title.includes('simultaneous clip'));assert.match(control.textContent,/Levi \+ Cole · in unison/);assert.match(control.title,/2 short voice calls/);
  await h.play();
  const requests=h.synthesis.filter(input=>input.text==='"User,"');assert.deepEqual(requests.map(input=>input.voice),['m','new']);assert.ok(requests.every(input=>!input.parameters.turns));
  const wav=h.audioBlobs.find(blob=>blob.type==='audio/wav');assert.ok(wav);const data=new DataView(await wav.arrayBuffer());assert.equal(data.getUint32(40,true),6);assert.equal(data.getInt16(44,true),Math.round(0.6*32767));
  const generated=h.synthesis.length;await h.play();assert.equal(h.synthesis.length,generated);
  h.dom.window.document.querySelector('[aria-label="Cole silent"]').click();await h.play();assert.equal(h.synthesis.length,generated);
  const remix=new DataView(await h.audioBlobs.filter(blob=>blob.type==='audio/wav').at(-1).arrayBuffer());assert.equal(remix.getInt16(44,true),Math.round(0.4*32767));
  h.dom.window.document.querySelector('[aria-label="Cole no voice"]').click();await h.play();assert.equal(h.synthesis.length,generated);
  assert.deepEqual(h.store.get('chat:chat-a').fixed[2].aliases,['Levi Cline']);assert.deepEqual(h.store.get('chat:chat-a').fixed[3].aliases,['Cole Lane']);
 }finally{await h.close();globalThis.AudioContext=originalContext;}
});

test('card splitting transfers One TTS voice choices on every connection',async()=>{
 const h=await harness();try{
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.connectionMode='one';saved.fixed[2].speaker='Alice & Bob';saved.fixed[2].aliases=[];
  saved.singleVoices={'native:a':{'Alice & Bob':'g',Narrator:'n',You:'y'},'native:b':{'Alice & Bob':'new'},'native:google':{'Alice & Bob':'Kore'}};h.store.set('chat:chat-a',saved);
  h.store.set('settings:global',{plannerMode:'heuristic',useFastClassifier:true,enableSfx:false,enableAmbience:false});h.state.character={name:'Alice & Bob'};await h.reload();
  assert.equal(globalThis.__CHOIR_API__.planParagraph('"Hello," Alice & Bob said.').segments[0].voice,'g');
  h.state.character.description='# Alice\nName: Alice Ward\nBright.\n# Bob\nName: Bob Gray\nDeep.';await h.reload();
  const config=globalThis.__CHOIR_API__.getConfig();assert.equal(globalThis.__CHOIR_API__.planParagraph('"Hello," Alice said.').segments[0].voice,'g');
  assert.equal(config.singleVoices['native:a'].Alice,'g');assert.equal(config.singleVoices['native:b'].Alice,'new');assert.equal(config.singleVoices['native:google'].Alice,'Kore');
  assert.ok(!Object.hasOwn(config.singleVoices['native:a'],'Alice & Bob'));
  await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'g');
 }finally{await h.close();}
});

test('partial card profiles include all leads and analyse unclaimed scenario text once without losing voices',async()=>{
 const h=await harness();try{
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.fixed[2].speaker='Alice & Bob';saved.fixed[2].aliases=[];h.store.set('chat:chat-a',saved);
  h.state.character={name:'Alice & Bob',description:'# Alice\nName: Alice Ward\nBright.\n# Bob\nName: Bob Gray\nDeep.\n# Clara\nName: Clara Wood\nAlto.'};h.message.content='The room fell quiet.';await h.reload();await h.plan();
  assert.deepEqual(h.store.get('chat:chat-a').fixed.slice(2).map(actor=>actor.speaker),['Alice','Bob','Clara']);
  const profiles=h.requests.filter(request=>request.action==='plan').at(-1).input.config.characterProfiles;assert.equal(profiles.length,3);assert.ok(!profiles[1].description.includes('Alto.'));
  h.state.character.scenario='Diego is another playable lead, with a gravelly voice.';h.state.cardRoles=[{name:'Alice Ward',aliases:['Alice'],description:'Bright.'},{name:'Bob Gray',aliases:['Bob'],description:'Deep.'},{name:'Clara Wood',aliases:['Clara'],description:'Alto.'},{name:'Diego',description:'Gravelly.'}];
  await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,1);assert.deepEqual(h.store.get('chat:chat-a').fixed.slice(2).map(actor=>actor.speaker),['Alice','Bob','Clara','Diego']);assert.equal(h.store.get('chat:chat-a').fixed[2].voice,'m');
  await h.reload();await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,1);
 }finally{await h.close();}
});

test('cached partial card analysis gains newly recognized profiles and aliases without another LLM call or changing saved voices',async()=>{
 const h=await harness();try{
  const card={name:'Choir QA - Mira and Adrian',description:'# Mira\nMira is a female captain. Her voice is feminine. Alias: Captain Mira.\n# Adrian\nAdrian is a male navigator. His voice is masculine. Alias: Adi.'};
  h.state.character=card;h.message.content='The room fell quiet.';
  const key=createHash('sha256').update(JSON.stringify(['name','description','personality','scenario','first_mes'].map(field=>card[field] || ''))).digest('hex');
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.fixed[2].speaker='Adrian';saved.fixed[2].aliases=['My navigator'];saved.plannerMode='llm';
  saved.cardCastAnalysis={key,roles:[{name:'Adrian',aliases:[],description:'Previously identified navigator.'}]};
  h.store.set('chat:chat-a',saved);await h.reload();await h.plan();
  const cast=h.store.get('chat:chat-a').fixed,adrian=cast.find(actor=>actor.speaker==='Adrian'),mira=cast.find(actor=>actor.speaker==='Mira');
  assert.deepEqual(cast.slice(2).map(actor=>actor.speaker),['Adrian','Mira']);assert.equal(adrian.voice,'m');assert.equal(adrian.route,'native:b');assert.equal(adrian.accent,'Irish');assert.equal(adrian.pronunciation,'Mira: mee-rah');
  assert.deepEqual(adrian.aliases,['My navigator','Adi']);assert.deepEqual(mira.aliases,['Captain Mira']);
  assert.equal(h.requests.filter(request=>request.action==='cardCast').length,0);assert.equal(h.synthesis.length,0);
  const profiles=h.requests.filter(request=>request.action==='plan').at(-1).input.config.characterProfiles;
  assert.deepEqual(profiles.map(profile=>profile.speaker),['Mira','Adrian']);assert.match(profiles[0].description,/female captain/);assert.ok(!profiles[0].description.includes('male navigator'));
  await h.reload();await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,0);assert.equal(h.store.get('chat:chat-a').fixed.find(actor=>actor.speaker==='Adrian').voice,'m');
 }finally{await h.close();}
});

test('cached group-title placeholders cannot replace local people while cached additional leads remain available',async()=>{
 const h=await harness();try{
  const card={name:'Choir QA - Mira and Adrian',description:'# Mira\nMira is a female captain. Alias: Captain Mira.\n# Adrian\nAdrian is a male navigator. Alias: Adi.',scenario:'Diego is another playable lead.'};
  h.state.character=card;h.message.content='The room fell quiet.';
  const key=createHash('sha256').update(JSON.stringify(['name','description','personality','scenario','first_mes'].map(field=>card[field] || ''))).digest('hex');
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.fixed[2].speaker=card.name;saved.fixed[2].aliases=[];saved.plannerMode='llm';
  saved.cardCastAnalysis={key,roles:[{name:card.name,aliases:['Mira','Adrian'],description:'Old combined identity.'},{name:'Adrian',aliases:[],description:'Navigator.'},{name:'Diego',aliases:['Pilot'],description:'Another playable lead.'}]};
  h.store.set('chat:chat-a',saved);await h.reload();await h.plan();
  const cast=h.store.get('chat:chat-a').fixed;assert.deepEqual(cast.slice(2).map(actor=>actor.speaker),['Mira','Adrian','Diego']);assert.equal(cast[2].voice,'m');assert.deepEqual(cast[4].aliases,['Pilot']);
  assert.equal(h.requests.filter(request=>request.action==='cardCast').length,0);assert.ok(!h.$('fixed').textContent.includes('Old combined identity'));
  await h.reload();await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,0);
 }finally{await h.close();}
});

test('Cue mixes both unison voices and reuses cached members after failures, levels and exclusions change',async()=>{
 const original=globalThis.AudioContext;let decoded=0;
 globalThis.AudioContext=class{
  sampleRate=24000;currentTime=0;async resume(){}async close(){}
  createMediaStreamDestination(){return {stream:{getTracks:()=>[{stop(){}}]}};}
  async decodeAudioData(){const channel=decoded++%2?Float32Array.of(0.2,0.3):Float32Array.of(0.4,0.2);return {numberOfChannels:1,getChannelData:()=>channel};}
  createMediaElementSource(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
 };
 const h=await harness({enabled:true});try{
  h.store.set('settings:global',{plannerMode:'heuristic',useFastClassifier:true,enableSfx:false,enableAmbience:false,enableMusic:false,prefetch:0,normalizeLoudness:false});await h.reload();
  const text='"Hello," You and Mira said in unison.';await globalThis.__CHOIR_API__.playParagraph({text});
  assert.deepEqual(h.synthesis.filter(input=>input.text==='"Hello,"').map(input=>input.voice),['y','m']);
  const wav=h.audioBlobs.find(blob=>blob.type==='audio/wav');assert.ok(wav);assert.equal(new DataView(await wav.arrayBuffer()).getInt16(44,true),Math.round(0.6*32767));
  const generated=h.synthesis.length;await globalThis.__CHOIR_API__.playParagraph({text});assert.equal(h.synthesis.length,generated);
  h.dom.window.document.querySelector('[aria-label="Mira silent"]').click();await globalThis.__CHOIR_API__.playParagraph({text});assert.equal(h.synthesis.length,generated);
  const remix=h.audioBlobs.filter(blob=>blob.type==='audio/wav').at(-1);assert.equal(new DataView(await remix.arrayBuffer()).getInt16(44,true),Math.round(0.4*32767));
  h.dom.window.document.querySelector('[aria-label="Mira no voice"]').click();await globalThis.__CHOIR_API__.playParagraph({text});assert.equal(h.synthesis.length,generated);
  h.dom.window.document.querySelector('[aria-label="Mira no voice"]').click();h.state.failVoice='m';const next='"Ready," You and Mira said in unison.';
  await assert.rejects(globalThis.__CHOIR_API__.playParagraph({text:next}),/429/);h.state.failVoice=null;await globalThis.__CHOIR_API__.playParagraph({text:next});
  assert.deepEqual(h.synthesis.filter(input=>input.text==='"Ready,"').map(input=>input.voice),['y','m','m']);
 }finally{await h.close();globalThis.AudioContext=original;}
});

test('connection-list outages retain the selected native adapter and voices and can be reloaded',async()=>{
 const h=await harness();try{
  const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url).endsWith('/tts-connections?limit=200')?new Response('Temporary outage',{status:502}):originalFetch(url,options);
  await h.reload();const config=globalThis.__CHOIR_API__.getConfig();assert.equal(config.connection,'a');assert.equal(config.fixed[2].voice,'m');
  assert.equal(h.$('connection').value,'a');assert.match(h.$('status').textContent,/Could not load TTS connections/);
  globalThis.fetch=originalFetch;await h.reload();assert.equal(h.$('connection').value,'a');await h.plan();await h.play();assert.ok(h.synthesis.some(input=>input.voice==='m'));
 }finally{await h.close();}
});

test('late message decorators wait for catalogues before restoring saved grouped clip controls',async()=>{
 const h=await harness();let release,cleanupExtra;try{
  await h.plan();const saved=structuredClone(h.store.get('chat:chat-a'));saved.batchSpeech=true;saved.sectionButtons=true;h.store.set('chat:chat-a',saved);
  const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/voices') && !release)await new Promise(resolve=>release=resolve);return originalFetch(url,options);};
  const originalDecorator=h.ctx.ui.registerDomDecorator;let decorator;h.ctx.ui.registerDomDecorator=options=>{decorator=options;return originalDecorator(options);};
  const reloading=h.reload();await until(()=>release && decorator);cleanupExtra=decorator.render(h.footer,{messageId:h.message.id});
  assert.match(h.footer.textContent,/Loading voice catalogues/);assert.ok(!h.$('status').textContent.includes('Load an available voice list'));
  release();await reloading;await until(()=>h.footer.querySelector('[data-choir-clip]'));assert.ok(!h.$('status').textContent.includes('Section controls unavailable'));
 }finally{release?.();cleanupExtra?.();await h.close();}
});

test('catalogue outages keep the saved lead and NPC editors and cannot erase their voices on autosave',async()=>{
 const h=await harness();try{
  const saved=h.store.get('chat:chat-a');saved.connection='b';saved.casts['native:b']=saved.casts['native:a'];delete saved.casts['native:a'];h.store.set('chat:chat-a',saved);h.store.set('settings:global',{connection:'b'});h.state.failCatalogue=true;
  await h.reload();assert.match(h.$('status').textContent,/catalogue unavailable/);
  assert.deepEqual([...h.$('fixed').querySelectorAll('.et-cast-header strong')].map(node=>node.textContent),['Narrator','You','Mira']);
  assert.match(h.$('npcs').textContent,/Guard/);h.$('skipMeta').checked=false;h.$('skipMeta').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  await until(()=>h.$('saveState').textContent==='Saved automatically');assert.deepEqual(h.store.get('chat:chat-a').fixed.map(actor=>actor.voice),['n','y','m']);
  h.state.failCatalogue=false;await h.reload();assert.equal(h.$('fixed').children.length,3);
 }finally{await h.close();}
});

test('legacy discovered characters keep their voice and pronunciation in the unified cast after reload',async()=>{
 const h=await harness();try{
  h.state.character={name:'Mira',description:'# Mira\nName: Mira\nA warm lead character.'};
  const saved=h.store.get('chat:chat-a'),mira=saved.fixed.pop();mira.sayAs='Mee Rah';
  saved.casts['native:a'].push(mira);saved.cardCastNPCs=['mira'];h.store.set('chat:chat-a',saved);await h.reload();
  assert.equal(h.$('fixed').children.length,2);assert.match(h.$('npcs').textContent,/Mira/);
  assert.equal(document.querySelector('[aria-label="Move Mira to NPC cast"]'),null);
  assert.deepEqual([...document.querySelectorAll('.et-section-header h3')].filter(node=>/Cast/.test(node.textContent)).map(node=>node.textContent),['Cast']);
  await h.plan();await h.reload();
  const actor=h.store.get('chat:chat-a').casts['native:a'].find(actor=>actor.speaker==='Mira');
  assert.equal(actor.voice,'m');assert.equal(actor.sayAs,'Mee Rah');assert.match(h.$('npcs').textContent,/Mira/);
 }finally{await h.close();}
});

test('narrative guideline headings are never added as leads and removing an old cached false lead stays removed',async()=>{
 const h=await harness();try{
  h.state.character={name:'Mira',description:'# Mira\nName: Mira\nA warm lead.\n# NARRATIVE GUIDELINES\nKeep the main character consistent.'};
  h.state.cardRoles=[{name:'Mira',description:'A warm lead.'},{name:'NARRATIVE GUIDELINES',description:'Keep the main character consistent.'}];await h.reload();await h.plan();
  const names=()=>[...h.$('fixed').querySelectorAll('.et-cast-header strong')].map(node=>node.textContent);assert.deepEqual(names(),['Narrator','You','Mira']);
  const saved=h.store.get('chat:chat-a');saved.cardCastAnalysis.roles.push({name:'NARRATIVE GUIDELINES',aliases:[],description:'Old cached mistake.'});saved.fixed.push({speaker:'NARRATIVE GUIDELINES',voice:'new',style:''});h.store.set('chat:chat-a',saved);await h.reload();
  h.$('otherCast').open=true;const row=[...h.$('fixed').children,...h.$('otherCastRows').children].find(row=>row.querySelector('.et-cast-header strong')?.textContent==='NARRATIVE GUIDELINES');assert.ok(row);assert.equal(row.parentElement,h.$('otherCastRows'),'the unused legacy character is folded away');row.querySelector('[aria-label="Remove character"]').click();
  await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();await h.plan();assert.deepEqual(names(),['Narrator','You','Mira']);assert.equal(h.requests.filter(request=>request.action==='cardCast').length,1);
 }finally{await h.close();}
});

test('cast capture retains voices when the host returns different parent wrappers and repairs a missing narrator',async()=>{
 const h=await harness();try{
  for(const row of h.$('fixed').children)Object.defineProperty(row,'parentElement',{configurable:true,get:()=>Object.create(h.$('fixed'))});
  await h.plan();assert.deepEqual(h.store.get('chat:chat-a').fixed.map(actor=>actor.speaker),['Narrator','You','Mira']);assert.equal(h.store.get('chat:chat-a').fixed[2].voice,'m');
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.fixed=[{speaker:'Levi',voice:'m',style:'',route:'native:b'},{speaker:'Cole',voice:'new',style:'',route:'native:b'}];h.store.set('chat:chat-a',saved);h.state.character={name:'Levi & Cole'};await h.reload();
  const repaired=h.store.get('chat:chat-a').fixed;assert.deepEqual(repaired.map(actor=>actor.speaker),['Narrator','Persona','Levi','Cole']);assert.deepEqual(repaired.slice(2).map(actor=>actor.voice),['m','new']);
 }finally{await h.close();}
});

test('no verified card suggestions keeps the existing cast and does not block playback or repeat analysis on reload',async()=>{
 const h=await harness();try{
  h.state.character={name:'Mira',description:'Mira is the captain, with a warm voice. No formatted profiles.'};h.state.cardRoles=[];
  await h.reload();await h.plan();await h.play();
  assert.deepEqual(h.store.get('chat:chat-a').fixed.map(actor=>[actor.speaker,actor.voice]),[['Narrator','n'],['You','y'],['Mira','m']]);
  await h.reload();h.message.content='At dusk. "Hello." "Wait." The gate opened.';await h.plan();await h.play();
  assert.equal(h.requests.filter(request=>request.action==='cardCast').length,1);assert.equal(h.store.get('chat:chat-a').fixed[2].voice,'m');
 }finally{await h.close();}
});

test('freeform scenario titles use cached generic card analysis and preserve separately assigned voices',async()=>{
 const h=await harness();try{
  h.state.character={name:'Closing Time',description:'Adrian is the captain. Ethan is his teammate. No special headings or tags.'};h.state.cardRoles=[{name:'Adrian',aliases:['Captain Adrian'],description:'Low-voiced captain.'},{name:'Ethan',description:'Brighter teammate.'}];h.state.multiCard=true;
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.fixed[2].speaker='Closing Time';saved.fixed[2].aliases=[];h.store.set('chat:chat-a',saved);h.message.content='Adrian said, "Hello." Ethan replied, "Wait."';
  await h.reload();await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,1);assert.deepEqual(h.store.get('chat:chat-a').fixed.slice(2).map(actor=>[actor.speaker,actor.voice]),[['Adrian','m'],['Ethan','new']]);
  const profiles=h.requests.find(request=>request.action==='plan').input.config.characterProfiles;assert.deepEqual(profiles.map(profile=>profile.speaker),['Adrian','Ethan']);assert.match(profiles[1].description,/Brighter/);
  await h.reload();await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,1);
  h.state.character.description+=' Both lead the evening shift.';await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,2);assert.deepEqual(h.store.get('chat:chat-a').fixed.slice(2).map(actor=>actor.voice),['m','new']);
  h.state.character.name='After Hours';await h.plan();assert.equal(h.requests.filter(request=>request.action==='cardCast').length,3);assert.deepEqual(h.store.get('chat:chat-a').fixed.slice(2).map(actor=>actor.voice),['m','new']);
 }finally{await h.close();}
});

test('a card with two men creates independent leads and passes each profile to Jev and LLM',async()=>{
 const h=await harness();try{
  h.state.character={name:'Adrian and Ethan | Show and Tell',description:'<adrian>\n# Adrian\nA male captain with a low voice. '+ 'Captain. '.repeat(1000)+'\n</adrian>\n<ethan>\n# Ethan\nA male teammate with a brighter voice.\n</ethan>'};
  const saved=structuredClone(h.store.get('chat:chat-a'));saved.fixed[2].speaker=h.state.character.name;saved.fixed[2].aliases=[];saved.npcPolicy={mode:'skip',route:'',voice:'',voices:[]};h.store.set('chat:chat-a',saved);
  h.message.content='Adrian said, "Hello." Ethan replied, "Wait."';
  const key='plan:'+createHash('sha256').update(JSON.stringify(['chat-a',h.message.id])).digest('hex');
  h.store.set(key,{chatId:'chat-a',messageId:h.message.id,content:h.message.content,transcript:transcriptFromMessage(h.message.content),attribution:{segments:[{speaker:'Narrator',text:'Adrian said,'},{speaker:h.state.character.name,text:'Hello.'},{speaker:'Narrator',text:'Ethan replied,'},{speaker:h.state.character.name,text:'Wait.'}]}});h.store.set('activeplan:chat-a',h.message.id);
  await h.reload();
  assert.deepEqual([...h.$('fixed').children].map(row=>row.querySelector('input').value),['Narrator','You','Adrian','Ethan']);h.state.multiCard=true;h.message.content='Adrian said, "Hello." Ethan replied, "Wait."';await h.plan();await h.play();
  assert.equal(h.synthesis.find(input=>input.text.includes('Hello')).voice,'m');assert.equal(h.synthesis.find(input=>input.text.includes('Wait')).voice,'new');assert.equal(h.store.get('chat:chat-a').fixed[3].voice,'new');
  const profiles=h.requests.find(request=>request.action==='plan').input.config.characterProfiles;assert.deepEqual(profiles.map(profile=>profile.speaker),['Adrian','Ethan']);assert.match(profiles[1].description,/brighter voice/);assert.ok(!profiles[1].description.includes('Captain.'));
  await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[3].value,'new');
  const paragraph=globalThis.__CHOIR_API__.planParagraph('Ethan said, "Another line."');assert.equal(paragraph.segments.at(-1).speaker,'Ethan');assert.equal(paragraph.segments.at(-1).voice,'new');assert.throws(()=>globalThis.__CHOIR_API__.planParagraph('"An ambiguous line."'),/Plan this message with Jev or LLM/);
  h.$('plannerMode').value='jev';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));await h.click('latest',text=>text.includes('The object cannot be cloned'));assert.deepEqual(h.requests.find(request=>request.action==='planJev').input.config.characterProfiles.map(profile=>profile.speaker),['Adrian','Ethan']);
 }finally{await h.close();}
});

test('Fish voice IDs can be assigned, described, auditioned and restored in both connection modes',async()=>{
 for(const mode of ['one','several']){
  const h=await harness();try{
   const connection=mode==='one'?h.connections[0]:h.connections[1];connection.provider='fish_audio';await h.reload();
   h.$('connectionMode').value=mode;h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));
   await until(()=>h.$('saveState').textContent==='Settings saved');
   let card=()=>h.$('fixed').children[2];
   if(mode==='several'){
    const route=card().querySelector('[data-choir-route]');route.value='native:b';route.dispatchEvent(new h.dom.window.Event('change'));
    await until(()=>h.$('status').textContent.includes('Speaker TTS connection selected'));
   }
   const voice=card().querySelector('[data-choir-voice]');voice.value='m';voice.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
   await until(()=>h.$('saveState').textContent==='Saved automatically');
   const before=h.store.get('chat:chat-a');card().querySelector('[data-choir-voice-id]').click();
   assert.equal(card().querySelector('[data-choir-voice-id-input]').value,'m');
   card().querySelector('[data-choir-voice-id-input]').value='not | a voice ID';card().querySelector('[data-choir-apply-voice-id]').click();
   await until(()=>h.$('status').textContent.includes('Enter a Fish Audio voice ID'));assert.deepEqual(h.store.get('chat:chat-a'),before);
   const id='0123456789abcdef0123456789abcdef',description='A warm, deep Irish male voice.';
   card().querySelector('[data-choir-voice-id-input]').value=` ${id} `;card().querySelector('[data-choir-voice-description]').value=description;
   card().querySelector('[data-choir-apply-voice-id]').click();await until(()=>h.$('status').textContent.startsWith('Voice ID saved'));
   assert.equal(card().querySelector('[data-choir-voice]').value,id);assert.equal(h.synthesis.length,0);
   const saved=h.store.get('chat:chat-a');assert.equal(mode==='one'?saved.singleVoices['native:a'].Mira:saved.fixed[2].voice,id);
   assert.equal(saved.extraVoices,`${id} | ${description}`);
   assert.deepEqual(saved.extraVoiceRoutes[id],[`native:${connection.id}`]);
   card().querySelector('[data-choir-preview]').click();await until(()=>h.$('status').textContent==='Audition finished.');
   assert.equal(h.synthesis[0].voice,id);assert.equal(h.synthesis[0].connectionId,connection.id);
   card().querySelector('[data-choir-voice-id]').click();assert.equal(card().querySelector('[data-choir-voice-id-input]').value,id);
   card().querySelector('[data-choir-voice-description]').value='A calm Irish storyteller.';card().querySelector('[data-choir-apply-voice-id]').click();
   await until(()=>h.$('status').textContent.startsWith('Voice ID saved'));
   assert.equal(h.store.get('chat:chat-a').extraVoices,`${id} | A calm Irish storyteller.`);
   await h.reload();assert.equal(card().querySelector('[data-choir-voice]').value,id);
   await h.plan();const casting=h.requests.filter(request=>request.action==='plan').at(-1).input.config;
   assert.equal(casting.fixed.find(actor=>actor.speaker==='Mira').voice,id);
   assert.equal(casting.voices.find(item=>item.id===id && item.route===`native:${connection.id}`).description,'A calm Irish storyteller.');
   assert.ok(casting.voices.filter(item=>item.id===id).every(item=>item.route===`native:${connection.id}`));
   if(mode==='several')assert.equal(h.$('fixed').children[0].querySelector('[data-choir-voice-id]').hidden,true);
  }finally{await h.close();}
 }
});

test('Choir chat plays Freesound preview audio at the cue, preserves speech, caches it across reload and honors the SFX toggle',async()=>{
 const h=await harness();try{
  assert.equal(h.$('enableSfx').closest('label').hidden,false);await configureFoley(h);h.message.content='She listened. The page snapped under her thumb.';
  await h.plan();await h.play();assert.equal(await playedFoley(h),1);assert.equal(h.requests.filter(request=>request.action==='freesound').length,1);assert.equal(h.state.previewFetches.length,1);
  assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);assert.equal(h.requests.find(request=>request.action==='sfx').input.segments.map(segment=>segment.text).join(' '),h.message.content);
  assert.equal(h.synthesis.map(request=>request.text).join(' '),h.message.content);assert.ok(h.synthesis.every(request=>!request.text.includes('[SFX:')));
  const sfxIndex=(await Promise.all(h.audioBlobs.map(blob=>blob.text()))).indexOf('FREESOUND_PREVIEW');
  assert.ok(Math.abs(h.audios[sfxIndex].volume/h.audios[0].volume-0.45)<0.001);assert.equal(h.$('sfxStatus').hidden,true);
  await h.reload();await h.play();assert.equal(await playedFoley(h),2);assert.equal(h.requests.filter(request=>request.action==='freesound').length,1);assert.equal(h.state.previewFetches.length,1);
  assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);
  h.$('enableSfx').checked=false;h.$('enableSfx').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
  const replay=[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay');replay.click();await until(()=>h.$('status').textContent==='Replay finished.');assert.equal(await playedFoley(h),2);
  await h.play();assert.equal(await playedFoley(h),2);assert.equal(h.requests.filter(request=>request.action==='freesound').length,1);await h.reload();assert.equal(h.$('enableSfx').checked,false);
 }finally{await h.close();}
});

test('Freesound failures stay visible, continue speech, and retry without regenerating cached narration',async()=>{
 for(const failure of ['key','choice','auth','empty','preview','type']){
  const h=await harness();try{
   await configureFoley(h,failure==='key'?'':'test-freesound-key');h.message.content='The page snapped under her thumb.';
   if(failure==='choice')h.state.sfxError='Planner quota exhausted';if(failure==='auth')h.state.foleyError='Freesound HTTP 401';if(failure==='empty')h.state.noFoleyResults=true;if(failure==='preview')h.state.previewStatus=503;if(failure==='type')h.state.previewType='text/html';
   await h.plan();await h.play();assert.equal(await playedFoley(h),0);assert.equal(h.synthesis.map(request=>request.text).join(' '),h.message.content);
   assert.equal(h.requests.filter(request=>request.action==='sfx').length,failure==='key'?0:1);
   assert.match(['key','choice'].includes(failure)?h.$('sfxStatus').textContent:h.$('status').textContent,failure==='key'?/Freesound API key/:/SFX skipped/);assert.equal(h.$('sfxStatus').hidden,false);assert.match(h.$('sfxStatus').textContent,/Speech continues/);
   const generated=h.synthesis.length;h.state.sfxError=null;h.state.foleyError=null;h.state.noFoleyResults=false;h.state.previewStatus=200;h.state.previewType='audio/mpeg';if(failure==='key')await configureFoley(h);
   if(['key','choice'].includes(failure))await h.plan();
   await h.play();assert.equal(await playedFoley(h),1);assert.equal(h.synthesis.length,generated);assert.equal(h.$('sfxStatus').hidden,true);
  }finally{await h.close();}
 }
});

test('replaying an older speech plan never waits for a new sound-effect LLM request',async()=>{
 const h=await harness();try{
  await h.plan();await h.play();const generated=h.synthesis.length,planned=h.requests.filter(request=>request.action==='plan').length;
  await configureFoley(h);h.state.holdSfx=true;await h.reload();
  assert.equal([...h.store].find(([key])=>key.startsWith('plan:'))[1].soundCues,false);
  await h.play();assert.equal(h.synthesis.length,generated);assert.equal(h.requests.filter(request=>request.action==='plan').length,planned);assert.equal(h.requests.filter(request=>request.action==='sfx').length,0);
  h.state.holdSfx=false;h.state.sfxError='Sound effect LLM is unavailable';await h.plan();assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);await h.play();
  assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);assert.match(h.$('sfxStatus').textContent,/Sound effect LLM is unavailable/);
  await h.reload();await h.play();assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);assert.equal(h.synthesis.length,generated);
  h.state.sfxError=null;[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Plan').click();await until(()=>h.requests.filter(request=>request.action==='sfx').length===2 && h.$('status').textContent.startsWith('Ready:'));
  await h.play();assert.equal(h.synthesis.length,generated);assert.equal(h.requests.filter(request=>request.action==='sfx').length,2);assert.equal(h.$('sfxStatus').hidden,true);
 }finally{await h.close();}
});

test('SFX mixer switch retains its level when off, stops live effects, applies to Cue and persists after reload',async()=>{
 const h=await harness({master:0.5,channels:{SFX:{volume:0.1,mute:true}}});try{
  const level=(actual,expected)=>assert.ok(Math.abs(actual-expected)<0.000001,`Expected volume ${expected}, got ${actual}`);
  h.$('showMixer').click();const mixer=document.querySelector('[data-choir-mixer]'),sfx=()=>document.querySelector('[data-choir-mixer] [data-choir-action="sfx"]');
  assert.equal(mixer.querySelector('[aria-label="SFX volume"]').value,'1');assert.equal(sfx().parentElement.className,'cm-auto-plan');assert.equal(sfx().textContent,'SFX');
  await configureFoley(h);h.message.content='She listened; the page snapped under her thumb.';await h.plan();h.state.blockAudio=true;h.$('play').click();
  await until(()=>h.audios.length===1 && !h.audios[0].paused);const narrator=h.audios[0];assert.equal(narrator.volume,0.5);narrator.onended();
  await until(()=>h.audios.length===2 && !h.audios[1].paused);const effect=h.audios[1];level(effect.volume,0.225);
  const sfxVolume=mixer.querySelector('[aria-label="SFX volume"]');sfxVolume.value='0.4';sfxVolume.dispatchEvent(new h.dom.window.Event('input'));sfxVolume.dispatchEvent(new h.dom.window.Event('change'));level(effect.volume,0.09);assert.equal(narrator.volume,0.5);
  h.state.blockAudio=false;sfx().click();assert.equal(sfx().textContent,'SFX');assert.equal(sfx().getAttribute('aria-pressed'),'false');assert.equal(h.$('enableSfx').checked,false);assert.equal(mixer.querySelector('[data-kind="sfx"]').dataset.enabled,'false');
  await until(()=>h.$('status').textContent.includes('Playback finished'));assert.equal(effect.paused,true);assert.equal(h.audios.at(-1).volume,0.5);
  assert.equal(mixer.querySelector('[aria-label="Narrator volume"]').value,'1');await until(()=>h.store.get('chat:chat-a').enableSfx===false);await h.reload();assert.equal(sfx().textContent,'SFX');
  const off=await globalThis.__CHOIR_API__.playParagraph({text:h.message.content});assert.equal(off.played,1);assert.equal(await playedFoley(h),1);
  h.$('enableSfx').checked=true;h.$('enableSfx').dispatchEvent(new h.dom.window.Event('change'));assert.equal(sfx().textContent,'SFX');
  assert.equal(document.querySelector('[aria-label="SFX volume"]').value,'0.4');
  const cueStart=h.audios.length;const on=await globalThis.__CHOIR_API__.playParagraph({text:h.message.content});assert.equal(on.played,3);level(h.audios[cueStart+1].volume,0.09);assert.equal(h.audios[cueStart].volume,0.5);
  const generated=h.synthesis.length,searched=h.requests.filter(request=>request.action==='freesound').length;await h.play();assert.equal(h.synthesis.length,generated);assert.equal(h.requests.filter(request=>request.action==='freesound').length,searched);
 }finally{await h.close();}
});

test('mixer plans silently, plays the latest reply, filters voices by plan and retains hidden preferences',async()=>{
 const h=await harness();try{
  const mixer=document.querySelector('[data-choir-mixer]'),names=()=>[...document.querySelectorAll('[data-choir-mixer] .cm-channel[data-kind="voice"]')].map(row=>row.dataset.speaker);
  assert.deepEqual(names(),[]);assert.match(mixer.textContent,/Plan the latest reply to see its voices/);assert.equal(h.$('play').getAttribute('aria-label'),'Play latest reply');assert.equal(h.$('play').disabled,false);
  h.$('plan-latest').click();await until(()=>h.requests.filter(r=>r.action==='plan').length===1 && !h.$('latest').disabled && names().length===3);
  assert.equal(h.audios.length,0);assert.equal(h.synthesis.length,0);assert.deepEqual(names(),['Narrator','Mira','Guard']);
  const volume=mixer.querySelector('[aria-label="Mira volume"]');volume.value='0.42';volume.dispatchEvent(new h.dom.window.Event('input'));volume.dispatchEvent(new h.dom.window.Event('change'));mixer.querySelector('[aria-label="Mira silent"]').click();
  await until(()=>h.store.get('ui:mixer')?.channels.Mira.mute===true);
  h.state.messages=[h.message,{id:'latest-b',content:'Only the narrator speaks in the latest reply.',is_user:false}];h.subscriptions.get('chat.messageCount')();h.$('play').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.deepEqual(names(),['Narrator']);assert.equal(h.requests.filter(r=>r.action==='plan').at(-1).input.transcript,'Only the narrator speaks in the latest reply.');assert.equal(h.synthesis.at(-1).text,'Only the narrator speaks in the latest reply.');
  h.state.messages=[h.message];await h.plan();assert.deepEqual(names(),['Narrator','Mira','Guard']);assert.equal(mixer.querySelector('[aria-label="Mira volume"]').value,'0.42');assert.equal(mixer.querySelector('[aria-label="Mira silent"]').getAttribute('aria-pressed'),'true');
  mixer.querySelector('[aria-label="Mira no voice"]').click();await tick();assert.ok(names().includes('Mira'));assert.equal(mixer.querySelector('[aria-label="Mira no voice"]').getAttribute('aria-pressed'),'true');
  await h.reload();assert.equal(document.querySelector('[aria-label="Mira volume"]').value,'0.42');assert.equal(document.querySelector('[aria-label="Mira no voice"]').getAttribute('aria-pressed'),'true');
  h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('Ready.'));assert.deepEqual(names(),[]);assert.equal(h.$('plan-latest').disabled,true);assert.equal(h.$('play').disabled,true);
 }finally{await h.close();}
});

test('SFX can be reenabled before its cue, and disabling cached effects preserves pause',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content='She listened; the page snapped under her thumb.';h.$('prefetch').value='1';await h.plan();h.state.delay=50;h.state.blockAudio=true;h.$('play').click();
  await until(()=>h.synthesis.length===1);h.$('sfx').click();await until(()=>h.audios[0]?.paused===false);assert.equal(await playedFoley(h),0);h.$('sfx').click();
  h.state.blockAudio=false;h.audios[0].onended();await until(()=>h.$('status').textContent.includes('Playback finished'));assert.equal(await playedFoley(h),1);
  const start=h.audios.length;h.state.blockAudio=true;const replay=[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay');replay.click();await until(()=>h.audios.length===start+1 && !h.audios.at(-1).paused);h.audios.at(-1).onended();
  await until(()=>h.audios.length===start+2 && !h.audios.at(-1).paused);h.$('pause').click();assert.equal(h.audios.at(-1).paused,true);h.$('sfx').click();
  await until(()=>h.audios.length===start+3 && h.$('play').getAttribute('aria-label')==='Resume Choir audio');assert.equal(h.audios.at(-1).paused,true);h.state.blockAudio=false;h.$('play').click();await until(()=>h.$('status').textContent==='Replay finished.');
 }finally{await h.close();}
});

test('Cue and cached recordings show their own speakers rather than the previously planned reply',async()=>{
 const h=await harness();try{
  const names=()=>[...document.querySelectorAll('.cm-channel[data-kind="voice"]')].map(row=>row.dataset.speaker);
  await h.plan();await h.play();const savedPlan=[...h.store.keys()].find(key=>key.startsWith('plan:'));h.store.delete(savedPlan);
  const cue=await globalThis.__CHOIR_API__.playParagraph({text:'A separate narrated paragraph.'});assert.equal(cue.played,1);assert.deepEqual(names(),['Narrator']);
  const replay=[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay');replay.click();await until(()=>h.$('status').textContent==='Replay finished.');assert.deepEqual(names(),['Narrator','Mira','Guard']);
 }finally{await h.close();}
});

test('Stop cancels Freesound search and preview downloads and late results cannot start audio',async()=>{
 for(const stage of ['search','preview']){
  const h=await harness();try{
   await configureFoley(h);h.message.content='The page snapped under her thumb.';await h.plan();
   if(stage==='search')h.state.holdFoley=true;else h.state.holdPreview=true;
   h.footer.querySelector('button').click();await until(()=>stage==='search'?h.requests.some(request=>request.action==='freesound'):h.state.previewFetches.length===1);
   h.$('stop').click();await tick();h.releaseHeld();await tick();assert.equal(h.$('status').textContent,'Stopped.');assert.equal(await playedFoley(h),0);assert.ok(h.audios.every(audio=>audio.paused));
   if(stage==='search')assert.equal(h.state.previewFetches.length,0);else assert.equal(h.state.previewAborted,1);
  }finally{await h.close();}
 }
});

test('automatic Choir playback and Cue share SFX while muted narration stays silent',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content='The page snapped under her thumb. "Hello." A quiet room. '.repeat(4);
  globalThis.__CHOIR_API__.setNarratorMuted(true);h.$('auto-plan').click();h.$('auto').checked=true;h.$('auto').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  h.events.get('GENERATION_ENDED')({chatId:'chat-a',messageId:h.message.id,content:h.message.content});await until(()=>h.$('status').textContent.includes('Playback finished') && !h.$('latest').disabled);
  assert.equal(await playedFoley(h),4);assert.equal(h.requests.filter(request=>request.action==='freesound').length,1);assert.ok(h.synthesis.every(request=>request.text.includes('Hello')));
  const bridge=globalThis.__CHOIR_API__,before=h.requests.filter(request=>request.action==='freesound').length,played=await playedFoley(h);
  assert.equal(bridge.getConfig().enableSfx,true);assert.equal(bridge.planParagraph('The page snapped under her thumb.').segments.filter(segment=>segment.kind==='sfx').length,4);
  const result=await bridge.playParagraph({text:'The page snapped under her thumb.',chatId:'chat-a'});assert.equal(result.played,4);assert.equal(await playedFoley(h),played+4);assert.equal(h.requests.filter(request=>request.action==='freesound').length,before);
  bridge.setNarratorMuted(false);const speechBefore=h.synthesis.length;
  await bridge.playParagraph({text:'The page snapped under her thumb.',chatId:'chat-a'});assert.ok(h.synthesis.length>speechBefore);assert.equal(h.requests.filter(request=>request.action==='freesound').length,before);
  h.$('enableSfx').checked=false;h.$('enableSfx').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  const effectsBefore=await playedFoley(h);assert.ok(bridge.planParagraph('The page snapped under her thumb.').segments.every(segment=>segment.kind!=='sfx'));
  await bridge.playParagraph({text:'The page snapped under her thumb.',chatId:'chat-a'});assert.equal(await playedFoley(h),effectsBefore);
 }finally{await h.close();}
});

test('Cue fetches real preview blobs, retries failed SFX and honors companion cancellation',async()=>{
 const h=await harness();try{
  await configureFoley(h);const bridge=globalThis.__CHOIR_API__,text='The page snapped under her thumb.';
  h.state.foleyError='Freesound HTTP 401';const statuses=[];
  const failed=await bridge.playParagraph({text,onStatus:status=>statuses.push(status)});assert.equal(failed.played,1);assert.match(failed.warnings[0],/401/);assert.equal(await playedFoley(h),0);assert.match(statuses.at(-1).message,/SFX skipped/);
  h.state.foleyError=null;const result=await bridge.playParagraph({text});assert.equal(result.played,2);assert.equal(await playedFoley(h),1);assert.equal(h.state.previewFetches.length,1);assert.equal(h.synthesis.length,1);
  await bridge.playParagraph({text});assert.equal(await playedFoley(h),2);assert.equal(h.requests.filter(request=>request.action==='freesound').length,2);
  const ctrl=new AbortController();ctrl.abort();const searches=h.requests.length;await assert.rejects(bridge.playParagraph({text,signal:ctrl.signal}),{name:'AbortError'});assert.equal(h.requests.length,searches);
  h.state.holdPreview=true;const pendingCtrl=new AbortController();const pending=bridge.playParagraph({text:'The glass shattered.',signal:pendingCtrl.signal});const stopped=assert.rejects(pending,{name:'AbortError'});
  await until(()=>h.state.previewFetches.length===2);pendingCtrl.abort();await stopped;assert.equal(h.state.previewAborted,1);assert.equal(await playedFoley(h),2);assert.ok(h.audios.every(audio=>audio.paused));
 }finally{await h.close();}
});

const beds=h=>h.audios.filter(audio=>audio.loop),voices=h=>h.audios.filter(audio=>!audio.loop);
const bedName=(h,audio)=>h.audioBlobs[h.audios.indexOf(audio)].text();
const scene='Night fell. Rain drummed on the roof. "Hello." The tavern door swung open. "Wait."';
const toggle=async(h,name,checked)=>{h.$(name).checked=checked;h.$(name).dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');};

test('volume buttons and percent entry change live playback, clamp values, tolerate blank edits and retain all levels after reload',async()=>{
 const h=await harness();try{
  await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios[0]?.paused===false);
  const find=label=>document.querySelector(`[aria-label="${label}"]`),number=name=>find(`${name} volume percent`),range=name=>find(`${name} volume`);
  const type=(name,value)=>{const input=number(name);input.value=value;input.dispatchEvent(new h.dom.window.Event('input'));};
  find('Decrease Master volume').click();assert.equal(number('Master').value,'95');assert.equal(h.audios[0].volume,0.95);
  type('Master','37');assert.equal(range('Master').value,'0.37');assert.equal(h.audios[0].volume,0.37);
  range('Master').dispatchEvent(new h.dom.window.MouseEvent('dblclick'));assert.equal(number('Master').value,'100');assert.equal(h.audios[0].volume,1);type('Master','37');
  type('Master','');assert.equal(h.audios[0].volume,0.37);number('Master').dispatchEvent(new h.dom.window.Event('blur'));assert.equal(number('Master').value,'37');
  type('Master','150');assert.equal(number('Master').value,'100');assert.equal(find('Increase Master volume').disabled,true);
  type('Master','-4');assert.equal(number('Master').value,'0');assert.equal(find('Decrease Master volume').disabled,true);assert.equal(h.audios[0].volume,0);
  type('Master','80');type('Narrator','25');assert.equal(h.audios[0].volume,0.2);range('Narrator').dispatchEvent(new h.dom.window.MouseEvent('dblclick'));assert.equal(number('Narrator').value,'100');assert.equal(h.audios[0].volume,0.8);type('Narrator','25');type('SFX','43');type('Ambience','61');assert.equal(h.audios[0].volume,0.2);
  find('Increase SFX volume').click();assert.equal(number('SFX').value,'48');
  const desktop=range('Ambience');desktop.value='0.32';desktop.dispatchEvent(new h.dom.window.Event('input'));desktop.dispatchEvent(new h.dom.window.Event('change'));assert.equal(number('Ambience').value,'32');
  await until(()=>h.store.get('ui:mixer')?.ambience===0.32 && h.store.get('ui:mixer')?.sfx===0.48);h.$('stop').click();await h.reload();
  assert.equal(number('Master').value,'80');assert.equal(number('Narrator').value,'25');assert.equal(number('SFX').value,'48');assert.equal(number('Ambience').value,'32');
 }finally{await h.close();}
});

test('all speaker and SFX controls amplify to 300% without loudness matching while Master stays at 100%',async()=>{
 for(const mobile of [false,true]){
  const originalContext=globalThis.AudioContext,graphs=[];let decodes=0;
  globalThis.AudioContext=class{
   destination={};async resume(){}async close(){}
   async decodeAudioData(){decodes++;throw Error('Loudness matching is off');}
   createMediaElementSource(audio){return {connect(gain){graphs.push({audio,gain});},disconnect(){}};}
   createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
  };
  let h;
  try{
   h=await harness(undefined,mobile);h.$('showMixer').click();await toggle(h,'normalizeLoudness',false);await configureFoley(h);
   h.message.content='At dawn. The page snapped under her thumb. "Hello." "Wait."';await h.plan();
   const find=label=>document.querySelector(`[aria-label="${label}"]`),type=(name,value)=>{const input=find(`${name} volume percent`);input.value=value;input.dispatchEvent(new h.dom.window.Event('input'));};
   for(const name of ['Narrator','Mira','Guard','SFX','Ambience']){
    assert.equal(find(`${name} volume`).max,'3');assert.equal(find(`${name} volume percent`).max,'300');assert.equal(find(`${name} volume percent`).value,'100');type(name,'300');
   }
   assert.equal(find('Master volume').max,'1');type('Master','300');assert.equal(find('Master volume percent').value,'100');
   h.state.blockAudio=true;h.$('play').click();await until(()=>graphs.length===1 && graphs[0].audio.paused===false);assert.equal(graphs[0].gain.gain.value,3);
   find('Narrator silent').click();assert.equal(graphs[0].gain.gain.value,0);find('Narrator silent').click();assert.equal(graphs[0].gain.gain.value,3);
   type('Master','50');assert.equal(graphs[0].gain.gain.value,1.5);graphs[0].audio.onended();
   let index=1;
   while(true){
    await until(()=>graphs.length===index+1 && graphs[index].audio.paused===false);
    if(await h.audioBlobs[h.audios.indexOf(graphs[index].audio)].text()==='FREESOUND_PREVIEW')break;
    assert.equal(graphs[index].gain.gain.value,1.5);graphs[index++].audio.onended();
   }
   const effect=graphs[index];assert.ok(Math.abs(effect.gain.gain.value-0.675)<0.000001);
   type('SFX','200');assert.equal(find('SFX volume').getAttribute('aria-valuetext'),'200 percent');assert.ok(Math.abs(effect.gain.gain.value-0.45)<0.000001);
   type('SFX','999');assert.equal(find('SFX volume percent').value,'300');assert.ok(Math.abs(effect.gain.gain.value-0.675)<0.000001);
   h.state.blockAudio=false;effect.audio.onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
   assert.ok(graphs.slice(index+1).every(graph=>graph.gain.gain.value===1.5));assert.equal(decodes,0);
   const generated=h.synthesis.length;await until(()=>h.store.get('ui:mixer')?.channels?.Mira?.volume===3 && h.store.get('ui:mixer')?.sfx===3);await h.reload();
   for(const name of ['Narrator','Mira','Guard','SFX','Ambience'])assert.equal(find(`${name} volume percent`).value,'300');
   assert.equal(find('Master volume percent').value,'50');await h.play();assert.equal(h.synthesis.length,generated);assert.equal(decodes,0);
  }finally{if(h)await h.close();globalThis.AudioContext=originalContext;}
 }
});

test('compact mute and skip icons remain distinct, accessible and reversible without losing percent entries',async()=>{
 const h=await harness();try{
  await h.plan();const get=kind=>document.querySelector(`[aria-label="Mira ${kind}"]`),mute=get('silent'),skip=get('no voice');
  assert.equal(mute.textContent,'');assert.equal(skip.textContent,'');assert.equal(mute.querySelectorAll('svg').length,1);assert.equal(skip.querySelectorAll('svg').length,1);assert.notEqual(mute.innerHTML,skip.innerHTML);
  const unmuted=mute.innerHTML,enabled=skip.innerHTML;mute.click();assert.equal(get('silent').getAttribute('aria-pressed'),'true');assert.notEqual(get('silent').innerHTML,unmuted);
  get('no voice').click();await until(()=>get('no voice').getAttribute('aria-pressed')==='true');assert.notEqual(get('no voice').innerHTML,enabled);
  get('silent').click();get('no voice').click();await until(()=>get('no voice').getAttribute('aria-pressed')==='false');assert.equal(get('silent').innerHTML,unmuted);assert.equal(get('no voice').innerHTML,enabled);
  assert.equal(document.querySelector('[aria-label="Mira volume percent"]').value,'100');
 }finally{await h.close();}
});

test('one cast channel tab includes every character on desktop and mobile and retains independent levels',async()=>{
 for(const mobile of [false,true]){
  const h=await harness(undefined,mobile);try{
   h.$('showMixer').click();await h.plan();document.querySelector('[aria-label="Channel levels"]').click();
   const tabs=()=>[...document.querySelectorAll('.cm-channel-tab')],tab=name=>tabs().find(item=>item.textContent===name),visible=()=>[...document.querySelectorAll('.cm-channel')].filter(row=>!row.hidden);
   assert.deepEqual(tabs().map(item=>item.textContent),['Cast','Scene audio']);assert.deepEqual(visible().map(row=>row.dataset.speaker),['Narrator','Mira','Guard']);
   const panel=document.querySelector('[role="tabpanel"]');assert.equal(panel.getAttribute('aria-labelledby'),tab('Cast').id);
   const percent=document.querySelector('[aria-label="Mira volume percent"]');percent.value='42';percent.dispatchEvent(new h.dom.window.Event('input'));document.querySelector('[aria-label="Mira silent"]').click();
   await until(()=>h.store.get('ui:mixer')?.channels.Mira?.mute);await h.reload();assert.deepEqual(visible().map(row=>row.dataset.speaker),['Narrator','Mira','Guard']);
   tab('Scene audio').click();assert.deepEqual(visible().map(row=>row.dataset.speaker),['SFX','Ambience','Music']);
   const effects=document.querySelector('[aria-label="SFX volume percent"]');effects.value='31';effects.dispatchEvent(new h.dom.window.Event('input'));
   await until(()=>h.store.get('ui:mixer')?.sfx===0.31);tab('Cast').click();assert.equal(document.querySelector('[aria-label="Mira volume percent"]').value,'42');
   assert.equal(document.querySelector('[aria-label="Mira silent"]').getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('[aria-label="SFX volume percent"]').value,'31');
  }finally{await h.close();}
 }
});

test('unified cast tabs support arrow keys and migrate both legacy cast groups',async()=>{
 for(const legacy of [{channelTab:'voice:Guard'},{channelGroup:'main'},{channelGroup:'npcs'}]){
  const h=await harness(legacy,true);try{
   await h.plan();const tabs=()=>[...document.querySelectorAll('.cm-channel-tab')],selected=()=>tabs().find(tab=>tab.getAttribute('aria-selected')==='true');
   assert.equal(selected().textContent,'Cast');
   selected().dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(selected().textContent,'Scene audio');assert.equal(document.activeElement,selected());
   selected().dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(selected().textContent,'Cast');
   selected().dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(selected().textContent,'Scene audio');assert.equal(tabs().filter(tab=>tab.tabIndex===0).length,1);
   h.$('ambience').click();assert.equal(document.querySelector('[data-kind="ambience"]').dataset.enabled,'false');
   h.setMobile(false);assert.equal(document.querySelector('.cm-channel-tabs').hidden,false);
  }finally{await h.close();}
 }
});

test('Channel levels collapse independently, persist their state and retain disabled sound levels and voice controls',async()=>{
 const h=await harness();try{
  h.$('showMixer').click();const mixer=()=>document.querySelector('[data-choir-mixer]'),menu=()=>mixer().querySelector('[aria-label="Channel levels"]'),body=()=>mixer().querySelector('.cm-levels-body');
  assert.equal(menu().getAttribute('aria-expanded'),'false');assert.equal(body().hidden,true);assert.equal(mixer().querySelector('[aria-label="Master volume"]').closest('.cm-levels-body'),null);
  menu().click();assert.equal(menu().getAttribute('aria-expanded'),'true');assert.equal(body().hidden,false);await until(()=>h.store.get('ui:mixer')?.levelsCollapsed===false);
  await h.plan();assert.deepEqual([...mixer().querySelectorAll('.cm-channel')].map(row=>row.dataset.speaker),['Narrator','Mira','Guard','SFX','Ambience','Music']);
  h.$('ambience').click();assert.equal(h.$('ambience').textContent,'Ambience');assert.equal(h.$('ambience').getAttribute('aria-pressed'),'false');assert.equal(h.$('enableAmbience').checked,false);assert.equal(mixer().querySelector('[data-kind="ambience"]').dataset.enabled,'false');
  h.$('sfx').click();assert.equal(mixer().querySelector('[data-kind="sfx"]').dataset.enabled,'false');assert.equal(mixer().querySelectorAll('.cm-channel[data-kind="voice"]').length,3);assert.equal(menu().getAttribute('aria-expanded'),'true');
  await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();assert.equal(menu().getAttribute('aria-expanded'),'true');assert.equal(body().hidden,false);assert.equal(h.$('ambience').textContent,'Ambience');assert.equal(mixer().querySelector('[data-kind="ambience"]').dataset.enabled,'false');
  await toggle(h,'enableAmbience',true);assert.equal(h.$('ambience').textContent,'Ambience');assert.equal(mixer().querySelector('[aria-label="Ambience volume"]').value,'1');
  menu().click();await until(()=>h.store.get('ui:mixer')?.levelsCollapsed===true);await h.reload();assert.equal(body().hidden,true);assert.equal(menu().getAttribute('aria-expanded'),'false');
 }finally{await h.close();}
});

test('mixer Ambience toggle stops the carried loop, keeps speech playing and remembers Off after reload',async()=>{
 const h=await harness();try{
  await configureFoley(h);const bridge=globalThis.__CHOIR_API__;h.state.blockAudio=true;
  const paragraph=bridge.playParagraph({text:'Rain drummed on the roof.'});await until(()=>beds(h).length===1 && !beds(h)[0].paused && voices(h).length===1 && !voices(h)[0].paused);
  h.$('ambience').click();assert.equal(beds(h)[0].paused,true);assert.equal(voices(h)[0].paused,false);assert.equal(document.querySelector('[data-kind="ambience"]').dataset.enabled,'false');
  h.state.blockAudio=false;voices(h)[0].onended();assert.equal((await paragraph).played,1);await until(()=>h.store.get('chat:chat-a').enableAmbience===false);
  await h.reload();assert.equal(h.$('ambience').textContent,'Ambience');assert.equal(document.querySelector('[aria-label="Ambience volume"]').value,'1');
 }finally{await h.close();}
});

test('turning Ambient sound off stops a carried Cue bed and prevents later beds without interrupting speech',async()=>{
 const h=await harness();try{
  await configureFoley(h);const bridge=globalThis.__CHOIR_API__;
  await bridge.playParagraph({text:'Rain drummed on the roof.'});await until(()=>beds(h).length===1 && !beds(h)[0].paused);
  await toggle(h,'enableAmbience',false);assert.equal(beds(h)[0].paused,true);
  assert.equal((await bridge.playParagraph({text:'The tavern was full.'})).played,1);assert.equal(beds(h).length,1);
  await toggle(h,'enableAmbience',true);await bridge.playParagraph({text:'The tavern was full.'});await until(()=>beds(h).length===2 && !beds(h)[1].paused);
 }finally{await h.close();}
});

test('Ambient sound off stops both crossfading beds while speech continues and no later marker restarts them',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content=scene;await h.plan();h.state.blockAudio=true;h.$('play').click();
  await until(()=>voices(h).length===1 && !voices(h)[0].paused);voices(h)[0].onended();
  await until(()=>beds(h).length===1 && !beds(h)[0].paused && voices(h).length===2);voices(h)[1].onended();
  await until(()=>voices(h).length===3 && !voices(h)[2].paused);voices(h)[2].onended();
  await until(()=>beds(h).length===2 && beds(h).every(audio=>!audio.paused) && voices(h).length===4);
  await toggle(h,'enableAmbience',false);assert.ok(beds(h).every(audio=>audio.paused));assert.equal(voices(h)[3].paused,false);
  h.state.blockAudio=false;voices(h)[3].onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.equal(beds(h).length,2);assert.ok(beds(h).every(audio=>audio.paused));
 }finally{await h.close();}
});

test('Ambient sound off prevents a late bed download from starting and reenabling can retry it',async()=>{
 const h=await harness();try{
  await configureFoley(h);const bridge=globalThis.__CHOIR_API__;h.state.holdBeds=true;
  await bridge.playParagraph({text:'Rain drummed on the roof.'});await until(()=>h.state.releaseBed);
  await toggle(h,'enableAmbience',false);h.state.holdBeds=false;h.state.releaseBed();await tick();assert.equal(beds(h).length,0);
  await toggle(h,'enableAmbience',true);await bridge.playParagraph({text:'Rain drummed on the roof.'});await until(()=>beds(h).length===1 && !beds(h)[0].paused);
 }finally{h.state.releaseBed?.();await h.close();}
});

test('ambience beds start at their anchor, loop under speech, crossfade, follow pause and fade out at the end',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content=scene;await h.plan();assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);
  h.state.blockAudio=true;h.$('play').click();
  await until(()=>voices(h).length===1 && !voices(h)[0].paused);assert.equal(beds(h).length,0);assert.equal(h.synthesis[0].text,'Night fell.');voices(h)[0].onended();
  await until(()=>beds(h).length===1 && !beds(h)[0].paused && voices(h).length===2);const rain=beds(h)[0];
  assert.equal(await bedName(h,rain),'AMBIENCE:rain');assert.match(h.synthesis[1].text,/^Rain drummed/);await until(()=>rain.volume===0.25);
  voices(h)[1].onended();await until(()=>voices(h).length===3 && !voices(h)[2].paused);assert.equal(beds(h).length,1);assert.equal(rain.paused,false);
  voices(h)[2].onended();await until(()=>beds(h).length===2 && !beds(h)[1].paused);const tavern=beds(h)[1];
  assert.equal(await bedName(h,tavern),'AMBIENCE:tavern crowd');await until(()=>rain.volume<0.2);assert.equal(rain.paused,false);
  await until(()=>rain.paused);await until(()=>tavern.volume===0.25);
  h.$('pause').click();assert.equal(voices(h)[3].paused,true);assert.equal(tavern.paused,true);
  h.$('pause').click();assert.equal(voices(h)[3].paused,false);assert.equal(tavern.paused,false);
  h.state.blockAudio=false;voices(h)[3].onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.equal(tavern.paused,false);await until(()=>tavern.paused);assert.equal(h.$('stop').disabled,true);
  assert.equal(h.state.bedFetches.length,2);assert.deepEqual(h.requests.filter(request=>request.action==='freesound').map(request=>request.input.filter),['duration:[10 TO 120]','duration:[10 TO 120]']);
  assert.equal(h.synthesis.map(request=>request.text.replace(/^\[Calm\]\s*/,'')).join(' '),scene);
 }finally{await h.close();}
});

test('saved beds survive reload, replay from the recording, follow Next, Previous, Stop and resume, and honor the persisted Ambient sound toggle',async()=>{
 const h=await harness();try{
  const replay=async()=>{[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent==='Replay finished.');};
  await configureFoley(h);h.message.content=scene;await h.plan();await h.play();await until(()=>beds(h).every(audio=>audio.paused));
  await h.reload();const searches=h.requests.filter(request=>request.action==='freesound').length,generated=h.synthesis.length,start=beds(h).length;
  await replay();assert.deepEqual(await Promise.all(beds(h).slice(start).map(audio=>bedName(h,audio))),['AMBIENCE:rain','AMBIENCE:tavern crowd']);await until(()=>beds(h).every(audio=>audio.paused));
  const ready=()=>until(()=>!h.$('next').disabled && voices(h).at(-1).paused===false),newBeds=()=>beds(h).slice(start+2);
  const playing=async(count,name)=>{await until(()=>newBeds().length===count && !newBeds().at(-1).paused);assert.equal(await bedName(h,newBeds().at(-1)),name);await ready();};
  h.state.blockAudio=true;h.$('play').click();await ready();assert.equal(newBeds().length,0);
  h.$('next').click();await playing(1,'AMBIENCE:rain');h.$('next').click();await until(()=>/Speaking: Mira/.test(document.querySelector('[data-choir-mixer]').textContent));await ready();assert.equal(newBeds().length,1);
  h.$('next').click();await playing(2,'AMBIENCE:tavern crowd');h.$('previous').click();await playing(3,'AMBIENCE:rain');
  h.$('stop').click();assert.ok(beds(h).every(audio=>audio.paused));h.$('play').click();await playing(4,'AMBIENCE:rain');assert.match(document.querySelector('[data-choir-mixer]').textContent,/Speaking: Mira/);
  h.$('stop').click();assert.ok(beds(h).every(audio=>audio.paused));assert.equal(h.requests.filter(request=>request.action==='freesound').length,searches);assert.equal(h.synthesis.length,generated);
  h.state.blockAudio=false;await toggle(h,'enableAmbience',false);const silent=beds(h).length;await h.play();await replay();assert.equal(beds(h).length,silent);
  await h.reload();assert.equal(h.$('enableAmbience').checked,false);assert.equal(h.store.get('chat:chat-a').enableAmbience,false);
 }finally{await h.close();}
});

test('Ambience can boost above the old volume cap on desktop and mobile, follows Master and survives cached replay',async()=>{
 for(const mobile of [false,true]){
  const h=await harness(undefined,mobile);try{
   h.$('showMixer').click();
   const find=label=>document.querySelector(`[aria-label="${label}"]`),range=()=>find('Ambience volume'),number=()=>find('Ambience volume percent');
   const type=(label,value)=>{const input=find(label);input.value=value;input.dispatchEvent(new h.dom.window.Event('input'));};
   assert.equal(range().max,'3');assert.equal(number().max,'300');assert.equal(number().value,'100');assert.equal(find('Master volume').max,'1');assert.equal(find('SFX volume').max,'3');
   await configureFoley(h);h.message.content='Rain drummed on the roof. "Hello."';await h.plan();h.state.blockAudio=true;h.$('play').click();
   await until(()=>beds(h).length===1 && beds(h)[0].volume===0.25);const rain=beds(h)[0],speech=voices(h)[0];
   type('Ambience volume','2');assert.equal(rain.volume,0.5);assert.equal(number().value,'200');assert.equal(speech.volume,1);
   type('Ambience volume percent','300');assert.equal(rain.volume,0.75);assert.equal(range().value,'3');assert.equal(speech.volume,1);
   assert.equal(range().style.getPropertyValue('--choir-level'),'100%');assert.equal(range().getAttribute('aria-valuetext'),'300 percent');
   type('Master volume percent','50');assert.equal(rain.volume,0.375);assert.equal(speech.volume,0.5);
   type('Ambience volume percent','999');assert.equal(number().value,'300');assert.equal(rain.volume,0.375);assert.equal(find('Increase Ambience volume').disabled,true);
   type('Ambience volume percent','295');find('Increase Ambience volume').click();assert.equal(number().value,'300');assert.equal(rain.volume,0.375);
   await until(()=>h.store.get('ui:mixer')?.ambience===3);const generated=h.synthesis.length,searches=h.requests.filter(request=>request.action==='freesound').length;
   h.$('stop').click();await h.reload();assert.equal(number().value,'300');assert.equal(range().value,'3');
   h.$('play').click();await until(()=>beds(h).length===2 && beds(h)[1].volume===0.375);
   assert.equal(voices(h).at(-1).volume,0.5);assert.equal(h.synthesis.length,generated);assert.equal(h.requests.filter(request=>request.action==='freesound').length,searches);
  }finally{await h.close();}
 }
});

test('Ambience slider sets bed level live without touching speech and persists after reload',async()=>{
 const h=await harness();try{
  h.$('showMixer').click();assert.equal(document.querySelector('[data-speaker="Ambience"]').dataset.kind,'ambience');
  await configureFoley(h);h.message.content='Rain drummed on the roof. "Hello."';await h.plan();h.state.blockAudio=true;h.$('play').click();
  await until(()=>beds(h).length===1 && beds(h)[0].volume===0.25);const rain=beds(h)[0],speech=voices(h)[0];
  const volume=document.querySelector('[aria-label="Ambience volume"]');volume.value='0.4';volume.dispatchEvent(new h.dom.window.Event('input'));volume.dispatchEvent(new h.dom.window.Event('change'));
  assert.ok(Math.abs(rain.volume-0.1)<0.000001);assert.equal(speech.volume,1);
  await until(()=>h.store.get('ui:mixer')?.ambience===0.4);h.$('stop').click();await h.reload();
  assert.equal(document.querySelector('[aria-label="Ambience volume"]').value,'0.4');
  h.$('play').click();await until(()=>beds(h).length===2 && beds(h)[1].volume>0);assert.ok(beds(h)[1].volume<=0.1+0.000001);
 }finally{await h.close();}
});

test('music changes from scary to romantic at a later cue within one narrated message',async()=>{
 const h=await harness();try{
  await toggle(h,'enableMusic',true);h.message.content='A shadow crept along the wall; then she held his hand with a tender smile.';
  h.state.soundCues={cues:[],ambience:[],music:[{segment:0,trigger:'A shadow crept',feels:['Eerie'],genres:['Horror'],keywords:['dark','strings']},{segment:0,trigger:'then she held',feels:['Calming'],genres:['Classical'],keywords:['romantic','piano']}]};
  h.state.musicTitles={Eerie:'Crypto',Calming:'Tender'};await h.plan();h.state.blockAudio=true;h.$('play').click();
  await until(()=>voices(h).length===1 && beds(h).length===1 && !beds(h)[0].paused);assert.match(beds(h)[0].src,/^blob:/);assert.equal(h.synthesis[0].text,'A shadow crept along the wall;');
  voices(h)[0].onended();await until(()=>voices(h).length===2 && beds(h).length===2 && !beds(h)[1].paused);
  assert.match(beds(h)[1].src,/^blob:/);assert.match(h.synthesis[1].text,/^then she held/);assert.equal(globalThis.__CHOIR_API__.getMusic().title,'Tender');
  const selection=h.requests.filter(request=>request.action==='music');assert.equal(selection.length,2);assert.deepEqual(selection[1].input.keywords,['romantic','piano']);assert.match(selection[1].input.moment,/tender smile/);
  h.state.blockAudio=false;voices(h)[1].onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
 }finally{await h.close();}
});

test('a music marker proxies the chosen incompetech track under speech with its credit and follows the Music slider and pause',async()=>{
 const h=await harness();try{
  h.$('showMixer').click();assert.equal(document.querySelector('[aria-label="Music volume"]').value,'1');assert.equal(h.$('music').getAttribute('aria-pressed'),'false');
  h.$('music').click();assert.equal(h.$('enableMusic').checked,true);assert.equal(h.$('music').getAttribute('aria-pressed'),'true');await until(()=>h.$('saveState').textContent==='Saved automatically');h.message.content=scene;await h.plan();
  assert.equal(h.requests.find(request=>request.action==='sfx').input.music,true);
  h.state.blockAudio=true;h.$('play').click();
  await until(()=>beds(h).length===1 && beds(h)[0].volume===0.2);const music=beds(h)[0];
  assert.match(music.src,/^blob:/);assert.equal(h.requests.find(request=>request.action==='musicAudio').input.url,'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Crypto.mp3');assert.equal(music.paused,false);
  assert.deepEqual(h.requests.filter(request=>request.action==='music').map(({input})=>[input.feels,input.genres,input.keywords]),[[['Dark'],['Soundtrack'],['organ']]]);
  assert.equal(h.$('musicCredit').hidden,false);assert.equal(h.$('musicCredit').textContent,'"Crypto" Kevin MacLeod (incompetech.com) · CC BY 4.0');
  const volume=document.querySelector('[aria-label="Music volume"]');assert.equal(volume.max,'3');
  volume.value='2';volume.dispatchEvent(new h.dom.window.Event('input'));volume.dispatchEvent(new h.dom.window.Event('change'));
  assert.ok(Math.abs(music.volume-0.4)<0.000001);assert.equal(voices(h)[0].volume,1);await until(()=>h.store.get('ui:mixer')?.music===2);
  h.$('pause').click();assert.equal(music.paused,true);h.$('pause').click();assert.equal(music.paused,false);
  h.$('music').click();assert.equal(music.paused,true);assert.equal(voices(h)[0].paused,false);assert.equal(h.$('musicCredit').hidden,true);assert.equal(document.querySelector('[aria-label="Music volume"]').value,'2');assert.equal(music.src,undefined);assert.equal(music.loads,1);
  h.$('stop').click();h.$('music').click();await until(()=>h.store.get('chat:chat-a').enableMusic===true);
  const musicRequests=()=>h.requests.filter(request=>request.action==='music').length;
  h.state.blockAudio=false;h.state.bedPlayError=true;await h.play();assert.match(h.$('sfxStatus').textContent,/Music skipped \(Dark, Soundtrack\): Browser blocked background audio/);
  h.state.bedPlayError=false;h.state.bedDecodeError=true;await h.play();assert.equal(musicRequests(),1);await until(()=>/Music skipped \(Dark, Soundtrack\): Browser could not play the incompetech track/.test(h.$('sfxStatus').textContent));
  h.state.bedDecodeError=false;await h.play();assert.equal(musicRequests(),2);assert.match(beds(h).at(-1).src,/^blob:/);
 }finally{await h.close();}
});

test('continuous music is opt-in, global, survives reply completion and cue-free replies, and stops explicitly',async()=>{
 const h=await harness();try{
  assert.equal(h.$('loopMusic').checked,false);
  await toggle(h,'enableMusic',true);await toggle(h,'loopMusic',true);
  assert.equal(h.store.get('settings:global').loopMusic,true);
  h.message.content='Night fell over the road.';await h.plan();await h.play();
  await until(()=>beds(h).length===1 && !beds(h)[0].paused);const music=beds(h)[0];
  await new Promise(resolve=>setTimeout(resolve,1600));assert.equal(music.paused,false);assert.equal(music.loop,true);
  h.message.content='The travellers kept walking.';await h.plan();
  assert.deepEqual(h.requests.filter(request=>request.action==='sfx').at(-1).input.currentMusic,{title:'Crypto',feels:['Dark']});
  assert.equal(music.paused,false);await h.play();assert.equal(music.paused,false);assert.equal(beds(h).length,1);
  assert.equal(h.$('stop').disabled,false);h.$('stop').click();assert.equal(music.paused,true);assert.equal(music.src,undefined);
  const requests=h.synthesis.length,musicRequests=h.requests.filter(request=>request.action==='music' || request.action==='musicAudio').length;
  await h.play();assert.equal(beds(h).length,2);assert.equal(beds(h)[1].paused,false,'playing the saved cue-free message restores its original music after Stop');
  assert.equal(h.synthesis.length,requests);assert.equal(h.requests.filter(request=>request.action==='music' || request.action==='musicAudio').length,musicRequests);
  const record=await recordingFor(h.message.content);assert.equal(record.segments[0].carried,true);assert.ok(record.blobs[0].blob.size>0);
  h.store.set('chat:chat-b',{loopMusic:false,enableMusic:false});h.state.active='chat-b';h.subscriptions.get('chat.active')();
  await until(()=>h.$('loopMusic').checked && h.$('enableMusic').checked);await h.reload();assert.equal(h.$('loopMusic').checked,true);
 }finally{await h.close();}
});

test('continuous music waits for its replacement, crossfades when ready, and keeps the current track if selection fails',async()=>{
 const h=await harness();try{
  await toggle(h,'enableMusic',true);await toggle(h,'loopMusic',true);const bridge=globalThis.__CHOIR_API__;
  await bridge.playParagraph({text:'Night fell over the road.'});await until(()=>beds(h).length===1 && !beds(h)[0].paused);
  const original=beds(h)[0];await until(()=>original.volume===0.2);
  h.state.holdMusic=true;h.state.musicTitle='Storm';await bridge.playParagraph({text:'The storm broke at once.'});
  await until(()=>h.state.releaseMusic);await new Promise(resolve=>setTimeout(resolve,1600));
  assert.equal(original.paused,false);assert.equal(original.volume,0.2);assert.equal(bridge.getMusic().title,'Crypto');
  h.state.releaseMusic();await until(()=>beds(h).length===2 && !beds(h)[1].paused);const replacement=beds(h)[1];
  await until(()=>original.paused && replacement.volume===0.2);assert.equal(bridge.getMusic().title,'Storm');
  h.state.holdMusic=false;h.state.musicError='No music available';await bridge.playParagraph({text:'Dawn broke in a new place.'});
  assert.equal(replacement.paused,false);assert.equal(bridge.getMusic().title,'Storm');
  bridge.stop();assert.ok(beds(h).every(audio=>audio.paused));
 }finally{await h.close();}
});

test('continuous music can finish loading after speech ends and is stopped by the loop toggle, music toggle, chat change and cleanup',async()=>{
 const h=await harness();try{
  await toggle(h,'enableMusic',true);await toggle(h,'loopMusic',true);
  h.state.holdMusic=true;h.message.content='Night fell over the road.';await h.plan();await h.play();
  await until(()=>h.state.releaseMusic);assert.equal(beds(h).length,0);
  h.state.holdMusic=false;h.state.releaseMusic();await until(()=>beds(h).length===1 && !beds(h)[0].paused);
  await toggle(h,'loopMusic',false);assert.equal(beds(h)[0].paused,true);
  await toggle(h,'loopMusic',true);await h.play();await until(()=>beds(h).length===2 && !beds(h)[1].paused);
  await toggle(h,'enableMusic',false);assert.equal(beds(h)[1].paused,true);
  await toggle(h,'enableMusic',true);await h.play();await until(()=>beds(h).length===3 && !beds(h)[2].paused);
  h.store.set('chat:chat-b',h.store.get('chat:chat-a'));h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>beds(h)[2].paused && /restored/i.test(h.$('saveState').textContent));
  assert.equal(h.$('loopMusic').checked,true);assert.equal(globalThis.__CHOIR_API__.getMusic(),null);
  await globalThis.__CHOIR_API__.playParagraph({text:'Night fell in another chat.'});await until(()=>beds(h).length===4 && !beds(h)[3].paused);
  await h.reload();assert.equal(beds(h)[3].paused,true);
 }finally{h.state.releaseMusic?.();await h.close();}
});

test('default music playback fades at the end, while continuous cached replay carries a track across messages',async()=>{
 const h=await harness();try{
  await toggle(h,'enableMusic',true);h.message.content='Night fell over the road.';await h.plan();
  h.state.blockAudio=true;h.$('play').click();await until(()=>beds(h).length===1 && !beds(h)[0].paused && voices(h).length===1 && !voices(h)[0].paused);
  h.state.blockAudio=false;voices(h)[0].onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
  await until(()=>beds(h).length===1 && beds(h)[0].paused);
  h.message.content='The travellers kept walking.';await h.plan();await h.play();
  await toggle(h,'loopMusic',true);
  for(const key of [...h.store.keys()])if(/^(plan:|activeplan:)/.test(key))h.store.delete(key);
  await h.reload();const bridge=globalThis.__CHOIR_API__;
  await bridge.playParagraph({text:'Night fell over the road.'});await until(()=>beds(h).length===2 && !beds(h)[1].paused);const music=beds(h)[1];
  const synthesis=h.synthesis.length;h.footer.querySelector('button').click();await until(()=>h.$('status').textContent==='Replay finished.');
  assert.equal(music.paused,false);assert.equal(h.synthesis.length,synthesis);assert.equal(beds(h).length,2);
 }finally{await h.close();}
});

test('continuous music honors stop cues and cancels a loading replacement when music is turned off',async()=>{
 const h=await harness();try{
  await toggle(h,'enableMusic',true);await toggle(h,'loopMusic',true);const bridge=globalThis.__CHOIR_API__;
  await bridge.playParagraph({text:'Night fell over the road.'});await until(()=>beds(h).length===1 && !beds(h)[0].paused);
  await bridge.playParagraph({text:'Music stopped in the quiet room.'});await until(()=>beds(h)[0].paused);assert.equal(bridge.getMusic(),null);
  await bridge.playParagraph({text:'The travellers kept walking.'});assert.equal(beds(h).length,1);
  await bridge.playParagraph({text:'Night fell in another place.'});await until(()=>beds(h).length===2 && !beds(h)[1].paused);
  h.state.holdMusic=true;await bridge.playParagraph({text:'The storm broke at once.'});await until(()=>h.state.releaseMusic);
  await toggle(h,'enableMusic',false);h.state.releaseMusic();await tick();assert.equal(beds(h).length,2);assert.ok(beds(h).every(audio=>audio.paused));assert.equal(bridge.getMusic(),null);
 }finally{h.state.releaseMusic?.();await h.close();}
});

test('Cue carries the playing music into later paragraphs, announces it and one bridge toggle turns all Choir sound off',async()=>{
 const h=await harness();try{
  const events=[],target=new EventTarget();target.addEventListener('choir-music-v1',event=>events.push(event.detail));globalThis.dispatchEvent=event=>target.dispatchEvent(event);
  try{
   await configureFoley(h);await toggle(h,'enableMusic',true);const bridge=globalThis.__CHOIR_API__;assert.equal(bridge.getMusic(),null);
   await bridge.playParagraph({text:'Night fell over the road.'});await until(()=>beds(h).length===1 && !beds(h)[0].paused);const music=beds(h)[0];
   const playing={title:'Crypto',credit:'"Crypto" Kevin MacLeod (incompetech.com) · CC BY 4.0'};
   await until(()=>bridge.getMusic()?.title==='Crypto');assert.deepEqual(bridge.getMusic(),playing);assert.deepEqual(events,[playing]);
   assert.equal(h.requests.filter(request=>request.action==='sfx')[0].input.currentMusic,undefined);
   await bridge.playParagraph({text:'Rain drummed on the roof.'});await until(()=>beds(h).length===2);
   assert.deepEqual(h.requests.filter(request=>request.action==='sfx')[1].input.currentMusic,{title:'Crypto',feels:['Dark']});
   assert.equal(music.paused,false);assert.equal(h.requests.filter(request=>request.action==='music').length,1);
   bridge.setSoundEnabled(false);assert.ok(beds(h).every(audio=>audio.paused));assert.equal(bridge.getMusic(),null);assert.deepEqual(events,[playing,null]);
   assert.deepEqual(['enableSfx','enableAmbience','enableMusic'].map(name=>h.$(name).checked),[false,false,false]);
   await until(()=>['enableSfx','enableAmbience','enableMusic'].every(name=>h.store.get('chat:chat-a')[name]===false));
   bridge.setSoundEnabled(true);await until(()=>['enableSfx','enableAmbience','enableMusic'].every(name=>h.store.get('chat:chat-a')[name]===true));assert.equal(h.$('enableMusic').checked,true);
  }finally{delete globalThis.dispatchEvent;}
 }finally{await h.close();}
});

test('a loading replacement track keeps the old one credited and announced until it starts',async()=>{
 const h=await harness();try{
  const events=[],target=new EventTarget();target.addEventListener('choir-music-v1',event=>events.push(event.detail?.title ?? null));globalThis.dispatchEvent=event=>target.dispatchEvent(event);
  try{
   await toggle(h,'enableMusic',true);const bridge=globalThis.__CHOIR_API__;
   await bridge.playParagraph({text:'Night fell over the road.'});await until(()=>bridge.getMusic()?.title==='Crypto');
   h.state.holdMusic=true;h.state.musicTitle='Storm';await bridge.playParagraph({text:'The storm broke at once.'});await until(()=>h.state.releaseMusic);
   assert.equal(bridge.getMusic().title,'Crypto');assert.match(h.$('musicCredit').textContent,/^"Crypto"/);assert.deepEqual(events,['Crypto']);
   h.state.releaseMusic();await until(()=>bridge.getMusic()?.title==='Storm');assert.match(h.$('musicCredit').textContent,/^"Storm"/);assert.deepEqual(events,['Crypto','Storm']);
  }finally{delete globalThis.dispatchEvent;}
 }finally{await h.close();}
});

test('the chat player starts loading every bed when it is planned, before its marker plays',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content=scene;await h.plan();h.state.blockAudio=true;h.$('play').click();
  await until(()=>h.state.bedFetches.length===2);assert.equal(voices(h).length,1);assert.equal(h.synthesis.length,1);
  assert.deepEqual(h.state.bedFetches.map(url=>new URL(url).searchParams.get('q')),['rain','tavern crowd']);
 }finally{await h.close();}
});

test('Cue loads the next paragraph bed early and the hand-off reuses that load',async()=>{
 const h=await harness();let first;try{
  await configureFoley(h);h.$('prefetch').value='1';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();
  const bridge=globalThis.__CHOIR_API__;h.state.blockAudio=true;
  first=bridge.playParagraph({text:'Night fell.',nextText:'Rain drummed on the roof.'}).catch(error=>error);
  await until(()=>h.state.bedFetches.length===1 && voices(h).length===1);assert.equal(beds(h).length,0);
  h.state.blockAudio=false;await bridge.playParagraph({text:'Rain drummed on the roof.'});assert.equal((await first).name,'AbortError');
  await until(()=>beds(h).length===1 && !beds(h)[0].paused);
  assert.equal(h.state.bedFetches.length,1);assert.equal(h.requests.filter(request=>request.action==='freesound').length,1);
 }finally{await h.close();await first;}
});

test('Cue prefetch names the music chosen for the current paragraph before it starts',async()=>{
 const h=await harness();try{
  await toggle(h,'enableMusic',true);h.$('prefetch').value='1';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();
  await globalThis.__CHOIR_API__.playParagraph({text:'Night fell over the road.',nextText:'The road was quiet.'});
  await until(()=>h.requests.filter(request=>request.action==='sfx').length===2);
  assert.deepEqual(h.requests.filter(request=>request.action==='sfx').map(request=>request.input.currentMusic),[undefined,{title:'',feels:['Dark']}]);
 }finally{await h.close();}
});

test('Cue keeps a bed across paragraphs until a stop entry, stop() or cancellation, and a failed bed never blocks speech',async()=>{
 const h=await harness();try{
  await configureFoley(h);const bridge=globalThis.__CHOIR_API__;
  assert.equal((await bridge.playParagraph({text:'Rain drummed on the roof.',chatId:'chat-a'})).played,1);await until(()=>beds(h).length===1 && !beds(h)[0].paused);const rain=beds(h)[0];
  assert.equal((await bridge.playParagraph({text:'"Hello."',chatId:'chat-a'})).played,1);assert.equal(rain.paused,false);assert.equal(beds(h).length,1);assert.equal(h.$('stop').disabled,false);
  await bridge.playParagraph({text:'Silence fell over the hall.',chatId:'chat-a'});assert.equal(rain.paused,false);await until(()=>rain.paused);
  await bridge.playParagraph({text:'Rain drummed again.'});await until(()=>beds(h).length===2 && !beds(h)[1].paused);bridge.stop();assert.ok(beds(h).every(audio=>audio.paused));
  h.state.blockAudio=true;const ctrl=new AbortController(),pending=bridge.playParagraph({text:'Rain drummed once more.',signal:ctrl.signal});
  await until(()=>beds(h).length===3 && !beds(h)[2].paused);ctrl.abort();await assert.rejects(pending,{name:'AbortError'});assert.ok(h.audios.every(audio=>audio.paused));
  h.state.blockAudio=false;h.state.noFoleyResults=true;assert.equal((await bridge.playParagraph({text:'The tavern was full.'})).played,1);
  await until(()=>/SFX skipped: No Freesound result for "tavern crowd"/.test(h.$('sfxStatus').textContent));assert.equal(beds(h).length,3);
  assert.deepEqual(h.requests.filter(request=>request.action==='freesound').map(request=>request.input.query).slice(-2),['tavern crowd','tavern']);
 }finally{await h.close();}
});

test('ambience playback and decode failures stay visible, keep speech running and allow a later paragraph to retry',async()=>{
 for(const failure of ['start','decode','resume']){
  const h=await harness();let pending;try{
   await configureFoley(h);h.state.blockAudio=true;
   h.state.bedPlayError=failure==='start';h.state.bedDecodeError=failure==='decode';
   const bridge=globalThis.__CHOIR_API__,text='Rain drummed on the roof.';
   pending=bridge.playParagraph({text}).then(result=>({result}),error=>({error}));
   await until(()=>beds(h).length===1 && voices(h).length===1 && !voices(h)[0].paused);
   if(failure==='resume'){h.$('play').click();await until(()=>voices(h)[0].paused);h.state.bedPlayError=true;h.$('play').click();}
   await until(()=>h.$('sfxStatus').textContent.includes('Ambience skipped'));
   assert.match(h.$('sfxStatus').textContent,/rain/);assert.match(h.$('sfxStatus').textContent,failure==='decode'?/decode/i:/blocked/i);
   assert.equal(h.$('sfxStatus').hidden,false);assert.equal(voices(h)[0].paused,false);assert.equal(beds(h)[0].paused,true);
   h.state.bedPlayError=false;h.state.bedDecodeError=false;h.state.blockAudio=false;
   assert.equal((await bridge.playParagraph({text})).played,1);assert.equal((await pending).error?.name,'AbortError');
   await until(()=>beds(h).length===2 && !beds(h)[1].paused);assert.equal(h.$('sfxStatus').hidden,true);
   // Only a file that failed to decode is fetched again; a blocked play reuses the cached bed.
   assert.equal(h.state.bedFetches.length,failure==='decode'?2:1);
  }finally{await h.close();await pending;}
 }
});

test('one sound request serves both toggles and none is made with both off',async()=>{
 const h=await harness();try{
  await configureFoley(h);await toggle(h,'enableSfx',false);h.message.content='Rain drummed. The page snapped under her thumb.';
  await h.plan();assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);await h.play();assert.equal(beds(h).length,1);assert.equal(await playedFoley(h),0);
  await toggle(h,'enableSfx',true);await toggle(h,'enableAmbience',false);await h.play();assert.equal(beds(h).length,1);assert.equal(await playedFoley(h),1);
  await toggle(h,'enableSfx',false);await h.plan();await h.play();assert.equal(h.requests.filter(request=>request.action==='sfx').length,1);assert.equal(h.$('sfxStatus').hidden,true);
 }finally{await h.close();}
});

test('Freesound searches drop trailing words until a sound matches',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.state.foleyWords=1;h.message.content='The page snapped under her thumb.';await h.plan();await h.play();
  assert.equal(await playedFoley(h),1);assert.deepEqual(h.requests.filter(request=>request.action==='freesound').map(request=>request.input.query),['page turn','page']);
 }finally{await h.close();}
});

test('each Freesound search carries the story moment at its anchor, its sound kind and the Decision connection',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.$('decisionConnection').value='decision-b';h.$('decisionConnection').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  await until(()=>h.store.get('chat:chat-a').decisionConnection==='decision-b');
  h.message.content='Rain drummed on the roof while the old clock ticked, the candles burned low and she listened until the page snapped under her thumb.';await h.plan();await h.play();
  const searches=h.requests.filter(request=>request.action==='freesound').map(({input})=>({query:input.query,kind:input.kind,moment:input.moment,decisionConnection:input.decisionConnection}));
  assert.deepEqual(searches.sort((a,b)=>a.query.localeCompare(b.query)),[
   {query:'page turn',kind:'sfx',moment:'k ticked, the candles burned low and she listened until the page snapped under her thumb.',decisionConnection:'decision-b'},
   {query:'rain',kind:'ambience',moment:h.message.content,decisionConnection:'decision-b'}]);
  h.message.content='She watched the shelf '.repeat(60)+'until the page snapped under her thumb.';await h.plan();await h.play();
  const moved=h.requests.filter(request=>request.action==='freesound').at(-1).input;
  assert.ok(moved.moment.includes('page snapped under her thumb.'));assert.ok(moved.moment.length<300);assert.equal(moved.decisionConnection,'decision-b');
 }finally{await h.close();}
});

test('mixer Auto-plan is opt-in, persists, reuses cached plans, and never automatically starts TTS',async()=>{
  const h=await harness();try{
    const event=()=>h.events.get('GENERATION_ENDED')({chatId:'chat-a',messageId:h.message.id,content:h.message.content});
    event();await tick();assert.equal(h.requests.length,0);
    h.$('showMixer').click();h.$('auto-plan').click();assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');
    event();await until(()=>h.$('status').textContent.startsWith('Ready:') && !h.$('latest').disabled);
    assert.equal(h.requests.filter(request=>request.action==='plan').length,1);assert.equal(h.synthesis.length,0);assert.equal(h.audios.length,0);
    event();await until(()=>h.$('status').textContent==='Saved attribution reused.');assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
    await h.reload();assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');assert.equal(h.$('auto').checked,false);
    h.message.content='A fresh reply.';event();await until(()=>h.requests.filter(request=>request.action==='plan').length===2 && !h.$('latest').disabled);
    assert.equal(h.synthesis.length,0);h.$('auto-plan').click();await until(()=>h.$('saveState').textContent==='Saved automatically');
    h.message.content='Another reply.';event();await tick();assert.equal(h.requests.filter(request=>request.action==='plan').length,2);
  }finally{await h.close();}
});

test('Auto-plan toolbar visibility and mixer state stay synchronized through reload and teardown',async()=>{
  const h=await harness();try{
    assert.equal(h.toolbarActions.has('choir_auto_plan'),false);
    assert.equal(h.toolbar.childElementCount,0);
    h.$('showAutoPlanAction').checked=true;h.$('showAutoPlanAction').dispatchEvent(new h.dom.window.Event('change'));
    await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(h.toolbarActions.get('choir_auto_plan').label,'Auto-plan Off');
    const shortcut=h.toolbar.querySelector('button');assert.ok(shortcut);assert.equal(shortcut.textContent,'Auto-plan');assert.equal(shortcut.getAttribute('aria-pressed'),'false');
    shortcut.click();assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');assert.equal(h.toolbarActions.get('choir_auto_plan').label,'Auto-plan On');assert.equal(shortcut.textContent,'Auto-plan');assert.equal(shortcut.getAttribute('aria-pressed'),'true');
    await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();
    assert.equal(h.$('showAutoPlanAction').checked,true);assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');assert.equal(h.toolbarActions.get('choir_auto_plan').label,'Auto-plan On');
    assert.equal(h.toolbar.childElementCount,1);assert.equal(h.toolbar.querySelector('button').getAttribute('aria-pressed'),'true');
    h.$('auto-plan').click();assert.equal(h.toolbarActions.get('choir_auto_plan').label,'Auto-plan Off');
    assert.equal(h.toolbar.querySelector('button').textContent,'Auto-plan');assert.equal(h.toolbar.querySelector('button').getAttribute('aria-pressed'),'false');
    await h.toolbarActions.get('choir_auto_plan').click();assert.equal(h.toolbar.querySelector('button').getAttribute('aria-pressed'),'true');assert.equal(h.toolbar.childElementCount,1);
    await until(()=>h.$('saveState').textContent==='Saved automatically');
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Connection preferences restored');
    assert.equal(h.toolbar.childElementCount,1);assert.equal(h.toolbar.querySelector('button').getAttribute('aria-pressed'),'true');
    h.toolbar.querySelector('button').click();await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(h.store.get('chat:chat-b').autoPlan,false);
    h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Saved settings restored');
    assert.equal(h.toolbar.querySelector('button').getAttribute('aria-pressed'),'false');assert.equal(h.synthesis.length,0);
    h.$('showAutoPlanAction').checked=false;h.$('showAutoPlanAction').dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.toolbarActions.has('choir_auto_plan'),false);
    assert.equal(h.toolbar.childElementCount,0);assert.equal(h.dom.window.document.querySelector('nav > button').textContent,'Another extension');
    await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();assert.equal(h.toolbarActions.has('choir_auto_plan'),false);
    assert.equal(h.toolbar.childElementCount,0);h.$('showAutoPlanAction').checked=true;h.$('showAutoPlanAction').dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.toolbar.childElementCount,1);
  }finally{await h.close();assert.equal(h.toolbarActions.size,0);assert.equal(h.toolbar.childElementCount,0);}
});

test('WebSocket completion metadata cannot make Auto-plan or Auto-play wait for an already published reply',async()=>{
 for(const mode of ['auto-plan','auto-play']){
  const h=await harness();try{
   h.$('auto-plan').click();if(mode==='auto-play')h.$('auto-play').click();
   const event={generationId:`websocket-${mode}`,chatId:'chat-a',messageId:h.message.id,content:h.message.content};
   const metadata={stateRevision:{epoch:'server-session',sequence:42},runtimeMutationId:'saved-reply'};
   // Lumiverse forwards the WebSocket callback's second argument to extensions.
   h.events.get('GENERATION_ENDED')(event,metadata);
   await until(()=>h.$('status').textContent.includes(mode==='auto-play'?'Playback finished':'Ready:') && !h.$('latest').disabled);
   assert.equal(h.state.canonicalReads || 0,0);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
   assert.equal(h.synthesis.length>0,mode==='auto-play');
   h.events.get('GENERATION_ENDED')(event,metadata);await new Promise(resolve=>setTimeout(resolve,150));
   assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
  }finally{await h.close();}
 }
});

test('automatic planning recovers missed completion events and waits for the saved swipe before planning',async()=>{
 for(const playing of [false,true]){
  const h=await harness();try{
   h.$('auto-plan').click();if(playing)h.$('auto-play').click();
   const original=h.message.content,completed='The saved reply arrived. "Hello."';
   h.state.savedMessages=[{...h.message,content:completed,swipes:[original,completed],swipe_id:1}];
   const event={generationId:'metrics-fallback',chatId:'chat-a',messageId:h.message.id,swipeId:1};
   h.events.get('GENERATION_METRICS_READY')(event,{stateRevision:{epoch:'server-session',sequence:42}});await until(()=>h.$('status').textContent.includes('Waiting for the completed reply'));
   assert.equal(h.requests.filter(request=>request.action==='plan').length,0);assert.equal(h.synthesis.length,0);
   h.message.content=completed;h.message.swipe_id=1;
   await until(()=>h.$('status').textContent.includes(playing?'Playback finished':'Ready:') && !h.$('latest').disabled);
   assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
   h.events.get('GENERATION_METRICS_READY')(event);h.events.get('GENERATION_ENDED')({...event,content:completed});await tick();
   assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
   assert.equal(h.synthesis.length,playing?2:0);
  }finally{await h.close();}
 }
});

test('automatic planning uses the full saved continuation and preserves final message normalization',async()=>{
 for(const generationType of ['continue','normal']){
  const h=await harness();try{
   h.$('auto-plan').click();const appended=' Then she smiled.',raw=generationType==='continue'?h.message.content+appended:'A saved reply. "Hello."';
   const completed=`${raw}\n`;
   h.state.savedMessages=[{...h.message,content:completed,swipes:[raw],swipe_id:0}];
   h.events.get('GENERATION_ENDED')({generationId:`canonical-${generationType}`,chatId:'chat-a',messageId:h.message.id,content:generationType==='continue'?appended:raw,generationType});
   if(generationType==='continue')h.message.content=appended; // A transient store projection must not plan just the suffix.
   await until(()=>h.$('status').textContent.includes('Waiting for the completed reply'));assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
   h.message.content=completed;await until(()=>h.$('status').textContent.startsWith('Ready:') && !h.$('latest').disabled);
   assert.equal(h.requests.filter(request=>request.action==='plan').at(-1).input.transcript,transcriptFromMessage(completed));assert.equal(h.synthesis.length,0);
  }finally{await h.close();}
 }
});

test('completion recovery respects swipe selection, disabling automation and navigation',async()=>{
 for(const cancel of ['swipe','off','chat']){
  const h=await harness();try{
   h.$('auto-plan').click();const completed='A different saved reply.';
   h.state.savedMessages=[{...h.message,content:completed,swipes:[h.message.content,completed],swipe_id:cancel==='swipe'?0:1}];
   const event={generationId:`cancel-${cancel}`,chatId:'chat-a',messageId:h.message.id,swipeId:1};
   h.events.get('GENERATION_METRICS_READY')(event);await until(()=>h.$('status').textContent.includes('Waiting for the completed reply'));
   if(cancel==='off')h.$('auto-plan').click();
   if(cancel==='chat'){h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Connection preferences restored');}
   h.message.content=completed;await new Promise(resolve=>setTimeout(resolve,250));assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
  }finally{await h.close();}
 }
});

test('late completion metadata cannot automate a generation that finished with automation off',async()=>{
 const h=await harness();try{
  const event={generationId:'finished-while-off',chatId:'chat-a',messageId:h.message.id};
  h.events.get('GENERATION_ENDED')({...event,content:h.message.content});h.$('auto-plan').click();
  h.state.savedMessages=[{...h.message,swipes:[h.message.content],swipe_id:0}];h.events.get('GENERATION_METRICS_READY')({...event,swipeId:0});
  await new Promise(resolve=>setTimeout(resolve,200));assert.equal(h.requests.filter(request=>request.action==='plan').length,0);
 }finally{await h.close();}
});

test('automatic planning ignores unsuitable events and duplicate events during a pending plan',async()=>{
  const h=await harness();try{
    h.$('auto-plan').click();const emit=extra=>h.events.get('GENERATION_ENDED')({chatId:'chat-a',messageId:h.message.id,content:h.message.content,...extra});
    emit({chatId:'chat-b'});emit({error:'Failed'});emit({generationType:'impersonate'});
    h.message.is_user=true;emit({});h.message.is_user=false;h.message.extra={is_system:true};emit({});h.message.extra={};await tick();assert.equal(h.requests.length,0);
    h.state.held=true;emit({});await until(()=>h.requests.some(request=>request.action==='plan'));emit({});await tick();
    assert.equal(document.querySelector('.cm-caption').textContent,'Planning speech');
    assert.equal(h.requests.filter(request=>request.action==='plan').length,1);h.$('stop').click();await tick();h.releaseHeld();await tick();
    assert.equal(h.$('status').textContent,'Stopped.');assert.equal(h.synthesis.length,0);
  }finally{await h.close();}
});

test('mixer Auto-play persists independently and only plays available plans with Auto-plan off',async()=>{
  const h=await harness();try{
    assert.equal(h.$('auto-play').textContent,'Auto-play');assert.equal(h.$('auto-play').getAttribute('aria-pressed'),'false');
    h.$('auto-play').click();assert.equal(h.$('auto').checked,true);assert.equal(h.$('auto-play').textContent,'Auto-play');assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'false');
    await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(h.store.get('chat:chat-a').auto,true);assert.equal(h.synthesis.length,0);
    await h.reload();assert.equal(h.$('auto-play').getAttribute('aria-pressed'),'true');assert.equal(h.$('auto').checked,true);
    h.$('auto').checked=false;h.$('auto').dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.$('auto-play').getAttribute('aria-pressed'),'false');
    h.$('auto').checked=true;h.$('auto').dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.$('auto-play').getAttribute('aria-pressed'),'true');
    h.events.get('GENERATION_ENDED')({chatId:'chat-a',messageId:h.message.id,content:h.message.content});
    await until(()=>h.$('status').textContent.includes('Auto-play skipped'));assert.equal(h.requests.length,0);assert.equal(h.synthesis.length,0);
    await h.plan();const plans=h.requests.filter(request=>request.action==='plan').length;
    h.events.get('GENERATION_ENDED')({generationId:'already-planned',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
    await until(()=>h.$('status').textContent.includes('Playback finished'));assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'false');assert.ok(h.synthesis.length>0);assert.equal(h.requests.filter(request=>request.action==='plan').length,plans);
    h.message.content='An unplanned regenerated reply.';const synthesis=h.synthesis.length;
    h.events.get('GENERATION_ENDED')({generationId:'unplanned-swipe',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
    await until(()=>h.$('status').textContent.includes('Auto-play skipped'));assert.equal(h.requests.filter(request=>request.action==='plan').length,plans);assert.equal(h.synthesis.length,synthesis);
    h.$('auto-plan').click();h.$('auto-play').click();assert.equal(h.$('auto').checked,false);assert.equal(h.$('auto-play').getAttribute('aria-pressed'),'false');assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');
    await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();assert.equal(h.$('auto-play').textContent,'Auto-play');assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');
  }finally{await h.close();}
});

test('Auto-play alone skips saved attribution that still needs an LLM voice choice',async()=>{
 const h=await harness();try{
  await h.plan();const plans=h.requests.filter(request=>request.action==='plan').length;
  h.store.get('chat:chat-a').fixed[2].voice='';await h.reload();h.$('auto-play').click();
  h.events.get('GENERATION_ENDED')({generationId:'needs-new-voice',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
  await until(()=>h.$('status').textContent.includes('Auto-play skipped'));
  assert.equal(h.requests.filter(request=>request.action==='plan').length,plans);assert.equal(h.synthesis.length,0);
 }finally{await h.close();}
});

test('turning Auto-plan off cancels its pending planner even with Auto-play left on',async()=>{
 for(const playing of [false,true]){
  const h=await harness();try{
   h.$('auto-plan').click();if(playing)h.$('auto-play').click();h.state.held=true;
   h.events.get('GENERATION_ENDED')({generationId:'held-automatic-plan',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
   await until(()=>h.requests.some(request=>request.action==='plan'));const pending=h.requests.find(request=>request.action==='plan');
   h.$('auto-plan').click();await until(()=>!h.$('latest').disabled);
   assert.equal(h.$('auto-play').getAttribute('aria-pressed'),String(playing));assert.ok(h.requests.some(request=>request.action==='cancel' && request.id===pending.id));
   h.state.held=false;h.releaseHeld();await tick();assert.equal(h.synthesis.length,0);assert.equal(h.$('preview').childElementCount,0);
   h.message.content='A later unplanned reply.';h.events.get('GENERATION_ENDED')({generationId:'after-plan-off',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
   if(playing)await until(()=>h.$('status').textContent.includes('Auto-play skipped'));else await new Promise(resolve=>setTimeout(resolve,150));
   assert.equal(h.requests.filter(request=>request.action==='plan').length,1);assert.equal(h.synthesis.length,0);
  }finally{await h.close();}
 }
});

test('turning Auto-play off during planning leaves Auto-plan running and prevents subsequent speech',async()=>{
 for(const control of ['mixer','drawer']){
  const h=await harness();try{
   h.$('auto-plan').click();h.$('auto-play').click();h.state.held=true;
   h.events.get('GENERATION_ENDED')({generationId:'planning-before-play-off',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
   await until(()=>h.requests.some(request=>request.action==='plan'));const pending=h.requests.find(request=>request.action==='plan');
   assert.equal(h.$('auto').disabled,false);
   if(control==='mixer')h.$('auto-play').click();else{h.$('auto').checked=false;h.$('auto').dispatchEvent(new h.dom.window.Event('change'));}
   assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');assert.ok(!h.requests.some(request=>request.action==='cancel' && request.id===pending.id));
   h.state.held=false;h.releaseHeld();await until(()=>h.$('status').textContent.startsWith('Ready:') && !h.$('latest').disabled);
   assert.ok([...h.store.keys()].some(key=>key.startsWith('plan:')));assert.equal(h.synthesis.length,0);
   h.message.content='The next reply is planned silently.';h.events.get('GENERATION_ENDED')({generationId:'silent-after-play-off',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
   await until(()=>h.requests.filter(request=>request.action==='plan').length===2 && !h.$('latest').disabled);assert.equal(h.synthesis.length,0);
  }finally{await h.close();}
 }
});

test('turning Auto-play off cancels automatic speech generation and active audio without disabling Auto-plan',async()=>{
 for(const stage of ['synthesis','audio']){
  const h=await harness();try{
   h.message.content='An automatically spoken reply.';h.$('auto-plan').click();h.$('auto-play').click();
   if(stage==='synthesis')h.state.holdSynthesisAt=1;else h.state.blockAudio=true;
   h.events.get('GENERATION_ENDED')({generationId:`stop-auto-${stage}`,chatId:'chat-a',messageId:h.message.id,content:h.message.content});
   await until(()=>stage==='synthesis'?h.state.releaseSynthesis:h.audios.some(audio=>!audio.paused));
   h.$('auto-play').click();await until(()=>!h.$('latest').disabled);
   assert.equal(h.$('auto-plan').getAttribute('aria-pressed'),'true');assert.ok(h.audios.every(audio=>audio.paused));
   if(stage==='synthesis'){assert.equal(h.state.aborted,1);h.state.releaseSynthesis();h.state.holdSynthesisAt=null;}
   const synthesis=h.synthesis.length;h.state.blockAudio=false;await tick();assert.equal(h.synthesis.length,synthesis);
   h.message.content='A following reply is planned silently.';h.events.get('GENERATION_ENDED')({generationId:`after-auto-${stage}`,chatId:'chat-a',messageId:h.message.id,content:h.message.content});
   await until(()=>h.requests.filter(request=>request.action==='plan').length===2 && !h.$('latest').disabled);assert.equal(h.synthesis.length,synthesis);
  }finally{await h.close();}
 }
});

test('turning Auto-plan off during automatic playback keeps that available plan playing',async()=>{
 const h=await harness();try{
  h.message.content='An already planned reply.';h.$('auto-plan').click();h.$('auto-play').click();h.state.blockAudio=true;
  h.events.get('GENERATION_ENDED')({generationId:'playing-available-plan',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
  await until(()=>h.audios.some(audio=>!audio.paused));const audio=h.audios.find(audio=>!audio.paused);
  h.$('auto-plan').click();assert.equal(audio.paused,false);assert.equal(h.$('auto-play').getAttribute('aria-pressed'),'true');
  h.state.blockAudio=false;audio.onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
  const synthesis=h.synthesis.length;h.message.content='A new unplanned reply.';h.events.get('GENERATION_ENDED')({generationId:'unplanned-after-speech',chatId:'chat-a',messageId:h.message.id,content:h.message.content});
  await until(()=>h.$('status').textContent.includes('Auto-play skipped'));assert.equal(h.requests.filter(request=>request.action==='plan').length,1);assert.equal(h.synthesis.length,synthesis);
 }finally{await h.close();}
});

test('automation switches do not cancel manually requested planning or playback',async()=>{
 const h=await harness();try{
  h.$('auto-plan').click();h.$('auto-play').click();h.state.held=true;h.$('latest').click();
  await until(()=>h.requests.some(request=>request.action==='plan'));const pending=h.requests.find(request=>request.action==='plan');
  h.$('auto-plan').click();h.$('auto-play').click();assert.ok(!h.requests.some(request=>request.action==='cancel' && request.id===pending.id));
  h.state.held=false;h.releaseHeld();await until(()=>h.$('status').textContent.startsWith('Ready:') && !h.$('latest').disabled);
  h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.some(audio=>!audio.paused));const audio=h.audios.find(audio=>!audio.paused);
  h.$('auto-play').click();h.$('auto-play').click();assert.equal(audio.paused,false);h.$('stop').click();assert.equal(audio.paused,true);
 }finally{await h.close();}
});

test('automation disabled during saved-plan lookup cannot start late local planning or playback',async()=>{
 for(const stage of ['planning','restore']){
  const h=await harness();let holding=true;const held=[];
  try{
   h.message.content='A simple narrated reply.';
   if(stage==='restore')await h.plan();else{h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));h.$('auto-plan').click();}
   h.$('auto-play').click();const plans=h.requests.filter(request=>request.action==='plan').length,get=h.ctx.settings.get;
   h.ctx.settings.get=async key=>{if(holding && key.startsWith('plan:'))await new Promise(resolve=>held.push(resolve));return get(key);};
   h.events.get('GENERATION_ENDED')({generationId:`delayed-lookup-${stage}`,chatId:'chat-a',messageId:h.message.id,content:h.message.content});
   await until(()=>held.length>0 && h.$('latest').disabled);h.$(stage==='planning'?'auto-plan':'auto-play').click();
   assert.equal(h.$('latest').disabled,false);holding=false;for(const release of held.splice(0))release();await new Promise(resolve=>setTimeout(resolve,150));
   assert.equal(h.requests.filter(request=>request.action==='plan').length,plans);assert.equal(h.synthesis.length,0);
   if(stage==='planning'){assert.equal(h.$('preview').childElementCount,0);assert.ok(![...h.store.keys()].some(key=>key.startsWith('plan:')));}
  }finally{holding=false;for(const release of held)release();await h.close();}
 }
});

test('Auto-plan and Auto-play wait for message publication after the host completion event, including same-ID regeneration',async()=>{
 for(const mode of ['auto-plan','auto-play'])for(const existing of [false,true]){
  const h=await harness();try{
   h.$('auto-plan').click();if(mode==='auto-play')h.$('auto-play').click();const finalContent='A completed assistant reply.';h.state.messages=existing?[{...h.message,content:'Previous swipe.'}]:[];
   const event={generationId:`generated-${mode}-${existing}`,chatId:'chat-a',messageId:h.message.id,content:finalContent};h.events.get('GENERATION_ENDED')(event,{stateRevision:{epoch:'server-session',sequence:42}});
   await new Promise(resolve=>setTimeout(resolve,150));assert.equal(h.requests.length,0,'Do not plan an unpublished reply');assert.equal(h.audios.length,0);
   h.message.content=finalContent;h.state.messages=[h.message];h.subscriptions.get('chat.messageCount')();
   await until(()=>h.$('status').textContent.includes(mode==='auto-play'?'Playback finished':'Ready:') && !h.$('latest').disabled);
   assert.equal(h.requests.filter(request=>request.action==='plan').length,1);assert.equal(h.requests.find(request=>request.action==='plan').input.transcript,finalContent);
   assert.equal(h.audios.length>0,mode==='auto-play');const audioCount=h.audios.length;h.events.get('GENERATION_ENDED')(event);await new Promise(resolve=>setTimeout(resolve,150));assert.equal(h.audios.length,audioCount);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
  }finally{await h.close();}
 }
});

test('new reply automation queues behind active planning, playback or Cue instead of dropping the completion event',async()=>{
 for(const activity of ['planning','playback','Cue']){
  const h=await harness();try{
   const playing=activity!=='planning';let companion;
   h.message.content='First reply.';h.$('auto-plan').click();if(playing)h.$('auto-play').click();
   if(playing){h.state.blockAudio=true;if(activity==='Cue')companion=globalThis.__CHOIR_API__.playParagraph({text:h.message.content});else{await h.plan();h.$('play').click();}await until(()=>h.audios.length===1 && !h.audios[0].paused);}
   else{h.state.held=true;h.$('latest').click();await until(()=>h.requests.some(request=>request.action==='plan'));}
   const initialPlans=activity==='Cue'?0:1,next={id:'message-next',name:'Mira',is_user:false,content:'Second reply.'};h.state.messages=[h.message,next];h.events.get('GENERATION_ENDED')({generationId:'next-generation',chatId:'chat-a',messageId:next.id,content:next.content});await new Promise(resolve=>setTimeout(resolve,150));assert.equal(h.requests.filter(request=>request.action==='plan').length,initialPlans);
   if(playing){h.state.blockAudio=false;h.audios[0].onended();await companion;}else{h.state.held=false;h.releaseHeld();}
   await until(()=>h.requests.filter(request=>request.action==='plan').length===initialPlans+1 && h.$('preview').textContent.includes(next.content) && !h.$('latest').disabled && (!playing || h.$('status').textContent.includes('Playback finished')));
   assert.equal(h.audios.length,playing?2:0);assert.equal(h.requests.filter(request=>request.action==='plan').at(-1).input.transcript,next.content);
  }finally{await h.close();}
 }
});

test('removed drawer narrator mute remains visible and reversible through mixer No voice and the Cue bridge',async()=>{
 const h=await harness();try{
  const saved=h.store.get('chat:chat-a');saved.muteNarrator=true;await h.reload();
  await h.plan();
  assert.equal(h.$('muteNarrator'),null);assert.ok(!h.root.textContent.includes('Mute narrator (dialogue only)'));
  const button=()=>h.dom.window.document.querySelector('[aria-label="Narrator no voice"]');assert.equal(button().getAttribute('aria-pressed'),'true');assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(),true);
  button().click();await until(()=>h.store.get('chat:chat-a').muteNarrator===false);assert.equal(button().getAttribute('aria-pressed'),'false');assert.equal(h.store.get('settings:global').muteNarrator,undefined);
  await h.reload();assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(),false);button().click();await until(()=>h.store.get('chat:chat-a').fixed[0].excluded===true);assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(),true);
  globalThis.__CHOIR_API__.setNarratorMuted(false);await until(()=>h.store.get('chat:chat-a').fixed[0].excluded===false);assert.equal(button().getAttribute('aria-pressed'),'false');
  const result=await globalThis.__CHOIR_API__.playParagraph({text:'Narration is audible again.'});assert.equal(result.played,1);assert.ok(h.synthesis.some(request=>request.voice==='n'));
 }finally{await h.close();}
});

test('Stop, disabling automation, navigation and teardown discard waiting automatic replies',async()=>{
 for(const cancellation of ['stop','off','navigate','teardown']){
  const h=await harness();try{
   h.$('auto-play').click();h.state.messages=[];h.events.get('GENERATION_ENDED')({generationId:'late-generation',chatId:'chat-a',messageId:h.message.id,content:h.message.content});await tick();
   if(cancellation==='stop')h.$('stop').click();else if(cancellation==='off')h.$('auto-play').click();else if(cancellation==='navigate'){h.state.active='chat-b';h.subscriptions.get('chat.active')();}else await h.reload();
   h.state.messages=[h.message];h.subscriptions.get('chat.messageCount')?.();await new Promise(resolve=>setTimeout(resolve,160));assert.equal(h.requests.length,0);assert.equal(h.audios.length,0);
  }finally{await h.close();}
 }
});

test('larger native requests apply OpenAI, Fish, and unknown-provider chunk limits without losing text',async()=>{
  for(const [provider,limit] of [['openai_tts',4096],['fish_audio',10000],['custom_tts',2000]]){
    const h=await harness();try{
      h.connections[0].provider=provider;await h.reload();h.message.content='A neutral phrase '.repeat(400)+'ends.';
      h.$('chunk').value='10000';h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
      await h.plan();await h.play();assert.ok(h.synthesis.every(request=>request.text.length<=limit));
      if(provider!=='custom_tts')assert.ok(h.synthesis.some(request=>request.text.length>2000));
      const spoken=h.synthesis.map(request=>request.text.replace(/^\[Calm\]\s*/,''));
      assert.ok(spoken.join(' ').replace(/\s+/g,' ').trim()===h.message.content.replace(/\s+/g,' ').trim(),'Native chunks must preserve the original speech text.');
    }finally{await h.close();}
  }
});

test('larger Google TTS requests preserve multilingual text and reserve input space for delivery instructions',async()=>{
  const h=await harness();try{
    h.connections[0].provider='google_tts';h.connections[0].model='gemini-3.8-flash-tts';h.state.catalogues={a:{voices:[{id:'Charon',name:'Charon'}]}};
    const style='Calm, measured narration with gentle warmth',saved=h.store.get('chat:chat-a');h.store.set('chat:chat-a',{...saved,chunk:10000,fixed:[{speaker:'Narrator',voice:'Charon',style}],casts:{}});
    await h.reload();h.message.content=Array.from({length:1500},(_,index)=>`你好世界${index}`).join(' ');
    await h.plan();await h.play();const requests=h.synthesis;
    assert.ok(requests.length>1);assert.ok(requests.every(request=>new TextEncoder().encode(request.text+style).length<=6000));
    assert.ok(requests.map(request=>request.text).join(' ').replace(/\s+/g,' ').trim()===h.message.content,'Google chunks must preserve the original multilingual text.');
  }finally{await h.close();}
});

test('companion paragraph playback also applies native provider limits and Fish delivery tags',async()=>{
  for(const [provider,limit] of [['openai_tts',4096],['fish_audio',10000]]){
    const h=await harness();try{
      h.connections[0].provider=provider;const saved=h.store.get('chat:chat-a');h.store.set('chat:chat-a',{...saved,chunk:10000});await h.reload();
      const text='A neutral phrase '.repeat(400)+'ends.';
      await globalThis.__CHOIR_API__.playParagraph({text,speaker:'Narrator'});
      assert.ok(h.synthesis.length>0);assert.ok(h.synthesis.every(request=>request.text.length<=limit));
      if(provider==='fish_audio')assert.ok(h.synthesis.every(request=>request.text.startsWith('[Calm]')));
      assert.ok(h.synthesis.map(request=>request.text.replace(/^\[Calm\]\s*/,'')).join(' ').replace(/\s+/g,' ').trim()===text,'Companion chunks must preserve the original paragraph.');
    }finally{await h.close();}
  }
});

async function fishGroupingHarness(mixer){
  const h=await harness(mixer);h.connections[0].provider='fish_audio';h.connections[0].model='s2.1-pro';
  h.state.providers=[{id:'fish_audio',capabilities:{parameters:{},multiSpeaker:{maxSpeakers:5,models:['s2.1-pro']}}}];
  const saved=h.store.get('chat:chat-a');saved.connectionMode='one';saved.batchSpeech=true;saved.chunk=1800;saved.enableSfx=false;saved.enableAmbience=false;
  for(const actor of saved.fixed){delete actor.route;delete actor.accent;delete actor.pronunciation;}
  h.store.set('chat:chat-a',saved);await h.reload();return h;
}
async function openRouterGroupingHarness(family='fish_audio',patched=true){
 const h=await harness(),fishModel='fish-audio/s2.1-pro-free:free',googleModel='google/gemini-3.8-flash-lite-tts';
 const fishIds=['1','2','3','4'].map(char=>char.repeat(32)),ids=family==='fish_audio'?fishIds:['Charon','Kore','Puck','Zephyr'];
 h.connections[0].provider='openrouter_tts';h.connections[0].model=family==='fish_audio'?fishModel:googleModel;
 const mixed=[{id:'alloy',name:'Alloy (OpenAI)'},...['Puck','Kore','Charon','Zephyr'].map(id=>({id,name:`${id} (Gemini)`}))];
 h.state.providers=[{id:'openrouter_tts',capabilities:{parameters:{instructions:{type:'string'},speech_style:{type:'string'}},staticVoices:mixed,...(patched?{multiSpeaker:{maxSpeakers:5,models:[fishModel,googleModel],maxSpeakersByModel:{[fishModel]:5,[googleModel]:2}}}:{})}}];
 h.state.catalogues={a:{voices:mixed}};h.state.planForCatalogue=true;
 const saved=h.store.get('chat:chat-a');saved.connectionMode='one';saved.batchSpeech=true;saved.enableSfx=false;saved.enableAmbience=false;saved.useStyle=true;
 saved.fixed.forEach((actor,i)=>{actor.voice=ids[i];delete actor.route;delete actor.accent;delete actor.pronunciation;});saved.casts={'native:a':[{speaker:'Guard',voice:ids[3],style:''}]};
 if(family==='fish_audio'){saved.extraVoices=fishIds.map(id=>`${id} | A warm storyteller.`).join('\n');saved.extraVoiceRoutes=Object.fromEntries(fishIds.map(id=>[id,['native:a']]));}
 h.store.set('chat:chat-a',saved);await h.reload();return h;
}

test('OpenRouter Fish restores assigned voices without an extra catalogue and lets a new cast add its first voice',async()=>{
 const h=await openRouterGroupingHarness('fish_audio',false);try{
  const saved=h.store.get('chat:chat-a');delete saved.extraVoices;delete saved.extraVoiceRoutes;h.store.set('chat:chat-a',saved);
  await h.reload();assert.equal(h.$('fixed').children.length,3);assert.doesNotMatch(h.$('status').textContent,/returned no voices/);
  await h.plan();await h.play();assert.equal(h.synthesis.length,4);assert.ok(h.synthesis.every(input=>/^[a-f0-9]{32}$/i.test(input.voice)));
  for(const actor of saved.fixed)actor.voice='';saved.casts={};h.store.set('chat:chat-a',saved);await h.reload();
  assert.equal(h.$('fixed').children.length,3);assert.ok(h.$('fixed').querySelector('[aria-label="Paste Fish Audio voice ID for Narrator"]'));
  assert.ok(![...h.$('fixed').querySelector('[data-choir-voice]').options].some(option=>['alloy','Puck'].includes(option.value)));
  const narrator=h.$('fixed').firstElementChild;narrator.querySelector('[data-choir-voice-id]').click();narrator.querySelector('[data-choir-voice-id-input]').value='5'.repeat(32);narrator.querySelector('[data-choir-apply-voice-id]').click();
  await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(h.store.get('chat:chat-a').singleVoices['native:a'].Narrator,'5'.repeat(32));
 }finally{await h.close();}
});

test('OpenRouter Fish grouping uses Fish voice IDs and exposes Fish catalogue tools without Gemini or GPT voices',async()=>{
 const h=await openRouterGroupingHarness();try{
  const options=[...h.$('fixed').querySelector('[data-choir-voice]').options].map(option=>option.value);
  assert.ok(!options.includes('Puck'));assert.ok(!options.includes('alloy'));assert.ok(options.includes('1'.repeat(32)));
  h.$('captureDefaults').click();const dialog=document.querySelector('[role="dialog"][aria-label="Set default"]');
  assert.equal(dialog.querySelector('[aria-label="Browse Fish voice catalogue for Default Narrator voice"]').parentElement.hidden,false);
  [...dialog.querySelectorAll('button')].find(button=>button.textContent==='Cancel').click();
  await h.plan();await h.play();assert.equal(h.synthesis.length,1);
  assert.deepEqual(h.synthesis[0].parameters.turns.map(turn=>turn.voice),['1','3','4','1'].map(char=>char.repeat(32)));
  assert.equal(h.synthesis[0].parameters.turns.map(turn=>turn.text).join(' '),h.message.content);
  assert.match(h.$('groupingStatus').title,/up to 5 voices per call/);
  await h.reload();await h.play();assert.equal(h.synthesis.length,1);
 }finally{await h.close();}
});

test('OpenRouter Gemini groups only two preset voices per call despite the provider also supporting five Fish voices',async()=>{
 const h=await openRouterGroupingHarness('gemini');try{
  const options=[...h.$('fixed').querySelector('[data-choir-voice]').options].map(option=>option.value);
  assert.ok(options.includes('Puck'));assert.ok(!options.includes('alloy'));
  assert.match(h.$('groupingStatus').title,/up to 2 preset voices per call/);
  await h.plan();await h.play();assert.equal(h.synthesis.length,2);
  assert.deepEqual(h.synthesis.flatMap(request=>request.parameters.turns.map(turn=>turn.voice)),['Charon','Puck','Zephyr','Charon']);
  assert.ok(h.synthesis.every(request=>new Set(request.parameters.turns.map(turn=>turn.voice)).size<=2));
 }finally{await h.close();}
});

test('an unpatched OpenRouter relay keeps Fish voices model-specific and uses separate calls for different speakers',async()=>{
 const h=await openRouterGroupingHarness('fish_audio',false);try{
  assert.match(h.$('groupingStatus').title,/relay advertises one voice per call/);
  await h.plan();await h.play();assert.equal(h.synthesis.length,4);
  assert.ok(h.synthesis.every(request=>!request.parameters.turns && /^[1-4]{32}$/.test(request.voice)));
  assert.equal(h.synthesis[0].text,'At dawn.');assert.equal(h.synthesis[0].parameters.instructions,'Calm');
 }finally{await h.close();}
});

test('optional Fish grouping sends four turns in one request and cached replay makes no new calls',async()=>{
  const h=await fishGroupingHarness();try{
    assert.equal(h.$('batchSpeech').checked,true);await h.plan();await h.play();
    assert.equal(h.synthesis.length,1);assert.deepEqual(h.synthesis[0].parameters.turns.map(turn=>turn.speaker),['Narrator','Mira','Guard','Narrator']);
    assert.deepEqual(h.synthesis[0].parameters.turns.map(turn=>turn.voice),['n','m','g','n']);
    await h.play();assert.equal(h.synthesis.length,1);
    await toggle(h,'batchSpeech',false);await h.play();assert.equal(h.synthesis.length,5);
  }finally{await h.close();}
});

test('Fish S2 sends a moderate dialogue-narration-dialogue passage as one call with both voice IDs',async()=>{
 const h=await fishGroupingHarness();try{
  const passage=['"'+('I want to explain what happened and how I felt. '.repeat(5)).trim()+'"','She rested her hand on the table, watched him quietly and considered everything he had said, drawing a slow breath as the room settled around them.','"'+('We can talk about this honestly and work through it together. '.repeat(5)).trim()+'"'].join(' ');
  assert.ok(passage.length>600 && passage.length<900);h.message.content=passage;
  await h.plan();assert.match(h.$('groupingStatus').title,/up to 5 voices per call/);assert.match(h.$('groupingStatus').textContent,/1 speech batch/);
  await h.play();assert.equal(h.synthesis.length,1);assert.deepEqual(h.synthesis[0].parameters.turns.map(turn=>[turn.speaker,turn.voice]),[['Mira','m'],['Narrator','n'],['Mira','m']]);
  assert.equal(h.synthesis[0].parameters.turns.map(turn=>turn.text).join(' '),passage);
  await h.reload();await h.play();assert.equal(h.synthesis.length,1);
 }finally{await h.close();}
});

test('grouped message controls show one multi-speaker clip and replay every turn from its shared recording',async()=>{
 const h=await fishGroupingHarness();try{
  h.message.content='The room fell quiet. "Hello." The door opened.';
  await toggle(h,'sectionButtons',true);await h.plan();
  const clips=()=>h.footer.querySelectorAll('[data-choir-clip]');await until(()=>clips().length===1);
  assert.equal(h.footer.querySelector('summary').textContent,'Audio clips (1)');assert.equal(h.footer.querySelectorAll('[data-choir-section]').length,0);
  assert.match(h.$('planSummary').textContent,/3 text turns · 1 speech clip/);
  assert.match(clips()[0].textContent,/Narrator → Mira → Narrator/);assert.match(clips()[0].title,/One multi-speaker TTS call/);
  clips()[0].click();await tick();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.equal(h.synthesis.length,1);assert.deepEqual(h.synthesis[0].parameters.turns.map(turn=>[turn.speaker,turn.voice]),[['Narrator','n'],['Mira','m'],['Narrator','n']]);
  await until(()=>[...h.$('preview').querySelectorAll('[data-cache-index]')].every(node=>node.textContent==='Shared clip 1 · Cached'));
  await h.reload();await until(()=>clips().length===1);clips()[0].click();await tick();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.equal(h.synthesis.length,1,'Playing the displayed grouped clip must reuse its complete recording.');
  await toggle(h,'batchSpeech',false);await until(()=>h.footer.querySelectorAll('[data-choir-section]').length===3);
  assert.equal(clips().length,0);assert.equal(h.footer.querySelector('summary').textContent,'Sections');
 }finally{await h.close();}
});

test('grouped clip playback selects exactly one bounded chunk instead of regenerating its whole original turn',async()=>{
 const h=await fishGroupingHarness();try{
  h.message.content=('The room was quiet and the windows were open. '.repeat(25)).trim();
  const saved=h.store.get('chat:chat-a');saved.chunk=500;h.store.set('chat:chat-a',saved);await h.reload();
  await toggle(h,'sectionButtons',true);await h.plan();await until(()=>h.footer.querySelectorAll('[data-choir-clip]').length>=3);
  h.footer.querySelector('[data-choir-clip="1"]').click();await tick();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.equal(h.synthesis.length,1);assert.ok(h.synthesis[0].text.length<=500);assert.ok(h.synthesis[0].text.length<h.message.content.length);
  h.footer.querySelector('[data-choir-clip="1"]').click();await tick();await until(()=>h.$('status').textContent.includes('Playback finished'));assert.equal(h.synthesis.length,1);
 }finally{await h.close();}
});

test('grouped clip controls update to actual separate requests when speaker levels differ',async()=>{
 const h=await fishGroupingHarness();try{
  h.message.content='The room fell quiet. "Hello." The door opened.';
  await toggle(h,'sectionButtons',true);await h.plan();await until(()=>h.footer.querySelectorAll('[data-choir-clip]').length===1);
  const level=document.querySelector('[aria-label="Mira volume percent"]');level.value='50';level.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  await until(()=>h.footer.querySelectorAll('[data-choir-clip]').length===3);assert.equal(h.footer.querySelector('summary').textContent,'Audio clips (3)');
  assert.match(h.$('planSummary').textContent,/3 text turns · 3 speech clips/);
  h.footer.querySelector('[data-choir-clip="1"]').click();await tick();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.equal(h.synthesis.length,1);assert.equal(h.synthesis[0].voice,'m');assert.equal(h.synthesis[0].parameters.turns,undefined);
 }finally{await h.close();}
});

test('grouping status explains a single-voice provider and updates its batch count with speaker levels',async()=>{
 const h=await harness();try{
  await toggle(h,'batchSpeech',true);await h.plan();assert.equal(h.$('groupingStatus').hidden,false);assert.match(h.$('groupingStatus').title,/one voice per call; different assigned voices need separate calls/);assert.match(h.$('groupingStatus').textContent,/4 speech batches/);
  await toggle(h,'batchSpeech',false);assert.equal(h.$('groupingStatus').hidden,true);
 }finally{await h.close();}
 const fish=await fishGroupingHarness();try{
  await fish.plan();assert.match(fish.$('groupingStatus').textContent,/1 speech batch/);
  const level=document.querySelector('[aria-label="Mira volume percent"]');level.value='50';level.dispatchEvent(new fish.dom.window.Event('input',{bubbles:true}));
  assert.match(fish.$('groupingStatus').textContent,/3 speech batches/);
 }finally{await fish.close();}
});
test('grouping falls back to separate calls for unequal speaker levels and old relays',async()=>{
  for(const oldRelay of [false,true]){
    const h=await fishGroupingHarness(oldRelay?undefined:{channels:{Mira:{volume:0.5}}});try{
      if(oldRelay){h.state.providers[0].capabilities.multiSpeaker=undefined;await h.reload();}
      await h.plan();await h.play();assert.equal(h.synthesis.length,oldRelay?4:3);
      assert.ok(oldRelay?h.synthesis.every(request=>!request.parameters.turns):h.synthesis.filter(request=>request.parameters.turns).every(request=>!request.parameters.turns.some(turn=>turn.speaker==='Mira')));
    }finally{await h.close();}
  }
});
test('No voice during a grouped clip stops it and next Play omits only that speaker',async()=>{
  const h=await fishGroupingHarness({enabled:true});try{
    await h.plan();h.state.blockAudio=true;h.footer.querySelector('button').click();await until(()=>h.audios.some(audio=>!audio.paused));
    h.root.ownerDocument.querySelector('[data-speaker="Mira"] [data-kind="no-voice"]').click();
    await until(()=>h.$('status').textContent.includes('rebuild grouped speech'));
    assert.ok(h.audios.every(audio=>audio.paused));h.state.blockAudio=false;
    await until(()=>!h.$('play').disabled);h.$('play').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.deepEqual(h.synthesis.at(-1).parameters.turns.map(turn=>turn.speaker),['Narrator','Guard','Narrator']);
  }finally{await h.close();}
});
test('grouped clips keep their shared level until next Play while Master remains immediate',async()=>{
  const h=await fishGroupingHarness({master:0.5});try{
    await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.some(audio=>!audio.paused));
    const audio=h.audios.at(-1);assert.equal(audio.volume,0.5);
    h.root.ownerDocument.querySelector('[data-speaker="Mira"] [data-kind="silent"]').click();assert.equal(audio.volume,0.5);
    const master=h.root.ownerDocument.querySelector('input[type="range"][aria-label="Master volume"]');master.value='0.7';master.dispatchEvent(new h.dom.window.Event('input'));assert.equal(audio.volume,0.7);
    h.state.blockAudio=false;audio.onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
    await h.play();assert.equal(h.synthesis.length,4);assert.ok(h.synthesis.slice(1).filter(request=>request.parameters.turns).every(request=>!request.parameters.turns.some(turn=>turn.speaker==='Mira')));
  }finally{await h.close();}
});
test('grouped playback keeps an SFX cue between the spoken text it interrupts',async()=>{
  const h=await fishGroupingHarness();try{
    await toggle(h,'enableSfx',true);h.$('freesoundApiKey').value='test-key';h.$('freesoundApiKey').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    h.message.content='At dawn. "Hello." The page snapped shut. "Wait." The gate closed.';
    await h.plan();await h.play();assert.equal(h.synthesis.length,2);
    assert.match(h.synthesis[0].text,/Hello/);assert.doesNotMatch(h.synthesis[0].text,/page snapped/);
    assert.match(h.synthesis[1].text,/page snapped/);assert.equal(h.state.previewFetches.length,1);
  }finally{await h.close();}
});
test('Google relay groups prebuilt voices using its existing connection',async()=>{
  const h=await harness();try{
    const voices=['Charon','Kore','Puck'].map(id=>({id,name:id}));
    h.connections[0].provider='google_tts';h.connections[0].model='gemini-3.8-flash-tts';
    h.state.providers=[{id:'google_tts',capabilities:{parameters:{},staticVoices:voices,multiSpeaker:{maxSpeakers:2,models:['gemini-3.8-flash-tts']}}}];
    h.state.catalogues={a:{voices}};h.state.planForCatalogue=true;
    const saved=h.store.get('chat:chat-a');saved.connectionMode='one';saved.casts={};saved.batchSpeech=true;saved.enableSfx=false;saved.enableAmbience=false;
    saved.fixed.forEach((actor,i)=>{actor.voice=voices[i].id;delete actor.route;delete actor.accent;delete actor.pronunciation;});
    h.store.set('chat:chat-a',saved);await h.reload();
    h.message.content='At dawn. "Hello." The gate closed.';await h.plan();await h.play();
    assert.equal(h.synthesis.length,1);
    assert.deepEqual(h.synthesis[0].parameters.turns.map(turn=>turn.voice),['Charon','Puck','Charon']);
  }finally{await h.close();}
});
test('heuristic planning and its test stay local without any backend request',async()=>{
  const h=await harness();try{
    h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    h.message.content='The room fell quiet.';await h.plan();
    assert.equal(h.requests.length,0);assert.match(h.$('preview').textContent,/Narrator/);
    await h.click('testPlanner',text=>text.startsWith('Heuristic test passed'));
    assert.equal(h.requests.length,0);assert.equal(h.synthesis.length,0);assert.equal(h.$('stop').disabled,true);
  }finally{await h.close();}
});

test('ambiguous heuristic dialogue stops without an LLM fallback or audio synthesis',async()=>{
  const h=await harness();try{
    h.$('allowLlmFallback').checked=true;h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    await h.click('latest',text=>text.includes('No LLM request was made'));
    assert.match(h.$('status').textContent,/could not identify the speaker.*Dialogue 1: "Hello\."/);
    assert.doesNotMatch(h.$('status').textContent,/unassigned|no assigned voice/);
    assert.equal(h.requests.length,0);assert.equal(h.synthesis.length,0);assert.equal(h.$('preview').children.length,0);
    assert.equal(h.$('llmPlannerBox').hidden,false);assert.equal(h.$('stop').disabled,true);
  }finally{await h.close();}
});

test('heuristic planning names the missing narrator voice instead of blaming dialogue ambiguity',async()=>{
  const h=await harness();try{
    const saved=h.store.get('chat:chat-a');saved.fixed[0].voice='';h.store.set('chat:chat-a',saved);await h.reload();
    h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    await h.click('latest',text=>text.includes('No LLM request was made'));
    assert.match(h.$('status').textContent,/needs a voice for Narrator/);
    assert.equal(h.requests.length,0);assert.equal(h.synthesis.length,0);
  }finally{await h.close();}
});

test('heuristic planning preserves the persona role after Lumiverse replaces its placeholder name',async()=>{
  const h=await harness();try{
    const saved=h.store.get('chat:chat-a');saved.fixed[1].speaker='Persona';saved.casts={};
    h.store.set('chat:chat-a',saved);h.state.persona={id:'persona-jay',name:'Jay'};
    await h.reload();await until(()=>h.$('fixed').children[1].querySelector('input').value==='Jay');
    h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    h.message.content='The door opened. "Hello." Jay said, "Welcome."';await h.plan();
    const plan=[...h.store].find(([key])=>key.startsWith('plan:'))[1];
    assert.deepEqual(plan.attribution.segments.filter(segment=>segment.text.startsWith('"')).map(segment=>segment.speaker),['Mira','Jay']);
    assert.equal(h.requests.length,0);assert.equal(h.synthesis.length,0);
    // Removing the persona must not turn the next lead into the persona role.
    const withoutPersona=h.store.get('chat:chat-a');withoutPersona.fixed=withoutPersona.fixed.filter(actor=>actor.speaker!=='Jay');
    withoutPersona.fixed.push({speaker:'Bob',voice:'g',style:''});h.store.set('chat:chat-a',withoutPersona);
    for(const key of [...h.store.keys()])if(/^(plan:|activeplan:)/.test(key))h.store.delete(key);
    h.message.content='The door opened. "Hello."';await h.reload();
    await h.click('latest',text=>text.includes('No LLM request was made'));
    assert.equal(h.requests.length,0);assert.equal(h.synthesis.length,0);assert.equal(h.$('preview').children.length,0);
  }finally{await h.close();}
});

test('switching from heuristic to LLM clears legacy flags and preserves the selected engine on reload',async()=>{
  const h=await harness();try{
    h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    h.$('plannerMode').value='llm';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    assert.equal(h.$('useFastClassifier').checked,false);assert.equal(h.$('llmPlannerBox').hidden,false);
    await until(()=>h.$('saveState').textContent==='Saved automatically');
    assert.equal(h.store.get('chat:chat-a').useFastClassifier,false);await h.reload();assert.equal(h.$('plannerMode').value,'llm');
    h.message.content='The room fell quiet.';await h.plan();assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
  }finally{await h.close();}
});

test('explicit planner selections survive stale flags and legacy Jev settings restore correctly',async()=>{
  const h=await harness();try{
    const saved=h.store.get('chat:chat-a');saved.plannerMode='jev';saved.useFastClassifier=true;h.store.set('chat:chat-a',saved);
    await h.reload();assert.equal(h.$('plannerMode').value,'jev');assert.equal(h.$('useFastClassifier').checked,false);
    await h.click('latest',text=>text.includes('The object cannot be cloned'));
    assert.equal(h.requests.filter(r=>r.action==='planJev').length,1);assert.equal(h.requests.filter(r=>r.action==='plan').length,0);
    delete saved.plannerMode;saved.useFastClassifier=false;saved.useJev=true;await h.reload();assert.equal(h.$('plannerMode').value,'jev');
  }finally{await h.close();}
});

test('Decision connection autosaves, survives reload and is inherited by a new chat',async()=>{
  const h=await harness();try{
    h.$('plannerMode').value='jev';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    h.$('decisionConnection').value='decision-b';h.$('decisionConnection').dispatchEvent(new h.dom.window.Event('change'));
    await until(()=>h.$('saveState').textContent==='Saved automatically');
    assert.equal(h.store.get('chat:chat-a').decisionConnection,'decision-b');assert.equal(h.store.get('settings:global').decisionConnection,'decision-b');
    await h.reload();assert.equal(h.$('decisionConnection').value,'decision-b');
    await h.click('testPlanner',text=>text.includes('Planner test passed'));
    assert.equal(h.requests.findLast(r=>r.action==='testPlanner').input.decisionConnection,'decision-b');
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Connection preferences restored');
    assert.equal(h.$('decisionConnection').value,'decision-b');assert.equal(h.$('plannerMode').value,'jev');
  }finally{await h.close();}
});

test('an incomplete Jev response never enables an unapproved LLM fallback',async()=>{
  const h=await harness();try{
    h.state.jevInvalid=true;h.$('plannerMode').value='jev';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
    await h.click('latest',text=>text.includes('Jev returned no valid speech plan'));
    assert.equal(h.requests.filter(r=>r.action==='plan').length,0);assert.equal(h.synthesis.length,0);
  }finally{await h.close();}
});

test('drawer Stop cancels pending planning and discards a late result with the mixer hidden',async()=>{
  const h=await harness();try{
    const stop=h.root.querySelector('[data-et="stop"]');assert.ok(stop);assert.equal(stop.disabled,true);
    h.state.held=true;h.$('latest').click();await until(()=>h.requests.some(r=>r.action==='plan'));await tick();
    assert.equal(stop.disabled,false);assert.equal(h.$('decisionConnection').disabled,true);
    stop.click();await tick();assert.equal(h.$('status').textContent,'Stopped.');assert.equal(stop.disabled,true);assert.equal(h.$('decisionConnection').disabled,false);
    assert.ok(h.requests.some(r=>r.action==='cancel'));h.releaseHeld();await tick();
    assert.equal(h.$('status').textContent,'Stopped.');assert.equal(h.$('preview').children.length,0);assert.equal(h.audios.length,0);
  }finally{await h.close();}
});

test('drawer Stop cancels in-flight speech and paused audio without opening the mixer',async()=>{
  const h=await harness();try{
    await h.plan();h.state.delay=200;h.$('play').click();await until(()=>h.synthesis.length>0);
    h.root.querySelector('[data-et="stop"]').click();await tick();assert.equal(h.state.aborted,1);assert.equal(h.audios.length,0);
    h.state.delay=0;h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false);
    h.$('pause').click();assert.equal(h.root.querySelector('[data-et="stop"]').disabled,false);
    h.root.querySelector('[data-et="stop"]').click();await tick();assert.ok(h.audios.every(audio=>audio.paused));assert.equal(h.$('status').textContent,'Stopped.');
  }finally{await h.close();}
});

test('reload and chat navigation restore plans; recasting and edited text regenerate only affected passages',async()=>{
  const h=await harness();try{
    h.message.content='At dawn. "Hello, Mira." "Wait." The gate closed.';
    assert.equal(h.footer.querySelector('button').title,'Play Choir · click again to stop'); // New ctx.ui decorator API.
    await h.plan();await h.play();assert.equal(h.synthesis.length,4);
    assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
    assert.equal(h.synthesis.find(r=>r.voice==='m').parameters.accent,'Irish');
    assert.match(h.synthesis.find(r=>r.voice==='m').text,/mee-rah/);
    await h.reload();assert.equal(h.$('preview').querySelectorAll('.et-card').length,4);
    await until(()=>h.$('preview').textContent.includes('Cached'));
    await h.play();assert.equal(h.synthesis.length,4);
    h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value='new';
    await h.click('save',text=>text.includes('retention saved'));await h.play();assert.equal(h.synthesis.length,5);
    assert.equal(h.synthesis.at(-1).voice,'new');assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('Ready.'));
    assert.equal(h.$('preview').children.length,0);
    h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('restored'));
    assert.equal(h.$('preview').querySelectorAll('.et-card').length,4);
    h.message.content='At dawn. "Greetings." "Wait." The gate closed.';h.events.get('MESSAGE_EDITED')({messageId:'message-a'});
    assert.equal(h.$('preview').children.length,0);await h.plan();await h.play();
    assert.equal(h.requests.filter(r=>r.action==='plan').length,2);assert.equal(h.synthesis.length,6);
    assert.equal(h.synthesis.at(-1).text,'"Greetings."');
  }finally{await h.close();}
});

test('connection speed and format changes regenerate only affected saved speech',async()=>{
  const h=await harness();try{
    h.connections[0].default_parameters={speed:1,output_format:'mp3'};await h.reload();await h.plan();await h.play();
    assert.equal(h.synthesis.length,4);
    h.connections[0].default_parameters.speed=1.2;await h.reload();await h.play();
    assert.equal(h.synthesis.length,7);assert.ok(h.synthesis.slice(4).every(request=>request.connectionId==='a'));
    h.connections[0].default_parameters.output_format='wav';await h.reload();await h.play();
    assert.equal(h.synthesis.length,10);assert.ok(h.synthesis.slice(7).every(request=>request.connectionId==='a'));
    h.connections[0].default_parameters.use_streaming_endpoint=true;await h.reload();await h.play();assert.equal(h.synthesis.length,10);
    assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
  }finally{await h.close();}
});

test('companion speech applies actor pronunciation and accent just like the main player',async()=>{
  const h=await harness();try{
    await globalThis.__CHOIR_API__.playParagraph({text:'"A companion-only line for Mira."',speaker:'Mira'});
    assert.equal(h.synthesis.length,1);assert.equal(h.synthesis[0].connectionId,'b');
    assert.equal(h.synthesis[0].parameters.accent,'Irish');assert.match(h.synthesis[0].text,/mee-rah/);
    await globalThis.__CHOIR_API__.playParagraph({text:'"A companion-only line for Mira."',speaker:'Mira'});assert.equal(h.synthesis.length,1);
  }finally{await h.close();}
});

test('companion cache changes with the TTS connection and delivery settings',async()=>{
  const h=await harness();try{
    const saved=h.store.get('chat:chat-a');h.store.set('chat:chat-a',{...saved,fixed:[{speaker:'Narrator',voice:'n',style:'Calm'}],casts:{}});await h.reload();
    const text='A companion-only narration.';
    await globalThis.__CHOIR_API__.playParagraph({text});await globalThis.__CHOIR_API__.playParagraph({text});assert.equal(h.synthesis.length,1);
    h.$('connection').value='b';h.$('connection').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('status').textContent==='Provider selected.');
    await globalThis.__CHOIR_API__.playParagraph({text});assert.equal(h.synthesis.length,2);assert.equal(h.synthesis[1].connectionId,'b');
    await toggle(h,'useStyle',false);await globalThis.__CHOIR_API__.playParagraph({text});assert.equal(h.synthesis.length,3);assert.equal(h.synthesis[2].parameters.instructions,undefined);
  }finally{await h.close();}
});

test('companion sound-choice requests cancel on Stop or external abort before speech starts',async()=>{
  for(const cancel of ['stop','signal','replacement']){
    const h=await harness();let pending;try{
      await configureFoley(h);h.state.holdSfx=true;const ctrl=new AbortController();
      pending=globalThis.__CHOIR_API__.playParagraph({text:'A companion-only narration.',signal:ctrl.signal}).then(result=>({result}),error=>({error}));
      await until(()=>h.requests.some(request=>request.action==='sfx'));
      assert.equal(h.$('stop').disabled,false,'Stop must be usable while optional sound choices are pending');
      if(cancel==='stop')globalThis.__CHOIR_API__.stop();
      else if(cancel==='signal')ctrl.abort();
      else{h.state.holdSfx=false;assert.equal((await globalThis.__CHOIR_API__.playParagraph({text:'The replacement narration.'})).played,1);}
      const outcome=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),500))]);
      assert.equal(outcome.error?.name,'AbortError');assert.equal(h.synthesis.length,cancel==='replacement'?1:0);assert.equal(h.audios.length,cancel==='replacement'?1:0);
      assert.ok(h.requests.some(request=>request.action==='cancel'));
    }finally{h.releaseHeld();await h.close();await pending;}
  }
});

test('replacing a companion request for the same text retries an aborted flight and caches the completed audio',async()=>{
  const h=await harness();try{
    h.state.delay=60;const bridge=globalThis.__CHOIR_API__,text='A companion-only narration.';
    const first=bridge.playParagraph({text}).then(result=>({result}),error=>({error}));await until(()=>h.synthesis.length===1);
    assert.equal((await bridge.playParagraph({text})).played,1);assert.equal((await first).error?.name,'AbortError');assert.equal(h.synthesis.length,2);
    assert.equal((await bridge.playParagraph({text})).played,1);assert.equal(h.synthesis.length,2);
  }finally{await h.close();}
});

test('429 retains completed audio across reload and retry bills only missing passages',async()=>{
  const h=await harness();try{
    await h.plan();h.state.failVoice='g';await h.click('play',text=>text.includes('Completed passages were retained'));
    assert.equal(h.synthesis.length,3);await until(()=>h.$('preview').textContent.includes('Cached'));
    await h.reload();h.state.failVoice=null;await h.play();
    assert.equal(h.synthesis.length,5);assert.deepEqual(h.synthesis.slice(3).map(r=>r.voice),['g','n']);
    assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
  }finally{await h.close();}
});

test('Fish 502 shows the selected connection, model, voice and returned error while retaining completed audio',async()=>{
  for(const failure of [
    {status:502,body:'Fish upstream: voice is unavailable'},
    {status:502,body:JSON.stringify({error:{message:'Fish synthesis timed out'}}),type:'application/json'},
    {status:502,body:'<html><head><style>hidden proxy styles</style></head><body><h1>502 Bad Gateway</h1><p>Upstream timed out</p></body></html>',type:'text/html'},
    {status:502,body:''}
  ]){
    const h=await harness();try{
      h.connections[1].provider='fish_audio';h.connections[1].model='s2.1-pro';await h.reload();await h.plan();
      h.state.failSynthesisAt=2;h.state.synthesisError=failure;
      await h.click('play',text=>text.includes('Completed passages were retained'));
      const error=h.$('status').textContent;
      assert.match(error,/Fish Audio speech failed/);assert.match(error,/Character provider/);assert.match(error,/s2\.1-pro/);assert.match(error,/voice m/);assert.match(error,/HTTP 502/);
      if(failure.type==='application/json')assert.match(error,/Fish synthesis timed out/);
      else if(failure.type==='text/html'){assert.match(error,/Upstream timed out/);assert.ok(!error.includes('hidden proxy styles'));assert.ok(!error.includes('<html>'));}
      else if(failure.body)assert.match(error,/voice is unavailable/);
      else assert.match(error,/returned no error details/);
      assert.equal(h.synthesis.length,2);await h.reload();h.state.synthesisError=null;h.state.failSynthesisAt=null;await h.play();
      assert.equal(h.synthesis.length,5);assert.deepEqual(h.synthesis.slice(2).map(request=>request.voice),['m','g','n']);
      assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
    }finally{await h.close();}
  }
});

test('mixer Silent and No voice retain text; resume, volume and position survive reload',async()=>{
  const h=await harness();try{
    h.$('showMixer').click();
    await h.plan();document.querySelector('[aria-label="Guard no voice"]').click();await tick();
    assert.equal(h.$('preview').querySelectorAll('.et-card').length,4);
    h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false);
    const audio=h.audios.at(-1);audio.currentTime=7;audio.ontimeupdate?.();
    const mixer=document.querySelector('[data-choir-mixer]');assert.match(mixer.textContent,/Speaking: Narrator/);
    const master=mixer.querySelector('[aria-label="Master volume"]');master.value='0.5';master.dispatchEvent(new h.dom.window.Event('input'));master.dispatchEvent(new h.dom.window.Event('change'));assert.equal(audio.volume,0.5);
    mixer.querySelector('[aria-label="Narrator silent"]').click();assert.equal(audio.volume,0);
    mixer.querySelector('[aria-label="Narrator silent"]').click();mixer.querySelector('[aria-label="Mira no voice"]').click();assert.equal(audio.volume,0.5);await tick();
    const header=mixer.firstChild;header.dispatchEvent(new h.dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:20,clientY:80}));header.dispatchEvent(new h.dom.window.MouseEvent('pointermove',{bubbles:true,clientX:90,clientY:160}));header.dispatchEvent(new h.dom.window.MouseEvent('pointerup',{bubbles:true}));
    h.$('stop').click();await tick();assert.equal(h.store.get('position:chat-a').seconds,7);
    await h.reload();assert.equal(document.querySelector('[data-choir-mixer]').style.left,'90px');assert.equal(document.querySelector('[aria-label="Guard no voice"]').getAttribute('aria-pressed'),'true');
    const before=h.synthesis.length;h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false);assert.equal(h.audios.at(-1).currentTime,7);
    h.state.blockAudio=false;h.audios.at(-1).onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.equal(h.synthesis.length,before+1);assert.ok(!h.synthesis.some(r=>r.voice==='g'));
    h.$('showMixer').click();document.querySelector('[aria-label="Collapse Choir voice mixer"]').click();assert.equal(document.querySelector('[data-choir-mixer]').children[1].hidden,true);
    h.$('showMixer').click();assert.equal(document.querySelector('[data-choir-mixer]').children[1].hidden,false);
  }finally{await h.close();}
});

test('drawer mixer button toggles and stays synchronized with the floating control, visibility and reload on desktop and mobile',async()=>{
  for(const mobile of [false,true]){
    const h=await harness({master:0.4,channels:{},x:50,y:100,collapsed:false});try{
      const mixer=()=>document.querySelector('[data-choir-mixer]');
      const check=expanded=>{assert.equal(h.$('showMixer').textContent,expanded?'Close mixer':'Open mixer');assert.equal(h.$('showMixer').getAttribute('aria-expanded'),String(expanded));assert.equal(!mixer().hidden && !mixer().children[1].hidden,expanded);};
      check(false);h.$('showMixer').click();check(true);
      assert.equal(h.$('enableMixer').checked,true);assert.equal(mixer().querySelector('[aria-label="Master volume"]').value,'0.4');
      h.$('showMixer').click();check(false);assert.equal(mixer().hidden,false);assert.ok(mixer().querySelector('[aria-label="Open Choir voice mixer"]'));
      h.$('showMixer').click();check(true);mixer().querySelector('[aria-label="Collapse Choir voice mixer"]').click();check(false);
      mixer().querySelector('[aria-label="Open Choir voice mixer"]').click();check(true);
      await toggle(h,'enableMixer',false);check(false);assert.equal(mixer().hidden,true);
      h.$('showMixer').click();check(true);assert.equal(h.$('enableMixer').checked,true);
      await until(()=>h.store.get('ui:mixer').collapsed===false && h.store.get('chat:chat-a').enableMixer===true);
      h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('Ready.'));check(true);
      h.$('showMixer').click();check(false);h.$('showMixer').click();check(true);
      await h.reload();check(false);h.$('showMixer').click();check(true);
      assert.equal(mixer().querySelector('[aria-label="Master volume"]').value,'0.4');assert.equal(h.synthesis.length,0);
    }finally{await h.close();}
  }
});

test('mixer starts as a draggable sound icon even with old expanded preferences, and dragging does not open it',async()=>{
  const h=await harness({master:0.4,channels:{},x:50,y:100,collapsed:false});try{
    const mixer=document.querySelector('[data-choir-mixer]'),button=mixer.querySelector('[aria-label="Open Choir voice mixer"]');
    assert.equal(mixer.style.width,'44px');assert.equal(mixer.children[1].hidden,true);assert.equal(mixer.firstChild.firstChild.hidden,true);assert.ok(button.querySelector('svg'));assert.equal(button.getAttribute('aria-expanded'),'false');
    button.dispatchEvent(new h.dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:50,clientY:100}));button.dispatchEvent(new h.dom.window.MouseEvent('pointermove',{bubbles:true,clientX:90,clientY:140}));button.dispatchEvent(new h.dom.window.MouseEvent('pointerup',{bubbles:true}));button.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,detail:1}));
    assert.equal(mixer.style.left,'90px');assert.equal(mixer.children[1].hidden,true);
    button.click();assert.equal(mixer.children[1].hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(mixer.querySelector('[aria-label="Master volume"]').value,'0.4');
    button.click();assert.equal(mixer.style.width,'44px');assert.equal(mixer.children[1].hidden,true);
    await h.reload();assert.equal(document.querySelector('[data-choir-mixer]').style.left,'90px');assert.equal(document.querySelector('[data-choir-mixer]').dataset.collapsed,'true');
  }finally{await h.close();}
});

test('host remount replaces the previous mixer and cancels its playback',async()=>{
  const h=await harness();try{
    await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false);
    h.$('showMixer').click();await h.remount();assert.ok(h.audios.every(audio=>audio.paused));
    assert.equal(document.querySelectorAll('[data-choir-mixer]').length,1);assert.equal(document.querySelector('[data-choir-mixer]').style.width,'44px');
  }finally{await h.close();}
});

test('latest planned notice invites an explicit redo without discarding cached audio',async()=>{
  const h=await harness();try{
    assert.equal(h.$('latestNotice').hidden,true);await h.plan();await h.play();
    assert.equal(h.$('latestNotice').hidden,false);assert.equal(h.$('latestNotice').textContent,'Already planned. Plan latest again to redo it.');
    const before=h.synthesis.length;await h.plan();assert.equal(h.requests.filter(r=>r.action==='plan').length,2);await h.play();assert.equal(h.synthesis.length,before);
    await h.reload();assert.equal(h.$('latestNotice').hidden,false);await h.plan();assert.equal(h.requests.filter(r=>r.action==='plan').length,3);
    h.store.set('activeplan:chat-a','another-message');await h.reload();await until(()=>!h.$('latestNotice').hidden);
    assert.equal(h.$('preview').children.length,0);await h.plan();assert.equal(h.requests.filter(r=>r.action==='plan').length,4);
    h.message.content='A different scene. "Hello."';h.events.get('MESSAGE_EDITED')({messageId:h.message.id});assert.equal(h.$('latestNotice').hidden,true);
  }finally{await h.close();}
});

test('message play reuses the current validated plan even when saving it fails, and overlapping clicks do not replan',async()=>{
  const h=await harness();try{
    h.state.failPlanSave=true;h.$('latest').click();await until(()=>h.$('status').textContent.includes('Settings storage failed'));
    assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
    const button=h.footer.querySelector('button');assert.equal(button.textContent,'');assert.equal(button.style.width,'28px');
    button.click();button.click();await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.equal(h.requests.filter(r=>r.action==='plan').length,1);const synthesized=h.synthesis.length;
    button.click();await until(()=>h.$('status').textContent.includes('Playback finished'));assert.equal(h.requests.filter(r=>r.action==='plan').length,1);assert.equal(h.synthesis.length,synthesized);
  }finally{await h.close();}
});

test('section playback is an optional persisted toggle and synthesizes only the selected section',async()=>{
  const h=await harness();try{
    h.message.content='The hall was quiet '.repeat(70)+'. "Welcome." '+'The road was dark '.repeat(80)+'.';
    await h.plan();assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
    assert.equal(h.footer.querySelector('details').hidden,true);
    h.$('sectionButtons').checked=true;h.$('sectionButtons').dispatchEvent(new h.dom.window.Event('change'));await tick();
    const sections=h.footer.querySelector('details');assert.equal(sections.hidden,false);assert.equal(sections.querySelectorAll('[data-choir-section]').length,3);
    sections.querySelector('[data-choir-section="1"]').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.equal(h.synthesis.length,1);assert.equal(h.synthesis[0].voice,'m');assert.match(h.synthesis[0].text,/Welcome/);assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
    await h.reload();assert.equal(h.$('sectionButtons').checked,true);await until(()=>h.footer.querySelectorAll('[data-choir-section]').length===3);
    h.$('sectionButtons').checked=false;h.$('sectionButtons').dispatchEvent(new h.dom.window.Event('change'));await tick();assert.equal(h.footer.querySelector('details').hidden,true);
    assert.equal(h.$('preview').querySelectorAll('[data-choir-section]').length,0);
  }finally{await h.close();}
});

test('retrying message play after a planner failure plans the whole reply again in one request',async()=>{
  const h=await harness();try{
    h.message.content='The hall was quiet '.repeat(70)+'. "Welcome." '+'The road was dark '.repeat(80)+'.';h.state.failPlanAt=1;
    h.$('latest').click();await until(()=>h.$('status').textContent.includes('Planner quota exhausted'));
    const first=h.requests.find(r=>r.action==='plan').input.transcript;
    h.state.failPlanAt=null;await h.reload();h.footer.querySelector('button').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.deepEqual(h.requests.filter(r=>r.action==='plan').map(r=>r.input.transcript),[first,first]);
  }finally{await h.close();}
});

test('bounded prefetch stops requests on chat switch; late planning cannot repopulate the next chat',async()=>{
  const h=await harness();try{
    await h.plan();h.$('prefetch').value='1';h.$('concurrency').value='4';h.state.blockAudio=true;
    h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false);await tick();assert.equal(h.synthesis.length,2);
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('Ready.'));
    assert.ok(h.audios.every(audio=>audio.paused));assert.equal(h.synthesis.length,2);assert.equal(h.$('preview').children.length,0);
    h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('restored'));
    h.message.content='A new scene. "Hello."';h.events.get('MESSAGE_EDITED')({messageId:'message-a'});h.state.held=true;h.$('latest').click();await until(()=>h.requests.filter(r=>r.action==='plan').length===2);
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('Ready.'));
    assert.ok(h.requests.some(r=>r.action==='cancel'));assert.equal(h.$('preview').children.length,0);
    h.releaseHeld();await tick();assert.equal(h.$('preview').children.length,0);
  }finally{await h.close();}
});

test('edits and swipes cancel planning and in-flight synthesis before stale replies or audio can play',async()=>{
  const h=await harness();try{
    h.state.held=true;h.$('latest').click();await until(()=>h.requests.some(request=>request.action==='plan'));
    h.message.content='The reply was edited. "Hello."';h.events.get('MESSAGE_EDITED')({messageId:'message-a',chatId:'chat-a'});
    h.releaseHeld();await tick();assert.equal(h.$('preview').children.length,0);assert.equal(h.audios.length,0);
    h.state.held=false;await h.plan();h.state.delay=200;h.$('play').click();await until(()=>h.synthesis.length>0);
    h.message.content='A different swipe.';h.events.get('MESSAGE_SWIPED')({messageId:'message-a',chatId:'chat-a'});
    await tick();assert.equal(h.state.aborted,1);assert.equal(h.audios.length,0);assert.equal(h.$('preview').children.length,0);
    assert.equal(h.$('play').disabled,false);assert.equal(h.$('play').getAttribute('aria-label'),'Play latest reply');
  }finally{await h.close();}
});

test('storage failure preserves generated audio in the session and reports the persistence limit',async()=>{
  const h=await harness();try{
    await h.plan();globalThis.indexedDB=undefined;
    await h.click('play',text=>text.includes('Audio could not be saved'));
    assert.equal(h.synthesis.length,4);assert.match(h.$('status').textContent,/unavailable/);
    await h.click('play',text=>text.includes('Audio could not be saved'));assert.equal(h.synthesis.length,4);
  }finally{await h.close();}
});

// Delay the commit notifications while retaining actual IndexedDB writes. This
// models a slow device without substituting the playback or recording code.
function holdRecordingCommits(){
  const put=IDBObjectStore.prototype.put,held=[];
  IDBObjectStore.prototype.put=function(...args){
    if(this.name==='recordings'){
      const transaction=this.transaction;
      const current=transaction.oncomplete;
      if(current){transaction.oncomplete=null;transaction.addEventListener('complete',event=>held.push(()=>current.call(transaction,event)),{once:true});}
      else Object.defineProperty(transaction,'oncomplete',{configurable:true,set(handler){
        transaction.addEventListener('complete',event=>held.push(()=>handler.call(transaction,event)),{once:true});
      }});
    }
    return put.apply(this,args);
  };
  return {held,release(){for(const finish of held.splice(0))finish();},restore(){IDBObjectStore.prototype.put=put;}};
}

test('slow recording commits never gate speech, prefetch or subsequent passages, and all audio is eventually saved',async()=>{
  const h=await harness();let commits;
  try{
    await h.plan();commits=holdRecordingCommits();h.$('play').click();
    await until(()=>h.audios.length===4 && h.audios.every(audio=>audio.endedAt));
    assert.equal(h.synthesis.length,4);await until(()=>commits.held.length>=4);
    commits.restore();commits.release();
    await until(()=>h.$('status').textContent.includes('Playback finished'));
    const saved=await recordingFor(h.message.content);
    assert.equal(saved.blobs.filter(Boolean).length,4);assert.equal(saved.segments.length,4);
    assert.equal(Object.keys(saved.passages).length,4);
  }finally{commits?.restore();commits?.release();await h.close();}
});

test('stalled recording commits report a bounded save failure while session replay needs no new speech',async()=>{
  const h=await harness(),setTimer=globalThis.setTimeout;let commits;
  try{
    await h.plan();commits=holdRecordingCommits();
    globalThis.setTimeout=(callback,ms,...args)=>setTimer(callback,ms===5000?50:ms,...args);
    h.$('play').click();
    await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.match(h.$('status').textContent,/storage is taking too long/);
    assert.match(h.$('status').textContent,/pending saves continue in the background/);
    assert.equal(h.audios.length,4);assert.equal(h.synthesis.length,4);
    h.$('play').click();await until(()=>h.audios.length===8 && h.$('status').textContent.includes('Playback finished'));
    assert.equal(h.synthesis.length,4);
    commits.restore();commits.release();await tick();
    const saved=await recordingFor(h.message.content);
    assert.equal(saved.blobs.filter(Boolean).length,4);assert.equal(saved.segments.length,4);
  }finally{globalThis.setTimeout=setTimer;commits?.restore();commits?.release();await h.close();}
});

test('Stop remains immediate during delayed recording commits and late saves never restart speech',async()=>{
  const h=await harness();let commits;
  try{
    await h.plan();commits=holdRecordingCommits();h.state.blockAudio=true;h.$('play').click();
    await until(()=>h.audios[0]?.paused===false && commits.held.length>0);
    h.$('stop').click();assert.equal(h.$('status').textContent,'Stopped.');
    assert.ok(h.audios.every(audio=>audio.paused));
    commits.restore();commits.release();await tick();await tick();
    assert.equal(h.synthesis.length,1);assert.ok(h.audios.every(audio=>audio.paused));assert.equal(h.$('status').textContent,'Stopped.');
  }finally{commits?.restore();commits?.release();await h.close();}
});

test('Stop interrupts the final recording-save wait while completed audio still commits',async()=>{
  const h=await harness();let commits;
  try{
    await h.plan();commits=holdRecordingCommits();h.$('play').click();
    await until(()=>h.audios.length===4 && h.audios.every(audio=>audio.endedAt));
    assert.equal(h.$('status').textContent.includes('Playback finished'),false);
    h.$('stop').click();assert.equal(h.$('status').textContent,'Stopped.');
    commits.restore();commits.release();await tick();await tick();
    assert.equal(h.$('status').textContent,'Stopped.');assert.equal(h.synthesis.length,4);
    const saved=await recordingFor(h.message.content);assert.equal(saved.blobs.filter(Boolean).length,4);
  }finally{commits?.restore();commits?.release();await h.close();}
});

test('a transient audio-storage open failure is retried without disabling saved recordings',async()=>{
  let h;try{
    failIdbOpen=1;h=await harness();
    await h.plan();await h.play();
    assert.match(h.$('status').textContent,/Audio saved on this device/);
    assert.ok(await recordingFor(h.message.content));
  }finally{failIdbOpen=0;if(h)await h.close();}
});

test('a full replay keeps the current and previous passage generations but drops older ones',async()=>{
  const h=await harness();try{
    await h.plan();await h.play();
    const first=await recordingFor(h.message.content),firstKeys=Object.keys(first.passages || {});
    assert.ok(firstKeys.length>=4);
    h.connections.forEach(connection=>{connection.default_parameters={speed:1.2};});
    await h.reload();await h.play();
    const second=await recordingFor(h.message.content),secondKeys=Object.keys(second.passages || {});
    const secondGeneration=secondKeys.filter(key=>!firstKeys.includes(key));
    assert.equal(h.synthesis.length,8);
    assert.equal(second.blobs.length,second.segments.length);
    assert.equal(secondKeys.length,8);
    assert.ok(firstKeys.every(key=>secondKeys.includes(key)));
    h.connections.forEach(connection=>{connection.default_parameters={speed:1.4};});
    await h.reload();await h.play();
    const third=await recordingFor(h.message.content),thirdKeys=Object.keys(third.passages || {});
    assert.equal(h.synthesis.length,12);
    assert.equal(thirdKeys.length,8);
    assert.equal(firstKeys.filter(key=>thirdKeys.includes(key)).length,0);
    assert.ok(secondGeneration.every(key=>thirdKeys.includes(key)));
    assert.equal(third.blobs.length,third.segments.length);
  }finally{await h.close();}
});

test('playing one section does not discard the rest of a message’s saved audio',async()=>{
  const h=await harness();try{
    await toggle(h,'sectionButtons',true);await h.plan();await h.play();
    const first=await recordingFor(h.message.content),saved=Object.keys(first.passages || {}).length;
    assert.ok(saved>=4);
    await until(()=>h.footer.querySelectorAll('[data-choir-section]').length>=3);
    h.footer.querySelector('[data-choir-section]').click();
    await until(()=>h.$('status').textContent.includes('Playback finished'));
    const second=await recordingFor(h.message.content);
    assert.ok(Object.keys(second.passages || {}).length>=saved);
    assert.equal(second.segments.length,1);
  }finally{await h.close();}
});

const insertRecordings=async rows=>{
  const database=await openRecordings();
  await new Promise((resolve,reject)=>{
    const transaction=database.transaction('recordings','readwrite'),store=transaction.objectStore('recordings');
    for(const row of rows)store.put(row.value,row.key);
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
  });
  database.close();
};
const failRecordingPuts=()=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){
    if(this.name==='recordings')throw Object.assign(new Error('The quota has been exceeded.'),{name:'QuotaExceededError'});
    return put.apply(this,args);
  };
  return ()=>{IDBObjectStore.prototype.put=put;};
};

test('repairing a saved speech clip keeps the recording creation date and timed deadline',async()=>{
 const h=await harness();try{
  await h.plan();await h.play();h.$('retention').value='7';h.$('retention').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  const row=(await recordings()).find(row=>row.value.content===h.message.content);row.value.createdAt=Date.now()-6*86400000;row.value.expiresAt=row.value.createdAt+7*86400000;
  row.value.blobs[0]=undefined;for(const key of Object.keys(row.value.passages))if(key.includes('At dawn'))delete row.value.passages[key];await insertRecordings([row]);
  await h.reload();await h.plan();await h.play();const after=await recordingFor(h.message.content);
  assert.equal(after.createdAt,row.value.createdAt);assert.equal(after.expiresAt,row.value.expiresAt);assert.equal(after.fullMessage,true);assert.ok(after.blobs[0]);
 }finally{await h.close();}
});

test('new recordings use changed global defaults without extending existing recordings in the chat',async()=>{
 const h=await harness();try{
  await h.plan();await h.play();h.$('retention').value='1';h.$('retention').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  const previous=await recordingFor(h.message.content),oldContent=h.message.content;
  h.store.set('settings:global',{...h.store.get('settings:global'),retention:'7'});
  h.$('chunk').value='1700';h.$('chunk').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  assert.equal((await recordingFor(oldContent)).expiresAt,previous.expiresAt,'inheriting a new default during an unrelated save must not change existing audio');
  h.message.id='next-message';h.message.content='The next morning. "Welcome again."';await h.plan();await h.click('play',text=>text.includes('Playback finished'));
  const next=await recordingFor(h.message.content);assert.equal(next.retention,'7');assert.equal(next.expiresAt,next.createdAt+7*86400000);
  h.$('chunk').value='1600';h.$('chunk').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  const old=await recordingFor(oldContent);assert.equal(old.expiresAt,previous.expiresAt);assert.equal(old.retention,'1');
 }finally{await h.close();}
});

test('drawer Replay refuses an interrupted recording with missing speech without synthesizing or saving a partial mix',async()=>{
 const h=await harness();try{
  await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios[0]?.paused===false);h.$('stop').click();await tick();await tick();
  const before=await recordingFor(h.message.content),calls=h.synthesis.length;assert.ok(before.blobs.filter(Boolean).length<before.segments.length);
  [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('Some speech is missing'));
  assert.equal(h.synthesis.length,calls);assert.equal((await recordingFor(h.message.content)).playedAudio?.blob,before.playedAudio?.blob);
 }finally{await h.close();}
});

test('audio expiring during playback is not saved again with a fresh retention clock',async()=>{
 const h=await harness();const originalNow=Date.now;try{
  await h.plan();await h.play();h.$('retention').value='1';h.$('retention').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  const before=await recordingFor(h.message.content),count=h.audios.length;h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.length>count && !h.audios.at(-1).paused);
  Date.now=()=>before.expiresAt+1;h.state.blockAudio=false;h.audios.at(-1).onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.equal(await recordingFor(h.message.content),null);
 }finally{Date.now=originalNow;await h.close();}
});

test('timed retention updates the stored policy and Replay cannot restore indefinite storage',async()=>{
 const h=await harness();try{
  await h.plan();await h.play();const calls=h.synthesis.length;
  for(const policy of ['7','30','1']){
   h.$('retention').value=policy;h.$('retention').dispatchEvent(new h.dom.window.Event('change'));
   await until(()=>h.$('saveState').textContent==='Saved automatically');
   const record=await recordingFor(h.message.content);assert.equal(record.retention,policy);assert.equal(record.expiresAt,record.createdAt+Number(policy)*86400000);
  }
  const before=await recordingFor(h.message.content);assert.equal(before.retention,'1');assert.equal(before.expiresAt,before.createdAt+86400000);
  [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent==='Replay finished.');
  const after=await recordingFor(h.message.content);assert.equal(after.retention,'1');assert.equal(after.expiresAt,before.expiresAt);assert.equal(h.synthesis.length,calls);
  const realNow=Date.now;try{Date.now=()=>after.expiresAt+1;
   [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('No saved audio'));
   assert.equal(await recordingFor(h.message.content),null);
  }finally{Date.now=realNow;}
 }finally{await h.close();}
});

test('changing persistent audio to session retention keeps it playable in memory and removes its disk copy',async()=>{
 const h=await harness();try{
  await h.plan();await h.play();const calls=h.synthesis.length;
  h.$('retention').value='session';h.$('retention').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  assert.equal(await recordingFor(h.message.content),null);
  [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent==='Replay finished.' || h.$('status').textContent.includes('No saved audio'));
  assert.equal(h.$('status').textContent,'Replay finished.');assert.equal(h.synthesis.length,calls);assert.equal(await recordingFor(h.message.content),null);
  await h.reload();[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('No saved audio'));
 }finally{await h.close();}
});

test('Replay preserves the deadline of recordings saved by older versions with a stale indefinite label',async()=>{
 const h=await harness();try{
  h.$('retention').value='7';h.$('retention').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  await h.plan();await h.play();const rows=await recordings(),row=rows.find(row=>row.value.content===h.message.content);
  row.value.retention='forever';row.value.expiresAt=Date.now()+86400000;await insertRecordings([row]);
  [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent==='Replay finished.');
  assert.equal((await recordingFor(h.message.content)).expiresAt,row.value.expiresAt);
  h.$('retention').value='forever';h.$('retention').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  assert.equal((await recordingFor(h.message.content)).expiresAt,null,'a deliberate policy change replaces the legacy deadline');
 }finally{await h.close();}
});

test('the minute cleanup removes expired disk records without requiring a replay or chat change',async()=>{
 const originalInterval=globalThis.setInterval;let sweep,h;
 globalThis.setInterval=(callback,delay,...args)=>{if(delay===60000)sweep=callback;return originalInterval(callback,delay,...args);};
 try{
  h=await harness();assert.equal(typeof sweep,'function');
  const namespace=h.store.get('audio:namespace'),key=JSON.stringify([namespace,'chat-old','expired-idle']);
  await insertRecordings([{key,value:{createdAt:1,retention:'1',expiresAt:Date.now()-1,blobs:[new Blob(['speech'])],passages:{music:new Blob(['music'])},playedAudio:{blob:new Blob(['mix'])}}}]);
  sweep();await tick();await tick();assert.equal((await recordings()).some(row=>row.key===key),false);
 }finally{globalThis.setInterval=originalInterval;await h?.close();}
});

test('expired recordings are physically pruned on visibility return and cannot be revived by a longer policy',async()=>{
 const h=await harness();try{
  const namespace=h.store.get('audio:namespace'),now=Date.now(),key=id=>JSON.stringify([namespace,'chat-a',id]);
  const row=(id,retention,expiresAt)=>({key:key(id),value:{content:id,createdAt:now-2*86400000,retention,expiresAt,segments:[],blobs:[new Blob(['speech'])],passages:{sound:new Blob(['music'])},playedAudio:{blob:new Blob(['mix'])}}});
  await insertRecordings([row('expired','1',now-1),row('future','7',now+86400000),row('forever','forever',null),{...row('foreign','1',now-1),key:JSON.stringify(['another-extension','chat-a','foreign'])}]);
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new h.dom.window.Event('visibilitychange'));await tick();await tick();
  let rows=await recordings();assert.equal(rows.some(row=>row.key===key('expired')),false);assert.ok(rows.some(row=>row.key===key('future')));assert.ok(rows.some(row=>row.key===key('forever')));assert.ok(rows.some(row=>JSON.parse(row.key)[0]==='another-extension'));
  await insertRecordings([row('expired-again','1',now-1)]);
  h.$('retention').value='7';h.$('retention').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('saveState').textContent==='Saved automatically');
  rows=await recordings();assert.equal(rows.some(row=>row.key===key('expired-again')),false);
 }finally{await h.close();}
});

test('a quota failure never deletes audio saved with indefinite retention and reports the limit',async()=>{
  const h=await harness();try{
    const namespace=h.store.get('audio:namespace'),key=JSON.stringify([namespace,'chat-old','message-old']);
    await insertRecordings([{key,value:{content:'Old reply',createdAt:1,retention:'forever',expiresAt:null,segments:[],blobs:[],passages:{}}}]);
    const restore=failRecordingPuts();
    try{await h.plan();await h.play();}finally{restore();}
    assert.match(h.$('status').textContent,/storage is full/i);
    assert.match(h.$('status').textContent,/Indefinitely/i);
    assert.ok((await recordings()).some(row=>row.key===key));
  }finally{await h.close();}
});

test('quota cleanup removes only expired recordings and keeps indefinite and unexpired audio',async()=>{
  const h=await harness();try{
    const namespace=h.store.get('audio:namespace'),now=Date.now();
    await insertRecordings([
      {key:JSON.stringify([namespace,'chat-old','expired']),value:{content:'Expired reply',createdAt:1,retention:'1',expiresAt:now-1000,segments:[],blobs:[],passages:{}}},
      {key:JSON.stringify([namespace,'chat-old','forever']),value:{content:'Forever reply',createdAt:2,retention:'forever',expiresAt:null,segments:[],blobs:[],passages:{}}},
      {key:JSON.stringify([namespace,'chat-old','later']),value:{content:'Later reply',createdAt:3,retention:'7',expiresAt:now+86400000,segments:[],blobs:[],passages:{}}}
    ]);
    const restore=failRecordingPuts();
    try{await h.plan();await h.play();}finally{restore();}
    const identities=(await recordings()).map(row=>JSON.parse(row.key)[2]);
    assert.equal(identities.includes('expired'),false);
    assert.ok(identities.includes('forever'));
    assert.ok(identities.includes('later'));
  }finally{await h.close();}
});

test('quota cleanup keeps the recording for the message being played',async()=>{
  const h=await harness();try{
    await h.plan();await h.play();
    const current=(await recordings()).find(row=>row.value?.content===h.message.content);
    assert.ok(current);
    h.connections.forEach(connection=>{connection.default_parameters={speed:1.2};});
    const restore=failRecordingPuts();
    try{await h.play();}finally{restore();}
    assert.match(h.$('status').textContent,/storage is full/i);
    const saved=(await recordings()).find(row=>row.key===current.key);
    assert.ok(saved);
    assert.deepEqual(saved.value.blobs,current.value.blobs);
  }finally{await h.close();}
});

test('an asynchronous quota error is reported without a null message and recovers',async()=>{
  const h=await harness();try{
    const namespace=h.store.get('audio:namespace'),now=Date.now();
    const currentKey=JSON.stringify([namespace,'chat-a','message-a']);
    await insertRecordings([
      {key:currentKey,value:{content:'Old version',createdAt:1,retention:'forever',expiresAt:null,segments:[],blobs:[],passages:{}}},
      {key:JSON.stringify([namespace,'chat-old','expired']),value:{content:'Expired reply',createdAt:2,retention:'1',expiresAt:now-1000,segments:[],blobs:[],passages:{}}}
    ]);
    const put=IDBObjectStore.prototype.put,add=IDBObjectStore.prototype.add;
    const quotaError=Object.assign(new Error('The quota has been exceeded.'),{name:'QuotaExceededError'});
    let first=true;
    IDBObjectStore.prototype.put=function(...args){
      if(first && this.name==='recordings'){
        first=false;
        // A real asynchronous request error (duplicate key), relabelled as the
        // quota failure the browser reports through the transaction event.
        const request=add.call(this,...args);
        Object.defineProperty(request,'error',{configurable:true,get:()=>quotaError,set:()=>{}});
        return request;
      }
      return put.apply(this,args);
    };
    try{await h.plan();await h.play();}finally{IDBObjectStore.prototype.put=put;}
    assert.doesNotMatch(h.$('status').textContent,/Cannot read properties of null/);
    assert.match(h.$('status').textContent,/Audio saved on this device/);
    const rows=await recordings();
    assert.ok(rows.some(row=>row.key===currentKey));
    assert.equal(rows.some(row=>JSON.parse(row.key)[2]==='expired'),false);
  }finally{await h.close();}
});

test('duplicate prefetched passages share one synthesis request',async()=>{
  const h=await harness();try{
    h.message.content='At dawn. At dawn.';h.$('prefetch').value='1';h.$('concurrency').value='2';h.state.delay=30;
    await h.plan();await h.play();assert.equal(h.synthesis.length,1);assert.equal(h.audios.length,2);
  }finally{await h.close();}
});

test('character exclusions preserve attribution and reenabling generates only those characters',async()=>{
  const h=await harness();try{
    await h.plan();
    document.querySelector('[aria-label="Mira no voice"]').click();document.querySelector('[aria-label="Guard no voice"]').click();await tick();await h.play();
    assert.deepEqual(h.synthesis.map(input=>input.voice),['n','n']);assert.equal(h.$('preview').querySelectorAll('.et-card').length,4);
    document.querySelector('[aria-label="Mira no voice"]').click();document.querySelector('[aria-label="Guard no voice"]').click();await tick();await h.play();
    assert.deepEqual(h.synthesis.slice(2).map(input=>input.voice),['m','g']);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
  }finally{await h.close();}
});

test('cancellation during audio decoding never starts the decoded passage',async()=>{
  const h=await harness(),originalContext=globalThis.AudioContext;let decode;
  globalThis.AudioContext=class{async resume(){}decodeAudioData(){return new Promise(resolve=>decode=resolve);}async close(){}};
  try{
    await h.plan();h.$('play').click();await until(()=>decode);assert.equal(h.$('pause').disabled,true);
    h.$('stop').click();decode({numberOfChannels:1,getChannelData:()=>new Float32Array([0.1])});await tick();
    assert.ok(h.audios.every(audio=>audio.paused));assert.match(document.querySelector('[data-choir-mixer]').textContent,/Ready to play/);
  }finally{globalThis.AudioContext=originalContext;await h.close();}
});

test('connection tests are independent; Jev fallback is off by default and keys never enter saved settings or cast export',async()=>{
  const h=await harness();try{
    assert.equal(h.$('setupGuide'),null);await h.click('testPlanner',text=>text.includes('Planner test passed'));assert.equal(h.synthesis.length,0);
    await h.click('testTts',text=>text.includes('Audition finished'));assert.equal(h.requests.filter(r=>r.action==='plan').length,0);assert.equal(h.synthesis.length,1);
    h.$('plannerMode').value='jev';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));h.$('jevKey').value='secret-jev-session';
    await h.click('latest',text=>text.includes('The object cannot be cloned'));assert.equal(h.requests.filter(r=>r.action==='plan').length,0);
    h.$('allowLlmFallback').checked=true;h.$('allowLlmFallback').dispatchEvent(new h.dom.window.Event('change'));await h.plan();
    assert.match(h.$('status').textContent,/Jev failed.*The object cannot be cloned/);
    h.$('exportCast').click();const exported=JSON.parse(h.$('castJson').value);assert.equal(exported.fixed[2].aliases[0],'Captain');
    assert.ok(!JSON.stringify([...h.store.values()]).includes('secret-jev-session'));assert.ok(!h.$('castJson').value.includes('secret-jev-session'));
    const before=h.store.get('chat:chat-a');h.$('castJson').value=JSON.stringify({...exported,fixed:exported.fixed.map(actor=>({...actor,voice:'missing'}))});
    await h.click('importCast',text=>text.includes('not in the selected'));assert.deepEqual(h.store.get('chat:chat-a'),before);
    h.$('castJson').value=JSON.stringify(exported);await h.click('importCast',text=>text.includes('Cast imported'));assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
  }finally{await h.close();}
});

test('compact cast editors retain hidden preferences through save, recasting and reload',async()=>{
  const h=await harness();try{
    const row=h.$('fixed').querySelectorAll('.et-card')[2],edit=row.querySelector('[data-choir-edit]'),editor=row.querySelector('[data-choir-cast-editor]');
    assert.equal(editor.hidden,true);assert.equal(row.querySelector('strong').textContent,'Mira');edit.click();assert.equal(editor.hidden,false);
    row.querySelector('[data-choir-voice]').value='new';edit.click();assert.equal(editor.hidden,true);
    await h.plan();await h.click('save',text=>text.includes('retention saved'));const actor=h.store.get('chat:chat-a').fixed[2];
    assert.equal(actor.voice,'new');assert.equal(actor.route,'native:b');assert.deepEqual(actor.aliases,['Captain']);assert.equal(actor.pronunciation,'Mira: mee-rah');assert.equal(actor.accent,'Irish');
    await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-cast-editor]')[2].hidden,true);assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
    await h.play();assert.equal(h.synthesis.find(input=>input.connectionId==='b').voice,'new');
    h.$('add').click();const added=h.$('fixed').lastElementChild;assert.equal(added.querySelector('[data-choir-cast-editor]').hidden,false);
    const name=added.querySelector('input');name.value='Echo';name.dispatchEvent(new h.dom.window.Event('input'));assert.equal(added.querySelector('strong').textContent,'Echo');
  }finally{await h.close();}
});

test('next skips a whole multi-chunk block; previous reuses audio, paused navigation and seeking preserve position',async()=>{
  const h=await harness();try{
    h.message.content='The hall was silent '.repeat(65)+'. "Hello." The door closed.';await h.plan();const planned=h.requests.filter(r=>r.action==='plan').length;h.state.blockAudio=true;
    h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false && !h.$('next').disabled);assert.equal(h.synthesis.length,1);
    const first=h.audios[0];h.$('pause').click();assert.equal(first.paused,true);h.$('next').click();
    await until(()=>h.audios.length===2 && !h.$('next').disabled);assert.equal(h.synthesis[1].voice,'m');assert.equal(h.audios[1].paused,true);assert.equal(h.$('pause').getAttribute('aria-label'),'Resume Choir audio');
    const seek=document.querySelector('[data-choir-mixer] [aria-label="Seek in current spoken block"]');seek.value='7.5';seek.dispatchEvent(new h.dom.window.Event('input'));await tick();
    assert.equal(h.audios[1].currentTime,7.5);assert.equal(h.store.get('position:chat-a').seconds,7.5);assert.equal(h.store.get('position:chat-a').passage,1);assert.equal(h.synthesis.length,2);
    h.$('previous').click();await until(()=>h.audios.length===3 && !h.$('next').disabled);assert.equal(h.synthesis.length,2);assert.equal(h.audios[2].paused,true);
    h.$('next').click();await until(()=>h.audios.length===4 && !h.$('next').disabled);assert.equal(h.synthesis.length,2);
    h.$('pause').click();assert.equal(h.audios[3].paused,false);h.$('next').click();
    await until(()=>h.audios.length===5 && h.audios[4].paused===false);assert.equal(h.synthesis.length,3);assert.match(h.synthesis[2].text,/door closed/);
    h.$('next').click();await until(()=>h.$('status').textContent.includes('Playback finished'));assert.equal(h.$('next').disabled,true);assert.equal(h.$('previous').disabled,true);assert.equal(seek.parentElement.hidden,true);
    assert.equal(h.requests.filter(r=>r.action==='plan').length,planned);
  }finally{await h.close();}
});

test('a failed prefetched chunk can be skipped; cancellation disables transport and preserves completed audio',async()=>{
  const h=await harness();try{
    h.message.content=Array.from({length:160},(_,index)=>`lantern${index}`).join(' ')+'. "Hello."';h.$('prefetch').value='1';h.state.failSynthesisAt=2;h.state.blockAudio=true;await h.plan();
    h.$('play').click();await until(()=>h.synthesis.length===2 && h.audios[0]?.paused===false);await tick();h.$('next').click();
    await until(()=>h.audios.length===2 && h.audios[1].paused===false);assert.equal(h.synthesis[2].voice,'m');assert.equal(h.synthesis.length,3);
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('Ready.'));assert.ok(h.audios.every(audio=>audio.paused));assert.equal(h.$('next').disabled,true);
    h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('restored'));
    h.state.failSynthesisAt=null;h.footer.querySelector('button').click();await until(()=>h.audios.length===3 && h.audios[2].paused===false);await tick();assert.equal(h.synthesis.length,4); // only the formerly failed prefetched chunk is new
  }finally{await h.close();}
});

test('saved recording playback supports previous, next and seeking without synthesis',async()=>{
  const h=await harness();try{
    await h.plan();await h.play();const generated=h.synthesis.length,before=h.audios.length;h.state.blockAudio=true;
    [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.audios.length===before+1 && !h.$('next').disabled);
    h.$('next').click();await until(()=>h.audios.length===before+2 && !h.$('next').disabled);assert.match(document.querySelector('[data-choir-mixer]').textContent,/Speaking: Mira/);
    h.$('previous').click();await until(()=>h.audios.length===before+3 && !h.$('previous').disabled);assert.match(document.querySelector('[data-choir-mixer]').textContent,/Speaking: Narrator/);
    const seek=document.querySelector('[data-choir-mixer] [aria-label="Seek in current spoken block"]');seek.value='9';seek.dispatchEvent(new h.dom.window.Event('input'));assert.equal(h.audios.at(-1).currentTime,9);
    h.$('stop').click();await tick();assert.equal(h.synthesis.length,generated);assert.equal(h.store.get('position:chat-a').seconds,9);assert.equal(h.$('previous').disabled,true);
  }finally{await h.close();}
});

test('previous remains available before a saved resume point and does not reapply the old seek offset',async()=>{
  const h=await harness();try{
    await h.plan();await h.play();const generated=h.synthesis.length;h.state.blockAudio=true;h.$('play').click();await until(()=>!h.$('next').disabled);
    h.$('next').click();await until(()=>document.querySelector('[data-choir-mixer]').textContent.includes('Speaking: Mira') && !h.$('next').disabled);
    const slider=document.querySelector('[data-choir-mixer] [aria-label="Seek in current spoken block"]');slider.value='8';slider.dispatchEvent(new h.dom.window.Event('input'));h.$('stop').click();await tick();await h.reload();
    h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false && !h.$('previous').disabled);assert.equal(h.audios.at(-1).currentTime,8);
    const before=h.audios.length;h.$('previous').click();await until(()=>h.audios.length===before+1 && !h.$('next').disabled);assert.match(document.querySelector('[data-choir-mixer]').textContent,/Speaking: Narrator/);
    h.$('next').click();await until(()=>h.audios.length===before+2 && !h.$('next').disabled);assert.match(document.querySelector('[data-choir-mixer]').textContent,/Speaking: Mira/);assert.equal(h.audios.at(-1).currentTime,0);
    assert.equal(h.synthesis.length,generated);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
  }finally{await h.close();}
});


test('drawer Stop shares the mixer transport; legacy solo and passage selections do not hide audio',async()=>{
  const h=await harness({master:1,channels:{Mira:{volume:1,solo:true},Narrator:{volume:1,mute:false}}});try{
    await h.plan();for(const [key,value] of h.store)if(key.startsWith('plan:'))h.store.set(key,{...value,excluded:[0]});await h.reload();
    for(const name of ['play','pause','next','previous','playSelected','resumePosition','seekHost'])assert.equal(h.root.querySelector('[data-et="'+name+'"]'),null);
    assert.equal(h.root.querySelector('[data-et="stop"]').disabled,true);
    assert.equal(h.root.querySelector('[aria-label^="Select passage"]'),null);assert.equal(h.root.querySelector('[aria-label^="Exclude passage"]'),null);
    assert.equal(h.root.querySelector('[data-et="planDetails"]').open,false);assert.equal(h.footer.querySelector('[aria-label="Next spoken block"]'),null);assert.equal(h.footer.querySelector('input[type="range"]'),null);
    assert.equal(document.querySelectorAll('[aria-label="Next spoken block"]').length,1);assert.equal(document.querySelector('[aria-label="Mira solo"]'),null);
    h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false);assert.equal(h.audios.at(-1).volume,1);
    document.querySelector('[aria-label="Narrator silent"]').click();assert.equal(h.audios.at(-1).volume,0);h.$('stop').click();await tick();await h.reload();
    assert.equal(document.querySelector('[aria-label="Narrator silent"]').getAttribute('aria-pressed'),'true');assert.equal(h.$('preview').querySelectorAll('.et-card').length,4);
  }finally{await h.close();}
});

test('No voice skips an in-flight failed speaker, persists per chat and reenables only missing audio',async()=>{
  const h=await harness();try{
    await h.plan();h.state.delay=80;h.state.failVoice='n';h.$('play').click();await until(()=>h.synthesis.length===1);
    document.querySelector('[aria-label="Narrator no voice"]').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
    assert.deepEqual(h.synthesis.map(v=>v.voice),['n','m','g']);assert.equal(h.audios.length,2);assert.equal(h.$('preview').querySelectorAll('.et-card').length,4);
    await h.reload();assert.equal(document.querySelector('[aria-label="Narrator no voice"]').getAttribute('aria-pressed'),'true');
    h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('Ready.'));assert.equal(document.querySelector('[aria-label="Narrator no voice"]'),null);assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(),false);
    h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('status').textContent.includes('restored'));assert.equal(document.querySelector('[aria-label="Narrator no voice"]').getAttribute('aria-pressed'),'true');
    h.state.failVoice=null;h.state.delay=0;document.querySelector('[aria-label="Narrator no voice"]').click();await tick();await h.play();
    assert.deepEqual(h.synthesis.slice(3).map(v=>v.voice),['n','n']);assert.equal(h.requests.filter(v=>v.action==='plan').length,1);
  }finally{await h.close();}
});

test('One TTS routes the entire cast without replanning and Several TTS restores saved character routes',async()=>{
  const h=await harness();try{
    await h.plan();await h.play();const planned=h.requests.filter(v=>v.action==='plan').length;
    h.$('connectionMode').value='one';h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.startsWith('One TTS now'));
    assert.ok(JSON.parse(h.$('planJson').value).segments.every(v=>v.route==='native:a'));assert.equal(h.store.get('chat:chat-a').fixed[2].route,'native:b');
    assert.ok([...h.$('fixed').querySelectorAll('[data-choir-route]')].every(v=>v.parentElement.hidden));
    const voices=h.$('fixed').querySelectorAll('[data-choir-voice]');voices[2].value='new';await h.click('save',text=>text.includes('retention saved'));await h.play();
    assert.equal(h.synthesis.at(-1).connectionId,'a');assert.equal(h.synthesis.at(-1).voice,'new');assert.equal(h.requests.filter(v=>v.action==='plan').length,planned);
    await h.reload();assert.equal(h.$('connectionMode').value,'one');assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'new');
    h.$('connectionMode').value='several';h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.startsWith('Several TTS restored'));
    assert.equal(h.$('fixed').querySelectorAll('[data-choir-route]')[2].value,'native:b');assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');
    const before=h.synthesis.length;await h.play();assert.equal(h.synthesis.length,before);assert.equal(h.requests.filter(v=>v.action==='plan').length,planned);
  }finally{await h.close();}
});


test('No voice skips already cached audio and changing it during paused playback preserves the pause',async()=>{
 const h=await harness();try{
  await h.plan();await h.play();const generated=h.synthesis.length;
  document.querySelector('[aria-label="Mira no voice"]').click();await tick();const count=h.audios.length;await h.play();assert.equal(h.audios.length-count,3);assert.equal(h.synthesis.length,generated);
  document.querySelector('[aria-label="Mira no voice"]').click();await tick();h.state.blockAudio=true;h.footer.querySelector('button').click();await until(()=>!h.$('next').disabled);h.$('next').click();await until(()=>document.querySelector('[data-choir-mixer]').textContent.includes('Speaking: Mira') && !h.$('next').disabled);
  h.$('pause').click();document.querySelector('[aria-label="Mira no voice"]').click();await until(()=>document.querySelector('[data-choir-mixer]').textContent.includes('Speaking: Guard') && !h.$('next').disabled);assert.equal(h.audios.at(-1).paused,true);assert.equal(h.synthesis.length,generated);
  h.$('stop').click();await tick();document.querySelector('[aria-label="Mira no voice"]').click();await tick();h.state.blockAudio=false;await h.play();assert.equal(h.synthesis.length,generated);
 }finally{await h.close();}
});

test('One TTS changes the whole cast connection and restores each provider voice choice without replanning',async()=>{
 const h=await harness();try{
  await h.plan();h.$('connectionMode').value='one';h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.startsWith('One TTS now'));
  h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value='new';await h.click('save',text=>text.includes('retention saved'));await h.play();const planned=h.requests.filter(v=>v.action==='plan').length;
  h.$('connection').value='b';h.$('connection').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.includes('Provider selected.'));
  assert.ok(JSON.parse(h.$('planJson').value).segments.every(v=>v.route==='native:b'));await h.click('save',text=>text.includes('retention saved'));const before=h.synthesis.length;await h.play();assert.ok(h.synthesis.slice(before).every(v=>v.connectionId==='b'));
  h.$('connection').value='a';h.$('connection').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.includes('Provider selected.'));
  assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'new');assert.ok(JSON.parse(h.$('planJson').value).segments.every(v=>v.route==='native:a'));assert.equal(h.requests.filter(v=>v.action==='plan').length,planned);
 }finally{await h.close();}
});


test('One TTS rejects an unavailable manually selected voice instead of silently replacing it',async()=>{
 const h=await harness();try{
  await h.plan();h.$('connectionMode').value='one';h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.startsWith('One TTS now'));
  const voice=h.$('fixed').querySelectorAll('[data-choir-voice]')[2],option=document.createElement('option');option.value='missing-voice';option.textContent='Missing';voice.append(option);voice.value='missing-voice';h.$('save').click();await until(()=>h.$('status').classList.contains('et-error'));
  assert.match(h.$('status').textContent,/voice/i);assert.equal(h.synthesis.length,0);assert.equal(h.requests.filter(v=>v.action==='plan').length,1);
 }finally{await h.close();}
});


test('NPC No voice follows the character across One TTS provider changes and can be cleared there',async()=>{
 const h=await harness();try{
  await h.plan();document.querySelector('[aria-label="Guard no voice"]').click();await tick();
  h.$('connectionMode').value='one';h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.startsWith('One TTS now'));
  h.$('connection').value='b';h.$('connection').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.includes('Provider selected.'));
  assert.equal(document.querySelector('[aria-label="Guard no voice"]').getAttribute('aria-pressed'),'true');await h.click('save',text=>text.includes('retention saved'));await h.play();assert.ok(!h.synthesis.some(v=>v.text.includes('Wait')));
  document.querySelector('[aria-label="Guard no voice"]').click();await tick();const before=h.synthesis.length;await h.play();assert.equal(h.synthesis.length,before+1);assert.match(h.synthesis.at(-1).text,/Wait/);
  h.$('connection').value='a';h.$('connection').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.includes('Provider selected.'));assert.equal(document.querySelector('[aria-label="Guard no voice"]').getAttribute('aria-pressed'),'false');assert.equal(h.requests.filter(v=>v.action==='plan').length,1);
 }finally{await h.close();}
});

test('Fish automatic casting excludes foreign voice IDs and plays with the chosen reference ID in both TTS modes',async()=>{
 for(const mode of ['one','several']){
  const h=await harness();try{
   const fishId='0123456789abcdef0123456789abcdef';h.connections[1].provider='fish_audio';
   h.state.catalogues={a:{voices:[{id:'alloy',name:'Alloy'},{id:'coral',name:'Coral'}]},b:{voices:[{id:fishId,name:'Storyteller'}]}};
   h.state.allowedVoices={a:['alloy','coral'],b:[fishId]};h.state.planForCatalogue=true;
   const saved=h.store.get('chat:chat-a');saved.connectionMode=mode;saved.connection=mode==='one'?'b':'a';
   saved.fixed.forEach(actor=>{actor.voice='';});saved.casts={'native:a':[{speaker:'Guard',voice:'',style:''}],'native:b':[{speaker:'Guard',voice:'',style:''}]};
   saved.extraVoices=`${fishId} | A warm Irish storyteller.\nKore | Firm\nvoice_bespoke_old | Gemini design\ncoral | Bright`;
   h.store.set('chat:chat-a',saved);await h.reload();await h.plan();
   const planned=h.requests.find(request=>request.action==='plan').input.config;
   assert.deepEqual(planned.voices.filter(voice=>voice.route==='native:b').map(voice=>voice.id),[fishId]);
   assert.equal(planned.voices.find(voice=>voice.route==='native:b').description,'A warm Irish storyteller.');
   await h.play();assert.ok(h.synthesis.some(request=>request.connectionId==='b'));
   assert.ok(h.synthesis.filter(request=>request.connectionId==='b').every(request=>request.voice===fishId));
   await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,fishId);
   h.message.content='A new dawn. "Hello again."';await h.plan();await h.play();
   assert.ok(h.synthesis.filter(request=>request.connectionId==='b').every(request=>request.voice===fishId));
   if(mode==='one'){
    h.$('connection').value='a';h.$('connection').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.includes('Provider selected.'));
    await h.plan();const switched=h.requests.filter(request=>request.action==='plan').at(-1).input.config;
    assert.ok(switched.voices.every(voice=>voice.route==='native:a' && ['alloy','coral'].includes(voice.id)));
    await h.play();assert.ok(h.synthesis.filter(request=>request.connectionId==='a').every(request=>['alloy','coral'].includes(request.voice)));
   }
  }finally{await h.close();}
 }
});

test('Fish casting searches the community library by default, keeps the chosen voice in the cast and leaves My Fish voices unchanged',async()=>{
 const ownId='0123456789abcdef0123456789abcdef',communityId='fedcba9876543210fedcba9876543210';
 const h=await harness();try{
  h.connections[1].provider='fish_audio';h.state.catalogues={b:{voices:[{id:ownId,name:'Client voice'}]}};
  h.state.allowedVoices={a:['n','y','g'],b:[ownId,communityId]};h.state.planForCatalogue=true;
  h.state.communityVoice={id:communityId,description:'Ana — female, young, soft'};
  const saved=h.store.get('chat:chat-a');saved.fixed[2].voice='';h.store.set('chat:chat-a',saved);await h.reload();
  assert.equal(h.$('fishVoiceSource').value,'community');assert.equal(h.$('fishVoiceSourceWrap').hidden,false);
  await h.plan();
  assert.deepEqual({...h.requests.find(request=>request.action==='plan').input.config.communityRoutes},{'native:b':'community'});
  const chosen=()=>h.$('fixed').querySelectorAll('[data-choir-voice]')[2];
  assert.equal(chosen().value,communityId);assert.match(chosen().selectedOptions[0].textContent,/Ana — female, young, soft/);
  await h.play();assert.ok(h.synthesis.filter(request=>request.connectionId==='b').every(request=>request.voice===communityId));
  await h.reload();assert.equal(chosen().value,communityId);assert.doesNotMatch(chosen().selectedOptions[0].textContent,/unavailable/);
  assert.match(h.$('extraVoices').value,new RegExp(`${communityId} \\| Ana`));
  h.$('fishVoiceSource').value='own';h.$('fishVoiceSource').dispatchEvent(new h.dom.window.Event('change'));
  chosen().value='';chosen().dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  h.state.communityVoice={id:'00000000000000000000000000000000',description:'Unused'};h.message.content='A new dawn. "Hello again."';await h.plan();
  const own=h.requests.filter(request=>request.action==='plan').at(-1).input.config;
  assert.equal('communityRoutes' in own,false);assert.deepEqual(own.voices.filter(voice=>voice.route==='native:b').map(voice=>voice.id),[ownId,communityId]);
  assert.equal(chosen().value,communityId);assert.doesNotMatch(h.$('extraVoices').value,/Unused/);
 }finally{await h.close();}
});

test('GPT TTS retains unknown-gender choices, recovers built-in voices, and excludes saved Fish voices',async()=>{
 for(const failure of ['normal','empty','error','network']){
  const h=await harness();try{
   const fishId='0123456789abcdef0123456789abcdef';
   h.state.catalogues={a:failure==='normal'?{voices:[{id:'coral',name:'Coral'},{id:'onyx',name:'Onyx'}]}:failure==='error'?{voices:[],error:'Catalogue unavailable'}:{voices:[]}};h.state.failCatalogue=failure==='network';
   const saved=h.store.get('chat:chat-a');saved.connectionMode='one';saved.fixed.forEach(actor=>{actor.voice='';actor.gender='female';});saved.casts={'native:a':[]};
   saved.extraVoices=`${fishId} | Fish storyteller\nKore | Firm`;
   h.store.set('chat:chat-a',saved);h.state.planForCatalogue=true;h.message.content='At dawn. "Hello."';
   h.state.allowedVoices={a:['alloy','ash','ballad','cedar','coral','echo','fable','marin','nova','onyx','sage','shimmer','verse']};
   await h.reload();
   for(const select of h.$('fixed').querySelectorAll('[data-choir-voice]')){
    assert.ok([...select.options].some(option=>option.value==='coral'));
    assert.ok(![...select.options].some(option=>option.value===fishId || option.value==='Kore'));
   }
   await h.plan();assert.equal(h.requests.find(request=>request.action==='plan').input.config.voices.length,failure==='normal'?2:13);
   await h.play();assert.ok(h.synthesis.length);assert.ok(h.synthesis.every(request=>h.state.allowedVoices.a.includes(request.voice)));
   await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,failure==='normal'?'onyx':'verse');
  }finally{await h.close();}
 }
});

test('LLM-selected fixed and NPC voices persist across new replies and reload in both TTS modes',async()=>{
 for(const mode of ['several','one']){
  const h=await harness();try{
   if(mode==='one'){h.$('connectionMode').value='one';h.$('connectionMode').dispatchEvent(new h.dom.window.Event('change'));await until(()=>h.$('status').textContent.startsWith('One TTS now'));}
   for(const node of [h.$('fixed').querySelectorAll('[data-choir-voice]')[2],h.$('npcs').querySelector('[data-choir-voice]')]){node.value='';node.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));}
   await until(()=>h.$('saveState').textContent==='Saved automatically');await h.plan();
   assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');assert.equal(h.$('npcs').querySelector('[data-choir-voice]').value,'g');
   h.message.content='Another dawn. "Hello again." "Wait here." The gate closed.';await h.plan();
   const planned=h.requests.filter(v=>v.action==='plan').at(-1).input.config;assert.equal(planned.fixed.find(actor=>actor.speaker==='Mira').voice,'m');assert.equal(planned.npcs.find(actor=>actor.speaker==='Guard').voice,'g');
   await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');assert.equal(h.$('npcs').querySelector('[data-choir-voice]').value,'g');
  }finally{await h.close();}
 }
});

test('Let LLM choose makes and saves a real choice despite current or reloaded attribution and audio caches',async()=>{
 for(const reload of [false,true]){
  const h=await harness();try{
   await h.plan();await h.play();const voice=h.$('fixed').querySelectorAll('[data-choir-voice]')[2];voice.value='';voice.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
   await until(()=>h.$('saveState').textContent==='Saved automatically');if(reload)await h.reload();
   assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'');assert.equal(h.requests.filter(v=>v.action==='plan').length,1);
   await h.play();assert.equal(h.requests.filter(v=>v.action==='plan').length,2);assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');assert.equal(h.store.get('chat:chat-a').fixed[2].voice,'m');
   h.$('prefetch').value='2';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
   await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');await h.play();assert.equal(h.requests.filter(v=>v.action==='plan').length,2);
  }finally{await h.close();}
 }
});

test('LLM casting receives bounded character and persona descriptions with voice catalogue descriptions',async()=>{
 const h=await harness();try{
  h.state.character={name:'Mira',description:'A mature captain with a husky Irish voice. '+ 'Detail. '.repeat(1500),personality:'Calm, direct, and warm.',system_prompt:'Private card instructions',creator_notes:'Private notes'};
  h.state.persona={id:'persona-a',name:'Alex',description:'A young, softly spoken traveller.'};
  const name=h.$('fixed').children[2].querySelector('input');name.value='Captain Mira';name.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  await h.plan();const snapshot=h.requests.find(v=>v.action==='plan').input.config;
  assert.deepEqual(snapshot.characterProfiles,[{speaker:'Captain Mira',name:'Mira',role:'character',description:h.state.character.description.slice(0,8000),personality:h.state.character.personality,scenario:'',firstMessage:''},{speaker:'You',name:'Alex',role:'persona',description:h.state.persona.description,personality:''}]);
  assert.equal(snapshot.voices.find(voice=>voice.id==='m' && voice.route==='native:b').description,'A mature, husky Irish voice.');
  assert.ok(!JSON.stringify(snapshot).includes('Private'));assert.ok(!JSON.stringify(h.store.get('chat:chat-a')).includes('mature captain'));
  h.state.failProfile=true;h.message.content='A new dawn.';await h.plan();assert.equal(h.requests.filter(v=>v.action==='plan').at(-1).input.config.characterProfiles.length,1);
 }finally{await h.close();}
});

test('placeholder lead names resolve once the persona and character are known, without replacing typed names',async()=>{
 const h=await harness();try{
  const names=()=>[...h.$('fixed').children].map(row=>row.querySelector('input').value);
  // Lumiverse may bind a new chat's persona only after the chat opened.
  h.state.character={name:'Metamorphosis: Just the Way You Are!',first_mes:'April 6, 2015. Saki stood far off.'};h.state.active='chat-new';h.subscriptions.get('chat.active')();
  await until(()=>names()[2]==='Metamorphosis: Just the Way You Are!');
  assert.deepEqual(names(),['Narrator','Persona','Metamorphosis: Just the Way You Are!']);assert.equal(h.store.has('chat:chat-new'),false);
  h.state.persona={id:'persona-jay',name:'Jay'};h.subscriptions.get('persona.activeId')();
  await until(()=>h.store.get('chat:chat-new')?.fixed[1].speaker==='Jay');assert.deepEqual(names(),['Narrator','Jay','Metamorphosis: Just the Way You Are!']);
  // Existing chats saved with placeholders resolve on load; the chat's own persona wins over a stale global one.
  const saved=structuredClone(h.store.get('chat:chat-a'));
  h.store.set('chat:chat-old',{...saved,fixed:[saved.fixed[0],{...saved.fixed[1],speaker:'Persona'},{...saved.fixed[2],speaker:'Character'}]});
  h.store.set('chat:chat-typed',{...saved,fixed:[saved.fixed[0],{...saved.fixed[1],speaker:'Captain'},{...saved.fixed[2],speaker:'Sensei'}]});
  h.state.personas={'persona-saki':{id:'persona-saki',name:'Saki'}};h.state.chatPersona='persona-saki';h.state.character={name:'Mira'};
  h.state.active='chat-old';h.subscriptions.get('chat.active')();
  await until(()=>h.store.get('chat:chat-old')?.fixed[1].speaker==='Saki');
  assert.deepEqual(h.store.get('chat:chat-old').fixed.map(actor=>actor.speaker),['Narrator','Saki','Mira']);assert.deepEqual(h.store.get('chat:chat-old').fixed.map(actor=>actor.voice),['n','y','m']);
  h.state.active='chat-typed';h.subscriptions.get('chat.active')();
  await until(()=>h.$('saveState').textContent==='Saved settings restored' && names()[1]==='Captain');
  h.subscriptions.get('persona.activeId')();await tick();
  assert.deepEqual(names(),['Narrator','Captain','Sensei']);assert.equal(h.store.get('chat:chat-typed').fixed[1].speaker,'Captain');
 }finally{await h.close();}
});

test('Jev planning receives speaker profiles, recent context and the fallback choice',async()=>{
 const h=await harness();try{
  h.state.character={name:'Metamorphosis: Just the Way You Are!',description:'',scenario:'',first_mes:'April 6, 2015. Saki stood far off.'};
  h.state.persona={id:'persona-jay',name:'Jay',description:'A quiet young man.'};
  h.state.messages=[{id:'earlier',content:'"Thanks for today."',name:'Saki',is_user:false},h.message];
  h.$('plannerMode').value='jev';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  h.$('allowLlmFallback').checked=true;h.$('allowLlmFallback').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  await h.plan();
  const jev=h.requests.find(request=>request.action==='planJev').input;
  assert.equal(jev.config.allowLlmFallback,true);assert.match(jev.context,/Saki: "Thanks for today\."/);
  assert.deepEqual(jev.config.characterProfiles.map(profile=>[profile.speaker,profile.name,profile.role]),[['Mira','Metamorphosis: Just the Way You Are!','character'],['You','Jay','persona']]);
  assert.equal(jev.config.characterProfiles[0].firstMessage,'April 6, 2015. Saki stood far off.');
  assert.deepEqual(h.requests.find(request=>request.action==='plan').input.config.characterProfiles,jev.config.characterProfiles);
 }finally{await h.close();}
});

test('a chosen voice remains visible after a save failure and Retry save persists that choice',async()=>{
 const h=await harness();try{
  const voice=h.$('fixed').querySelectorAll('[data-choir-voice]')[2];voice.value='';voice.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
  h.state.failConfigSave=true;h.$('latest').click();await until(()=>h.$('status').textContent.includes('Settings storage failed') && !h.$('latest').disabled);
  assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');assert.equal(h.$('save').hidden,false);
  h.state.failConfigSave=false;await h.click('save',text=>text.includes('retention saved'));await h.reload();assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');
 }finally{await h.close();}
});

test('retrying failed planning asks the LLM for unassigned voices instead of restoring catalogue defaults',async()=>{
 const h=await harness();try{
  const voice=h.$('fixed').querySelectorAll('[data-choir-voice]')[2];voice.value='';voice.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
  h.state.failPlanAt=1;h.$('latest').click();await until(()=>h.$('status').textContent.includes('Planner quota exhausted') && !h.$('latest').disabled);
  assert.equal(h.store.get('chat:chat-a').fixed[2].voice,'');
  const before=h.requests.filter(v=>v.action==='plan');await h.plan();const after=h.requests.filter(v=>v.action==='plan');
  assert.equal(after[before.length].input.transcript,before[0].input.transcript);assert.equal(after[before.length].input.config.fixed[2].voice,'');
  assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'m');assert.equal(h.store.get('chat:chat-a').fixed[2].voice,'m');
 }finally{await h.close();}
});

test('cast and planner edits autosave without Save and survive reload without replanning',async()=>{
 const h=await harness();try{
  await h.plan();const edit=(node,value)=>{node.value=value;node.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));};
  const row=h.$('fixed').children[2];edit(row.querySelector('[data-choir-voice]'),'new');
  const fields=row.querySelectorAll('input');edit(fields[2],'Softer delivery');edit(fields[3],'Captain, Lady Mira');edit(fields[4],'mee-rah');edit(fields[5],'French');
  edit(h.$('planner'),'planner');h.$('normalizeLoudness').checked=false;h.$('normalizeLoudness').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(h.store.get('chat:chat-a').fixed[2].voice,'new');
  await h.reload();assert.equal(h.$('planner').value,'planner');assert.equal(h.$('normalizeLoudness').checked,false);assert.equal(h.$('fixed').querySelectorAll('[data-choir-voice]')[2].value,'new');
  await h.play();assert.equal(h.synthesis.find(v=>v.text.includes('Hello')).voice,'new');assert.equal(h.requests.filter(v=>v.action==='plan').length,1);
 }finally{await h.close();}
});

test('navigation flushes the old chat draft and new chats inherit connections without copying its cast',async()=>{
 const h=await harness();try{
  h.$('planner').value='planner';h.$('planner').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
  const name=h.$('fixed').children[2].querySelector('input');name.value='Captain Mira';name.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  h.state.active='chat-b';h.subscriptions.get('chat.active')();await until(()=>h.$('saveState').textContent==='Connection preferences restored');
  assert.equal(h.store.get('chat:chat-a').fixed[2].speaker,'Captain Mira');assert.equal(h.$('connection').value,'a');assert.equal(h.$('planner').value,'planner');assert.equal(h.$('fixed').children[2].querySelector('input').value,'Mira');
  h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('fixed').children[2]?.querySelector('input').value==='Captain Mira');assert.equal(h.$('planner').value,'planner');
 }finally{await h.close();}
});

test('provider selection persists even when its catalogue fails',async()=>{
 const h=await harness();try{
  h.state.failCatalogue=true;h.$('connection').value='b';h.$('connection').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await until(()=>h.$('status').textContent.includes('catalogue unavailable'));
  assert.equal(h.store.get('chat:chat-a').connection,'b');h.state.failCatalogue=false;await h.reload();assert.equal(h.$('connection').value,'b');
 }finally{await h.close();}
});

test('autosave serializes delayed writes, reports storage failure and recovers on the next edit',async()=>{
 const h=await harness();try{
  h.state.configDelay=200;h.$('plannerTokens').value='4096';h.$('plannerTokens').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,280));
  h.$('plannerTokens').value='6144';h.$('plannerTokens').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');assert.equal(h.store.get('chat:chat-a').plannerTokens,6144);
  h.state.configDelay=0;h.state.failConfigSave=true;h.$('prefetch').value='2';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent.includes('Save failed'));assert.equal(h.$('prefetch').value,'2');
  h.state.failConfigSave=false;h.$('prefetch').value='3';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');await h.reload();assert.equal(h.$('prefetch').value,'3');assert.equal(h.$('plannerTokens').value,'6144');
  assert.ok(!JSON.stringify(h.store.get('settings:global')).includes('jevApiKey'));
 }finally{await h.close();}
});

test('chat navigation cancels playback immediately while a pending settings save is slow',async()=>{
 const h=await harness();try{
  await h.plan();h.state.configDelay=200;h.$('plannerTokens').value='4096';h.$('plannerTokens').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  h.state.blockAudio=true;h.$('play').click();await until(()=>h.audios.at(-1)?.paused===false);
  h.state.active='chat-b';h.subscriptions.get('chat.active')();assert.ok(h.audios.every(audio=>audio.paused));assert.equal(h.$('next').disabled,true);
  await until(()=>h.$('saveState').textContent==='Connection preferences restored');assert.equal(h.store.get('chat:chat-a').plannerTokens,4096);
 }finally{await h.close();}
});

test('invalid TTS chunk edits never overwrite saved settings and valid boundaries survive reload',async()=>{
 const h=await harness();try{
  for(const value of ['', '79', '10001', '80.5']){
   h.$('chunk').value=value;h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
   h.$('planner').value='planner';h.$('planner').dispatchEvent(new h.dom.window.Event('change'));
   await new Promise(resolve=>setTimeout(resolve,280));
   assert.equal(h.store.get('chat:chat-a').chunk,500);assert.equal(h.store.has('settings:global'),false);
   assert.match(h.$('status').textContent,/Max characters per request.*80.*10000.*1800/);
   assert.match(h.$('saveState').textContent,/Not saved/);
   h.$('save').click();await tick();assert.equal(h.store.get('chat:chat-a').chunk,500);
  }
  for(const value of ['80','2000','10000']){
   h.$('chunk').value=value;h.$('chunk').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
   await until(()=>h.$('saveState').textContent==='Saved automatically');
   assert.equal(h.store.get('chat:chat-a').chunk,Number(value));await h.reload();assert.equal(h.$('chunk').value,value);
  }
 }finally{await h.close();}
});

test('several LLM sound effects in one passage play in story order between complete clauses',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content='The page snapped; the glass shattered on the floor.';
  await h.plan();await h.play();
  assert.deepEqual(h.requests.filter(request=>request.action==='freesound').map(request=>request.input.query),['page turn','glass shatter']);
  const order=(await Promise.all(h.audioBlobs.map(blob=>blob.text()))).map(text=>text==='FREESOUND_PREVIEW'?'sfx':'speech');
  assert.deepEqual(order,['sfx','speech','sfx','speech']);
  assert.deepEqual(h.synthesis.map(request=>request.text),['The page snapped;','the glass shattered on the floor.']);
 }finally{await h.close();}
});

const sfxSentence='Once she took the bite, Kellin set the plate back on the walnut edge and slid his hand across the table.';
test('SFX preserves action groups in normal, grouped and Cue playback with no extra speech or planning on replay',async()=>{
 for(const grouped of [false,true])for(const trigger of ['set the plate','and slid his hand']){
  const h=await harness();try{
   await configureFoley(h);await toggle(h,'batchSpeech',grouped);h.message.content=sfxSentence;
   h.state.soundCues={cues:[{segment:0,trigger,query:'plate clink'}],ambience:[],music:[]};
   const expected=trigger.startsWith('and')?['Once she took the bite, Kellin set the plate back on the walnut edge','and slid his hand across the table.']:['Once she took the bite,','Kellin set the plate back on the walnut edge and slid his hand across the table.'];
   await h.plan();await h.play();assert.deepEqual(h.synthesis.map(request=>request.text),expected);
   assert.deepEqual((await Promise.all(h.audioBlobs.map(blob=>blob.text()))).map(text=>text==='FREESOUND_PREVIEW'?'sfx':'speech'),['speech','sfx','speech']);
   const generated=h.synthesis.length,planned=h.requests.length;await h.reload();await h.play();assert.equal(h.synthesis.length,generated);assert.equal(h.requests.length,planned);
   await globalThis.__CHOIR_API__.playParagraph({text:sfxSentence});assert.deepEqual(h.synthesis.slice(generated).map(request=>request.text),expected);
  }finally{await h.close();}
 }
});

test('Replay rebuilds legacy SFX cuts from saved attribution and retains the effect without another planner call',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content=sfxSentence;h.state.soundCues={cues:[{segment:0,trigger:'set the plate',query:'plate clink'}],ambience:[],music:[]};
  await h.plan();await h.play();const generated=h.synthesis.length,planned=h.requests.filter(request=>request.action==='plan' || request.action==='sfx').length;
  const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{
   const transaction=database.transaction('recordings','readwrite'),request=transaction.objectStore('recordings').openCursor();
   request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const saved=cursor.value,cut=sfxSentence.indexOf('set the plate');
    const {sfxPlacement,passages,...legacy}=saved;cursor.update({...legacy,segments:[{...saved.segments[0],text:sfxSentence.slice(0,cut).trim()},saved.segments[1],{...saved.segments[2],text:sfxSentence.slice(cut)}]});cursor.continue();};
   transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
  });database.close();await h.reload();
  [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.deepEqual(h.synthesis.slice(generated).map(request=>request.text),['Once she took the bite,','Kellin set the plate back on the walnut edge and slid his hand across the table.']);
  assert.equal(h.requests.filter(request=>request.action==='plan' || request.action==='sfx').length,planned);assert.equal(h.state.previewFetches.length,1);
  const rebuilt=h.synthesis.length;await h.reload();await h.play();assert.equal(h.synthesis.length,rebuilt);
 }finally{await h.close();}
});

test('speech lookahead prepares the next voice while an effect is stalled and keeps a quick start',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content='She listened; the page snapped under her thumb. "Hello." The light faded.';
  h.$('concurrency').value='1';h.$('prefetch').value='1';await h.plan();
  h.state.blockAudio=true;h.state.holdPreview=true;h.state.holdSynthesisAt=2;h.$('play').click();
  await until(()=>h.audios.some(audio=>!audio.paused));
  await until(()=>h.state.previewFetches.length===1 && h.synthesis.length===2);
  assert.ok(h.state.releaseSynthesis,'the next speech is already in flight while the first voice plays');
  await tick();assert.equal(h.synthesis.length,2,'one prefetched speech stays bounded and does not generate the whole message');
  h.$('stop').click();await until(()=>h.state.previewAborted===1 && h.state.aborted===1);
 }finally{await h.close();}
});

test('speech lookahead skips previously cached voices to prepare the next missing clip',async()=>{
 for(const prefetch of [0,1]){
  const h=await harness();try{
   await h.plan();await h.play();assert.equal(h.synthesis.length,4);
   const row=(await recordings()).find(row=>row.value.content===h.message.content);
   row.value.blobs[2]=undefined;
   for(const key of Object.keys(row.value.passages))if(key.includes('Wait.'))delete row.value.passages[key];
   const db=await openRecordings();await new Promise((resolve,reject)=>{
    const transaction=db.transaction('recordings','readwrite');transaction.objectStore('recordings').put(row.value,row.key);
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
   });db.close();
   await h.reload();h.$('prefetch').value=String(prefetch);h.state.blockAudio=true;h.$('play').click();
   await until(()=>h.audios.at(-1)?.paused===false);
   if(prefetch)await until(()=>h.synthesis.length===5);else{await tick();assert.equal(h.synthesis.length,4,'prefetch zero does not generate future speech');}
   if(prefetch)assert.match(h.synthesis.at(-1).text,/Wait/);
  }finally{await h.close();}
 }
});

test('Cue speech lookahead has its own request slots while an effect is stalled',async()=>{
 const h=await harness();let pending;
 try{
  await configureFoley(h);h.message.content='She listened; the page snapped under her thumb. "Hello." The light faded.';
  h.$('concurrency').value='1';h.$('prefetch').value='1';await h.plan();
  h.state.blockAudio=true;h.state.holdPreview=true;h.state.holdSynthesisAt=2;
  pending=globalThis.__CHOIR_API__.playParagraph({text:h.message.content});pending.catch(()=>{});
  await until(()=>h.audios.some(audio=>!audio.paused));
  await until(()=>h.state.previewFetches.length===1 && h.synthesis.length===2);
  assert.ok(h.state.releaseSynthesis);h.$('stop').click();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(h.state.previewAborted,1);assert.equal(h.state.aborted,1);
 }finally{await h.close();await pending?.catch(()=>{});}
});

test('a cached or fresh SFX cannot hide the speech request waiting after it under parallel prefetch',async()=>{
 const h=await harness();try{
  await configureFoley(h);h.message.content='She listened; the page snapped under her thumb. "Hello." The light faded.';
  h.$('concurrency').value='3';h.$('prefetch').value='3';h.$('chunk').value='6000';await h.plan();
  for(const cached of [false,true]){
   if(cached){h.connections[0].default_parameters={speed:1.2};await h.reload();}
   const start=h.audios.length;h.state.holdSynthesisAt=h.synthesis.length+2;h.$('play').click();
   await until(()=>h.audios.length===start+2 && h.audios.at(-1).paused && h.state.releaseSynthesis);
   assert.match(h.$('status').textContent,/Synthesizing 3\/5: Narrator/);
   assert.doesNotMatch(h.$('status').textContent,/SFX/);
   h.state.releaseSynthesis();h.state.releaseSynthesis=null;h.state.holdSynthesisAt=null;
   await until(()=>h.$('status').textContent.includes('Playback finished'));
   assert.equal(h.audios.length,start+5);assert.equal(h.state.previewFetches.length,1);
  }
 }finally{await h.close();}
});

test('native speech times out during headers or audio download, reports the speaker, and retry retains completed audio',async()=>{
 const actualSetTimeout=globalThis.setTimeout;
 for(const body of [false,true]){
  const h=await harness();try{
   await configureFoley(h);h.message.content='She listened; the page snapped under her thumb. "Hello." The light faded.';
   h.$('concurrency').value='3';h.$('prefetch').value='3';await h.plan();
   h.state.holdSynthesisAt=2;h.state.holdSynthesisBody=body;
   globalThis.setTimeout=(fn,delay,...args)=>actualSetTimeout(fn,delay===185000?80:delay,...args);
   h.$('play').click();await until(()=>h.$('status').textContent.includes('timed out'));
   globalThis.setTimeout=actualSetTimeout;
   assert.match(h.$('status').textContent,/GPT TTS speech failed for Narrator/);
   assert.match(h.$('status').textContent,/model model-a; voice n/);
   assert.match(h.$('status').textContent,/Completed passages were retained/);assert.equal(h.state.aborted,1);
   assert.equal(h.$('play').disabled,false);assert.ok(h.audios.every(audio=>audio.paused));
   const failedText=h.synthesis[1].text;h.state.holdSynthesisAt=null;await h.play();
   // Some later passages may not have been scheduled when the timeout fired.
   // Retry the failed passage and generate those once; completed text stays cached.
   const texts=[...new Set(h.synthesis.map(request=>request.text))];assert.equal(texts.join(' '),h.message.content);
   for(const text of texts)assert.equal(h.synthesis.filter(request=>request.text===text).length,text===failedText?2:1);
   assert.equal(h.state.previewFetches.length,1);
  }finally{globalThis.setTimeout=actualSetTimeout;await h.close();}
 }
});

test('edits that only add images or trackers keep the plan, playback and saved audio; spoken edits still replan',async()=>{
  const h=await harness();try{
    await h.plan();h.state.delay=50;h.$('play').click();await until(()=>h.synthesis.length>0);
    h.message.content='At dawn. ![scene](https://img.test/a.png) "Hello." <img src="b.png">\n\n"Wait." The gate closed.\n<div class="tracker">Time: 06:00 | Mood: calm</div>';
    h.events.get('MESSAGE_EDITED')({messageId:'message-a',chatId:'chat-a'});await tick();
    assert.equal(h.state.aborted,0);assert.equal(h.$('preview').querySelectorAll('.et-card').length,4);
    await until(()=>h.$('status').textContent.includes('Playback finished'));assert.equal(h.synthesis.length,4);
    h.state.delay=0;await h.reload();await h.play();
    assert.equal(h.synthesis.length,4);assert.equal(h.requests.filter(r=>r.action==='plan').length,1);
    h.message.content='At dawn. "Greetings." "Wait." The gate closed.';h.events.get('MESSAGE_EDITED')({messageId:'message-a',chatId:'chat-a'});
    assert.equal(h.$('preview').children.length,0);
  }finally{await h.close();}
});

test('read-along highlights the spoken passage, then words, without changing the message, and clears on stop',async()=>{
  const original={CSS:globalThis.CSS,Highlight:globalThis.Highlight,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const highlights=new Map(),shown=[];
  globalThis.CSS={highlights:{set:(name,highlight)=>{shown.push(highlight.ranges.map(String).join('|'));highlights.set(name,highlight);},delete:name=>highlights.delete(name)}};
  globalThis.Highlight=class{constructor(...ranges){this.ranges=ranges;}};
  globalThis.requestAnimationFrame=fn=>setTimeout(fn,1);globalThis.cancelAnimationFrame=clearTimeout;
  const h=await harness();
  try{
    assert.equal(h.$('readAlong').value,'off');assert.equal(h.$('followNarration').checked,false);
    const bubble=document.createElement('div');bubble.dataset.messageId='message-a';
    bubble.innerHTML='<div data-component="MessageContent"><p>At <strong>dawn</strong>. <em>“Hello.”</em></p><p>“Wait.” The gate closed.</p><button>At dawn.</button></div>';
    document.body.append(bubble);const rendered=bubble.innerHTML;
    h.ctx.dom.findMessageElement=id=>document.querySelector(`[data-message-id="${id}"]`);
    await h.plan();await h.play();
    assert.deepEqual(shown,[],'the default draws nothing');
    h.$('readAlong').value='passage';h.$('readAlong').dispatchEvent(new h.dom.window.Event('change'));
    await h.play();
    assert.deepEqual(shown.filter((text,i)=>text!==shown[i-1]),['At dawn','“Hello.”','“Wait.”','The gate closed.']);
    assert.equal(bubble.innerHTML,rendered);assert.equal(highlights.size,0);
    shown.length=0;h.state.blockAudio=true;
    h.$('readAlong').value='word';h.$('readAlong').dispatchEvent(new h.dom.window.Event('change'));
    h.footer.querySelector('button').click();await until(()=>shown.length);
    assert.equal(shown.at(-1),'At');
    h.audios.at(-1).currentTime=20;await until(()=>shown.at(-1)==='At dawn');
    h.$('stop').click();assert.equal(highlights.size,0);
    await until(()=>h.store.get('settings:global')?.readAlong==='word');await h.reload();
    assert.equal(h.$('readAlong').value,'word');
  }finally{await h.close();Object.assign(globalThis,original);}
});

test('read-along and Follow narration are inert without the CSS Custom Highlight API',async()=>{
  const h=await harness();
  try{
    h.ctx.dom.findMessageElement=()=>{throw Error('message lookup without highlight support');};
    h.$('readAlong').value='word';h.$('followNarration').checked=true;
    for(const name of ['readAlong','followNarration'])h.$(name).dispatchEvent(new h.dom.window.Event('change'));
    await h.plan();await h.play();
    await until(()=>h.store.get('settings:global')?.followNarration===true);await h.reload();
    assert.equal(h.$('followNarration').checked,true);
  }finally{await h.close();}
});

const metaReply='At dawn. "Hello."\n\nActive Pressures:\n\nOpen Loop  Unanswered: What happens when the battery requires its next 2-hour physical recharge cycle.\n\n"Wait." The gate closed.';
const skipChecks=h=>h.requests.filter(request=>request.action==='skipCheck');
const plannedText=h=>h.requests.filter(request=>request.action==='plan').at(-1).input.transcript;

test('non-story blocks are checked once per reply and stay out of planning, audio, replay and reload',async()=>{
 const h=await harness();try{
  h.message.content=metaReply;h.state.skipLines=/^(Active Pressures|Open Loop)/;
  await h.plan();
  assert.equal(skipChecks(h).length,1);assert.equal(skipChecks(h)[0].input.lines.length,4);
  assert.equal(plannedText(h),'At dawn. "Hello."\n\n"Wait." The gate closed.');
  await h.play();assert.ok(h.synthesis.length && h.synthesis.every(request=>!/Pressures|Open Loop/.test(request.text)));
  const generated=h.synthesis.length;await h.play();await h.reload();await h.play();
  assert.equal(h.synthesis.length,generated);assert.equal(skipChecks(h).length,1);assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
 }finally{await h.close();}
});

test('a failed non-story check plays the whole reply and is not cached',async()=>{
 const h=await harness();try{
  h.message.content=metaReply;h.state.skipLines=/^(Active Pressures|Open Loop)/;h.state.skipError='Planner quota exhausted';
  await h.plan();assert.equal(skipChecks(h).length,1);assert.match(plannedText(h),/Open Loop/);
  assert.ok(![...h.store.keys()].some(key=>key.startsWith('skip:')));
 }finally{await h.close();}
});

test('Local heuristic mode and the Skip non-story blocks toggle make no check request',async()=>{
 const h=await harness();try{
  h.message.content=metaReply;h.state.skipLines=/^(Active Pressures|Open Loop)/;
  h.$('skipMeta').checked=false;h.$('skipMeta').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await until(()=>h.$('saveState').textContent==='Saved automatically');
  await h.plan();assert.equal(skipChecks(h).length,0);assert.match(plannedText(h),/Open Loop/);
  await h.reload();assert.equal(h.$('skipMeta').checked,false);
  h.$('skipMeta').checked=true;h.$('plannerMode').value='heuristic';h.$('plannerMode').dispatchEvent(new h.dom.window.Event('change'));
  h.message.content='The room fell quiet.';await h.plan();assert.equal(skipChecks(h).length,0);
 }finally{await h.close();}
});

const speedInput=()=>document.querySelector('[aria-label="Playback speed in settings"]');
const gapInput=()=>document.querySelector('[aria-label="Gap between voices in settings"]');
const speedEntry=()=>document.querySelector('[aria-label="Playback speed in settings value"]');
const gapEntry=()=>document.querySelector('[aria-label="Gap between voices in settings value"]');
const speedPreset=rate=>document.querySelector(`.cm-speed-options [data-playback-rate="${rate}"]`);
const setRange=(h,input,value)=>{input.value=value;input.dispatchEvent(new h.dom.window.Event('input'));input.dispatchEvent(new h.dom.window.Event('change'));};
const typeValue=(h,input,value)=>{input.value=value;input.dispatchEvent(new h.dom.window.Event('input'));};
const commitValue=(h,input,value)=>{typeValue(h,input,value);input.dispatchEvent(new h.dom.window.Event('blur'));};
const savedMixer=h=>h.store.get('ui:mixer');
const resetOf=(h,slot)=>h.$(slot).querySelector('.et-tuning-reset');

test('Abyssal mixer checkbox applies immediately and saves its choice independently of chat settings',async()=>{
 const h=await harness({enabled:true,playbackRate:1.5,channels:{Mira:{volume:0.6,speed:1.25}}});try{
  const mixer=()=>document.querySelector('[data-choir-mixer]'),toggle=()=>h.$('abyssalMixerTheme'),chat=structuredClone(h.store.get('chat:chat-a'));
  assert.equal(toggle().checked,false);assert.equal(mixer().dataset.abyssalTheme,'false');
  toggle().checked=true;toggle().dispatchEvent(new h.dom.window.Event('change'));
  assert.equal(mixer().dataset.abyssalTheme,'true');await until(()=>savedMixer(h)?.abyssalTheme===true);
  assert.deepEqual(h.store.get('chat:chat-a'),chat);await h.reload();assert.equal(toggle().checked,true);assert.equal(mixer().dataset.abyssalTheme,'true');
  toggle().checked=false;toggle().dispatchEvent(new h.dom.window.Event('change'));assert.equal(mixer().dataset.abyssalTheme,'false');
  await until(()=>savedMixer(h)?.abyssalTheme===false);await h.reload();assert.equal(toggle().checked,false);
  assert.equal(savedMixer(h).playbackRate,1.5);assert.equal(savedMixer(h).channels.Mira.volume,0.6);assert.equal(savedMixer(h).channels.Mira.speed,1.25);
 }finally{await h.close();}
});

test('default mixer offers Normal, Fast and Very fast buttons while detailed controls stay hidden and choices survive reload',async()=>{
 const h=await harness();try{
  const master=document.querySelector('[data-choir-mixer] .cm-master');
  assert.deepEqual([...master.nextElementSibling.querySelectorAll('.cm-speed-options button')].map(button=>button.textContent),['Normal','Fast','Very fast']);
  assert.equal(master.nextElementSibling.querySelector('.cm-speed-options input'),null);assert.ok(document.querySelector('[aria-label="Playback speed in mixer"]').closest('[hidden]'));assert.ok(document.querySelector('[aria-label="Gap between voices in mixer"]').closest('[hidden]'));
  assert.equal(speedPreset(1).getAttribute('aria-pressed'),'true');
  assert.equal(speedInput().value,'1');assert.equal(gapInput().value,'0');assert.equal(h.$('playbackRate').value,'1');assert.equal(h.$('voiceGapMs').value,'0');
  speedPreset(2).click();assert.equal(speedEntry().value,'2.00');assert.equal(speedPreset(2).getAttribute('aria-pressed'),'true');
  speedPreset(1).click();assert.equal(speedEntry().value,'1.00');
  speedPreset(1.5).click();assert.equal(h.$('playbackRate').value,'1.5');assert.equal(speedEntry().value,'1.50');assert.equal(h.$('playbackRateEntry').value,'1.50');
  assert.equal(speedPreset(1.5).getAttribute('aria-pressed'),'true');assert.equal(speedPreset(1).getAttribute('aria-pressed'),'false');
  setRange(h,gapInput(),'250');assert.equal(h.$('voiceGapMs').value,'250');assert.equal(gapEntry().value,'250');assert.equal(h.$('voiceGapMsEntry').value,'250');
  await until(()=>savedMixer(h)?.playbackRate===1.5 && savedMixer(h)?.voiceGapMs===250);
  assert.equal(h.store.get('chat:chat-a').playbackRate,undefined,'speed is no longer written into the chat');
  await h.reload();
  assert.equal(speedPreset(1.5).getAttribute('aria-pressed'),'true');
  assert.equal(speedInput().value,'1.5');assert.equal(h.$('playbackRate').value,'1.5');assert.equal(gapInput().value,'250');assert.equal(h.$('voiceGapMs').value,'250');
  await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length>=1 && !voices(h)[0].paused);
  const calls=h.synthesis.length;speedPreset(2).click();assert.equal(voices(h)[0].playbackRate,2);assert.equal(h.synthesis.length,calls);h.$('stop').click();
 }finally{await h.close();}
});

test('saved speed and gap outside their ranges are clamped on load, and chat-level speed values from before are not read',async()=>{
 let h=await harness({enabled:true,playbackRate:40,voiceGapMs:-40});try{
  assert.equal(speedInput().value,'4');assert.equal(h.$('playbackRate').value,'4');assert.equal(speedEntry().value,'16.00');assert.equal(gapInput().value,'0');assert.equal(h.$('voiceGapMs').value,'0');
  await h.close();h=await harness();h.store.set('chat:chat-a',{...h.store.get('chat:chat-a'),playbackRate:2,voiceGapMs:900});await h.reload();
  assert.equal(speedInput().value,'1');assert.equal(h.$('playbackRate').value,'1');assert.equal(gapInput().value,'0');assert.equal(h.$('voiceGapMs').value,'0');
 }finally{await h.close();}
});

test('typed speed accepts 0.07 to 16 times, expands the slider maximum, is saved, and reaches the playing block',async()=>{
 const h=await harness();try{
  await h.plan();
  commitValue(h,speedEntry(),'3.37');
  assert.equal(speedInput().value,'3.37');assert.equal(h.$('playbackRate').value,'3.37');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'3.37×');assert.equal(h.$('playbackRateEntry').value,'3.37');
  await until(()=>savedMixer(h)?.playbackRate===3.37);
  commitValue(h,speedEntry(),'9');assert.equal(speedInput().value,'9');assert.equal(speedInput().max,'9','typing a higher speed expands the slider');assert.equal(speedEntry().value,'9.00');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'9.00×','the readout shows the true value');assert.equal(h.$('playbackRateEntry').value,'9.00');
  await until(()=>savedMixer(h)?.playbackRate===9);
  commitValue(h,speedEntry(),'40');assert.equal(speedEntry().value,'16.00');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'16.00×');
  await until(()=>savedMixer(h)?.playbackRate===16);
  commitValue(h,speedEntry(),'0.01');assert.equal(speedEntry().value,'0.07');assert.equal(speedInput().value,'0.25','the slider pins at its 0.25x end');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'0.07×');
  await until(()=>savedMixer(h)?.playbackRate===0.07);
  commitValue(h,speedEntry(),'0.1');assert.equal(speedEntry().value,'0.10');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'0.10×');
  commitValue(h,speedEntry(),'1.237');assert.equal(speedInput().value,'1.24');assert.equal(speedEntry().value,'1.24');
  commitValue(h,speedEntry(),'3.37');
  h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length>=1 && !voices(h)[0].paused);
  assert.equal(voices(h)[0].playbackRate,3.37);assert.equal(voices(h)[0].preservesPitch,true);
  h.$('stop').click();
 }finally{await h.close();}
});

test('each character speed replaces the playback speed for that character, follows the playback speed when unset and changes the playing block live',async()=>{
 const h=await harness();try{
  await h.plan();
  const speedOf=name=>document.querySelector(`[aria-label="${name} speed"]`);
  const speedRow=speedOf('Mira').closest('.et-character-speed'),editor=speedRow.closest('[data-choir-cast-editor]');
  assert.ok(editor,'Mira has a speed control inside her character editor');assert.equal(editor.hidden,true);
  editor.closest('.et-cast-row').querySelector('[data-choir-edit]').click();assert.equal(editor.hidden,false);
  assert.equal(document.querySelector('[data-choir-mixer] [aria-label="Mira speed"]'),null,'character speed controls are absent from the mixer');
  assert.equal(speedOf('Mira').value,'1');assert.equal(document.querySelector('[aria-label="Mira speed value"]').value,'1.00');
  assert.ok(speedOf('Mira').closest('.cm-volume').classList.contains('cm-inherited'),'a character without its own speed is dimmed');
  assert.match(speedOf('Mira').closest('.cm-volume').title,/Follows master speed/);
  setRange(h,speedOf('Narrator'),'2');assert.equal(document.querySelector('[aria-label="Narrator speed value"]').value,'2.00');
  assert.equal(speedOf('Narrator').closest('.cm-volume').classList.contains('cm-inherited'),false,'a character with its own speed is not dimmed');
  await until(()=>savedMixer(h)?.channels?.Narrator?.speed===2);
  h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length>=1 && !voices(h)[0].paused);
  assert.equal(voices(h)[0].playbackRate,2,'narration plays at its own 2x with the playback speed at 1x');
  setRange(h,speedOf('Narrator'),'0.5');assert.equal(voices(h)[0].playbackRate,0.5,'a live change reaches the block that is playing');
  typeValue(h,speedEntry(),'2');assert.equal(voices(h)[0].playbackRate,0.5,'narration keeps its own 0.5x rather than multiplying the playback speed');
  assert.equal(savedMixer(h).channels.Narrator.speed,0.5);
  setRange(h,speedOf('Mira'),'2.5');assert.equal(voices(h)[0].playbackRate,0.5,'Mira does not change the narration');
  assert.equal(document.querySelector('[aria-label="Mira speed value"]').value,'2.50');
  voices(h)[0].onended();
  await until(()=>voices(h).length>=2 && !voices(h)[1].paused);
  assert.equal(voices(h)[1].playbackRate,2.5,'Mira speaks at her own 2.5x, not the playback speed times 2.5');
  h.$('stop').click();
 }finally{await h.close();}
});

test('character and NPC speeds are available before planning and preserve mixer volume edits after a speed change',async()=>{
 const h=await harness();try{
  const guardSpeed=()=>document.querySelector('[aria-label="Guard speed"]');
  assert.ok(document.querySelector('[aria-label="Mira speed"]'));assert.ok(guardSpeed().closest('[data-choir-cast-editor]').hidden);
  setRange(h,guardSpeed(),'1.25');await until(()=>savedMixer(h)?.channels?.Guard?.speed===1.25);
  await h.plan();setRange(h,guardSpeed(),'1.75');
  commitValue(h,document.querySelector('[aria-label="Guard volume percent"]'),'50');
  await until(()=>savedMixer(h)?.channels?.Guard?.speed===1.75 && savedMixer(h)?.channels?.Guard?.volume===0.5);
  await h.reload();assert.equal(guardSpeed().value,'1.75');assert.equal(document.querySelector('[data-choir-mixer] [aria-label="Guard speed"]'),null);
 }finally{await h.close();}
});

test('a character without its own speed follows the playback speed live, and double-click or its reset button clears the saved speed',async()=>{
 const h=await harness();try{
  await h.plan();
  const miraSlider=()=>document.querySelector('[aria-label="Mira speed"]');
  const miraRow=()=>miraSlider().closest('.cm-volume');
  const miraEntry=()=>document.querySelector('[aria-label="Mira speed value"]');
  const miraReset=()=>document.querySelector('[aria-label="Follow playback speed for Mira"]');
  assert.equal(miraReset().hidden,true,'the reset button is hidden while Mira follows the playback speed');
  setRange(h,speedInput(),'1.5');
  assert.equal(miraEntry().value,'1.50','the dimmed row follows the playback speed live');assert.equal(miraRow().classList.contains('cm-inherited'),true);
  setRange(h,miraSlider(),'3');
  await until(()=>savedMixer(h)?.channels?.Mira?.speed===3);
  assert.equal(miraRow().classList.contains('cm-inherited'),false,'an own speed is not dimmed');
  assert.equal(miraReset().hidden,false,'an own speed shows the reset button');
  setRange(h,speedInput(),'2');assert.equal(miraEntry().value,'3.00','Mira keeps 3x when the playback speed changes');
  await h.reload();
  assert.equal(miraSlider().value,'3');assert.equal(miraRow().classList.contains('cm-inherited'),false,'Mira keeps her own speed after reload');
  miraSlider().dispatchEvent(new h.dom.window.Event('dblclick'));
  assert.equal(miraEntry().value,'2.00','double-click returns Mira to the playback speed');
  assert.equal(miraRow().classList.contains('cm-inherited'),true);assert.equal(miraReset().hidden,true);
  await until(()=>savedMixer(h)?.channels?.Mira && !('speed' in savedMixer(h).channels.Mira));
  setRange(h,miraSlider(),'1.25');await until(()=>savedMixer(h)?.channels?.Mira?.speed===1.25);
  miraReset().click();
  assert.equal(miraEntry().value,'2.00','the reset button follows the playback speed again');
  await until(()=>savedMixer(h)?.channels?.Mira && !('speed' in savedMixer(h).channels.Mira));
  assert.equal(speedInput().value,'2');
 }finally{await h.close();}
});

test('a browser that refuses a speed plays the block at normal speed, and a speed it accepts later reaches the playing block',async()=>{
 const h=await harness({enabled:true,playbackRate:12});try{
  h.state.audioLimits={min:0.0625,max:8};
  await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length>=1 && !voices(h)[0].paused);
  assert.equal(voices(h)[0].playbackRate,1,'the refused 12x falls back to normal speed instead of stopping playback');
  assert.equal(speedEntry().value,'12.00','the saved speed is unchanged');
  typeValue(h,speedEntry(),'6');assert.equal(voices(h)[0].playbackRate,6,'a speed the browser accepts reaches the playing block');
  h.$('stop').click();
 }finally{await h.close();}
});

test('saved playback speed sets a pitch-preserving speech rate and a slider change applies to the block that is playing',async()=>{
 const h=await harness({enabled:true,playbackRate:1.5});try{
  await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length>=1 && !voices(h)[0].paused);
  assert.equal(voices(h)[0].playbackRate,1.5);assert.equal(voices(h)[0].preservesPitch,true);
  setRange(h,speedInput(),'0.75');
  assert.equal(voices(h)[0].playbackRate,0.75);assert.equal(speedEntry().value,'0.75');
  h.$('stop').click();
 }finally{await h.close();}
});

test('ambience beds keep normal speed while the spoken block plays at the saved speed',async()=>{
 const h=await harness({enabled:true,playbackRate:1.5});try{
  await configureFoley(h);h.message.content=scene;await h.plan();
  h.state.blockAudio=true;h.$('play').click();
  await until(()=>voices(h).length===1 && !voices(h)[0].paused);assert.equal(voices(h)[0].playbackRate,1.5);voices(h)[0].onended();
  await until(()=>beds(h).length===1 && !beds(h)[0].paused && voices(h).length===2);
  assert.equal(beds(h)[0].playbackRate,1);assert.equal(voices(h)[1].playbackRate,1.5);
  h.$('stop').click();
 }finally{await h.close();}
});

test('excluded opening dialogue adds no voice gap before the first audible speaker',async()=>{
 const h=await harness({enabled:true,voiceGapMs:1500});try{
  h.message.content='"Hello." "Wait." The gate closed.';await h.plan();document.querySelector('[aria-label="Mira no voice"]').click();await tick();h.state.blockAudio=true;
  // A gap is a long timer. Record those instead of timing the whole JSDOM startup
  // path, whose planning, storage and rendering work varies independently of gaps.
  const gapTimers=[],nativeSetTimeout=globalThis.setTimeout;
  globalThis.setTimeout=(fn,delay,...args)=>{if(delay===1500)gapTimers.push(delay);return nativeSetTimeout(fn,delay,...args);};
  try{
   h.$('play').click();await until(()=>voices(h).length && (gapTimers.length || voices(h)[0].playedAt));
   assert.deepEqual(gapTimers,[],'no voice gap may be scheduled before the first audible voice');
   await until(()=>voices(h)[0].playedAt);
   assert.equal(h.synthesis[0].voice,'g');
   // Positive control: the same gap must still separate the next audible speaker.
   const first=voices(h)[0];h.state.blockAudio=false;first.onended();
   await until(()=>voices(h).length===2 && gapTimers.length===1);
   assert.deepEqual(gapTimers,[1500],'the saved gap still separates consecutive audible speakers');
  }finally{globalThis.setTimeout=nativeSetTimeout;}
 }finally{await h.close();}
});

test('different character speeds split Fish dialogue and rebuild cached Replay without another planner request',async()=>{
 const h=await fishGroupingHarness({enabled:true});try{
  await h.plan();await h.play();assert.equal(h.synthesis.length,1);assert.ok(h.synthesis[0].parameters.turns.length>1);
  setRange(h,document.querySelector('[aria-label="Mira speed"]'),'0.25');await until(()=>savedMixer(h)?.channels.Mira.speed===0.25);
  const replay=()=>[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
  const start=voices(h).length;replay();await until(()=>h.$('status').textContent.includes('Playback finished'));
  assert.deepEqual(voices(h).slice(start).map(audio=>audio.playbackRate),[1,0.25,1]);
  assert.equal(h.requests.filter(request=>request.action==='plan').length,1);assert.equal(h.synthesis.length,4);
  assert.ok(h.synthesis.slice(1).every(input=>!input.parameters.turns?.some(turn=>turn.speaker==='Mira') || input.parameters.turns.every(turn=>turn.speaker==='Mira')));
  const calls=h.synthesis.length;replay();await until(()=>h.$('status').textContent==='Replay finished.');assert.equal(h.synthesis.length,calls);
  await h.reload();replay();await until(()=>h.$('status').textContent==='Replay finished.');assert.equal(h.synthesis.length,calls);
 }finally{await h.close();}
});

test('a voice gap separates grouped Fish speakers and repairs an older shared recording on Replay',async()=>{
 const h=await fishGroupingHarness({enabled:true});try{
  await h.plan();await h.play();assert.equal(h.synthesis.length,1);
  setRange(h,gapInput(),'400');await until(()=>savedMixer(h)?.voiceGapMs===400);
  const start=voices(h).length;[...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
  const clips=voices(h).slice(start);assert.equal(clips.length,4);assert.ok(h.synthesis.slice(1).every(input=>!input.parameters.turns));
  for(let i=1;i<clips.length;i++)assert.ok(clips[i].playedAt-clips[i-1].endedAt>=380);
  assert.equal(h.requests.filter(request=>request.action==='plan').length,1);
 }finally{await h.close();}
});

test('Next and Stop cancel a pending voice gap without late audio starting',async()=>{
 const h=await harness({enabled:true,voiceGapMs:400});try{
  await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length===1 && !voices(h)[0].paused);voices(h)[0].onended();
  await until(()=>voices(h).length===2 && !h.$('next').disabled);const skipped=voices(h)[1];assert.equal(skipped.playedAt,undefined);h.$('next').click();
  await until(()=>voices(h).length===3 && !h.$('next').disabled);const stopped=voices(h)[2];h.$('stop').click();await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal(skipped.playedAt,undefined);assert.equal(stopped.playedAt,undefined);assert.ok(voices(h).every(audio=>audio.paused));
 }finally{await h.close();}
});

test('voice gap leaves at least the saved silence between consecutive spoken blocks',async()=>{
 const h=await harness({enabled:true,voiceGapMs:400});try{
  await h.plan();
  h.$('play').click();await until(()=>h.$('status').textContent.includes('Playback finished'));
  const clips=voices(h);assert.ok(clips.length>=3,`expected several spoken blocks, got ${clips.length}`);
  for(let i=1;i<clips.length;i++)assert.ok(clips[i].playedAt-clips[i-1].endedAt>=380,`gap before block ${i+1} was ${clips[i].playedAt-clips[i-1].endedAt}ms`);
 }finally{await h.close();}
});

test('Mixer Play holds the silence before the next voice and Resume finishes the wait before that voice starts',async()=>{
 const h=await harness({enabled:true,voiceGapMs:400});try{
  await h.plan();
  h.$('play').click();
  await until(()=>voices(h).length>=2 && h.$('play').getAttribute('aria-label')==='Pause Choir audio');
  const first=voices(h)[0],held=voices(h)[1];assert.equal(held.playedAt,undefined);
  h.$('play').click();await tick();assert.equal(h.$('play').getAttribute('aria-label'),'Resume Choir audio');
  await new Promise(resolve=>setTimeout(resolve,700));assert.equal(held.playedAt,undefined,'the held voice must not start while playback is paused');
  h.$('play').click();await until(()=>held.playedAt);
  assert.ok(held.playedAt-first.endedAt>=900,`resumed gap ended ${held.playedAt-first.endedAt}ms after the first voice`);
  await until(()=>h.$('status').textContent.includes('Playback finished'));
 }finally{await h.close();}
});

test('drawer speed and gap show their values, reset from their Reset buttons and from double-click, and keep the reset value after reload',async()=>{
 const h=await harness();try{
  setRange(h,h.$('playbackRate'),'3.2');
  assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'3.20×');assert.equal(h.$('playbackRateEntry').value,'3.20');assert.equal(speedInput().value,'3.2');
  resetOf(h,'playbackSpeedSlot').click();
  assert.equal(h.$('playbackRate').value,'1');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'1.00×');assert.equal(h.$('playbackRateEntry').value,'1.00');assert.equal(speedInput().value,'1');
  await until(()=>savedMixer(h)?.playbackRate===1);
  setRange(h,h.$('playbackRate'),'2.5');h.$('playbackRate').dispatchEvent(new h.dom.window.Event('dblclick'));
  assert.equal(h.$('playbackRate').value,'1');assert.equal(speedInput().value,'1');
  setRange(h,h.$('voiceGapMs'),'750');assert.equal(h.$('voiceGapMs').getAttribute('aria-valuetext'),'750 ms');assert.equal(h.$('voiceGapMsEntry').value,'750');assert.equal(gapInput().value,'750');
  resetOf(h,'voiceGapSlot').click();assert.equal(h.$('voiceGapMs').value,'0');assert.equal(gapInput().value,'0');
  await until(()=>savedMixer(h)?.voiceGapMs===0);
  setRange(h,h.$('playbackRate'),'1.75');await until(()=>savedMixer(h)?.playbackRate===1.75);
  await h.reload();
  assert.equal(h.$('playbackRate').value,'1.75');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'1.75×');assert.equal(speedInput().value,'1.75');
  assert.equal(h.$('voiceGapMs').value,'0');assert.equal(h.$('voiceGapMs').getAttribute('aria-valuetext'),'0 ms');
 }finally{await h.close();}
});

test('REGRESSION drawer speed slider moves freely, its readout follows the thumb, and the value persists and reloads',async()=>{
 const h=await harness();try{
  setRange(h,h.$('playbackRate'),'1.4');
  assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'1.40×');assert.equal(speedInput().value,'1.4');
  await until(()=>savedMixer(h)?.playbackRate===1.4);
  setRange(h,h.$('playbackRate'),'0.6');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'0.60×');assert.equal(h.$('playbackRateEntry').value,'0.60');
  await until(()=>savedMixer(h)?.playbackRate===0.6);
  await h.reload();
  assert.equal(h.$('playbackRate').value,'0.6');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'0.60×');assert.equal(speedInput().value,'0.6');
  setRange(h,h.$('playbackRate'),'1');await until(()=>savedMixer(h)?.playbackRate===1);await h.reload();
  assert.equal(h.$('playbackRate').value,'1');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'1.00×');assert.equal(speedInput().value,'1');
 }finally{await h.close();}
});

test('REGRESSION speed can be pushed to the 4x maximum and back to 0.25x from either control, before and after reload',async()=>{
 const h=await harness();try{
  setRange(h,speedInput(),'4');assert.equal(h.$('playbackRate').value,'4');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'4.00×');assert.equal(h.$('playbackRateEntry').value,'4.00');
  await until(()=>savedMixer(h)?.playbackRate===4);
  setRange(h,h.$('playbackRate'),'0.25');assert.equal(speedInput().value,'0.25');assert.equal(speedEntry().value,'0.25');
  await until(()=>savedMixer(h)?.playbackRate===0.25);
  await h.reload();assert.equal(speedInput().value,'0.25');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'0.25×');
  setRange(h,speedInput(),'2');await until(()=>savedMixer(h)?.playbackRate===2);await h.reload();
  assert.equal(h.$('playbackRate').value,'2');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'2.00×');
  setRange(h,speedInput(),'1.2');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'1.20×');
  await until(()=>savedMixer(h)?.playbackRate===1.2);
 }finally{await h.close();}
});

test('the slider maximum set in settings moves the top end of the speed sliders, is clamped to 1 to 16, saved, and survives reload',async()=>{
 const h=await harness();try{
  const field=()=>h.$('speedSliderMax');
  assert.equal(field().value,'4');assert.equal(speedInput().max,'4');assert.equal(h.$('playbackRate').max,'4');
  field().value='8';field().dispatchEvent(new h.dom.window.Event('change'));
  assert.equal(speedInput().max,'8');assert.equal(h.$('playbackRate').max,'8');
  setRange(h,h.$('playbackRate'),'7.5');assert.equal(h.$('playbackRate').value,'7.5');assert.equal(h.$('playbackRateEntry').value,'7.50');
  await until(()=>savedMixer(h)?.speedSliderMax===8 && savedMixer(h)?.playbackRate===7.5);
  await h.reload();assert.equal(field().value,'8');assert.equal(speedInput().max,'8');assert.equal(h.$('playbackRate').value,'7.5');
  field().value='40';field().dispatchEvent(new h.dom.window.Event('change'));assert.equal(field().value,'16');assert.equal(speedInput().max,'16');
  field().value='0.2';field().dispatchEvent(new h.dom.window.Event('change'));assert.equal(field().value,'1');assert.equal(speedInput().max,'1');
  await until(()=>savedMixer(h)?.speedSliderMax===1);
 }finally{await h.close();}
});

test('REGRESSION typing 12 stretches the speed slider to 12, so dragging left goes to 11 instead of jumping back to 4',async()=>{
 const h=await harness();try{
  const entry=h.$('playbackRateEntry');entry.value='12';entry.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  assert.equal(h.$('playbackRate').max,'12');assert.equal(speedInput().max,'12');assert.equal(h.$('speedSliderMax').value,'12');assert.equal(h.$('playbackRate').value,'12');
  setRange(h,h.$('playbackRate'),'11');assert.equal(h.$('playbackRateEntry').value,'11.00');
  await until(()=>savedMixer(h)?.speedSliderMax===12 && savedMixer(h)?.playbackRate===11);
  await h.reload();assert.equal(h.$('playbackRate').max,'12');assert.equal(h.$('playbackRate').value,'11');
 }finally{await h.close();}
});

test('REGRESSION speed saved at 2 stays editable with no chat open: the mixer row is not locked and the drawer readout follows the thumb',async()=>{
 const h=await harness();try{
  setRange(h,speedInput(),'2');await until(()=>savedMixer(h)?.playbackRate===2);
  h.state.active=null;h.subscriptions.get('chat.active')();await until(()=>h.$('plan-latest').disabled===true);
  assert.equal(speedInput().disabled,false,'the global speed must not be locked while no chat is open');
  assert.equal(speedInput().value,'2');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'2.00×');
  setRange(h,h.$('playbackRate'),'0.6');assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'0.60×');assert.equal(speedInput().value,'0.6');
  await until(()=>savedMixer(h)?.playbackRate===0.6);
  h.state.active='chat-a';h.subscriptions.get('chat.active')();await until(()=>h.$('plan-latest').disabled===false);
  assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'0.60×');assert.equal(speedInput().value,'0.6');
 }finally{await h.close();}
});

test('mixer speed buttons follow settings and leave custom speeds unselected across navigation and reload',async()=>{
 const h=await harness();try{
  speedPreset(1.5).click();
  assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'1.50×');assert.equal(h.$('playbackRateEntry').value,'1.50');
  setRange(h,h.$('playbackRate'),'2');assert.equal(speedPreset(2).getAttribute('aria-pressed'),'true');
  setRange(h,h.$('playbackRate'),'2.36');
  assert.equal(speedInput().value,'2.36');assert.equal(speedEntry().value,'2.36');assert.equal(speedInput().getAttribute('aria-valuetext'),'2.36×');
  assert.ok([...document.querySelectorAll('.cm-speed-options button')].every(button=>button.getAttribute('aria-pressed')==='false'));
  h.subscriptions.get('chat.active')();await tick();
  assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'2.36×','the drawer still shows the shared value after a chat switch');
  assert.equal(speedInput().value,'2.36');
  await until(()=>savedMixer(h)?.playbackRate===2.36);
  await h.reload();
  assert.equal(h.$('playbackRate').getAttribute('aria-valuetext'),'2.36×');assert.equal(h.$('playbackRateEntry').value,'2.36');assert.equal(speedInput().value,'2.36');
  assert.ok([...document.querySelectorAll('.cm-speed-options button')].every(button=>button.getAttribute('aria-pressed')==='false'));
 }finally{await h.close();}
});

test('REGRESSION after a host remount the live drawer and the mixer stay in step in both directions',async()=>{
 const h=await harness();try{
  const drawers=()=>[...h.root.querySelectorAll('[data-et="playbackRate"]')];
  await h.remount();
  assert.equal(drawers().length,1,'remount disposes the earlier drawer, so exactly one live drawer remains');
  assert.equal(document.querySelectorAll('.cm-speed-options button').length,3);
  speedPreset(1.5).click();
  assert.equal(drawers()[0].getAttribute('aria-valuetext'),'1.50×','the live drawer follows the mixer');
  setRange(h,drawers()[0],'2');
  assert.equal(speedPreset(2).getAttribute('aria-pressed'),'true','the mixer follows the drawer');
  assert.equal(drawers()[0].getAttribute('aria-valuetext'),'2.00×','the drawer shows the value it set');
  await until(()=>savedMixer(h)?.playbackRate===2);
 }finally{await h.close();}
});

test('a mixer speed button updates a focused typed speed field without restoring the previous value on blur',async()=>{
 const h=await harness();try{
  speedEntry().focus();typeValue(h,speedEntry(),'2.36');
  speedPreset(1.5).click();assert.equal(speedEntry().value,'1.50');assert.equal(speedInput().value,'1.5');
  speedEntry().blur();assert.equal(speedEntry().value,'1.50');
  await until(()=>savedMixer(h)?.playbackRate===1.5);
 }finally{await h.close();}
});

test('the reported case: a master speed of 4 times with a character at 0.25 times plays that character at 0.25 times',async()=>{
 const h=await harness();try{
  await h.plan();
  setRange(h,speedInput(),'4');
  setRange(h,document.querySelector('[aria-label="Narrator speed"]'),'0.25');
  assert.equal(document.querySelector('[aria-label="Narrator speed value"]').value,'0.25');
  h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length>=1 && !voices(h)[0].paused);
  assert.equal(voices(h)[0].playbackRate,0.25,'the character speed replaces the master 4x instead of multiplying it');
  h.$('stop').click();
 }finally{await h.close();}
});


test('speed prefetch skips background markers before the next spoken passage',async()=>{
 for(const rate of [1.5,2]){
  const h=await harness({enabled:true,playbackRate:rate});try{
   const saved=h.store.get('chat:chat-a');Object.assign(saved,{prefetch:1,concurrency:1,enableAmbience:true,enableSfx:false,enableMusic:true,freesoundApiKey:'fixture-key'});
   h.store.set('chat:chat-a',saved);await h.reload();
   h.message.content='At dawn. Rain drummed on the roof. "Hello."';h.state.blockAudio=true;h.state.delay=120;
   h.state.soundCues={cues:[],ambience:[{segment:0,trigger:'Rain drummed',query:'rain'}],music:[{segment:0,trigger:'Rain drummed',feels:['Dark'],genres:['Soundtrack'],keywords:['piano']}]};
   await h.plan();h.$('play').click();await until(()=>voices(h).length===1 && !voices(h)[0].paused);
   await new Promise(resolve=>setTimeout(resolve,70));
   assert.equal(h.synthesis.length,2,'the next speech should synthesize while the first plays even when music and ambience markers lie between them');
  }finally{await h.close();}
 }
});

test('progress counter starts at the first audible clip after leading music and ambience, including cached replay',async()=>{
 const h=await harness();try{
  await configureFoley(h);await toggle(h,'enableMusic',true);
  h.message.content='Rain drummed on the roof. "Hello."';
  h.state.soundCues={cues:[],ambience:[{segment:0,trigger:'Rain drummed',query:'rain'}],music:[{segment:0,trigger:'Rain drummed',feels:['Dark'],genres:['Soundtrack'],keywords:['piano']}]};
  await h.plan();h.state.blockAudio=true;h.state.delay=100;h.$('play').click();
  await until(()=>h.synthesis.length===1);
  assert.match(h.$('status').textContent,/^Synthesizing 1\/2: Narrator/);
  assert.equal(h.synthesis[0].text,'Rain drummed on the roof.','the opening narration must be synthesized and heard');
  await until(()=>voices(h).length===1 && !voices(h)[0].paused);
  assert.match(h.$('status').textContent,/^Playing 1\/2: Narrator/);
  voices(h)[0].onended();await until(()=>voices(h).length===2 && !voices(h)[1].paused);
  assert.match(h.$('status').textContent,/^Playing 2\/2: Mira/);
  voices(h)[1].onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
  const recording=await recordingFor(h.message.content);
  assert.deepEqual(recording.segments.slice(0,2).map(segment=>segment.kind).sort(),['ambience','music'],'fixture must contain two real leading background markers');
  const generated=h.synthesis.length,start=voices(h).length;
  [...h.$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
  await until(()=>voices(h).length===start+1 && !voices(h).at(-1).paused);
  assert.match(h.$('status').textContent,/^Replaying 1\/2: Narrator/);
  voices(h).at(-1).onended();await until(()=>voices(h).length===start+2 && !voices(h).at(-1).paused);
  assert.match(h.$('status').textContent,/^Replaying 2\/2: Mira/);
  voices(h).at(-1).onended();await until(()=>h.$('status').textContent==='Replay finished.');
  assert.equal(h.synthesis.length,generated,'cached replay must not synthesize any speech again');
 }finally{await h.close();}
});

test('progress counter excludes a leading actor set to No voice',async()=>{
 const h=await harness();try{
  h.message.content='Opening narration. "Hello."';await h.plan();
  document.querySelector('[aria-label="Narrator no voice"]').click();
  await until(()=>h.store.get('chat:chat-a').fixed.find(actor=>actor.speaker==='Narrator').excluded);
  h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length===1 && !voices(h)[0].paused);
  assert.match(h.$('status').textContent,/^Playing 1\/1: Mira/);
  assert.equal(h.synthesis.length,1);assert.equal(h.synthesis[0].voice,'m');assert.equal(h.synthesis[0].text,'"Hello."');
  voices(h)[0].onended();await until(()=>h.$('status').textContent.includes('Playback finished'));
 }finally{await h.close();}
});

test('progress counter keeps the actual resumed clip and seek position after leading background markers',async()=>{
 const h=await harness();try{
  await configureFoley(h);await toggle(h,'enableMusic',true);
  h.message.content='Rain drummed on the roof. "Hello." "Wait."';
  h.state.soundCues={cues:[],ambience:[{segment:0,trigger:'Rain drummed',query:'rain'}],music:[{segment:0,trigger:'Rain drummed',feels:['Dark'],genres:['Soundtrack'],keywords:['piano']}]};
  await h.plan();h.state.blockAudio=true;h.$('play').click();await until(()=>voices(h).length===1 && !h.$('next').disabled);
  h.$('next').click();await until(()=>voices(h).length===2 && !voices(h).at(-1).paused && !h.$('next').disabled);
  assert.match(h.$('status').textContent,/^Playing 2\/3: Mira/);
  voices(h).at(-1).currentTime=7.25;voices(h).at(-1).ontimeupdate();h.$('stop').click();
  await until(()=>h.store.get('position:chat-a')?.seconds===7.25);
  assert.equal(h.store.get('position:chat-a').passage,1);
  const generated=h.synthesis.length,start=voices(h).length;await h.reload();h.$('play').click();
  await until(()=>voices(h).length===start+1 && !voices(h).at(-1).paused && !h.$('next').disabled);
  assert.match(h.$('status').textContent,/^Playing 2\/3: Mira/,'resuming the second clip must keep its ordinal within the full playback');
  assert.equal(voices(h).at(-1).currentTime,7.25);assert.equal(h.store.get('position:chat-a').passage,1);
  assert.equal(h.synthesis.length,generated,'resume must reuse the saved second clip');
  h.$('previous').click();await until(()=>voices(h).length===start+2 && !voices(h).at(-1).paused);
  assert.match(h.$('status').textContent,/^Playing 1\/3: Narrator/);
  assert.equal(voices(h).at(-1).currentTime,0,'previous must not inherit the resumed seek offset');
  assert.equal(h.synthesis.length,generated);
 }finally{await h.close();}
});
