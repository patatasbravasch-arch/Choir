import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {setup} from '../dist/frontend.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const until=async predicate=>{
  for(let i=0;i<400;i++){if(predicate())return;await tick();}
  throw new Error('Fluidity fixture did not reach the expected state');
};
const observe=promise=>{
  const outcome={};
  outcome.promise=promise.then(value=>{outcome.value=value;},error=>{outcome.error=error;});
  return outcome;
};

// Speech and decode gates make request order and preparation observable without
// relying on network timings or pretending that faster playback speeds up TTS.
async function harness({concurrency=1,prefetch=1,normalize=true,ambience=false,holdDecode=false}={}){
  const dom=new JSDOM('<body><main></main><footer></footer></body>',{url:'https://lumiverse.test'});
  const original=Object.fromEntries(['document','Audio','AudioContext','fetch','indexedDB'].map(key=>[key,globalThis[key]]));
  globalThis.document=dom.window.document;globalThis.indexedDB=new IDBFactory();
  const root=document.querySelector('main'),footer=document.querySelector('footer');
  const requests=[],audios=[],decodes=[],state={active:0,peak:0,aborted:0,holdDecode},store=new Map();
  store.set('chat:fluidity',{
    connection:'a',plannerMode:'heuristic',skipMeta:false,enableMixer:true,
    enableSfx:false,enableMusic:false,enableAmbience:ambience,freesoundApiKey:ambience?'fixture-key':'',
    normalizeLoudness:normalize,prefetch,concurrency,chunk:500,batchSpeech:false,
    fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'You',voice:'y',style:''},{speaker:'Mira',voice:'m',style:''}],
    casts:{'native:a':[]}
  });
  class FakeAudio{
    constructor(src){this.src=src;this.paused=true;this.duration=1;this.currentTime=0;this.playbackRate=1;audios.push(this);}
    play(){this.paused=false;this.started=true;this.onloadedmetadata?.();return Promise.resolve();}
    pause(){this.paused=true;}
    finish(){this.paused=true;this.currentTime=1;this.onended?.();}
    removeAttribute(name){delete this[name];}
    load(){}
  }
  const samples=Float32Array.from({length:2400},(_,index)=>0.1*Math.sin(index/7));
  class FakeContext{
    constructor(){this.sampleRate=24000;}
    resume(){return Promise.resolve();}
    close(){return Promise.resolve();}
    createMediaElementSource(){return {connect(){},disconnect(){}};}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    decodeAudioData(){
      const decoded={numberOfChannels:1,sampleRate:24000,getChannelData:()=>samples};
      let release;const promise=new Promise(resolve=>release=()=>resolve(decoded));
      decodes.push({release});if(!state.holdDecode)release();return promise;
    }
  }
  globalThis.Audio=FakeAudio;globalThis.AudioContext=FakeContext;
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/tts/synthesize')){
      state.active++;state.peak=Math.max(state.peak,state.active);
      return new Promise((resolve,reject)=>{
        let settled=false;
        const finish=(value,error)=>{
          if(settled)return;settled=true;state.active--;options.signal?.removeEventListener('abort',cancel);
          error?reject(error):resolve(value);
        };
        const cancel=()=>{if(!settled)state.aborted++;finish(null,new DOMException('Stopped','AbortError'));};
        const request={...JSON.parse(options.body),release:()=>finish(new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/wav'}})),fail:()=>finish(new Response('Provider quota exhausted',{status:429}))};
        requests.push(request);options.signal?.addEventListener('abort',cancel,{once:true});
        if(options.signal?.aborted)cancel();
      });
    }
    if(url.endsWith('/spindle'))return Response.json({extensions:[{identifier:'choir',metadata:{branch:'lunch-test'}}]});
    if(url.includes('/providers'))return Response.json({providers:[{id:'openai_tts',capabilities:{parameters:{}}}]});
    if(url.endsWith('/voices'))return Response.json({voices:['n','y','m'].map(id=>({id,name:id}))});
    if(url.includes('/decision-connections?') || url.includes('/connections?'))return Response.json({data:[]});
    return Response.json({data:[{id:'a',name:'Fixture speech',provider:'openai_tts',model:'fixture-model'}]});
  };
  let backend;
  const ctx={
    settings:{get:async key=>structuredClone(store.get(key)??null),set:async(key,value)=>{store.set(key,structuredClone(value));}},
    messages:{getRecent:()=>[],getContent:()=>null},state:{subscribe:()=>()=>{}},events:{on:()=>()=>{}},
    characters:{get:async()=>({name:'Mira'})},getActiveChat:()=>({chatId:'fluidity',characterId:'mira'}),dom:{addStyle:()=>()=>{}},
    ui:{registerDrawerTab:()=>({root,activate(){},destroy(){root.replaceChildren();}}),registerInputBarAction:()=>({onClick(){},destroy(){}}),registerDomDecorator:options=>options.render(footer,{messageId:'fixture'})},
    onBackendMessage:fn=>{backend=fn;return()=>{backend=null;};},
    sendToBackend:request=>{
      if(request.action==='cancel')return;
      let result;
      if(request.action==='ping')result={ready:true};
      else if(request.action==='sfx')result={cues:[],music:[],ambience:request.input.segments.flatMap((segment,index)=>segment.text.includes('Rain drummed')?[{segment:index,trigger:'Rain drummed',query:'rain'}]:[])};
      else if(request.action==='freesound')result={results:[{id:1,name:'rain',previewUrl:'https://fixture.test/rain.mp3'}]};
      else if(request.action==='freesoundPreview'){state.bedPreviews=(state.bedPreviews??0)+1;result={base64:btoa('fixture rain'),mimeType:'audio/mpeg'};}
      else result={};
      queueMicrotask(()=>backend?.({namespace:'choir',id:request.id,result}));
    }
  };
  let cleanup;
  try{cleanup=await setup(ctx);}catch(error){Object.assign(globalThis,original);dom.window.close();throw error;}
  const bridge=globalThis.__CHOIR_API__,voices=()=>audios.filter(audio=>!audio.loop);
  return {bridge,requests,audios,voices,decodes,state,
    async close(){bridge.stop();for(const decode of decodes)decode.release();cleanup();await tick();Object.assign(globalThis,original);dom.window.close();}
  };
}

test('companion prioritizes current speech and obeys concurrency 1 with a future paragraph',async()=>{
  const h=await harness({concurrency:1,prefetch:4});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'Current opening. "Current reply." Current ending.',nextText:'Future paragraph. "Future reply."'}));
    await until(()=>h.requests.length===1);
    assert.equal(h.requests[0].text,'Current opening.');assert.equal(h.state.active,1);
    h.requests[0].release();await until(()=>h.requests.length===2 && h.voices()[0]?.started);
    assert.equal(h.requests[1].text,'"Current reply."');
    h.requests[1].release();await until(()=>h.requests.length===3);
    assert.equal(h.requests[2].text,'Current ending.');
    h.requests[2].release();await until(()=>h.requests.length===4);
    assert.equal(h.requests[3].text,'Future paragraph.');assert.equal(h.state.peak,1);
    h.bridge.stop();await pending.promise;assert.equal(pending.error?.name,'AbortError');
  }finally{await h.close();await pending?.promise;}
});

test('companion lookahead never exceeds concurrency 2',async()=>{
  const h=await harness({concurrency:2,prefetch:4});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'First narration. "First reply." Second narration. "Second reply."',nextText:'Future narration.'}));
    await until(()=>h.requests.length===2);assert.equal(h.state.active,2);
    assert.deepEqual(h.requests.map(request=>request.text),['First narration.','"First reply."']);
    h.requests[0].release();await until(()=>h.requests.length===3);
    assert.equal(h.requests[2].text,'Second narration.');assert.equal(h.state.active,2);
    h.requests[1].release();await until(()=>h.requests.length===4);
    assert.equal(h.requests[3].text,'"Second reply."');assert.equal(h.state.peak,2);
  }finally{await h.close();await pending?.promise;}
});

test('companion prefetch reaches the next speech across an ambience marker',async()=>{
  const h=await harness({prefetch:1,ambience:true});let pending;
  try{
    const text='Opening narration. Rain drummed on the roof. "Hello."';
    pending=observe(h.bridge.playParagraph({text}));await until(()=>h.requests.length===1);
    const segments=h.bridge.planParagraph(text).segments,marker=segments.findIndex(segment=>segment.kind==='ambience');
    assert.ok(marker>0 && segments.slice(marker+1).some(segment=>!segment.kind),'fixture must place a bed between spoken clips');
    h.requests[0].release();await until(()=>h.voices()[0]?.started && h.requests.length===2);
    assert.equal(h.voices().length,1,'the next speech is requested while the first remains playing');
    assert.equal(h.requests[1].text,'Rain drummed on the roof.');
    await until(()=>h.state.bedPreviews===1);
    assert.equal(h.decodes.length,1,'a looping bed should not be decoded for speech loudness matching');
  }finally{await h.close();await pending?.promise;}
});

test('loudness preparation overlaps current playback and cached replay reuses its measurements',async()=>{
  const h=await harness();let pending;
  try{
    const text='First passage. "Second passage."';
    pending=observe(h.bridge.playParagraph({text}));await until(()=>h.requests.length===1);
    h.requests[0].release();await until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.requests[1].release();await until(()=>h.decodes.length===2);
    assert.equal(h.voices().length,1,'lookahead audio is analyzed before the current clip ends');
    h.voices()[0].finish();await until(()=>h.voices()[1]?.started);h.voices()[1].finish();await pending.promise;
    assert.equal(pending.value?.played,2);
    pending=observe(h.bridge.playParagraph({text}));await until(()=>h.voices()[2]?.started);
    h.voices()[2].finish();await until(()=>h.voices()[3]?.started);h.voices()[3].finish();await pending.promise;
    assert.equal(pending.value?.played,2);assert.equal(h.requests.length,2);assert.equal(h.decodes.length,2,'same cached blobs should not decode again for loudness');
  }finally{await h.close();await pending?.promise;}
});

test('disabled loudness matching does not decode speech for analysis',async()=>{
  const h=await harness({normalize:false});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'One passage.'}));await until(()=>h.requests.length===1);
    h.requests[0].release();await until(()=>h.voices()[0]?.started);h.voices()[0].finish();await pending.promise;
    assert.equal(pending.value?.played,1);assert.equal(h.decodes.length,0);
  }finally{await h.close();await pending?.promise;}
});

test('external abort completes while loudness decoding remains pending',async()=>{
  const h=await harness({holdDecode:true,prefetch:0}),ctrl=new AbortController();let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'A cancellable passage.',signal:ctrl.signal}));await until(()=>h.requests.length===1);
    h.requests[0].release();await until(()=>h.decodes.length===1);ctrl.abort();
    await until(()=>pending.error);assert.equal(pending.error.name,'AbortError');assert.ok(h.voices().every(audio=>!audio.started));
    await until(()=>getEventListeners(ctrl.signal,'abort').length===0);
    h.decodes[0].release();await tick();assert.ok(h.voices().every(audio=>!audio.started),'a late decode must not restart cancelled audio');
  }finally{await h.close();await pending?.promise;}
});

test('Stop cancels active companion synthesis without starting queued lookahead',async()=>{
  const h=await harness({prefetch:4,concurrency:1});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'First passage. "Second passage." Third passage.',nextText:'Future paragraph.'}));
    await until(()=>h.requests.length===1);h.bridge.stop();await pending.promise;
    assert.equal(pending.error?.name,'AbortError');assert.equal(h.state.active,0);
    h.requests[0].release();await tick();
    assert.equal(h.requests.length,1,'aborted queued jobs must never reach the provider');assert.equal(h.voices().length,0);
  }finally{await h.close();await pending?.promise;}
});

test('Stop cancels next-paragraph synthesis after the current paragraph has returned',async()=>{
  const h=await harness({prefetch:4,concurrency:1,normalize:false});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'Current paragraph.',nextText:'Future opening. "Future reply." Future ending.'}));
    await until(()=>h.requests.length===1);h.requests[0].release();
    await until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.voices()[0].finish();await pending.promise;
    assert.equal(pending.value?.played,1);assert.equal(h.state.active,1,'future synthesis must still be pending after paragraph completion');
    const stop=document.querySelector('[data-et="stop"]');
    assert.equal(stop.disabled,false,'the drawer can stop background speech even after playback returns');
    stop.click();await until(()=>h.state.active===0);
    assert.equal(h.state.aborted,1,'Stop must reach the retained prefetch controller');
    h.requests[1].release();await tick();
    assert.equal(h.requests.length,2,'queued future clips must not launch after Stop');
  }finally{await h.close();await pending?.promise;}
});

test('Stop becomes idle after a completed paragraph finishes its background lookahead',async()=>{
  const h=await harness({prefetch:1,normalize:false});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'Current paragraph.',nextText:'Future paragraph.'}));
    await until(()=>h.requests.length===1);h.requests[0].release();
    await until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.voices()[0].finish();await pending.promise;
    assert.equal(document.querySelector('[data-et="stop"]').disabled,false);
    h.requests[1].release();await until(()=>document.querySelector('[data-et="stop"]').disabled);
    assert.equal(h.state.active,0);
  }finally{await h.close();await pending?.promise;}
});

test('muting Narrator skips narration waiting in the companion synthesis queue',async()=>{
  const h=await harness({prefetch:4,concurrency:1,normalize:false});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'"First dialogue." Queued narration. "Second dialogue."',speaker:'Mira'}));
    await until(()=>h.requests.length===1);assert.equal(h.requests[0].text,'"First dialogue."');
    h.bridge.setNarratorMuted(true);h.requests[0].release();await until(()=>h.requests.length===2 && h.voices()[0]?.started);
    assert.equal(h.requests[1].text,'"Second dialogue."','the queued narration must be skipped before reaching TTS');
    h.requests[1].release();h.voices()[0].finish();await until(()=>h.voices()[1]?.started);h.voices()[1].finish();await pending.promise;
    assert.equal(pending.value?.played,2);assert.equal(h.requests.length,2);
  }finally{await h.close();await pending?.promise;}
});

test('a companion speech failure aborts active and queued next-paragraph work',async()=>{
  const h=await harness({prefetch:4,concurrency:2,normalize:false});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'Current paragraph.',nextText:'Future opening. "Future reply." Future ending.'}));
    await until(()=>h.requests.length===2);h.requests[0].fail();await pending.promise;await until(()=>h.state.active===0);
    assert.match(pending.error?.message??'',/quota exhausted/);assert.equal(h.state.aborted,1);
    h.requests[1].release();await tick();assert.equal(h.requests.length,2,'a failed paragraph must not continue filling its future queue');
  }finally{await h.close();await pending?.promise;}
});

test('unison members decode once for mixing without a second loudness-analysis decode',async()=>{
  const h=await harness({prefetch:0});let pending;
  try{
    const text='"Hello," You and Mira said in unison.';
    const speech=h.bridge.planParagraph(text).segments.filter(segment=>!segment.kind);
    assert.equal(speech[0]?.unison?.length,2,'fixture must produce a two-speaker unison block');
    pending=observe(h.bridge.playParagraph({text}));await until(()=>h.requests.length===1);h.requests[0].release();
    await until(()=>h.requests.length===2);h.requests[1].release();await until(()=>h.voices()[0]?.started);
    assert.equal(h.decodes.length,2,'each member needs one mixing decode; the mixed clip is already normalized');
    h.bridge.stop();await pending.promise;assert.equal(pending.error?.name,'AbortError');
  }finally{await h.close();await pending?.promise;}
});

test('a ready companion clip starts without an added timer delay',async()=>{
  const h=await harness({normalize:false});let pending;
  try{
    pending=observe(h.bridge.playParagraph({text:'First passage. "Second passage."'}));await until(()=>h.requests.length===1);
    h.requests[0].release();await until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.requests[1].release();await tick();
    h.voices()[0].finish();
    // Promise continuations can start ready audio before yielding to timers.
    // A fixed 60 ms inter-clip sleep necessarily loses this race.
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.ok(h.voices()[1]?.started,'ready audio should start before the next timer turn');
    h.voices()[1].finish();await pending.promise;assert.equal(pending.value?.played,2);
  }finally{await h.close();await pending?.promise;}
});
