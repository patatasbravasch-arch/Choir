import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldOpenSetup,setupDraft,setupIssues,saveSetupSettings,ONBOARDING_KEY} from '../src/setup.js';

const value=()=>({mode:'native',connection:'tts',model:'gemini-model',connectionMode:'several',plannerMode:'heuristic',planner:'llm',
  fixed:['Narrator','Persona','Character'].map(speaker=>({speaker,voice:'voice',style:''})),npcPolicy:{mode:'skip',voices:[]},
  enableSfx:false,enableAmbience:false,enableMusic:false,autoDesignNPCs:false,auto:false,autoPlan:false});
const connections={tts:[{id:'tts',model:'speech'}],llm:[{id:'llm',model:'text'}],decision:[{id:'decision'}]};

test('first run opens once; completed and explicitly deferred users remain quiet across reloads',()=>{
  for(const state of [undefined,null,{}, {completed:false}])assert.equal(shouldOpenSetup(state),true);
  for(const state of [{completed:true},{completed:false,deferred:true},{version:9,completed:true}])assert.equal(shouldOpenSetup(state),false);
});

test('new installations opt out of all optional paid automation; existing users preserve every preference',()=>{
  const initial={...value(),enableSfx:true,enableAmbience:true,enableMusic:true,autoDesignNPCs:true,auto:true,autoPlan:true,plannerMode:'jev',jevApiKey:'session-secret'};
  const original=structuredClone(initial),fresh=setupDraft(initial,null,false),existing=setupDraft(initial,null,true);
  for(const key of ['enableSfx','enableAmbience','enableMusic','auto','autoPlan']){assert.equal(fresh[key],false);assert.equal(existing[key],true);}
  for(const key of ['mode','model','autoDesignNPCs','apiKey','jevApiKey'])assert.equal(Object.hasOwn(existing,key),false);
  assert.equal(fresh.plannerMode,'heuristic');assert.equal(existing.plannerMode,'jev');assert.equal(fresh.npcPolicy.mode,'skip');
  assert.ok(!JSON.stringify(existing).includes('session-secret'));assert.deepEqual(initial,original);
});

test('captured voice defaults seed the draft without mutating an existing chat cast',()=>{
  const initial=value(),preset={version:2,leadVoices:[{voice:'n',route:'native:tts'},{voice:'y'},{voice:'m',accent:'Irish'}],npcPolicy:{mode:'single',voice:'g'}};
  const before=structuredClone(initial),draft=setupDraft(initial,preset,true);
  assert.deepEqual(draft.fixed.map(actor=>actor.voice),['n','y','m']);assert.equal(draft.npcPolicy.voice,'g');assert.deepEqual(initial,before);
  draft.fixed[0].voice='changed';assert.equal(preset.leadVoices[0].voice,'n');
});

test('configuration validation distinguishes missing routes, voices, session keys, planners and optional dependencies',()=>{
  assert.deepEqual(setupIssues(value(),connections),[]);
  const draft=value();draft.connection='deleted';assert.ok(setupIssues(draft,connections).some(issue=>issue.step===1));
  draft.connection='tts';draft.fixed[0].route='gemini';assert.ok(setupIssues(draft,connections,{gemini:'secret'}).some(issue=>issue.step===2));
  draft.fixed[0].route='native:tts';assert.deepEqual(setupIssues(draft,connections),[]);
  draft.fixed[0].voice='';assert.ok(setupIssues(draft,connections,{gemini:'secret'}).some(issue=>issue.step===2));
  draft.fixed[0].excluded=true;assert.ok(!setupIssues(draft,connections,{gemini:'secret'}).some(issue=>/Narrator/.test(issue.message)));
  draft.plannerMode='llm';draft.planner='deleted';assert.ok(setupIssues(draft,connections,{gemini:'secret'}).some(issue=>/Planner LLM/.test(issue.message)));
});

test('heuristic needs no LLM but cannot silently choose automatic NPC voices or sound cues',()=>{
  const draft=value(),local={...connections,llm:[]};assert.deepEqual(setupIssues(draft,local),[]);
  draft.npcPolicy.mode='llm';assert.ok(setupIssues(draft,local).some(issue=>/Automatic NPC/.test(issue.message)));
  draft.npcPolicy.mode='skip';draft.enableSfx=true;assert.equal(setupIssues(draft,local).filter(issue=>issue.step===3).length,2);
  draft.freesoundApiKey='configured';assert.equal(setupIssues(draft,local).filter(issue=>issue.step===3).length,1);
});

test('Jev requires an available Decision connection on modern hosts; session keys only work on the legacy fallback',()=>{
  const draft=value();draft.plannerMode='jev';draft.decisionConnection='decision';assert.deepEqual(setupIssues(draft,connections),[]);
  draft.decisionConnection='missing';assert.ok(setupIssues(draft,connections,{jev:'secret'}).length);
  assert.deepEqual(setupIssues(draft,{...connections,directJev:true},{jev:'secret'}),[]);
});

test('shared and preferred NPC voices have contextual validation',()=>{
  const draft=value();draft.npcPolicy={mode:'single',voice:''};assert.ok(setupIssues(draft,connections).some(issue=>/shared NPC/.test(issue.message)));
  draft.npcPolicy={mode:'preferred',voices:[]};assert.ok(setupIssues(draft,connections).some(issue=>/preferred NPC/.test(issue.message)));
  draft.npcPolicy.voices=['voice'];assert.deepEqual(setupIssues(draft,connections),[]);
  draft.npcPolicy.route='gemini';assert.ok(setupIssues(draft,connections).some(issue=>issue.step===2));
});

test('automatic lead casting uses existing empty IDs with LLM and Jev; local heuristic still requires voices',()=>{
  const draft=value();draft.fixed.forEach(actor=>actor.voice='');
  assert.equal(setupIssues(draft,connections).filter(issue=>issue.step===2).length,3);
  draft.plannerMode='llm';assert.deepEqual(setupIssues(draft,connections),[]);
  draft.plannerMode='jev';draft.decisionConnection='decision';assert.match(setupIssues(draft,connections)[0].message,/narrator voice for Jev/);
  draft.fixed[0].voice='voice';assert.deepEqual(setupIssues(draft,connections),[]);
  draft.plannerMode='llm';draft.planner='missing';assert.ok(setupIssues(draft,connections).some(issue=>issue.step===1));
});

test('Jev automatic narration remains available for community Fish routes and disabled narrators',()=>{
  const draft=value();draft.plannerMode='jev';draft.decisionConnection='decision';draft.fixed[0].voice='';
  const native={...connections,tts:[{id:'tts',provider:'fish_audio',model:'s2'}]};assert.deepEqual(setupIssues(draft,native),[]);
  const relay={...connections,tts:[{id:'tts',provider:'openrouter_tts',model:'fish-audio/s2:free'}]};assert.deepEqual(setupIssues(draft,relay),[]);
  draft.fishVoiceSource='own';assert.match(setupIssues(draft,native)[0].message,/narrator voice for Jev/);
  draft.fixed[0].excluded=true;assert.deepEqual(setupIssues(draft,native),[]);
});

test('successful settings save completes last and never writes any chat key',async()=>{
  const store=new Map([['chat:existing',{fixed:[{voice:'original'}]}]]),writes=[];
  const settings={get:async key=>store.get(key),set:async(key,data)=>{writes.push(key);store.set(key,data);}};
  await saveSetupSettings(settings,[['settings:global',{plannerMode:'heuristic'}],['settings:captured-defaults',{version:2,leadVoices:[{voice:'new'}]}]],{completed:true});
  assert.deepEqual(writes,['settings:global','settings:captured-defaults',ONBOARDING_KEY]);assert.equal(store.get(ONBOARDING_KEY).completed,true);
  assert.deepEqual(store.get('chat:existing'),{fixed:[{voice:'original'}]});
});

test('each save failure restores prior preferences and defaults; retry completes cleanly',async()=>{
  for(const failedKey of ['settings:global','settings:captured-defaults',ONBOARDING_KEY]){
    const store=new Map([['settings:global',{connection:'old'}],['settings:captured-defaults',{voice:'old'}],[ONBOARDING_KEY,{deferred:true}]]);
    const before=structuredClone([...store]);let fail=true;
    const settings={get:async key=>store.get(key),set:async(key,data)=>{store.set(key,data);if(key===failedKey && fail){fail=false;throw Error('storage offline');}}};
    const writes=[['settings:global',{connection:'new'}],['settings:captured-defaults',{voice:'new'}]];
    await assert.rejects(saveSetupSettings(settings,writes,{completed:true}),/Previous settings were restored/);
    assert.deepEqual([...store],before);await saveSetupSettings(settings,writes,{completed:true});assert.equal(store.get(ONBOARDING_KEY).completed,true);
  }
});

test('failed save removes keys that did not exist and reports incomplete compensation accurately',async()=>{
  const store=new Map();let failure=true;
  const settings={get:async key=>store.get(key),remove:async key=>store.delete(key),set:async(key,data)=>{if(failure && key===ONBOARDING_KEY){failure=false;throw Error('offline');}store.set(key,data);}};
  await assert.rejects(saveSetupSettings(settings,[['settings:global',{connection:'new'}]],{completed:true}),/Previous settings/);assert.equal(store.size,0);
  settings.remove=async()=>{throw Error('still offline');};failure=true;
  await assert.rejects(saveSetupSettings(settings,[['settings:global',{connection:'new'}]],{completed:true}),/Some settings may have saved/);
});
