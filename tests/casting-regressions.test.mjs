import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const bundle=readFileSync(new URL('../dist/backend.js',import.meta.url),'utf8');
function harness(evaluate,generate=async()=>{throw Error('Unexpected LLM request');}){
  let handler,wake;const sent=[],requests=[];
  vm.runInNewContext(bundle,{spindle:{onFrontendMessage:fn=>handler=fn,sendToFrontend:message=>{sent.push(message);if(message.result || message.error)wake?.(message);},decisions:{evaluate:async(input,options)=>{requests.push(input);return evaluate(input,options);}},connections:{get:async()=>({id:'planner',model:'test',provider:'test'})},generate:{raw:generate}},console,Map,Set,AbortController,TextEncoder,setTimeout,clearTimeout,URL,crypto:globalThis.crypto,atob,Uint8Array,DataView});
  return {requests,sent,send:(input,action='planJev')=>handler({namespace:'choir',action,input,id:'test'},'user','session'),cancel:()=>handler({namespace:'choir',action:'cancel',id:'test'},'user','session'),result:()=>sent.some(message=>message.result || message.error)?Promise.resolve(sent.findLast(message=>message.result || message.error)):new Promise(resolve=>wake=resolve)};
}
const actor=(speaker,voice='',gender='auto')=>({speaker,voice,gender,style:''});
const config=()=>({voices:[{id:'n'},{id:'male',gender:'male'},{id:'female-1',gender:'female'},{id:'female-2',gender:'female'}],fixed:[actor('Narrator','n'),actor('Mira'),actor('Eve')],npcs:[],useStyle:false,characterProfiles:[{speaker:'Mira',name:'Mira',role:'character',description:'Mira is a woman. She has a feminine voice.'},{speaker:'Eve',name:'Eve',role:'character',description:'Eve is a woman with a feminine voice.'}]});

test('Jev checks the profile before choosing automatic catalogue voices and batches each identity once',async()=>{
  const h=harness(async input=>({answers:Object.hasOwn(input.questions,'speaker_0')?{speaker_0:{choice:'Mira'},speaker_1:{choice:'Mira'},speaker_2:{choice:'Eve'}}:{voice_gender_0:{choice:'female'},voice_gender_1:{choice:'female'}}}));
  h.send({transcript:'Mira said, "Hello." Mira added, "Stay." Eve replied, "Yes."',config:config()});
  const result=await h.result();assert.equal(result.error,undefined);
  assert.deepEqual(Array.from(result.result.segments.filter(s=>s.speaker!=='Narrator'),s=>[s.speaker,s.voice]),[['Mira','female-1'],['Mira','female-1'],['Eve','female-2']]);
  assert.equal(h.requests.length,2);assert.deepEqual(Object.keys(h.requests[1].questions),['voice_gender_0','voice_gender_1']);
  assert.match(h.requests[1].state.characters.find(c=>c.name==='Mira').about,/Mira is a woman/);
  assert.match(h.requests[1].questions.voice_gender_0.instructions,/Do not guess from the name/);
});

test('Jev preserves manually assigned voices and explicit gender preferences without another Decision request',async()=>{
  const c=config();c.fixed[1]=actor('Mira','male');c.fixed[2].gender='female';
  const h=harness(async()=>({answers:{speaker_0:{choice:'Mira'},speaker_1:{choice:'Eve'}}}));
  h.send({transcript:'Mira said, "Hi." Eve said, "Hello."',config:c});
  const result=await h.result();assert.equal(result.error,undefined);assert.equal(h.requests.length,1);
  assert.deepEqual(Array.from(result.result.segments.filter(s=>s.speaker!=='Narrator'),s=>s.voice),['male','female-1']);
});

test('a known gender match takes priority over an unlabelled catalogue voice',async()=>{
  const c=config();c.voices.splice(1,0,{id:'unlabelled'});
  const h=harness(async input=>({answers:Object.hasOwn(input.questions,'speaker_0')?{speaker_0:{choice:'Mira'}}:{voice_gender_0:{choice:'female'}}}));
  h.send({transcript:'Mira said, "Hi."',config:c});
  const result=await h.result();assert.equal(result.error,undefined);assert.equal(result.result.segments.find(s=>s.speaker==='Mira').voice,'female-1');
});

test('Jev keeps the shared NPC voice policy without trying to infer that NPC gender',async()=>{
  const c=config();c.npcPolicy={mode:'single',voice:'male'};
  const h=harness(async input=>({answers:Object.hasOwn(input.questions,'speaker_0')?{speaker_0:{choice:'Someone not listed'}}:{name_0:{choice:'Judy'}}}));
  h.send({transcript:'Someone waved at Judy. "Hello," Judy said.',config:c});
  const result=await h.result();assert.equal(result.error,undefined);assert.equal(result.result.npcs[0].speaker,'Judy');assert.equal(result.result.npcs[0].voice,'male');assert.equal(h.requests.length,2);
});

test('missing, invalid and unknown automatic gender answers give guidance instead of assigning the first voice',async()=>{
  for(const gender of [undefined,'female-looking','unknown']){
    const h=harness(async input=>({answers:Object.hasOwn(input.questions,'speaker_0')?{speaker_0:{choice:'Mira'}}:{voice_gender_0:{choice:gender}}}));
    h.send({transcript:'Mira said, "Hi."',config:config()});
    assert.match((await h.result()).error,/Choose their voice or gender/);
  }
});

test('an unavailable gender match cannot silently use a catalogue voice of the opposite gender',async()=>{
  const c=config();c.fixed[1].gender='female';c.voices=c.voices.filter(v=>v.id==='male');c.voices.push({id:'n',gender:'male'});
  const h=harness(async()=>({answers:{speaker_0:{choice:'Mira'}}}));h.send({transcript:'Mira said, "Hi."',config:c});
  assert.match((await h.result()).error,/No female voice is available for Mira/);
});

test('multiple unidentified Jev speakers cannot collapse into one saved Unknown speaker',async()=>{
  const h=harness(async input=>({answers:Object.hasOwn(input.questions,'speaker_0')?{speaker_0:{choice:'Someone not listed'},speaker_1:{choice:'Someone not listed'}}:{}}));
  h.send({transcript:'The waitress said, "Tea?" The old man answered, "Coffee."',config:config()});
  const result=await h.result();assert.equal(result.result,undefined);assert.match(result.error,/multiple dialogue speakers.*Standard LLM/);
});

test('unidentified Jev speakers use the existing explicitly enabled LLM fallback',async()=>{
  let calls=0;const h=harness(async()=>({answers:{speaker_0:{choice:'Someone not listed'},speaker_1:{choice:'Someone not listed'}}}),async()=>{calls++;return {content:'D1|Waitress|\nD3|Old man|\nNPC|Waitress|female|female-1\nNPC|Old man|male|male'};});
  h.send({transcript:'The waitress said, "Tea?" The old man answered, "Coffee."',config:{...config(),plannerMode:'jev',allowLlmFallback:true},connectionId:'planner'},'plan');
  const result=await h.result();assert.equal(result.error,undefined);assert.equal(calls,1);assert.deepEqual(Array.from(result.result.npcs,n=>n.speaker),['Waitress','Old man']);
});

test('Stop cancels an in-flight catalogue gender decision and suppresses its late result',async()=>{
  let release,signal;const h=harness(async(input,options)=>{
    if(Object.hasOwn(input.questions,'speaker_0'))return {answers:{speaker_0:{choice:'Mira'}}};
    signal=options.signal;return new Promise(resolve=>release=resolve);
  });h.send({transcript:'Mira said, "Hi."',config:config()});
  for(let i=0;i<10 && !release;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(release);h.cancel();assert.equal(signal.aborted,true);release({answers:{voice_gender_0:{choice:'female'}}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.sent.filter(message=>message.result || message.error).length,0);
});
