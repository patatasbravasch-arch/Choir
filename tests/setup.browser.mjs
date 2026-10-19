import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {createSetupWizard,saveSetupSettings,ONBOARDING_KEY} from '../src/setup.js';
import {setup} from '../dist/frontend.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const until=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await tick();}throw Error('Setup UI did not reach the expected state');};
const base=()=>({mode:'native',connection:'tts',model:'gemini-speech',connectionMode:'several',plannerMode:'heuristic',planner:'llm',
  fixed:['Narrator','Persona','Character'].map(speaker=>({speaker,voice:'voice',style:''})),npcPolicy:{mode:'skip',voices:[]},
  enableSfx:false,enableAmbience:false,enableMusic:false,autoDesignNPCs:false,auto:false,autoPlan:false});
const profiles={tts:[{id:'tts',name:'Speech',provider:'openai_tts',model:'speech-model'}],llm:[{id:'llm',name:'Planner',model:'text-model',is_default:true}],decision:[{id:'decision',name:'Jev'}]};

function uiHarness({existing=false,state,config=base(),failSave=false}={}){
  const dom=new JSDOM('<body></body>'),store=new Map(),modals=[],reports=[],calls=[],session={gemini:'',jev:''};let voiceFailure=false,testFailure=false,holdTest=false,releaseTest;
  if(state)store.set(ONBOARDING_KEY,state);
  const settings={get:async key=>store.get(key),set:async(key,value)=>{if(failSave && key==='settings:global'){failSave=false;throw Error('Storage unavailable');}store.set(key,structuredClone(value));},remove:async key=>store.delete(key)};
  const ctx={settings,dom:{addStyle:css=>{const style=dom.window.document.createElement('style');style.textContent=css;dom.window.document.head.append(style);return()=>style.remove();}},ui:{showModal:options=>{
    calls.push(['modal',options]);const root=dom.window.document.createElement('section');root.setAttribute('role','dialog');root.setAttribute('aria-label',options.title);dom.window.document.body.append(root);
    let dismiss;const modal={root,onDismiss(fn){dismiss=fn;return()=>dismiss=null;},dismiss(){root.remove();dismiss?.();}};modals.push(modal);return modal;
  }}};
  const wizard=createSetupWizard(ctx,{
    report:value=>reports.push(value),session:()=>session,setSession:(kind,value)=>{session[kind]=value;},stopTest:()=>calls.push(['stopTest']),connectionGuide:()=>calls.push(['guide']),
    snapshot:async()=>({config:structuredClone(config),existing,preset:null,connections:structuredClone(profiles)}),
    connections:async()=>{calls.push(['connections']);return structuredClone(profiles);},
    voices:async route=>{calls.push(['voices',route]);if(voiceFailure)throw Error('Catalogue offline');return [{id:'voice',name:'Voice'},{id:'other',name:'Other'}];},
    testPlanner:async(draft,signal)=>{calls.push(['planner',draft.plannerMode]);if(testFailure)throw Error('Planner unavailable');if(holdTest)await new Promise((resolve,reject)=>{releaseTest=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true});});return 'Local · Heuristic · no LLM request';},
    testVoice:async draft=>{calls.push(['synthesis']);if(testFailure)throw Error(`Provider rejected ${draft.freesoundApiKey}`);},
    save:async draft=>saveSetupSettings(settings,[['settings:global',{mode:draft.mode,enableSfx:draft.enableSfx,plannerMode:draft.plannerMode}],['settings:captured-defaults',{version:2,leadVoices:draft.fixed,npcPolicy:draft.npcPolicy}]],{version:1,completed:true,deferred:false})
  });
  const root=()=>dom.window.document.querySelector('[data-choir-setup]');
  const findButton=text=>[...root().querySelectorAll('button')].find(node=>node.textContent===text);
  const click=text=>{const node=findButton(text);assert.ok(node,`Missing button ${text}`);assert.equal(node.disabled,false,`Disabled button ${text}`);node.click();};
  const label=text=>root().querySelector(`[aria-label="${text}"]`);
  const select=(text,value)=>{const node=label(text);node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const input=(text,value)=>{const node=label(text);node.value=value;node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  return {dom,store,modals,reports,calls,wizard,root,click,label,select,input,session,setVoiceFailure:value=>{voiceFailure=value;},setTestFailure:value=>{testFailure=value;},holdTest(){holdTest=true;},releaseTest:()=>releaseTest?.()};
}

test('automatic first run has one modal, navigates backward and forward, and makes no paid call',async()=>{
  const h=uiHarness();await Promise.all([h.wizard.start(),h.wizard.start(),h.wizard.open()]);assert.equal(h.modals.length,1);
  assert.equal(h.root().querySelector('h2').textContent,'Welcome');h.click('Next');assert.equal(h.label('Planner engine').value,'heuristic');
  h.click('Next');await until(()=>h.label('Narrator voice').options.length===3);h.select('Narrator voice','other');h.click('Back');h.click('Next');
  assert.equal(h.label('Narrator voice').value,'other');h.click('Next');h.click('Next');assert.match(h.root().textContent,/connection has not been tested/);
  assert.equal(h.calls.filter(call=>['planner','synthesis'].includes(call[0])).length,0);h.wizard.dispose();assert.equal(h.root(),null);
});

test('Skip and close persist deferral without saving settings; manual reopen still works',async()=>{
  for(const action of ['skip','dismiss']){
    const h=uiHarness();await h.wizard.start();if(action==='skip')h.click('Skip for now');else h.modals[0].dismiss();
    await until(()=>h.store.get(ONBOARDING_KEY)?.deferred);assert.equal(h.store.has('settings:global'),false);
    await h.wizard.start();assert.equal(h.root(),null);await h.wizard.open();assert.ok(h.root());h.wizard.dispose();
  }
});

test('completed setup stays quiet on reload and can be run again without losing completion when skipped',async()=>{
  const h=uiHarness({state:{completed:true}});await h.wizard.start();assert.equal(h.modals.length,0);await h.wizard.open();h.click('Skip for now');await tick();
  assert.equal(h.store.get(ONBOARDING_KEY).completed,true);h.wizard.dispose();
});

test('missing connections block navigation and refresh errors do not assert that a connection works',async()=>{
  const config=base();config.connection='missing';const h=uiHarness({config});await h.wizard.start();h.click('Next');h.click('Next');
  assert.equal(h.root().querySelector('h2').textContent,'Connections');assert.match(h.root().querySelector('[role="alert"]').textContent,/available TTS/);
  h.select('Default TTS connection','tts');h.click('Refresh connections');await until(()=>h.root().textContent.includes('Connections refreshed'));h.click('Next');
  assert.equal(h.root().querySelector('h2').textContent,'TTS & Voices');h.wizard.dispose();
});

test('finish validates optional requirements, reports save failure, retries, and offers an explicit final playback test',async()=>{
  const h=uiHarness({failSave:true});await h.wizard.start();h.click('Next');h.click('Next');h.click('Next');
  const sfx=h.label('Sound effects');sfx.checked=true;sfx.dispatchEvent(new h.dom.window.Event('change'));h.click('Next');assert.match(h.root().textContent,/need a Freesound API key/);
  sfx.checked=false;sfx.dispatchEvent(new h.dom.window.Event('change'));h.click('Next');h.click('Finish setup');await until(()=>h.root().textContent.includes('Setup could not be saved'));
  assert.ok(!h.store.get(ONBOARDING_KEY)?.completed);h.click('Finish setup');await until(()=>h.root().textContent.includes('Setup completed successfully'));
  assert.equal(h.store.get(ONBOARDING_KEY).completed,true);assert.equal(h.calls.filter(call=>call[0]==='synthesis').length,0);
  h.click('Test final playback');await until(()=>h.root().textContent.includes('Voice test passed'));assert.equal(h.calls.filter(call=>call[0]==='synthesis').length,1);
  h.click('Close');assert.equal(h.root(),null);h.wizard.dispose();
});

test('test failures are actionable, secrets are redacted, retries work and changing choices invalidates the test result',async()=>{
  const h=uiHarness({config:{...base(),freesoundApiKey:'super-secret-key'}});await h.wizard.start();h.click('Next');h.click('Next');
  h.setTestFailure(true);h.click('Test narrator voice');await until(()=>h.root().textContent.includes('Provider rejected'));assert.ok(!h.root().textContent.includes('super-secret-key'));assert.match(h.root().textContent,/redacted/);
  h.setTestFailure(false);h.click('Test narrator voice');await until(()=>h.root().textContent.includes('Voice test passed'));h.select('Narrator voice','other');h.click('Next');h.click('Next');
  assert.match(h.root().textContent,/Speech connection has not been tested/);h.wizard.dispose();
});

test('voice catalogue failure permits retry and dismissal aborts a pending test and remembers deferral',async()=>{
  const h=uiHarness();h.setVoiceFailure(true);await h.wizard.start();h.click('Next');h.click('Next');await until(()=>h.root().textContent.includes('Catalogue offline'));
  h.setVoiceFailure(false);h.click('Retry voice list');await until(()=>h.label('Narrator voice').options.length===3);h.click('Back');h.holdTest();h.click('Test planner connection');
  h.modals[0].dismiss();await until(()=>h.store.get(ONBOARDING_KEY)?.deferred);assert.equal(h.root(),null);h.wizard.dispose();
});

test('existing users are seeded from their configuration and cancel preserves it exactly',async()=>{
  const config={...base(),enableSfx:true,freesoundApiKey:'existing-key',plannerMode:'llm',npcPolicy:{mode:'preferred',voices:['voice']}};
  const h=uiHarness({existing:true,config});const before=structuredClone(config);await h.wizard.start();assert.match(h.root().textContent,/existing setup was found/);
  h.click('Next');assert.equal(h.label('Planner engine').value,'llm');h.click('Next');h.select('Narrator voice','other');h.click('Skip for now');await tick();
  assert.deepEqual(config,before);assert.equal(h.store.has('settings:captured-defaults'),false);h.wizard.dispose();
});

test('persona and main cast offer Let the LLM choose and save automatic choices without planner calls',async()=>{
  const h=uiHarness();await h.wizard.start();h.click('Next');h.select('Planner engine','llm');h.click('Next');
  await until(()=>h.label('Main character voice').options.length===3);
  for(const name of ['Narrator','Persona','Main character']){assert.equal(h.label(`${name} voice`).options[0].textContent,'Let the LLM choose');h.select(`${name} voice`,'');}
  h.click('Test main character voice');assert.match(h.root().textContent,/chooses it when you plan a reply/);assert.equal(h.calls.filter(call=>call[0]==='synthesis').length,0);
  h.click('Next');h.click('Next');assert.match(h.root().textContent,/LLM chooses during planning/);h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
  assert.deepEqual(h.store.get('settings:captured-defaults').leadVoices.map(actor=>actor.voice),['','','']);assert.equal(h.calls.filter(call=>call[0]==='planner').length,0);h.wizard.dispose();
});

test('Fish setup guide distinguishes credentials from voices and never offers retired direct Gemini setup',async()=>{
  const h=uiHarness();await h.wizard.start();h.click('Next');
  assert.equal(h.label('Speech mode'),null);assert.doesNotMatch(h.root().textContent,/Direct Gemini|Gemini API key/);
  const guide=[...h.root().querySelectorAll('details')].find(node=>node.querySelector('summary')?.textContent==='How to connect Fish Audio');assert.ok(guide);guide.open=true;
  const links=[...guide.querySelectorAll('a')];assert.ok(links.some(link=>link.href==='https://fish.audio/app/api-keys'));assert.ok(links.every(link=>link.target==='_blank' && link.rel.includes('noopener')));
  assert.match(guide.textContent,/API key.*voice ID/s);assert.match(guide.textContent,/Refresh connections/);assert.equal(h.calls.filter(call=>['synthesis','planner'].includes(call[0])).length,0);assert.equal(h.store.size,0);h.wizard.dispose();
});

// Integration with the generated extension, including the real persistence,
// synthesis adapter, and chat switching paths (providers are deterministic).
async function frontendHarness(existing){
  const dom=new JSDOM('<body><main></main></body>',{url:'http://lumiverse.test'}),store=new Map(),events=new Map(),subscriptions=new Map(),rpc=[],synthesis=[],audios=[];
  const original={document:globalThis.document,fetch:globalThis.fetch,Audio:globalThis.Audio,indexedDB:globalThis.indexedDB};
  Object.assign(globalThis,{document:dom.window.document,indexedDB:new IDBFactory()});
  let backend,active=existing?'old':null;
  if(existing){store.set('chat:old',{...base(),fixed:base().fixed.map((actor,index)=>({...actor,voice:['old-n','old-y','old-m'][index]})),casts:{'native:tts':[{speaker:'Guard',voice:'old-g',style:''}]}});store.set('settings:global',{mode:'native',connection:'tts',plannerMode:'heuristic',prefetch:0});}
  class Audio {constructor(){this.paused=true;audios.push(this);}play(){this.paused=false;setTimeout(()=>this.onended?.(),1);return Promise.resolve();}pause(){this.paused=true;}}
  globalThis.Audio=Audio;
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/tts/synthesize')){synthesis.push(JSON.parse(options.body));return new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'audio/mpeg'}});}
    if(url.includes('/providers'))return Response.json({providers:[{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}}]});
    if(url.endsWith('/voices'))return Response.json({voices:['voice','other','old-n','old-y','old-m','old-g'].map(id=>({id,name:id}))});
    if(url.includes('/tts-connections?'))return Response.json({data:profiles.tts});
    if(url.includes('/decision-connections?'))return Response.json({data:profiles.decision});
    if(url.includes('/connections?'))return Response.json({data:profiles.llm});
    return Response.json({extensions:[]});
  };
  const ctx={settings:{get:async key=>store.get(key),set:async(key,value)=>store.set(key,structuredClone(value)),remove:async key=>store.delete(key)},
    getActiveChat:()=>({chatId:active}),messages:{getRecent:()=>[],getContent:()=>''},state:{subscribe:(key,fn)=>{subscriptions.set(key,fn);return()=>subscriptions.delete(key);}},
    dom:{addStyle:()=>()=>{}},ui:{registerDrawerTab:()=>({root:document.querySelector('main'),destroy(){},activate(){}}),registerInputBarAction:()=>({onClick(){},destroy(){}}),
      showModal:options=>{const root=document.createElement('section');root.setAttribute('role','dialog');root.setAttribute('aria-label',options.title);document.body.append(root);let dismiss;return {root,onDismiss(fn){dismiss=fn;return()=>dismiss=null;},dismiss(){root.remove();dismiss?.();}};}},
    events:{on:(key,fn)=>{events.set(key,fn);return()=>events.delete(key);}},onBackendMessage:fn=>{backend=fn;return()=>backend=null;},
    sendToBackend:request=>{rpc.push(request);if(request.action==='cancel')return;setTimeout(()=>backend?.({namespace:'choir',id:request.id,result:request.action==='ping'?{ready:true,decisionsAvailable:true}:{provider:'local',model:'heuristic',response:'READY'}}),1);}
  };
  const cleanup=await setup(ctx);
  const root=()=>document.querySelector('[data-choir-setup]');
  const click=text=>{const button=[...root().querySelectorAll('button')].find(node=>node.textContent===text);assert.ok(button,`Missing ${text}: ${root().textContent}`);assert.equal(button.disabled,false);button.click();};
  const select=(label,value)=>{const node=root().querySelector(`[aria-label="${label}"]`);node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  return {store,rpc,synthesis,audios,root,click,select,dom,async switchChat(id){active=id;subscriptions.get('chat.active')?.();await tick();},cleanup(){cleanup();dom.window.close();Object.assign(globalThis,original);}};
}

test('generated Choir saves first-run defaults without chat writes, plays actual native speech and inherits defaults in a new chat',async()=>{
  const h=await frontendHarness(false);
  try{
    await until(()=>h.root());assert.equal(h.synthesis.length,0);assert.ok(h.rpc.every(request=>request.action==='ping'));
    h.click('Next');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);
    for(const name of ['Narrator','Persona','Main character'])h.select(`${name} voice`,'voice');
    h.click('Test narrator voice');await until(()=>h.root().textContent.includes('Voice test passed'));assert.equal(h.synthesis.length,1);assert.equal(h.audios.length,1);assert.equal(h.synthesis[0].connectionId,'tts');
    h.click('Next');h.click('Next');h.click('Finish setup');await until(()=>h.root().textContent.includes('Setup completed successfully'));
    assert.equal(h.store.get(ONBOARDING_KEY).completed,true);assert.equal(h.store.get('settings:global').plannerMode,'heuristic');assert.equal(h.store.get('settings:global').enableSfx,false);
    assert.deepEqual(h.store.get('settings:captured-defaults').leadVoices.map(actor=>actor.voice),['voice','voice','voice']);assert.ok(![...h.store.keys()].some(key=>key.startsWith('chat:')));
    h.click('Close');await h.switchChat('new');await until(()=>document.querySelectorAll('[data-choir-voice]').length===3);
    assert.deepEqual([...document.querySelectorAll('[data-choir-voice]')].map(node=>node.value),['voice','voice','voice']);
  }finally{h.cleanup();}
});

test('generated Choir keeps an existing chat cast and NPCs byte-for-byte while saving new defaults',async()=>{
  const h=await frontendHarness(true);
  try{
    const before=structuredClone(h.store.get('chat:old'));await until(()=>h.root());h.click('Next');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);h.select('Narrator voice','other');h.click('Next');h.click('Next');h.click('Finish setup');
    await until(()=>h.root().textContent.includes('Setup completed successfully'));assert.deepEqual(h.store.get('chat:old'),before);
    assert.equal(h.store.get('settings:captured-defaults').leadVoices[0].voice,'other');assert.equal(document.querySelector('[data-choir-voice]').value,'old-n');
    assert.ok(!JSON.stringify([...h.store.values()]).includes('jevApiKey":"session'));assert.equal(h.synthesis.length,0);
  }finally{h.cleanup();}
});

test('generated Choir preserves automatic lead IDs and the LLM planner without synthesizing or planning during setup',async()=>{
  const h=await frontendHarness(false);
  try{
    await until(()=>h.root());h.click('Next');h.select('Planner engine','llm');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Main character voice"]').options.length>2);
    for(const name of ['Narrator','Persona','Main character'])h.select(`${name} voice`,'');
    h.click('Next');h.click('Next');h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    assert.deepEqual(h.store.get('settings:captured-defaults').leadVoices.map(actor=>actor.voice),['','','']);assert.equal(h.store.get('settings:global').plannerMode,'llm');
    assert.equal(h.synthesis.length,0);assert.ok(h.rpc.every(request=>request.action==='ping'));assert.equal(h.store.get(ONBOARDING_KEY).completed,true);
  }finally{h.cleanup();}
});

test('generated setup saves reading exclusions and highlight preferences through the existing global settings',async()=>{
  const h=await frontendHarness(false);try{
    await until(()=>h.root());h.click('Next');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);
    for(const name of ['Narrator','Persona','Main character'])h.select(`${name} voice`,'voice');h.click('Next');
    const tags=h.root().querySelector('[aria-label="Skip tags and blocks"]');tags.value='summary, .tracker';tags.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    h.select('Highlight spoken text','word');const automatic=h.root().querySelector('[aria-label="Skip non-story blocks"]');automatic.checked=false;automatic.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    h.click('Next');assert.match(h.root().textContent,/summary, .tracker/);h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    assert.equal(h.store.get('settings:global').ignoredTags,'summary, .tracker');assert.equal(h.store.get('settings:global').skipMeta,false);assert.equal(h.store.get('settings:global').readAlong,'word');assert.equal(h.synthesis.length,0);
    assert.ok(h.rpc.every(request=>request.action==='ping'));
  }finally{h.cleanup();}
});
