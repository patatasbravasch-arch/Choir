import {test} from 'node:test';
import assert from 'node:assert/strict';
import {castReply,resolvePlanReferences,validatePlan,speechSourceUnits,DELIVERY_CONTEXT_RULES} from '../src/core.js';
import {planWithJev} from '../src/backend.js';
import {voiceDelivery} from '../src/delivery.js';

const text='"Oh, you have got to be fucking kidding me," Julian breathed out, a slow, wicked grin splitting his face as he tilted his head to the side. **"Kian. Put out that disgusting cancer stick and get your dead ass over here right now. Look at the ears on her."**';
const config=()=>({fixed:[{speaker:'Narrator',voice:'Charon',style:'Measured narration'},{speaker:'Julian',voice:'Puck',style:''}],npcs:[],voices:[{id:'Charon'},{id:'Puck'}],useStyle:true});
const gemini=segment=>voiceDelivery({segment,actor:{speaker:'Julian'},family:'gemini',connection:{provider:'google_tts',model:'gemini-3.8-flash-tts'},supported:{speech_style:{}}});

test('LLM casting retains the narration around harsh dialogue and passes distinct delighted and playful acting to Gemini',async()=>{
 const c=config(),units=speechSourceUnits(text),dialogue=units.filter(unit=>unit.kind==='dialogue');let calls=0;
 const raw=await castReply(text,c,'Julian is pleased to see his friend.',async messages=>{
  calls++;assert.ok(messages[0].content.includes(DELIVERY_CONTEXT_RULES));
  assert.match(messages[1].content,/breathed out, a slow, wicked grin splitting his face/);
  assert.match(messages[1].content,/Julian is pleased to see his friend/);
  assert.match(messages[1].content,/Look at the ears on her/);
  return dialogue.map((unit,index)=>`D${unit.id}|Julian|${index?'playfully commanding, delighted':'delighted disbelief, softly amused'}`).join('\n');
 });
 const plan=validatePlan(resolvePlanReferences(raw,text,c),text,c),spoken=plan.segments.filter(segment=>segment.speaker==='Julian');
 assert.equal(calls,1,'context guidance adds no extra LLM pass');assert.equal(spoken.length,2);
 for(const segment of spoken){const request=gemini(segment);assert.equal(request.text,segment.text);assert.equal(segment.voice,'Puck');assert.match(request.parameters.speech_style,/delighted/);assert.doesNotMatch(request.parameters.speech_style,/angry/);}
 assert.match(gemini(spoken[0]).style,/softly amused/);assert.match(gemini(spoken[1]).style,/playfully commanding/);
});

for(const native of [true,false])test(`${native?'Lumiverse Decision':'direct Jev'} offers context-aware delight and teasing without dropping genuine anger`,async()=>{
 const original=globalThis.spindle,requests=[],transcript=text+' Julian stopped grinning. Furious now, he snapped, "Leave!"';
 const answer=questions=>Object.fromEntries(Object.keys(questions).map((id,index)=>[id,{choice:id.startsWith('speaker_') || requests.length===1?'Julian':['delighted','playful','angry'][index]}]));
 globalThis.spindle=native?{decisions:{evaluate:async input=>{requests.push(input);return {answers:answer(input.questions)};}}}:{cors:async(_url,options)=>{const input=JSON.parse(options.body);requests.push(input);return {status:200,body:{answers:answer(input.questions)}};}};
 try{
  const plan=await planWithJev({transcript,config:config(),apiKey:native?undefined:'test-key',context:'Julian is initially delighted by the encounter.'});
  assert.equal(requests.length,2,'the existing speaker and emotion evaluations remain sufficient');
  const questions=Object.values(requests[1].questions);
  for(const question of questions){assert.ok(question.instructions.includes(DELIVERY_CONTEXT_RULES));assert.ok(question.criteria.delighted);assert.ok(question.criteria.playful);assert.match(question.criteria.angry,/Genuine anger/);}
  if(native)assert.match(questions[1].instructions,/wicked grin/);
  else assert.match(requests[1].state[1].context,/wicked grin/);
  const spoken=plan.segments.filter(segment=>segment.speaker==='Julian');assert.deepEqual(spoken.map(segment=>segment.style),['delighted','playful','angry']);
  assert.deepEqual(spoken.map(segment=>gemini(segment).parameters.speech_style),['delighted','playful','angry']);
  const fish=voiceDelivery({segment:spoken[1],actor:{},family:'fish_audio',connection:{model:'s2.1-pro'},supported:{}});assert.ok(fish.text.startsWith('[playful] '));
 }finally{globalThis.spindle=original;}
});
