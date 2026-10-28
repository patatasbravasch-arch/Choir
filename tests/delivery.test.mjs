import {test} from 'node:test';
import assert from 'node:assert/strict';
import {voiceDelivery,characterDeliveryMode,normalizeMixerColumns,fishStyleCues} from '../src/delivery.js';

const segment={speaker:'Mira',text:'Welcome home.',style:'Warm. whispering'},actor={speaker:'Mira',style:'Warm',accent:'Irish'};
const request=options=>voiceDelivery({segment,actor,family:'gemini',connection:{provider:'google_tts',model:'gemini-3.8-flash-tts'},supported:{speech_style:{type:'string'}},...options});

test('Gemini metadata carries persistent accent and turn delivery without modifying spoken text',()=>{
 const result=request({});assert.equal(result.text,segment.text);assert.equal(result.parameters.speech_style,'whispering. Accent: Irish');
});
test('Fish S2 injects delivery at the TTS boundary and clears relay directions to avoid duplicate cues',()=>{
 const result=request({family:'fish_audio',connection:{provider:'fish_audio',model:'s2.1-pro'},supported:{voice_direction:{models:['s2.1-pro']}}});
 assert.equal(result.text,'[whispering][Accent: Irish] Welcome home.');assert.equal(result.parameters.voice_direction,'');
});
test('older Fish relays receive free-form S2 tags and their accent instructions',()=>{
 const result=request({family:'fish_audio',connection:{provider:'fish_audio',model:'s2-pro'},supported:{}});
 assert.equal(result.text,'[whispering][Accent: Irish] Welcome home.');
});
test('Fish S1 receives fixed parenthesis tags and never a fabricated accent tag',()=>{
 const result=request({family:'fish_audio',connection:{provider:'fish_audio',model:'s1'},supported:{voice_direction:{models:['s2-pro']}}});
 assert.match(result.text,/\(whispering\)/);assert.ok(!result.text.includes('Irish'));assert.ok(!result.text.includes('['));
 assert.equal(request({family:'fish_audio',segment:{...segment,style:'not shouting'},actor:{...actor,style:''},connection:{provider:'fish_audio',model:'s1'},supported:{}}).text,segment.text);
});
test('mixed Fish and Gemini voices select their own provider adapter',()=>{
 const gemini=request({}),fish=request({family:'fish_audio',connection:{provider:'openrouter_tts',model:'fish-audio/s2-pro'},supported:{instructions:{}}});
 assert.deepEqual(Object.keys(gemini.parameters),['speech_style']);assert.deepEqual(fish.parameters,{});assert.equal(fish.text,'[whispering][Accent: Irish] Welcome home.');
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
 assert.match(result.text,/Delivery: whispering\. Accent: Irish/);assert.deepEqual(result.parameters,{});
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
 assert.match(result.text,/Delivery: whispering\. Accent: Irish\n\nText:\nWelcome home\.$/);assert.ok(!result.text.includes('[Warm'));
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

test('automatic Fish delivery translates Jev labels and retains free-form LLM directions',()=>{
 assert.deepEqual(fishStyleCues('cheerful; sigh; cheerful'),['happy','sighing']);
 assert.deepEqual(fishStyleCues('[slightly sad][whispers sweetly]. slightly sad. hesitant. angry'),['slightly sad','whispers sweetly','hesitant']);
 for(const [style,expected] of [['cheerful','[happy]'],['sigh','[sighing]'],['sad; whispering','[sad][whispering]'],['slightly amused','[slightly amused]']]){
  const fish=request({family:'fish_audio',segment:{...segment,style},actor:{},connection:{provider:'fish_audio',model:'s2.1-pro-free'},supported:{voice_direction:{}}});
  assert.equal(fish.text,`${expected} Welcome home.`);assert.deepEqual(fish.parameters,{voice_direction:''});
 }
});

test('Fish source cues keep position and suppress generated tones without discarding persistent accent',()=>{
 const fish=request({family:'fish_audio',segment:{...segment,text:'This is [emphasis] important.',style:'angry; shouting'},connection:{provider:'fish_audio',model:'s2.1-pro'},supported:{voice_direction:{}}});
 assert.equal(fish.text,'[Accent: Irish] This is [emphasis] important.');assert.equal(fish.parameters.voice_direction,'');
 const off=request({family:'fish_audio',segment:{...segment,text:'[sad] Welcome home.'},actor:{deliveryMode:'off'},connection:{model:'s2.1-pro'},supported:{}});
 assert.equal(off.text,'[sad] Welcome home.');
 const narrator=request({family:'fish_audio',narrator:true,segment:{...segment,style:'angry; sobbing'},actor:{speaker:'Narrator',style:'Calm narration'},connection:{model:'s2.1-pro'},supported:{}});
 assert.equal(narrator.text,'[Calm narration] Welcome home.');
});

test('acting intensity survives mixed Gemini and Fish routing without weakening explicit bases or preset cues',()=>{
 for(const style of ['Slightly amused, conversational','Clearly delighted, softly spoken','Intensely angry']){
  assert.equal(request({segment:{...segment,style},actor:{}}).parameters.speech_style,style);
  const fish=request({family:'fish_audio',segment:{...segment,style},actor:{},connection:{model:'s2.1-pro'},supported:{}});
  assert.equal(fish.text,`${style.split(', ').map(cue=>`[${cue}]`).join('')} Welcome home.`);
 }
 const actor={style:'Intensely delighted',deliveryMode:'base',accent:'Irish'};
 assert.equal(request({actor,segment:{...segment,style:'Slightly amused'}}).parameters.speech_style,'Intensely delighted. Accent: Irish');
 const fish=request({family:'fish_audio',actor,segment:{...segment,text:'[furious] Welcome home.',style:'Slightly amused'},connection:{model:'s2.1-pro'},supported:{}});
 assert.equal(fish.text,'[Accent: Irish] [furious] Welcome home.');
});

test('automatic acting removes the validated base prefix once while base-only and fallback retain it',()=>{
 const actor={style:'Dramatic and theatrical',accent:'Irish'};
 const segment={speaker:'Mira',text:'Welcome home.',style:'Dramatic and theatrical. Slightly amused, conversational'};
 assert.equal(request({actor,segment}).parameters.speech_style,'Slightly amused, conversational. Accent: Irish');
 const fish=request({family:'fish_audio',actor,segment,connection:{model:'s2.1-pro'},supported:{}});
 assert.equal(fish.text,'[Slightly amused][conversational][Accent: Irish] Welcome home.');
 assert.equal(request({actor:{...actor,deliveryMode:'base'},segment}).parameters.speech_style,'Dramatic and theatrical. Accent: Irish');
 assert.equal(request({actor,segment:{...segment,style:actor.style}}).parameters.speech_style,'Dramatic and theatrical. Accent: Irish');
 assert.equal(request({actor,segment:{...segment,style:''}}).parameters.speech_style,'Dramatic and theatrical. Accent: Irish');
 for(const style of ['[dramatic]',' Dramatic\n and theatrical ']){
  const actor={style},segment={text:'Welcome home.',style:`${style}. Slightly amused`};
  assert.equal(request({actor,segment}).parameters.speech_style,'Slightly amused');
  assert.equal(request({family:'fish_audio',actor,segment,connection:{model:'s2.1-pro'},supported:{}}).text,'[Slightly amused] Welcome home.');
 }
});
