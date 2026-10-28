import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {playbackFixture} from './fixtures/playback.mjs';
import {withDrawerControl} from './fixtures/drawer.mjs';

const require=createRequire(path.join(process.env.CHOIR_BROWSER_MODULES || '.', 'package.json'));
const {chromium}=require('playwright');
const source=playbackFixture
 .replace("providers:[{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}}]","providers:[{id:'google_tts',capabilities:{parameters:{speech_style:{type:'string'}},multiSpeaker:{maxSpeakers:2,models:['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts']}}},{id:'openrouter_tts',capabilities:{parameters:{speech_style:{type:'string'}}}}]")
 .replace("provider:'openai_tts',model:'model-a'","provider:'google_tts',model:'gemini-3.8-flash-tts'")
 .replace("provider:'openai_tts',model:'model-b'","provider:'google_tts',model:'gemini-3.8-flash-lite-tts'")
 .replace("id:'c',name:'Fish Audio',provider:'fish_audio',model:'s2.1-pro'","id:'c',name:'OpenRouter Gemini',provider:'openrouter_tts',model:'google/gemini-3.8-flash-tts'")
 .replace("voices:['n','y','m']","voices:['Charon','Achird','Kore']")
 .replace("voice:actor.voice,style:''","voice:actor.voice,style:unit.kind==='dialogue'?'Warm and relieved':''");
const server=createServer(async(req,res)=>{
 try{res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?source:await readFile(new URL('..'+req.url,import.meta.url)));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
 const cases=['native:a','native:b'].flatMap(route=>['grouped','separate','custom'].map(kind=>({route,kind}))).concat({route:'native:c',kind:'custom'});
 for(const {route,kind} of cases){
  if(process.env.CHOIR_GEMINI_ROUTE && route!==process.env.CHOIR_GEMINI_ROUTE)continue;
  const mobile=route==='native:b',page=await browser.newPage({viewport:mobile?{width:360,height:900}:{width:1280,height:1000},hasTouch:mobile,isMobile:mobile});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
  await page.evaluate(async({route,kind})=>{
   await window.cleanup();
   const saved=window.fixtureStore.get('chat:fixture');
   Object.assign(saved,{connection:route.slice(7),connectionMode:'several',plannerMode:'llm',useStyle:true,batchSpeech:kind!=='separate',normalizeLoudness:true,enableMixer:false,enableSfx:false,enableAmbience:false,enableMusic:false});
   for(const actor of saved.fixed){actor.route=route;actor.style='';actor.voice=actor.speaker==='Narrator'?'Charon':actor.speaker==='Mira'?(kind==='custom'?'voicekey_fixture':'Kore'):'Achird';}
   saved.fixed[0].deliveryMode='base';
   if(kind==='custom')saved.extraVoices='voicekey_fixture | Warm storyteller';
   window.fixtureStore.set('chat:fixture',saved);
   window.fixtureMessage.content='The hall fell silent. "<sigh> Welcome... <short pause> stay." A new story begins.';
   document.querySelector('[data-component="MessageContent"]').innerHTML='<p>The hall fell silent.</p><p>“<sigh> Welcome... <short pause> stay.”</p><p>A new story begins.</p>';
   window.cleanup=await window.mountChoir();
  },{route,kind});
  await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());
  await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  await withDrawerControl(page,'drawerPlay',()=>page.locator('[data-et="drawerPlay"]').click());
  await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
  const calls=await page.evaluate(()=>window.calls);
  assert.ok(calls.length);
  const turns=calls.flatMap(call=>call.parameters.turns || [{speaker:call.voice==='Charon'?'Narrator':'Mira',text:call.text,voice:call.voice,style:call.parameters.speech_style}]);
  assert.ok(turns.some(turn=>turn.text.includes('<sigh> Welcome... <short pause> stay.')));
  assert.ok(turns.filter(turn=>turn.speaker==='Narrator').every(turn=>turn.voice==='Charon' && turn.style===''));
  const dialogue=turns.find(turn=>turn.speaker==='Mira');
  assert.equal(dialogue.style,'Warm and relieved');
  assert.equal(dialogue.voice,kind==='custom'?'voicekey_fixture':'Kore');
  if(kind==='grouped')assert.equal(calls.length,1,'compatible preset turns use one request even with matching on');
  else {assert.ok(calls.length>1);assert.ok(calls.every(call=>!call.parameters.turns),'custom voices and disabled grouping use separate calls');}
  if(kind==='custom'){
   const settings=await page.evaluate(()=>window.fixtureStore.get('chat:fixture'));
   assert.ok(settings.extraVoiceRoutes.voicekey_fixture.includes(route),'temporary Gemini IDs remain scoped to Gemini');
   await withDrawerControl(page,'extraVoices',async()=>{});
   assert.equal(await page.locator('[data-et="geminiVoiceHint"]').isVisible(),true);
  }
  console.log(`PASS ${route} ${kind}: vocal events, delivery metadata and fixed voice IDs`);
  await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
