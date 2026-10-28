import {test} from 'node:test';
import assert from 'node:assert/strict';
import {castReply,resolvePlanReferences,validatePlan,speechSourceUnits,DELIVERY_CONTEXT_RULES} from '../src/core.js';
import {planWithJev} from '../src/backend.js';
import {voiceDelivery} from '../src/delivery.js';

const text='"Oh, you have got to be fucking kidding me," Julian breathed out, a slow, wicked grin splitting his face as he tilted his head to the side. **"Kian. Put out that disgusting cancer stick and get your dead ass over here right now. Look at the ears on her."**';
const config=()=>({fixed:[{speaker:'Narrator',voice:'Charon',style:'Measured narration'},{speaker:'Julian',voice:'Puck',style:''}],npcs:[],voices:[{id:'Charon'},{id:'Puck'}],useStyle:true});
const gemini=segment=>voiceDelivery({segment,actor:{speaker:'Julian'},family:'gemini',connection:{provider:'google_tts',model:'gemini-3.8-flash-tts'},supported:{speech_style:{}}});

test('LLM casting requests contextual emotion and intensity in one call and preserves its degree for Gemini',async()=>{
 const c=config(),units=speechSourceUnits(text),dialogue=units.filter(unit=>unit.kind==='dialogue');let calls=0;
 const raw=await castReply(text,c,'Julian is pleased to see his friend.',async messages=>{
  calls++;assert.ok(messages[0].content.includes(DELIVERY_CONTEXT_RULES));
  assert.match(messages[0].content,/Choose emotion AND acting intensity together/);
  assert.match(messages[0].content,/Ordinary dialogue is restrained and conversational/);
  assert.match(messages[0].content,/intense acting only when the passage supports that degree/);
  assert.match(messages[0].content,/Natural, conversational delivery rather than an empty style/);
  assert.match(messages[1].content,/breathed out, a slow, wicked grin splitting his face/);
  assert.match(messages[1].content,/Julian is pleased to see his friend/);
  assert.match(messages[1].content,/Look at the ears on her/);
  return dialogue.map((unit,index)=>`D${unit.id}|Julian|${index?'clearly delighted, playfully commanding':'slightly amused, softly spoken'}`).join('\n');
 });
 const plan=validatePlan(resolvePlanReferences(raw,text,c),text,c),spoken=plan.segments.filter(segment=>segment.speaker==='Julian');
 assert.equal(calls,1,'context guidance adds no extra LLM pass');assert.equal(spoken.length,2);
 for(const segment of spoken){const request=gemini(segment);assert.equal(request.text,segment.text);assert.equal(segment.voice,'Puck');assert.equal(request.parameters.speech_style,segment.style);assert.doesNotMatch(request.parameters.speech_style,/angry/);}
 assert.equal(gemini(spoken[0]).style,'slightly amused, softly spoken');assert.equal(gemini(spoken[1]).style,'clearly delighted, playfully commanding');
});

for(const native of [true,false])test(`${native?'Lumiverse Decision':'direct Jev'} chooses emotion with intensity without another evaluation and overrides dramatic bases for neutral lines`,async()=>{
 const original=globalThis.spindle,requests=[],transcript=text+' Julian stopped grinning. Furious now, he snapped, "Leave!" Later he said casually, "The train leaves at six."';
 const c=config();c.fixed[1].style='Dramatic and theatrical';
 const answer=questions=>Object.fromEntries(Object.keys(questions).map((id,index)=>[id,{choice:id.startsWith('speaker_') || requests.length===1?'Julian':['amused','delighted','furious','neutral'][index]}]));
 globalThis.spindle=native?{decisions:{evaluate:async input=>{requests.push(input);return {answers:answer(input.questions)};}}}:{cors:async(_url,options)=>{const input=JSON.parse(options.body);requests.push(input);return {status:200,body:{answers:answer(input.questions)}};}};
 try{
  const plan=await planWithJev({transcript,config:c,apiKey:native?undefined:'test-key',context:'Julian is initially delighted by the encounter.'});
  assert.equal(requests.length,2,'the existing speaker and emotion evaluations remain sufficient');
  const questions=Object.values(requests[1].questions);
  for(const question of questions){assert.ok(question.instructions.includes(DELIVERY_CONTEXT_RULES));assert.match(question.criteria.amused,/Low intensity/);assert.match(question.criteria.delighted,/Moderate intensity/);assert.match(question.criteria.furious,/High intensity/);assert.ok(question.criteria.playful);assert.match(question.criteria.angry,/genuine anger/);}
  if(native)assert.match(questions[1].instructions,/wicked grin/);
  else assert.match(requests[1].state[1].context,/wicked grin/);
  const spoken=plan.segments.filter(segment=>segment.speaker==='Julian'),expected=['Slightly amused, conversational','Clearly delighted, warm','Intensely angry','Natural, conversational delivery'];
  assert.deepEqual(spoken.map(segment=>segment.style),expected.map(style=>`Dramatic and theatrical. ${style}`),'validated plans retain their attribution-compatible base prefix');
  for(const [index,segment] of spoken.entries()){
   const request=voiceDelivery({segment,actor:c.fixed[1],family:'gemini',connection:{model:'gemini-3.8-flash-tts'},supported:{}});
   assert.equal(request.style,expected[index]);assert.ok(!request.style.includes('theatrical'));
   const fish=voiceDelivery({segment,actor:c.fixed[1],family:'fish_audio',connection:{model:'s2.1-pro'},supported:{}});
   assert.equal(fish.text,`${expected[index].split(', ').map(cue=>`[${cue}]`).join('')} ${segment.text}`);
  }
 }finally{globalThis.spindle=original;}
});

test('Fish S2 and Gemini keep distinct emotions distinct and ordinary dialogue restrained',()=>{
  for(const [style,fishPrefix,geminiStyle] of [
    ['slightly amused, softly spoken','[slightly amused][softly spoken]','slightly amused, softly spoken'],
    ['clearly delighted, warm','[clearly delighted][warm]','clearly delighted, warm'],
    ['Natural, conversational delivery','[Natural][conversational delivery]','Natural, conversational delivery'],
  ]){
    const segment={speaker:'Mira',text:'Welcome home.',style};
    const fish=voiceDelivery({segment,actor:{speaker:'Mira'},family:'fish_audio',connection:{model:'s2.1-pro'},supported:{}});
    const gemini=voiceDelivery({segment,actor:{speaker:'Mira'},family:'gemini',connection:{model:'gemini-3.8-flash-tts'},supported:{speech_style:{}}});
    assert.equal(fish.text,`${fishPrefix} Welcome home.`);
    assert.equal(gemini.parameters.speech_style,geminiStyle);
    assert.ok(!fish.text.includes('happy'));
    assert.ok(!/angry|furious|terrified|ecstatic/i.test(gemini.parameters.speech_style));
  }
});
