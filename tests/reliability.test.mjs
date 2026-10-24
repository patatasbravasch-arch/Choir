import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attributionPlan,restoreAttribution,validatePlan,validateCastConfig,passageKey,mixerVolume,loudnessGain,castExport,castImport,fastClassifyPlan} from '../src/core.js';
const config={defaultRoute:'native:a',useStyle:true,voices:[{id:'n',route:'native:a'},{id:'m',route:'native:a'},{id:'new',route:'native:b'}],fixed:[{speaker:'Narrator',voice:'n',style:'Calm'},{speaker:'Mira',voice:'m',style:'Bright',aliases:['Captain']}],npcs:[]};

test('attribution survives voice, route and base style changes without repeating delivery styles',()=>{
  const transcript='It rained. "Hello."';
  const plan=validatePlan({segments:[{speaker:'Narrator',text:'It rained.',style:'Slow'},{speaker:'Captain',text:'"Hello."',style:'Warm'}]},transcript,config);
  assert.equal(plan.segments[1].speaker,'Mira');
  const saved=attributionPlan(plan,config);
  assert.equal(saved.segments[1].style,'Warm');assert.ok(!JSON.stringify(saved).includes('Bright'));
  const changed={...config,fixed:[config.fixed[0],{...config.fixed[1],voice:'new',route:'native:b',style:'Quiet'}]};
  const restored=restoreAttribution(saved,transcript,changed);
  assert.equal(restored.segments[1].voice,'new');assert.equal(restored.segments[1].route,'native:b');assert.equal(restored.segments[1].style,'Quiet. Warm');
  assert.deepEqual(attributionPlan(restored,changed),saved);
  assert.throws(()=>restoreAttribution(saved,'It snowed. "Hello."',changed),/changes or skips/);
});

test('aliases identify the canonical actor locally and ambiguous or conflicting aliases fail',()=>{
  const local={...config,fixed:[...config.fixed,{speaker:'Guard',voice:'n',style:''}]};
  const plan=fastClassifyPlan('Captain said, "Hello."',local);
  assert.equal(plan.segments.at(-1).speaker,'Mira');
  assert.throws(()=>validateCastConfig({...config,fixed:[config.fixed[0],{...config.fixed[1],aliases:['Narrator']}]}),/Conflicting character alias/);
});

test('cache identity changes only with synthesis inputs, never mixer controls or credentials',()=>{
  const segment={speaker:'Mira',voice:'m',route:'native:a',text:'Hello.',style:'Warm'};
  const settings={model:'model',useStyle:true,styleParam:'instructions'},connection={model:'model',provider:'openai',api_url:'https://provider.test'};
  const key=passageKey(segment,settings,connection,{accent:'Irish'});
  assert.equal(passageKey(segment,{...settings,master:0.1,apiKey:'different',normalizeLoudness:false},connection,{accent:'Irish'}),key);
  for(const changed of [{text:'Edited.'},{voice:'new'},{route:'native:b'},{style:'Angry'}])assert.notEqual(passageKey({...segment,...changed},settings,connection,{accent:'Irish'}),key);
  assert.notEqual(passageKey(segment,settings,{...connection,model:'new-model'},{accent:'Irish'}),key);
  assert.notEqual(passageKey(segment,settings,connection,{accent:'French'}),key);
});

test('audio cache tracks effective connection defaults while ignoring transport preferences',()=>{
  const segment={speaker:'Narrator',voice:'n',route:'native:a',text:'Hello.',style:''},settings={model:'unused'};
  const connection={model:'tts-1',provider:'openai_tts',default_parameters:{speed:1,output_format:'mp3'}};
  const key=passageKey(segment,settings,connection);
  assert.notEqual(passageKey(segment,settings,{...connection,default_parameters:{speed:1.2,output_format:'mp3'}}),key);
  assert.notEqual(passageKey(segment,settings,{...connection,default_parameters:{speed:1,output_format:'wav'}}),key);
  assert.equal(passageKey(segment,settings,{...connection,default_parameters:{output_format:'mp3',speed:1,use_streaming_endpoint:true}}),key);
  assert.equal(passageKey(segment,settings,connection,{speed:1.2}),passageKey(segment,settings,{...connection,default_parameters:{speed:1.2,output_format:'mp3'}},{speed:1.2}));
});

test('mixer handles mute, multiple solos, clamping and speaker names that match object properties',()=>{
  const channels={Mira:{volume:0.4,solo:true},Guard:{volume:1},Narrator:{volume:0.5,solo:true,mute:true}};
  assert.equal(mixerVolume(0.5,'Mira',channels),0.2);assert.equal(mixerVolume(1,'Guard',channels),0);assert.equal(mixerVolume(1,'Narrator',channels),0);
  assert.equal(mixerVolume(1,'constructor',{}),1);assert.equal(mixerVolume(2,'Mira',{Mira:{volume:2}}),2);
  assert.equal(mixerVolume(0.5,'Mira',{Mira:{volume:3}}),1.5);assert.equal(mixerVolume(1,'Mira',{Mira:{volume:99}}),3);
  assert.equal(mixerVolume(-1,'Mira',{Mira:{volume:3}}),0);assert.equal(mixerVolume(1,'Mira',{Mira:{volume:-1}}),0);
});

test('NPC policies restrict only NPC voices, survive cached attribution, and reject unavailable preferred choices',()=>{
  const transcript='At dawn. "Hello." "Wait."',raw={segments:[{speaker:'Narrator',text:'At dawn.'},{speaker:'Mira',text:'"Hello."'},{speaker:'Courier',voice:'m',text:'"Wait."'}]};
  const base=validatePlan(raw,transcript,config),saved=attributionPlan(base,config);
  const single={...config,npcPolicy:{mode:'single',route:'native:b',voice:'new'}};
  const alias=structuredClone(saved);alias.segments[1].speaker='Captain';assert.equal(restoreAttribution(alias,transcript,single).segments[1].voice,'m');
  for(const plan of [validatePlan(raw,transcript,single),restoreAttribution(saved,transcript,single)]){
    assert.equal(plan.segments[1].voice,'m');assert.equal(plan.segments[1].route,'native:a');assert.equal(plan.segments[2].voice,'new');assert.equal(plan.segments[2].route,'native:b');
  }
  const preferred={...config,voices:[...config.voices,{id:'other',route:'native:b'}],npcPolicy:{mode:'preferred',route:'native:b',voices:['new']}};
  const chosen=structuredClone(raw);chosen.segments[2].voice='new';assert.equal(validatePlan(chosen,transcript,preferred).npcs[0].voice,'new');
  chosen.segments[2].voice='other';assert.throws(()=>validatePlan(chosen,transcript,preferred),/preferred voices/);
  assert.equal(restoreAttribution(saved,transcript,preferred).segments[2].voice,'new');
  const skipped=validatePlan(raw,transcript,{...config,npcPolicy:{mode:'skip'}});assert.equal(skipped.segments.map(s=>s.text).join(' '),transcript);assert.equal(skipped.npcs[0].voice,'m');
  assert.throws(()=>validateCastConfig({...config,npcPolicy:{mode:'preferred',route:'native:b',voices:[]}}),/at least one/);
  assert.throws(()=>validateCastConfig({...config,npcPolicy:{mode:'single',route:'native:b',voice:'m'}}),/shared NPC voice/);
});

test('mixed-provider loudness matching raises quiet audio, lowers loud audio and caps peaks without amplifying silence',()=>{
  const quiet=new Float32Array(24000).fill(0.03),loud=new Float32Array(24000).fill(0.24);
  assert.ok(Math.abs(0.03*loudnessGain([quiet])-0.12)<0.0001);assert.ok(Math.abs(0.24*loudnessGain([loud])-0.12)<0.0001);
  const peaked=new Float32Array(24000).fill(0.01);peaked[0]=0.9;assert.ok(loudnessGain([peaked])*peaked[0]<=0.95);
  assert.equal(loudnessGain([new Float32Array(32)]),1);
});

test('loudness matching ignores provider edge padding without changing audio or internal pauses',()=>{
  for(const sampleRate of [16000,24000,44100,48000]){
    const speech=Float32Array.from({length:sampleRate},(_,i)=>0.08*Math.sin(2*Math.PI*220*i/sampleRate));
    const padded=new Float32Array(sampleRate*4);padded.set(speech,sampleRate);
    const original=padded.slice(),gain=loudnessGain([speech],undefined,sampleRate);
    assert.ok(Math.abs(loudnessGain([padded],undefined,sampleRate)-gain)<0.00001);
    assert.deepEqual(padded,original);
    // Non-frame-aligned padding may leave less than one frame at each edge.
    const shifted=new Float32Array(sampleRate*4);shifted.set(speech,Math.round(sampleRate*0.037));
    assert.ok(Math.abs(20*Math.log10(loudnessGain([shifted],undefined,sampleRate)/gain))<0.1);
    const paused=new Float32Array(sampleRate*2);paused.set(speech.subarray(0,sampleRate/2));paused.set(speech.subarray(sampleRate/2),sampleRate*1.5);
    assert.ok(Math.abs(loudnessGain([paused],undefined,sampleRate)-gain*Math.SQRT2)<0.00001);
  }
});

test('loudness edge detection measures both channels, tolerates quiet padding and retains peak headroom',()=>{
  const sampleRate=24000,speech=new Float32Array(sampleRate).fill(0.06),quiet=new Float32Array(sampleRate).fill(0.00002);
  const left=new Float32Array(sampleRate*4).fill(0.00002),right=left.slice();right.set(speech,sampleRate);
  assert.ok(Math.abs(loudnessGain([left,right])-loudnessGain([quiet,speech]))<0.00001);
  const peaked=right.slice();peaked[0]=0.9;
  assert.ok(loudnessGain([left,peaked])*peaked[0]<=0.95);
  assert.equal(loudnessGain([new Float32Array(sampleRate).fill(0.00001)]),1);
  assert.equal(loudnessGain([]),1);
});

test('versioned cast exchange round-trips preferences and strips credentials and unknown fields',()=>{
  const c={fixed:[...config.fixed.map(actor=>({...actor,accent:'Irish',pronunciation:'mee-rah',excluded:true}))],casts:{'native:a':[]},jevApiKey:'secret',apiKey:'secret'};
  const exported=castExport({...c,fixed:c.fixed.map(actor=>({...actor,apiKey:'secret'}))});assert.ok(!JSON.stringify(exported).includes('secret'));
  const imported=castImport({...exported,fixed:exported.fixed.map(actor=>({...actor,apiKey:'secret',untrusted:'unknown'}))});
  assert.deepEqual(imported,{fixed:c.fixed,casts:c.casts});
  assert.throws(()=>castImport({...exported,version:2}),/version 1/);
  assert.throws(()=>castImport({...exported,casts:{unknown:[]}}),/provider/);
});


test('cast exchange preserves connection mode and per-provider single voices while rejecting malformed routing',()=>{
 const config={fixed:[{speaker:'Narrator',voice:'n',style:'',excluded:true}],casts:{'native:a':[]},connectionMode:'one',singleVoices:{'native:a':{Narrator:'new',Mira:''}},apiKey:'private-key'};
 const exported=castExport(config);assert.equal(JSON.stringify(exported).includes('private-key'),false);
 assert.deepEqual(castImport(exported),{fixed:config.fixed,casts:config.casts,connectionMode:'one',singleVoices:config.singleVoices});
 assert.throws(()=>castImport({...exported,connectionMode:'unknown'}),/connection mode/);
 assert.throws(()=>castImport({...exported,singleVoices:{'https://evil.test':{Narrator:'n'}}}),/voice choices/);
 assert.throws(()=>castImport({...exported,singleVoices:{'native:a':{Narrator:{secret:'private-key'}}}}),/voice choice/);
});
