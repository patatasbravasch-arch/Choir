import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';

// Retest of inject e8d9f29 / script a10d130: each test asserts the corrected behaviour.
// The speaker-dropdown cases need the script branch's plan editor and are skipped without it.
const repo=new URL('../',import.meta.url);
const branch=readFileSync(new URL('src/frontend.js',repo),'utf8').includes('function speakerChoice')?'script':'inject';
const core=await import(new URL('src/core.js',repo));
const {voiceDelivery}=await import(new URL('src/delivery.js',repo));
async function reuse(file,start,end,names){
  const url=new URL('tests/'+file,repo),source=readFileSync(url,'utf8'),require=createRequire(url);
  let header=source.slice(0,Math.min(source.indexOf(start),source.indexOf('\ntest(')));
  header=header.replace(/from '([^']+)'/g,(_,specifier)=>`from '${specifier.startsWith('.')?new URL(specifier,url).href:specifier.startsWith('node:')?specifier:pathToFileURL(require.resolve(specifier)).href}'`);
  const helpers=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  const body=(header+helpers+`\nexport {${names}};`).replaceAll('import.meta.url',JSON.stringify(url.href));
  return import('data:text/javascript;base64,'+Buffer.from(body).toString('base64'));
}
const reliability=await reuse('reliability.browser.mjs','const tick=','\nasync function elizaFixture','harness,until,tick');
const fluid=await reuse('fluidity.browser.mjs','const tick=','\ntest(','harness,until,tick,observe');
const {harness,until}=reliability;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const edit=(h,name,value)=>{
  h.$(name).value=String(value);
  h.$(name).dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
};
const switchTo=async(h,id)=>{h.state.active=id;await h.subscriptions.get('chat.active')();};
const choice=(h,index,speaker)=>{
  const select=h.$('preview').querySelector(`select[aria-label="Speaker of block ${index}"]`);
  assert.ok(select,'expected script speaker dropdown');select.value=speaker;
  select.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
};
const configure=h=>Object.assign(h.store.get('chat:chat-a'),{
  skipMeta:false,enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false
});
function backend(decide){
  let handler;const calls=[],sent=[];
  vm.runInNewContext(readFileSync(new URL('dist/backend.js',repo),'utf8'),{
    spindle:{
      onFrontendMessage:fn=>handler=fn,sendToFrontend:message=>sent.push(message),
      generate:{raw:async()=>{calls.push('fallback');return {content:'D1|Mira|warm'};}},
      decisions:{evaluate:async request=>{calls.push(Object.keys(request.questions)[0]);return decide(request);}},
      connections:{get:async()=>({id:'planner',model:'mock',provider:'openai'}),list:async()=>[{id:'planner',model:'mock',provider:'openai',is_default:true}]}
    },
    console,Map,Set,AbortController,DOMException,TextEncoder,setTimeout,clearTimeout,URL,crypto:globalThis.crypto,atob,btoa,Uint8Array,DataView
  });
  return {calls,async plan(input){
    handler({namespace:'choir',id:'probe',action:'plan',input},'fixture','fixture');
    await until(()=>sent.some(message=>message.result || message.error));
    return sent.findLast(message=>message.result || message.error);
  }};
}

test('autosave keeps a restored valid value after an invalid intermediate edit',async()=>{
  const h=await harness();
  try{
    const before=h.store.get('chat:chat-a').chunk;
    edit(h,'chunk',700);edit(h,'chunk','');edit(h,'chunk',700);
    await wait(400);
    assert.equal(h.$('chunk').value,'700');
    assert.equal(h.store.get('chat:chat-a').chunk,700,`edit was lost; original=${before}`);
  }finally{await h.close();}
});

test('a new chat recovers its narrator voice after a failed first save',async()=>{
  const h=await harness();
  try{
    h.store.delete('chat:chat-a');await h.reload();
    h.state.failConfigSave=true;
    const narrator=h.root.querySelector('[data-choir-voice]');narrator.value='n';
    narrator.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>h.$('saveState').textContent.includes('Save failed'));
    await switchTo(h,'chat-b');h.state.failConfigSave=false;await switchTo(h,'chat-a');
    assert.equal(h.root.querySelector('[data-choir-voice]').value,'n');
  }finally{h.state.failConfigSave=false;await h.close();}
});

test('a delayed failed speaker edit never replaces the newly opened chat plan',{skip:branch!=='script'},async()=>{
  const h=await harness();let reject;
  try{
    configure(h);await h.reload();await h.plan();
    const b={...h.message,id:'message-b',content:'Evening arrived. "Hello." "Wait."'};
    h.ctx.messages.getRecent=()=>[h.state.active==='chat-a'?h.message:b];
    h.ctx.messages.getContent=id=>id===h.message.id?h.message.content:id===b.id?b.content:null;
    h.store.set('chat:chat-b',structuredClone(h.store.get('chat:chat-a')));
    await switchTo(h,'chat-b');await h.plan();await switchTo(h,'chat-a');
    const set=h.ctx.settings.set;let held=false;
    h.ctx.settings.set=async(key,value)=>{
      if(key.startsWith('plan:') && !held){held=true;await new Promise((_,no)=>reject=no);}
      return set(key,value);
    };
    choice(h,2,'Guard');await until(()=>reject);
    await switchTo(h,'chat-b');assert.match(h.$('planJson').value,/Evening/);
    reject(Error('Delayed speaker save failed'));reject=null;
    await until(()=>h.$('status').textContent.includes('Delayed speaker save failed'));
    assert.match(h.$('planJson').value,/Evening/);
  }finally{reject?.(Error('Cleanup'));await h.close();}
});

test('a rejected speaker edit keeps persistent and visible attribution consistent',{skip:branch!=='script'},async()=>{
  const h=await harness();
  try{
    configure(h);await h.reload();await h.plan();
    const set=h.ctx.settings.set;
    h.ctx.settings.set=async(key,value)=>{if(key.startsWith('activeplan:'))throw Error('Active pointer write failed');return set(key,value);};
    choice(h,2,'Guard');await until(()=>h.$('status').textContent.includes('Active pointer write failed'));
    const visible=JSON.parse(h.$('planJson').value).segments[1].speaker;
    const saved=[...h.store].find(([key])=>key.startsWith('plan:'))[1].attribution.segments[1].speaker;
    assert.equal(saved,visible);
  }finally{await h.close();}
});

test('skipping unnecessary card analysis still restores a saved speaker correction',{skip:branch!=='script'},async()=>{
  const h=await harness();
  try{
    configure(h);h.state.character={name:'Mira',description:'Mira is a captain with a warm voice. No formatted profiles.'};
    h.store.get('chat:chat-a').injectPlan='auto';
    await h.reload();h.message.content='Mira smiled. "Hello."\n<!--choir\nQ1|Mira|warm|Hello\n-->';
    await h.plan();choice(h,2,'Guard');await until(()=>h.$('status').textContent.startsWith('Block 2 is now'));
    // The saved correction is restored when the chat opens again. (Plan latest on a shown plan re-plans by design.)
    await h.reload();await until(()=>h.$('planJson').value);
    assert.equal(JSON.parse(h.$('planJson').value).segments[1].speaker,'Guard');
  }finally{await h.close();}
});

test('extracting a later sentence omits earlier sentence sound cues',async()=>{
  const h=await harness();
  try{
    configure(h);Object.assign(h.store.get('chat:chat-a'),{enableSfx:true,freesoundApiKey:'fixture-only'});
    h.message.content='The glass shattered. Later she slept.';await h.reload();await h.plan();
    const full=globalThis.__CHOIR_API__.planParagraph(h.message.content).segments;
    assert.ok(full.some(segment=>segment.kind==='sfx'),'full paragraph must have the real sound cue');
    const later=globalThis.__CHOIR_API__.planParagraph('Later she slept.').segments;
    assert.equal(later.filter(segment=>segment.kind==='sfx').length,0);
  }finally{await h.close();}
});

test('a repeated dialogue paragraph uses its requested paragraph position',async()=>{
  const h=await harness();
  try{
    configure(h);await h.reload();h.message.content='"Yes."\n\n"Yes."';
    const send=h.ctx.sendToBackend;
    h.ctx.sendToBackend=request=>{
      if(request.action!=='plan')return send(request);
      h.requests.push(request);
      const units=core.speechSourceUnits(request.input.transcript);
      const result=core.validatePlan({segments:units.map((unit,index)=>({unit_ids:[unit.id],speaker:index?'Guard':'Mira',voice:index?'g':'m',style:'',text:unit.text}))},request.input.transcript,request.input.config);
      queueMicrotask(()=>h.emitBackend({namespace:'choir',id:request.id,result}));
    };
    await h.plan();
    await globalThis.__CHOIR_API__.playParagraph({text:'"Yes."',messageId:h.message.id,paragraphIndex:1});
    assert.equal(h.synthesis.at(-1).voice,'g');
  }finally{await h.close();}
});

test('prefetch handoff honors concurrency after a voice change',async()=>{
  const h=await fluid.harness({normalize:false,prefetch:1,concurrency:1});let first,next;
  try{
    first=fluid.observe(h.bridge.playParagraph({text:'Current paragraph.',nextText:'Future paragraph.'}));
    await fluid.until(()=>h.requests.length===1);h.requests[0].release();
    await fluid.until(()=>h.voices()[0]?.started && h.requests.length===2);
    h.voices()[0].finish();await first.promise;
    const narrator=document.querySelector('[data-choir-voice]');narrator.value='m';
    narrator.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));
    next=fluid.observe(h.bridge.playParagraph({text:'Future paragraph.'}));
    await fluid.tick();await fluid.tick();
    assert.equal(h.state.peak,1,JSON.stringify(h.requests.map(({text,voice})=>({text,voice}))));
  }finally{await h.close();await first?.promise;await next?.promise;}
});

test('muting a paused companion clip does not resume the next speaker',async()=>{
  const h=await fluid.harness({normalize:false,prefetch:1});let operation;
  try{
    operation=fluid.observe(h.bridge.playParagraph({text:'Opening narration. "Hello."'}));
    await fluid.until(()=>h.requests.length>=1);h.requests[0].release();
    await fluid.until(()=>h.voices()[0]?.started && h.requests.length>=2);h.requests[1].release();
    document.querySelector('[data-choir-action="playback"]').click();
    assert.equal(h.voices()[0].paused,true);
    h.bridge.setNarratorMuted(true);await fluid.until(()=>h.voices().length>=2);
    assert.equal(h.voices()[1].paused,true);
  }finally{await h.close();await operation?.promise;}
});

test('an abbreviated title remains inside a single interrupted speech tag',()=>{
  const plan=core.readInjectedPlan('<!--choir\nQ1|Mira|warm|Wait\n-->');
  assert.equal(core.injectedCastRows('"Wait," Dr. Mira said. "I can explain."',plan).covered,true);
});

test('a second semicolon-separated speech tag is not attributed to the first speaker',()=>{
  const plan=core.readInjectedPlan('<!--choir\nQ1|Mira|warm|Wait\n-->');
  assert.equal(core.injectedCastRows('"Wait," Mira said; Eve replied, "No."',plan).covered,false);
});

test('failed automatic voice-gender gating causes no discarded delivery call',async()=>{
  const h=backend(async request=>({answers:Object.fromEntries(Object.keys(request.questions).map(key=>[key,{choice:key.startsWith('speaker_')?'Mira':key.startsWith('voice_gender_')?'unknown':'neutral'}]))}));
  const result=await h.plan({
    transcript:'Mira said, "Hello."',
    config:{plannerMode:'jev',allowLlmFallback:true,useStyle:true,
      voices:[{id:'n'},{id:'m',gender:'female'}],
      fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Mira',voice:'',gender:'auto',style:''}],npcs:[]}
  });
  assert.equal(result.error,undefined);
  assert.ok(!h.calls.some(call=>call.startsWith('emotion_')),JSON.stringify(h.calls));
});

test('Ignore style explicitly clears inherited connection acting instructions',()=>{
  const delivery=voiceDelivery({
    segment:{text:'Hello.',style:'Warm'},actor:{speaker:'Mira',style:'Warm'},
    family:'openai',connection:{provider:'openai_tts',model:'gpt-4o-mini-tts',default_parameters:{instructions:'Shout every word'}},
    supported:{instructions:{}},styleParam:'none'
  });
  const effective={instructions:'Shout every word',...delivery.parameters};
  assert.equal(effective.instructions,'');
});

test('Ignore style makes identical native requests share a cache identity',()=>{
  const connection={provider:'openai_tts',model:'gpt-4o-mini-tts'},keys=[];
  for(const style of ['Warm','Firm']){
    const segment={text:'Hello.',voice:'alloy',route:'native:a',style};
    const delivery=voiceDelivery({segment,actor:{speaker:'Mira'},family:'openai',connection,supported:{instructions:{}},styleParam:'none'});
    // Ignore style may send an explicit empty instructions value (it overrides connection defaults); it must not vary with style.
    assert.ok(!/Warm|Firm/.test(JSON.stringify(delivery.parameters)));
    keys.push(core.passageKey({...segment,style:delivery.style},{defaultRoute:'native:a'},connection,delivery.parameters));
  }
  assert.equal(keys[0],keys[1]);
});
