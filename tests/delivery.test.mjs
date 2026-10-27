import {test} from 'node:test';
import assert from 'node:assert/strict';
import {voiceDelivery,characterDeliveryMode,normalizeMixerColumns} from '../src/delivery.js';

const segment={speaker:'Mira',text:'Welcome home.',style:'Warm. whispering'},actor={speaker:'Mira',style:'Warm',accent:'Irish'};
const request=options=>voiceDelivery({segment,actor,family:'gemini',connection:{provider:'google_tts',model:'gemini-3.8-flash-tts'},supported:{speech_style:{type:'string'}},...options});

test('Gemini metadata carries persistent accent and turn delivery without modifying spoken text',()=>{
 const result=request({});assert.equal(result.text,segment.text);assert.equal(result.parameters.speech_style,'Warm. whispering. Accent: Irish');
});
test('Fish S2 uses voice_direction including accents, without duplicating inline tags',()=>{
 const result=request({family:'fish_audio',connection:{provider:'fish_audio',model:'s2.1-pro'},supported:{voice_direction:{models:['s2.1-pro']}}});
 assert.equal(result.text,segment.text);assert.equal(result.parameters.voice_direction,'Warm. whispering. Accent: Irish');
});
test('older Fish relays receive free-form S2 tags and their accent instructions',()=>{
 const result=request({family:'fish_audio',connection:{provider:'fish_audio',model:'s2-pro'},supported:{}});
 assert.equal(result.text,'[Warm. whispering. Accent: Irish] Welcome home.');
});
test('Fish S1 receives fixed parenthesis tags and never a fabricated accent tag',()=>{
 const result=request({family:'fish_audio',connection:{provider:'fish_audio',model:'s1'},supported:{voice_direction:{models:['s2-pro']}}});
 assert.match(result.text,/\(whispering\)/);assert.ok(!result.text.includes('Irish'));assert.ok(!result.text.includes('['));
 assert.equal(request({family:'fish_audio',segment:{...segment,style:'not shouting'},actor:{...actor,style:''},connection:{provider:'fish_audio',model:'s1'},supported:{}}).text,segment.text);
});
test('mixed Fish and Gemini voices select their own provider adapter',()=>{
 const gemini=request({}),fish=request({family:'fish_audio',connection:{provider:'openrouter_tts',model:'fish-audio/s2-pro'},supported:{instructions:{}}});
 assert.deepEqual(Object.keys(gemini.parameters),['speech_style']);assert.deepEqual(fish.parameters,{});assert.equal(fish.text,'[Warm. whispering. Accent: Irish] Welcome home.');
});

test('preset Fish cues are not duplicated or contradicted, while accents remain persistent',()=>{
 for(const modern of [false,true]){
  const result=request({family:'fish_audio',segment:{...segment,text:'[whispering] Welcome home.',style:'shouting'},connection:{provider:'fish_audio',model:'s2.1-pro'},supported:modern?{voice_direction:{models:['s2.1-pro']}}:{}});
  const wire=modern?`[${result.parameters.voice_direction}] ${result.text}`:result.text;
  assert.equal(wire.match(/\[whispering\]/g).length,1);assert.ok(!wire.includes('shouting'));assert.ok(wire.includes('Accent: Irish'));
 }
 const s1=request({family:'fish_audio',segment:{...segment,text:'(whispering) Welcome home.',style:'angry'},connection:{provider:'fish_audio',model:'s1'},supported:{}});
 assert.equal(s1.text,'(whispering) Welcome home.');
});

test('Fish S1 supports advanced documented cues and older OpenRouter Gemini uses a spoken-text wrapper',()=>{
 for(const cue of ['confused','determined','screaming','soft tone','sighing']){
  const result=request({family:'fish_audio',segment:{...segment,style:cue},actor:{},connection:{provider:'fish_audio',model:'s1'},supported:{}});
  assert.equal(result.text,`(${cue}) Welcome home.`);
 }
 const result=request({connection:{provider:'openrouter_tts',model:'google/gemini-2.5-flash-tts'},supported:{instructions:{},speech_style:{}}});
 assert.match(result.text,/Delivery: Warm\. whispering\. Accent: Irish/);assert.deepEqual(result.parameters,{});
});
test('narrator defaults to base style and discards planner emotions',()=>{
 const result=request({segment:{...segment,speaker:'Narrator',style:'Measured. [shouting] [sobbing]'},actor:{speaker:'Narrator',style:'Measured',accent:'Irish'},narrator:true});
 assert.equal(result.parameters.speech_style,'Measured. Accent: Irish');assert.ok(!result.style.includes('shouting'));
});
test('narrator without a base style receives neutral narration, with opt-in acting',()=>{
 assert.equal(request({actor:{},narrator:true}).style,'Steady, neutral narration');
 assert.equal(request({actor:{deliveryMode:'auto'},narrator:true}).style,segment.style);
});
test('turn acting can be disabled without losing a character accent or pronunciation',()=>{
 const result=request({actor:{...actor,deliveryMode:'off',pronunciation:'Soften the final consonants'}});
 assert.equal(result.style,'Soften the final consonants. Accent: Irish');assert.ok(!result.style.includes('whispering'));
});
test('global delivery off preserves accent and explicitly clears relay defaults when empty',()=>{
 assert.equal(request({useStyle:false}).parameters.speech_style,'Accent: Irish');
 assert.deepEqual(request({actor:{deliveryMode:'off'}}).parameters,{speech_style:''});
 const fish=request({family:'fish_audio',actor:{deliveryMode:'off'},supported:{voice_direction:{}},connection:{provider:'fish_audio',model:'s2-pro'}});
 assert.deepEqual(fish.parameters,{voice_direction:''});
});
test('legacy Gemini receives a bounded delivery prompt rather than Fish tone syntax',()=>{
 const result=request({connection:{provider:'google_tts',model:'gemini-2.5-pro-preview-tts'},supported:{}});
 assert.match(result.text,/Delivery: Warm\. whispering\. Accent: Irish\n\nText:\nWelcome home\.$/);assert.ok(!result.text.includes('[Warm'));
});
test('enumerated provider accents validate option objects and reject unsupported values',()=>{
 assert.equal(request({supported:{accent:{options:[{id:'Irish',label:'Irish'}]}}}).parameters.accent,'Irish');
 assert.throws(()=>request({supported:{accent:{enum:['French']}}}),/not supported/);
});
test('delivery mode migration and mixer columns normalize malformed saved preferences',()=>{
 assert.equal(characterDeliveryMode({},true),'base');assert.equal(characterDeliveryMode({deliveryMode:'legacy'}),'auto');
 for(const value of [undefined,null,-1,0,8,2.5,'invalid'])assert.equal(normalizeMixerColumns(value),0);
 for(const value of [1,'2',7])assert.equal(normalizeMixerColumns(value),Number(value));
});
