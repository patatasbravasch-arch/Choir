import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {createSetupWizard,saveSetupSettings,ONBOARDING_KEY} from '../src/setup.js';
import {setup} from '../dist/frontend.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const until=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await tick();}throw Error('Setup UI did not reach the expected state');};
const base=()=>({mode:'native',connection:'tts',model:'gemini-speech',connectionMode:'several',plannerMode:'heuristic',planner:'llm',
  fixed:['Narrator','Persona','Character'].map(speaker=>({speaker,voice:'voice',style:''})),npcPolicy:{mode:'skip',voices:[]},
  enableSfx:false,enableAmbience:false,enableMusic:false,autoDesignNPCs:false,auto:false,autoPlan:false});
const profiles={tts:[{id:'tts',name:'Speech',provider:'openai_tts',model:'speech-model'}],llm:[{id:'llm',name:'Planner',model:'text-model',is_default:true}],decision:[{id:'decision',name:'Jev'}]};

function uiHarness({existing=false,state,config=base(),failSave=false,connections=profiles,plannerTest,connectionRequest,saveSetup,catalogue=[{id:'voice',name:'Voice'},{id:'other',name:'Other'}]}={}){
  const dom=new JSDOM('<body></body>'),store=new Map(),modals=[],reports=[],calls=[],session={gemini:'',jev:''};let voiceFailure=false,testFailure=false,holdTest=false,releaseTest;
  if(state)store.set(ONBOARDING_KEY,state);
  const settings={get:async key=>store.get(key),set:async(key,value)=>{if(failSave && key==='settings:global'){failSave=false;throw Error('Storage unavailable');}store.set(key,structuredClone(value));},remove:async key=>store.delete(key)};
  const ctx={settings,dom:{addStyle:css=>{const style=dom.window.document.createElement('style');style.textContent=css;dom.window.document.head.append(style);return()=>style.remove();}},ui:{showModal:options=>{
    calls.push(['modal',options]);const root=dom.window.document.createElement('section');root.setAttribute('role','dialog');root.setAttribute('aria-label',options.title);dom.window.document.body.append(root);
    let dismiss;const modal={root,onDismiss(fn){dismiss=fn;return()=>dismiss=null;},dismiss(){root.remove();dismiss?.();}};modals.push(modal);return modal;
  }}};
  const wizard=createSetupWizard(ctx,{
    report:value=>reports.push(value),session:()=>session,setSession:(kind,value)=>{session[kind]=value;},stopTest:()=>calls.push(['stopTest']),connectionGuide:()=>calls.push(['guide']),
    snapshot:async()=>({config:structuredClone(config),existing,preset:null,connections:structuredClone(connections)}),
    connections:async signal=>{calls.push(['connections']);return connectionRequest?connectionRequest(signal):structuredClone(connections);},
    voices:async route=>{calls.push(['voices',route]);if(voiceFailure)throw Error('Catalogue offline');return structuredClone(catalogue);},
    testPlanner:async(draft,signal)=>{calls.push(['planner',draft.plannerMode]);if(plannerTest)return plannerTest(draft,signal);if(testFailure)throw Error('Planner unavailable');if(holdTest)await new Promise((resolve,reject)=>{releaseTest=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true});});return 'Local · Heuristic · no LLM request';},
    testVoice:async(draft,actor)=>{calls.push(['synthesis',actor.speaker]);if(testFailure)throw Error(`Provider rejected ${draft.freesoundApiKey}`);},
    save:async(draft,initial,signal,onCommit)=>{calls.push(['save']);if(saveSetup)return saveSetup(draft,initial,signal,onCommit);onCommit?.();return saveSetupSettings(settings,[['settings:global',{mode:draft.mode,enableSfx:draft.enableSfx,plannerMode:draft.plannerMode}],['settings:captured-defaults',{version:2,leadVoices:draft.fixed,npcPolicy:draft.npcPolicy}]],{version:1,completed:true,deferred:false});}
  });
  const root=()=>dom.window.document.querySelector('[data-choir-setup]');
  const findButton=text=>[...root().querySelectorAll('button')].find(node=>(node.textContent===text || node.getAttribute('aria-label')===text));
  const click=text=>{const node=findButton(text);assert.ok(node,`Missing button ${text}`);assert.equal(node.disabled,false,`Disabled button ${text}`);node.click();};
  const label=text=>root().querySelector(`[aria-label="${text}"]`);
  const select=(text,value)=>{const node=label(text);node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const input=(text,value)=>{const node=label(text);node.value=value;node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  return {dom,store,modals,reports,calls,wizard,root,click,label,select,input,session,setVoiceFailure:value=>{voiceFailure=value;},setTestFailure:value=>{testFailure=value;},holdTest(){holdTest=true;},releaseTest:()=>releaseTest?.()};
}

test('automatic first run has one modal, navigates backward and forward, and makes no paid call',async()=>{
  const h=uiHarness();await Promise.all([h.wizard.start(),h.wizard.start(),h.wizard.open()]);assert.equal(h.modals.length,1);
  assert.equal(h.root().querySelector('h2').textContent,'Choose your setup');h.click('Guided setup');assert.equal(h.label('Planner engine').value,'llm');
  h.click('Next');await until(()=>h.label('Narrator voice').options.length===3);h.select('Narrator voice','other');h.click('Back');h.click('Next');
  assert.equal(h.label('Narrator voice').value,'other');h.click('Next');assert.match(h.root().textContent,/connection has not been tested/);
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
  const config=base();config.connection='missing';const h=uiHarness({existing:true,config});await h.wizard.start();h.click('Guided setup');h.click('Next');
  assert.equal(h.root().querySelector('h2').textContent,'Connect');assert.match(h.root().querySelector('[role="alert"]').textContent,/available TTS/);
  h.select('Default TTS connection','tts');h.click('Refresh connections');await until(()=>h.root().textContent.includes('Connections refreshed'));h.click('Next');
  assert.equal(h.root().querySelector('h2').textContent,'Voices');h.wizard.dispose();
});

test('finish validates optional requirements, reports save failure, retries, and offers an explicit final playback test',async()=>{
  const h=uiHarness({failSave:true});await h.wizard.start();h.click('Guided setup');h.click('Next');h.click('Next');
  h.click('Soundscape →');let sfx=h.label('Sound effects');sfx.checked=true;sfx.dispatchEvent(new h.dom.window.Event('change'));h.click('Finish setup');assert.match(h.root().textContent,/need a Freesound API key/);
  sfx=h.label('Sound effects');sfx.checked=false;sfx.dispatchEvent(new h.dom.window.Event('change'));h.click('Finish setup');await until(()=>h.root().textContent.includes('Setup could not be saved'));
  assert.ok(!h.store.get(ONBOARDING_KEY)?.completed);h.click('Finish setup');await until(()=>h.root().textContent.includes('Setup completed successfully'));
  assert.equal(h.store.get(ONBOARDING_KEY).completed,true);assert.equal(h.calls.filter(call=>call[0]==='synthesis').length,0);
  h.click('Test final playback');await until(()=>h.root().textContent.includes('Voice test passed'));assert.equal(h.calls.filter(call=>call[0]==='synthesis').length,1);
  h.click('Close');assert.equal(h.root(),null);h.wizard.dispose();
});

test('test failures are actionable, secrets are redacted, retries work and changing choices invalidates the test result',async()=>{
  const h=uiHarness({config:{...base(),freesoundApiKey:'super-secret-key'}});await h.wizard.start();h.click('Guided setup');h.click('Next');
  h.setTestFailure(true);h.click('Test narrator voice');await until(()=>h.root().textContent.includes('Provider rejected'));assert.ok(!h.root().textContent.includes('super-secret-key'));assert.match(h.root().textContent,/redacted/);
  h.setTestFailure(false);h.click('Test narrator voice');await until(()=>h.root().textContent.includes('Voice test passed'));h.select('Narrator voice','other');h.click('Next');
  assert.match(h.root().textContent,/Speech connection has not been tested/);h.wizard.dispose();
});

test('voice catalogue failure permits retry and dismissal aborts a pending test and remembers deferral',async()=>{
  const h=uiHarness();h.setVoiceFailure(true);await h.wizard.start();h.click('Guided setup');h.click('Next');await until(()=>h.root().textContent.includes('Catalogue offline'));
  h.setVoiceFailure(false);h.click('Retry voice list');await until(()=>h.label('Narrator voice').options.length===3);h.click('Back');h.holdTest();h.click('Test planner connection');
  h.modals[0].dismiss();await until(()=>h.store.get(ONBOARDING_KEY)?.deferred);assert.equal(h.root(),null);h.wizard.dispose();
});

test('existing users are seeded from their configuration and cancel preserves it exactly',async()=>{
  const config={...base(),enableSfx:true,freesoundApiKey:'existing-key',plannerMode:'llm',npcPolicy:{mode:'preferred',voices:['voice']}};
  const h=uiHarness({existing:true,config});const before=structuredClone(config);await h.wizard.start();assert.match(h.root().textContent,/existing setup was found/);
  h.click('Guided setup');assert.equal(h.label('Planner engine').value,'llm');h.click('Next');h.select('Narrator voice','other');h.click('Skip for now');await tick();
  assert.deepEqual(config,before);assert.equal(h.store.has('settings:captured-defaults'),false);h.wizard.dispose();
});

test('persona and main cast offer Let the LLM choose and save automatic choices without planner calls',async()=>{
  const h=uiHarness();await h.wizard.start();h.click('Guided setup');h.select('Planner engine','llm');h.click('Next');
  await until(()=>h.label('Main character voice').options.length===3);
  for(const name of ['Narrator','Persona','Main character']){assert.equal(h.label(`${name} voice`).options[0].textContent,'Let the LLM choose');h.select(`${name} voice`,'');}
  h.click('Test main character voice');assert.match(h.root().textContent,/chooses it when you plan a reply/);assert.equal(h.calls.filter(call=>call[0]==='synthesis').length,0);
  h.click('Next');assert.match(h.root().textContent,/LLM chooses during planning/);h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
  assert.deepEqual(h.store.get('settings:captured-defaults').leadVoices.map(actor=>actor.voice),['','','']);assert.equal(h.calls.filter(call=>call[0]==='planner').length,0);h.wizard.dispose();
});

test('Fish setup guide distinguishes credentials from voices and never offers retired direct Gemini setup',async()=>{
  const h=uiHarness();await h.wizard.start();h.click('Guided setup');
  assert.equal(h.label('Speech mode'),null);assert.doesNotMatch(h.root().textContent,/Direct Gemini|Gemini API key/);
  h.click('How to connect Fish Audio →');const guide=h.root().querySelector('[data-setup-guide=fish]');assert.ok(guide);
  const links=[...guide.querySelectorAll('a')];assert.ok(links.some(link=>link.href==='https://fish.audio/app/api-keys'));assert.ok(links.every(link=>link.target==='_blank' && link.rel.includes('noopener')));
  assert.match(guide.textContent,/API key.*voice ID/s);assert.match(guide.textContent,/Refresh connections/);assert.equal(h.calls.filter(call=>['synthesis','planner'].includes(call[0])).length,0);assert.equal(h.store.size,0);h.wizard.dispose();
});

function checkIllustratedGuide(h,id,expectedSteps,secret){
  const guide=h.root().querySelector(`[data-setup-guide="${id}"]`);assert.ok(guide,`Missing ${id} illustrated guide`);guide.open=true;
  const steps=[...guide.querySelectorAll('ol.cs-guide-steps > li')];
  assert.deepEqual(steps.map(step=>step.dataset.guideStep),expectedSteps);
  assert.equal(guide.querySelectorAll('figure').length,expectedSteps.length);
  assert.equal(guide.querySelectorAll('img').length,expectedSteps.length);
  for(const step of steps){
    const title=step.querySelector('h4').textContent,picture=step.querySelector('.cs-guide-picture'),image=picture.querySelector('img'),caption=step.querySelector('figcaption');
    assert.ok(image.alt.length>25,`Missing descriptive alternative text for ${title}`);
    assert.equal(image.loading,'lazy');assert.ok(image.width>0 && image.height>0);
    if(picture.dataset.pictureKind==='screenshot'){
      assert.match(image.src,/^assets\/guides\/[a-z-]+\.webp$/);
      const bytes=readFileSync(new URL('../'+image.src,import.meta.url));
      assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
      assert.ok(!bytes.includes(Buffer.from(secret)));
    }else{
      assert.match(image.src,/^data:image\/svg\+xml;charset=utf-8,/);
      const svg=decodeURIComponent(image.src.split(',').slice(1).join(','));
      assert.match(svg,/<svg\b/);assert.doesNotMatch(svg,/<script\b|<foreignObject\b|(?:href|src)=["']https?:/i);
      assert.ok(!svg.includes(secret));
    }
    assert.ok(!image.alt.includes(secret));assert.ok(!step.outerHTML.includes(secret));
    assert.ok(caption.textContent.trim());assert.equal(picture.getAttribute('aria-describedby'),caption.id);
    const toggle=step.querySelector('button');assert.equal(toggle.getAttribute('aria-label'),`Enlarge picture: ${title}`);assert.equal(toggle.getAttribute('aria-expanded'),'false');
    toggle.click();assert.ok(picture.classList.contains('cs-picture-large'));assert.equal(toggle.getAttribute('aria-expanded'),'true');
    assert.equal(toggle.getAttribute('aria-label'),`Reduce picture: ${title}`);assert.equal(h.dom.window.document.activeElement,picture);
    toggle.click();assert.equal(picture.classList.contains('cs-picture-large'),false);assert.equal(toggle.getAttribute('aria-expanded'),'false');
    assert.equal(toggle.getAttribute('aria-label'),`Enlarge picture: ${title}`);
  }
  const links=[...guide.querySelectorAll('a')];assert.ok(links.length);assert.ok(links.every(link=>link.target==='_blank'&&link.rel.includes('noopener')));
  return guide;
}

test('Fish Audio illustrated guide has an offline picture for every step and enlarges without provider requests or saving',async()=>{
  const secret='fish-guide-private-draft-key',h=uiHarness({config:{...base(),freesoundApiKey:secret}});
  try{
    await h.wizard.start();h.click('Guided setup');await tick();const before=h.calls.map(call=>call[0]);
    h.click('How to connect Fish Audio →');const guide=checkIllustratedGuide(h,'fish',['fish-account','fish-api-key','fish-lumiverse','fish-choose-connection','fish-voice-id','fish-test'],secret);
    assert.equal(guide.querySelector('h3').textContent,'How to connect Fish Audio');
    assert.match(guide.textContent,/Create New Key/);assert.match(guide.textContent,/Connect.*TTS.*New TTS Connection/);
    assert.match(guide.textContent,/API URL empty/);assert.match(guide.textContent,/Refresh connections/);
    assert.match(guide.textContent,/voice ID is different from an API key/);assert.match(guide.textContent,/Test narrator voice/);
    assert.match(guide.textContent,/illustrated examples, not screenshots/);
    const urls=[...guide.querySelectorAll('a')].map(link=>link.href);
    assert.ok(urls.some(url=>/^https:\/\/fish\.audio\/app\/api-keys\/?$/.test(url)));
    assert.ok(urls.includes('https://docs.fish.audio/developer-guide/getting-started/api-key'));
    assert.ok(urls.includes('https://docs.fish.audio/developer-guide/getting-started/quickstart'));
    await tick();assert.deepEqual(h.calls.map(call=>call[0]),before);assert.equal(h.store.size,0);
    h.click('← Back to setup');assert.equal(h.label('Default TTS connection').value,'tts');assert.equal(h.root().querySelector('h2').textContent,'Connect');
  }finally{h.wizard.dispose();h.dom.window.close();}
});

test('Freesound guide uses real website captures and explains the secret without exposing draft credentials',async()=>{
  const secret='freesound-guide-private-draft-key',h=uiHarness({config:{...base(),freesoundApiKey:secret}});
  try{
    await h.wizard.start();h.click('Guided setup');h.click('Next');h.click('Next');await tick();
    h.click('Soundscape →');h.input('Freesound API key',secret+'-edited');const before=h.calls.map(call=>call[0]);
    h.click('How to get a Freesound API key →');const guide=checkIllustratedGuide(h,'freesound',['freesound-account','freesound-apply','freesound-secret','freesound-paste','freesound-enable','freesound-finish'],secret);
    assert.equal(guide.querySelector('h3').textContent,'How to get a Freesound API key');
    assert.equal(guide.querySelectorAll('[data-picture-kind="screenshot"]').length,3);
    assert.match(guide.textContent,/actual Freesound website screenshots/);assert.match(guide.textContent,/credentials table was empty/);
    assert.match(guide.textContent,/Playback → Soundscape/);assert.doesNotMatch(guide.textContent,/Optional Features/);
    assert.match(guide.textContent,/Client secret\/Api key/);assert.match(guide.textContent,/Do not copy Client ID/);
    assert.match(guide.textContent,/Sound effects and\/or Ambient sound/);assert.match(guide.textContent,/Sound cue LLM connection/);
    assert.match(guide.textContent,/Finish setup/);assert.match(guide.textContent,/Plan latest/);assert.match(guide.textContent,/do not need to set up an OAuth/);
    const urls=[...guide.querySelectorAll('a')].map(link=>link.href);
    assert.ok(urls.includes('https://freesound.org/apiv2/apply/'));
    assert.ok(urls.includes('https://freesound.org/docs/api/authentication.html#token-authentication'));
    await tick();assert.deepEqual(h.calls.map(call=>call[0]),before);assert.equal(h.store.size,0);
    h.click('← Back to setup');assert.equal(h.label('Freesound API key').value,secret+'-edited');assert.equal(h.label('Freesound API key').type,'password');
    assert.equal(h.label('Sound effects').checked,false);assert.equal(h.label('Ambient sound').checked,false);
    assert.equal(h.root().querySelector('h2').textContent,'Soundscape');
  }finally{h.wizard.dispose();h.dom.window.close();}
});

test('deleted saved actor and NPC routes can be reached and repaired on the voices step',async()=>{
  const config={...base(),npcPolicy:{mode:'single',route:'native:deleted',voice:'old'}};
  config.fixed[0].route='native:deleted';
  const h=uiHarness({existing:true,config});await h.wizard.open();h.click('Guided setup');h.click('Next');
  assert.equal(h.root().querySelector('h2').textContent,'Voices');
  h.click('Next');assert.equal(h.root().querySelector('h2').textContent,'Voices');
  assert.match(h.root().textContent,/available TTS connection.*Narrator/s);
  h.select('Narrator connection','native:tts');await until(()=>h.label('Narrator voice').options.length===3);h.select('Narrator voice','voice');
  h.select('Casting connection','native:tts');await until(()=>h.label('Shared voice').options.length===3);h.select('Shared voice','voice');h.click('Next');
  assert.equal(h.root().querySelector('h2').textContent,'Try it');h.wizard.dispose();
});

test('switching default connections clears inherited voice IDs while preserving explicitly routed voices',async()=>{
  const connections={...profiles,tts:[...profiles.tts,{id:'other',name:'Other',provider:'google_tts',model:'gemini-tts'}]};
  const config={...base(),npcPolicy:{mode:'preferred',voices:['voice'],voice:'voice'}};config.fixed[1].route='native:tts';
  const h=uiHarness({existing:true,config,connections});await h.wizard.open();h.click('Guided setup');h.select('Default TTS connection','other');h.click('Next');
  assert.equal(h.label('Narrator voice').value,'');assert.equal(h.label('Persona voice').value,'voice');assert.equal(h.label('Main character voice').value,'');
  assert.equal(h.label('Preferred voice IDs').value,'');
  await until(()=>h.label('Narrator voice').options.length===3);h.select('Narrator voice','other');h.click('Change connection');h.select('Default TTS connection','tts');h.click('Next');assert.equal(h.label('Narrator voice').value,'');
  await until(()=>h.label('Narrator voice').options.length===3);
  h.select('Narrator voice','voice');h.click('Change connection');h.select('Voice connection mode','one');h.click('Next');assert.equal(h.label('Persona voice').value,'voice');
  h.click('Change connection');h.select('Default TTS connection','tts');h.click('Next');assert.equal(h.label('Narrator voice').value,'voice');h.wizard.dispose();
});

test('voice dropdown and custom provider ID stay synchronized',async()=>{
  const h=uiHarness();await h.wizard.open();h.click('Guided setup');h.click('Next');await until(()=>h.label('Narrator voice').options.length===3);
  h.select('Narrator voice','other');assert.equal(h.label('Narrator voice ID').value,'other');
  h.input('Narrator voice ID','private-voice');assert.equal(h.label('Narrator voice').value,'private-voice');h.wizard.dispose();
});

test('focused setup roles keep accents and delivery while validation opens the role needing a voice',async()=>{
  const config=base();config.fixed[2].voice='';const h=uiHarness({existing:true,config});await h.wizard.open();h.click('Guided setup');h.click('Next');
  const visible=()=>[...h.root().querySelectorAll('[data-setup-role]')].filter(panel=>!panel.hidden).map(panel=>panel.dataset.setupRole);
  assert.deepEqual(visible(),['0']);h.click('Next');assert.deepEqual(visible(),['2']);assert.match(h.root().querySelector('[role="alert"]').textContent,/Character/);
  await until(()=>h.label('Main character voice').options.length===3);h.select('Main character voice','other');
  h.input('Main character accent','light Irish accent');h.input('Main character base delivery','warm, conversational');h.select('Main character delivery','base');
  h.label('Edit narrator setup voice').click();assert.deepEqual(visible(),['0']);h.label('Edit main character setup voice').click();
  assert.equal(h.label('Main character accent').value,'light Irish accent');h.click('Next');h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
  const actor=h.store.get('settings:captured-defaults').leadVoices[2];assert.equal(actor.voice,'other');assert.equal(actor.accent,'light Irish accent');assert.equal(actor.style,'warm, conversational');assert.equal(actor.deliveryMode,'base');
  assert.equal(h.calls.filter(call=>['planner','synthesis'].includes(call[0])).length,0);h.wizard.dispose();
});

test('completion auditions an enabled role when narration is turned off',async()=>{
  const config=base();config.fixed[0].excluded=true;const h=uiHarness({config});await h.wizard.open();h.click('Guided setup');for(let i=0;i<2;i++)h.click('Next');h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
  h.click('Test final playback');await until(()=>h.root().textContent.includes('Voice test passed'));assert.equal(h.calls.find(call=>call[0]==='synthesis')[1],'Persona');h.wizard.dispose();
});

test('a non-cooperative planner test can be cancelled and its late response cannot overwrite the next step',async()=>{
  let release,signal;
  const h=uiHarness({plannerTest:async(_,value)=>{signal=value;return new Promise(resolve=>release=resolve);}});
  await h.wizard.open();h.click('Guided setup');h.click('Test planner connection');assert.ok(release);h.click('Cancel');
  await until(()=>!h.root().querySelector('[aria-label="Planner engine"]').disabled);assert.equal(signal.aborted,true);
  assert.match(h.root().textContent,/cancelled/i);h.click('Next');release('Late planner success');await tick();
  assert.equal(h.root().querySelector('h2').textContent,'Voices');assert.doesNotMatch(h.root().textContent,/Late planner success/);
  h.click('Next');assert.match(h.root().textContent,/Planner connection has not been tested/);h.wizard.dispose();
});

test('Finish validation can be cancelled before writes and a late connection result cannot save defaults',async()=>{
  let release,signal;
  const h=uiHarness({connectionRequest:async value=>{signal=value;return new Promise(resolve=>release=resolve);}});
  await h.wizard.open();h.click('Guided setup');for(let i=0;i<2;i++)h.click('Next');h.click('Finish setup');assert.ok(release);h.click('Cancel');
  await until(()=>!h.root().querySelector('.cs-primary').disabled);assert.equal(signal.aborted,true);h.click('Back');
  release({...structuredClone(profiles),tts:[]});await tick();assert.equal(h.calls.filter(call=>call[0]==='save').length,0);
  assert.equal(h.store.has(ONBOARDING_KEY),false);assert.equal(h.root().querySelector('h2').textContent,'Voices');
  h.click('Next');assert.doesNotMatch(h.root().textContent,/Missing TTS connection/);h.wizard.dispose();
});

test('Cancel is unavailable while settings writes commit',async()=>{
  let release;
  const h=uiHarness({saveSetup:async(_,__,___,onCommit)=>{onCommit();await new Promise(resolve=>release=resolve);}});
  await h.wizard.open();h.click('Guided setup');for(let i=0;i<2;i++)h.click('Next');h.click('Finish setup');await until(()=>release);
  assert.equal([...h.root().querySelectorAll('button')].find(node=>node.textContent==='Cancel').hidden,true);
  release();await until(()=>h.root().textContent.includes('Setup completed successfully'));h.click('Close');assert.equal(h.root(),null);h.wizard.dispose();
});

test('Jev catalogue setup requires an assigned narrator before review while allowing automatic dialogue voices',async()=>{
  const config={...base(),plannerMode:'jev',decisionConnection:'decision'};config.fixed.forEach(actor=>actor.voice='');
  const h=uiHarness({existing:true,config});await h.wizard.open();h.click('Guided setup');h.click('Next');
  assert.equal(h.label('Narrator voice').options[0].textContent,'Choose a voice');h.click('Next');
  assert.match(h.root().textContent,/Choose a narrator voice for Jev/);await until(()=>h.label('Narrator voice').options.length===3);
  h.select('Narrator voice','voice');h.click('Next');assert.equal(h.root().querySelector('h2').textContent,'Try it');h.wizard.dispose();
});

test('Review identifies the selected Jev Decision connection rather than the unrelated LLM ID',async()=>{
  const config={...base(),plannerMode:'jev',decisionConnection:'decision',planner:'llm'};
  const connections={...profiles,decision:[{id:'decision',name:'Decision QA',model:'jev-latest'}]};
  const h=uiHarness({existing:true,config,connections});await h.wizard.open();h.click('Guided setup');for(let i=0;i<2;i++)h.click('Next');
  assert.match(h.root().textContent,/Jev · Decision QA · jev-latest/);assert.doesNotMatch(h.root().textContent,/jev · llm/);h.wizard.dispose();
});

// Integration with the generated extension, including the real persistence,
// synthesis adapter, and chat switching paths (providers are deterministic).
async function frontendHarness(existing,{mixer}={}){
  const dom=new JSDOM('<body><main></main></body>',{url:'http://lumiverse.test'}),store=new Map(),events=new Map(),subscriptions=new Map(),rpc=[],synthesis=[],audios=[];
  const original={document:globalThis.document,fetch:globalThis.fetch,Audio:globalThis.Audio,indexedDB:globalThis.indexedDB};
  Object.assign(globalThis,{document:dom.window.document,indexedDB:new IDBFactory()});
  let backend,active=existing?'old':null;
  if(mixer)store.set('ui:mixer',structuredClone(mixer));
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
  const click=text=>{const button=[...root().querySelectorAll('button')].find(node=>(node.textContent===text || node.getAttribute('aria-label')===text));assert.ok(button,`Missing ${text}: ${root().textContent}`);assert.equal(button.disabled,false);button.click();};
  const select=(label,value)=>{const node=root().querySelector(`[aria-label="${label}"]`);node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  return {store,rpc,synthesis,audios,root,click,select,dom,async switchChat(id){active=id;subscriptions.get('chat.active')?.();await tick();},cleanup(){cleanup();dom.window.close();Object.assign(globalThis,original);}};
}

test('generated Choir saves first-run defaults without chat writes, plays actual native speech and inherits defaults in a new chat',async()=>{
  const h=await frontendHarness(false);
  try{
    await until(()=>h.root());assert.equal(h.synthesis.length,0);assert.ok(h.rpc.every(request=>request.action==='ping'));
    h.click('Guided setup');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);
    for(const name of ['Narrator','Persona','Main character'])h.select(`${name} voice`,'voice');
    h.click('Test narrator voice');await until(()=>h.root().textContent.includes('Voice test passed'));assert.equal(h.synthesis.length,1);assert.equal(h.audios.length,1);assert.equal(h.synthesis[0].connectionId,'tts');
    h.click('Next');h.click('Finish setup');await until(()=>h.root().textContent.includes('Setup completed successfully'));
    assert.equal(h.store.get(ONBOARDING_KEY).completed,true);assert.equal(h.store.get('settings:global').plannerMode,'llm');assert.equal(h.store.get('settings:global').enableSfx,false);
    assert.deepEqual(h.store.get('settings:captured-defaults').leadVoices.map(actor=>actor.voice),['voice','voice','voice']);assert.ok(![...h.store.keys()].some(key=>key.startsWith('chat:')));
    h.click('Close');await h.switchChat('new');await until(()=>document.querySelectorAll('[data-choir-voice]').length===3);
    assert.deepEqual([...document.querySelectorAll('[data-choir-voice]')].map(node=>node.value),['voice','voice','voice']);
  }finally{h.cleanup();}
});

test('generated Choir keeps an existing chat cast and NPCs byte-for-byte while saving new defaults',async()=>{
  const h=await frontendHarness(true);
  try{
    const before=structuredClone(h.store.get('chat:old'));await until(()=>h.root());h.click('Guided setup');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);h.select('Narrator voice','other');h.click('Next');h.click('Finish setup');
    await until(()=>h.root().textContent.includes('Setup completed successfully'));assert.deepEqual(h.store.get('chat:old'),before);
    assert.equal(h.store.get('settings:captured-defaults').leadVoices[0].voice,'other');assert.equal(document.querySelector('[data-choir-voice]').value,'old-n');
    assert.ok(!JSON.stringify([...h.store.values()]).includes('jevApiKey":"session'));assert.equal(h.synthesis.length,0);
  }finally{h.cleanup();}
});

test('generated setup auditions accent and base style through native synthesis and invalidates the changed test',async()=>{
  const h=await frontendHarness(false);try{
    await until(()=>h.root());h.click('Guided setup');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);
    for(const name of ['Narrator','Persona','Main character'])h.select(`${name} voice`,'voice');
    const input=(label,value)=>{const node=h.root().querySelector(`[aria-label="${label}"]`);node.value=value;node.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));};
    input('Narrator accent','Irish');input('Narrator base delivery','calm, measured');h.select('Narrator delivery','base');h.click('Test narrator voice');await until(()=>h.root().textContent.includes('Voice test passed'));
    assert.match(h.synthesis[0].parameters.instructions,/Irish/);assert.match(h.synthesis[0].parameters.instructions,/calm, measured/);assert.equal(h.synthesis[0].voice,'voice');
    input('Narrator accent','light Dublin accent');h.click('Next');assert.match(h.root().textContent,/Speech connection has not been tested/);h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    const actor=h.store.get('settings:captured-defaults').leadVoices[0];assert.equal(actor.accent,'light Dublin accent');assert.equal(actor.deliveryMode,'base');assert.equal(h.synthesis.length,1);
  }finally{h.cleanup();}
});

test('generated Choir preserves automatic lead IDs and the LLM planner without synthesizing or planning during setup',async()=>{
  const h=await frontendHarness(false);
  try{
    await until(()=>h.root());h.click('Guided setup');h.select('Planner engine','llm');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Main character voice"]').options.length>2);
    for(const name of ['Narrator','Persona','Main character'])h.select(`${name} voice`,'');
    h.click('Next');h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    assert.deepEqual(h.store.get('settings:captured-defaults').leadVoices.map(actor=>actor.voice),['','','']);assert.equal(h.store.get('settings:global').plannerMode,'llm');
    assert.equal(h.synthesis.length,0);assert.ok(h.rpc.every(request=>request.action==='ping'));assert.equal(h.store.get(ONBOARDING_KEY).completed,true);
  }finally{h.cleanup();}
});

test('voice gender filtering preserves explicit choices and unknown metadata, and shows descriptions',async()=>{
  const catalogue=[{id:'voice',name:'Storyteller',gender:'male',description:'Warm and deliberate.'},{id:'female',name:'Guide',gender:'female',description:'Clear and bright.'},{id:'other',name:'Guest'},{id:'second-male',name:'Man',gender:'male'}];
  const h=uiHarness({catalogue});await h.wizard.start();h.click('Guided setup');h.click('Next');await until(()=>h.label('Narrator voice').options.length===5);
  h.select('Narrator voice gender','female');let voices=h.label('Narrator voice');
  assert.equal(voices.value,'voice');assert.deepEqual([...voices.options].map(node=>node.value),['','voice','female','other']);
  assert.match(voices.selectedOptions[0].textContent,/Male.*differs from preference/);assert.match(h.root().textContent,/Warm and deliberate/);
  h.select('Narrator voice','female');voices=h.label('Narrator voice');assert.ok(![...voices.options].some(node=>node.value==='voice'));assert.match(h.root().textContent,/Clear and bright/);
  h.input('Narrator voice ID','custom-saved');assert.equal(h.label('Narrator voice').value,'custom-saved');h.select('Narrator voice gender','neutral');assert.equal(h.label('Narrator voice').value,'custom-saved');
  h.click('Next');assert.match(h.root().textContent,/custom-saved/);h.label('Edit narrator').click();assert.equal(h.label('Narrator voice gender').value,'neutral');assert.equal(h.calls.filter(call=>['planner','synthesis'].includes(call[0])).length,0);h.wizard.dispose();
});

test('Fish source changes revalidate automatic Jev narration, including OpenRouter Fish routes',async()=>{
  for(const speech of [{...profiles.tts[0],provider:'fish_audio',model:'s2'},{...profiles.tts[0],provider:'openrouter_tts',model:'fish-audio/s2:free'}]){
    const config={...base(),plannerMode:'jev',decisionConnection:'decision'};config.fixed[0].voice='';
    const h=uiHarness({existing:true,config,connections:{...profiles,tts:[speech]}});await h.wizard.open();h.click('Guided setup');h.click('Next');
    assert.equal(h.label('Voices the planner picks from').value,'community');h.select('Voices the planner picks from','own');h.click('Next');assert.equal(h.root().querySelector('h2').textContent,'Voices');assert.match(h.root().textContent,/Choose a narrator voice for Jev/);
    h.select('Voices the planner picks from','both');h.click('Next');assert.equal(h.root().querySelector('h2').textContent,'Try it');h.wizard.dispose();
  }
});

test('Jev fallback needs an LLM and invalid request limits can be repaired before Review',async()=>{
  const config={...base(),plannerMode:'jev',decisionConnection:'decision'};
  const h=uiHarness({existing:true,config,connections:{...profiles,llm:[]}});await h.wizard.open();h.click('Guided setup');
  const fallback=h.label('Allow LLM fallback after Jev fails');fallback.checked=true;fallback.dispatchEvent(new h.dom.window.Event('change'));h.click('Next');assert.match(h.root().textContent,/LLM fallback needs/);
  fallback.checked=false;fallback.dispatchEvent(new h.dom.window.Event('change'));h.click('Next');h.click('Next');
  assert.equal(h.label('Automatic NPC voice casting'),null);
  for(const [label,bad,good] of [['Prefetch passages','5','2'],['Concurrent TTS requests','0','2'],['Max characters per request','79','900']]){
    if(!h.label(label))h.click('Performance & text filters →');h.input(label,bad);h.click('Finish setup');assert.equal(h.root().querySelector('h2').textContent,'Performance & text filters');assert.match(h.root().querySelector('[role="alert"]').textContent,/whole number/);h.input(label,good);
  }
  assert.equal(h.label('Prefetch passages').value,'2');assert.equal(h.label('Concurrent TTS requests').value,'2');assert.equal(h.label('Max characters per request').value,'900');h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);h.wizard.dispose();
});

test('generated setup persists drawer choices and new-chat genders while preserving the existing cast and mixer state',async()=>{
  const mixer={playbackRate:1.75,voiceGapMs:80,speedSliderMax:3,abyssalTheme:true,position:{x:40,y:100},master:.7,effects:.4};
  const h=await frontendHarness(true,{mixer});try{
    const before=structuredClone(h.store.get('chat:old'));await until(()=>h.root());h.click('Guided setup');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);
    h.select('Narrator voice','other');h.select('Narrator voice gender','female');h.select('Persona voice gender','neutral');h.select('Main character voice gender','male');h.click('Next');
    const setCheck=(name,value)=>{const node=h.root().querySelector(`[aria-label="${name}"]`);node.checked=value;node.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));};
    const setNumber=(name,value)=>{const node=h.root().querySelector(`[aria-label="${name}"]`);node.value=String(value);node.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));};
    setCheck('Floating audio mixer',true);setCheck('Match passage loudness',false);setCheck('Show message play controls',true);h.select('Audio retention for new recordings','7');
    h.click('Performance & text filters →');setCheck('Group speech requests',true);setCheck('Show automatic planning shortcut',true);setNumber('Prefetch passages',2);setNumber('Concurrent TTS requests',3);setNumber('Max characters per request',900);h.click('Back to playback');
    h.click('Soundscape →');setCheck('Background music',true);assert.equal(h.root().querySelector('[aria-label="Loop music between replies"]').closest('div').hidden,false);setCheck('Loop music between replies',true);
    h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    const global=h.store.get('settings:global');for(const [key,value] of Object.entries({enableMixer:true,normalizeLoudness:false,batchSpeech:true,retention:'7',prefetch:2,concurrency:3,chunk:900,sectionButtons:true,showAutoPlanAction:true,enableMusic:true,loopMusic:true,autoPlan:false,auto:false}))assert.equal(global[key],value,key);
    assert.deepEqual(h.store.get('settings:captured-defaults').leadVoices.map(actor=>actor.gender),['female','neutral','male']);assert.deepEqual(h.store.get('chat:old'),before);assert.deepEqual(h.store.get('ui:mixer'),mixer);
    assert.equal(h.synthesis.length,0);assert.ok(h.rpc.every(request=>request.action==='ping'));await until(()=>h.root().textContent.includes('Setup completed successfully'));h.click('Close');await h.switchChat('new');await until(()=>document.querySelectorAll('[data-choir-voice]').length===3);
    assert.equal(document.querySelector('[data-choir-voice]').value,'other');assert.deepEqual([...document.querySelectorAll('[data-choir-gender]')].map(node=>node.value),['female','neutral','male']);
  }finally{h.cleanup();}
});

test('generated setup saves reading exclusions and highlight preferences through the existing global settings',async()=>{
  const h=await frontendHarness(false);try{
    await until(()=>h.root());h.click('Guided setup');h.click('Next');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);
    for(const name of ['Narrator','Persona','Main character'])h.select(`${name} voice`,'voice');h.click('Next');
    h.select('Highlight spoken text','word');h.click('Performance & text filters →');const tags=h.root().querySelector('[aria-label="Skip tags and blocks"]');tags.value='summary, .tracker';tags.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    const automatic=h.root().querySelector('[aria-label="Skip non-story blocks"]');automatic.checked=false;automatic.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    assert.equal(h.store.get('settings:global').ignoredTags,'summary, .tracker');assert.equal(h.store.get('settings:global').skipMeta,false);assert.equal(h.store.get('settings:global').readAlong,'word');assert.equal(h.synthesis.length,0);
    assert.ok(h.rpc.every(request=>request.action==='ping'));
  }finally{h.cleanup();}
});

test('Quick start saves in one screen and fresh installs select an available LLM without paid requests',async()=>{
  const h=uiHarness();try{
    await h.wizard.start();assert.equal(h.root().dataset.setupMode,'choose');
    h.click('Quick start');await until(()=>h.label('Narrator voice').options.length===3);
    assert.equal(h.label('Planner engine').value,'llm');assert.equal(h.label('Planner LLM connection').value,'llm');
    assert.equal(h.root().querySelector('.cs-progress').hidden,true);assert.equal(h.label('Choose new character voices automatically').checked,true);
    h.select('Narrator voice','other');h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    assert.equal(h.store.get('settings:captured-defaults').leadVoices[0].voice,'other');assert.equal(h.calls.filter(call=>['planner','synthesis'].includes(call[0])).length,0);
  }finally{h.wizard.dispose();}
});

test('switching all three modes preserves the same voice draft, accent and custom preferences',async()=>{
  const h=uiHarness();try{
    await h.wizard.open();h.click('Quick start');await until(()=>h.label('Narrator voice').options.length===3);h.select('Narrator voice','other');
    h.click('Guided');h.click('Next');assert.equal(h.label('Narrator voice').value,'other');h.input('Narrator accent','Irish');
    h.click('Custom');assert.equal(h.root().querySelector('.cs-progress').hidden,true);h.click('Performance & filters');h.input('Prefetch passages','2');
    h.click('Playback');h.select('Highlight spoken text','word');h.click('Quick start');assert.equal(h.label('Narrator voice').value,'other');
    h.click('Custom');h.click('Voices');assert.equal(h.label('Narrator accent').value,'Irish');h.click('Performance & filters');assert.equal(h.label('Prefetch passages').value,'2');
    assert.equal(h.root().querySelectorAll('details details').length,0);assert.equal(h.store.size,0);h.click('Save setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    assert.equal(h.store.get('settings:captured-defaults').leadVoices[0].accent,'Irish');
  }finally{h.wizard.dispose();}
});

test('postponed setup has a permanent drawer reminder; finishing hides it',async()=>{
  const h=await frontendHarness(false);try{
    await until(()=>h.root());h.click('Skip for now');await until(()=>h.store.get(ONBOARDING_KEY)?.deferred);
    assert.equal(document.querySelector('[data-et="continueSetup"]').hidden,false);document.querySelector('[data-et="continueSetup"]').click();await until(()=>h.root());
    h.click('Quick start');await until(()=>h.root().querySelector('[aria-label="Narrator voice"]').options.length>2);h.click('Finish setup');await until(()=>h.store.get(ONBOARDING_KEY)?.completed);
    await until(()=>h.root().textContent.includes('Setup completed successfully'));assert.equal(document.querySelector('[data-et="continueSetup"]').hidden,true);assert.equal(h.synthesis.length,0);
  }finally{h.cleanup();}
});
