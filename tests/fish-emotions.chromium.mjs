import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {playbackFixture} from './fixtures/playback.mjs';
import {withDrawerControl} from './fixtures/drawer.mjs';

const require=createRequire(path.join(process.env.CHOIR_BROWSER_MODULES || '.', 'package.json')),{chromium}=require('playwright');
const fixture=playbackFixture
 .replace("providers:[{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}}]","providers:[{id:'google_tts',capabilities:{parameters:{speech_style:{type:'string'}}}},{id:'fish_audio',capabilities:{parameters:{voice_direction:{type:'string',models:['s2.1-pro']}},multiSpeaker:{maxSpeakers:5,models:['s2.1-pro']}}},{id:'openrouter_tts',capabilities:{multiSpeaker:{maxSpeakers:5,models:['fish-audio/s2-pro']}}}]")
 .replace("provider:'openai_tts',model:'model-a'","provider:'google_tts',model:'gemini-3.8-flash-tts'")
 .replace("id:'b',name:'Characters',provider:'openai_tts',model:'model-b'","id:'b',name:'Characters',provider:window.openRouterFish?'openrouter_tts':'fish_audio',model:window.openRouterFish?'fish-audio/s2-pro':'s2.1-pro'")
 .replace("voice:actor.voice,style:''","voice:actor.voice,style:unit.kind==='dialogue'?(window.fixtureStyle || 'Slightly amused, conversational'):''");
assert.ok(fixture.includes("window.fixtureStyle || 'Slightly amused, conversational'"));
const server=createServer(async(req,res)=>{
 try{res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?fixture:await readFile(new URL('..'+req.url,import.meta.url)));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
 for(const mobile of [false,true])for(const openRouter of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:320,height:800}:{width:1280,height:1000},hasTouch:mobile,isMobile:mobile});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
  await page.evaluate(async openRouter=>{
   await window.cleanup();window.openRouterFish=openRouter;
   const saved=window.fixtureStore.get('chat:fixture');Object.assign(saved,{connectionMode:'several',useStyle:true,skipMeta:false,batchSpeech:false,enableMixer:false,enableSfx:false,enableAmbience:false,enableMusic:false});
   Object.assign(saved.fixed[2],{style:'Dramatic and theatrical',deliveryMode:'auto'});window.fixtureStore.set('chat:fixture',saved);window.cleanup=await window.mountChoir();
  },openRouter);
  assert.equal(await page.getByRole('combobox',{name:'Add Fish emotion or delivery cue',exact:true}).count(),0,'automatic TTS emotions need no manual picker');
  const plan=async()=>{await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));};
  const play=async()=>{await withDrawerControl(page,'drawerPlay',()=>page.locator('[data-et="drawerPlay"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));};
  await plan();assert.equal(await page.evaluate(()=>window.calls.length),0,'planning does not synthesize audio');
  await page.getByRole('tab',{name:'Playback',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Speech plan →',exact:true}).isVisible(),true,'delivery guidance must have a visible entry in Playback');
  await page.getByRole('button',{name:'Speech plan →',exact:true}).click();
  assert.equal(await page.locator('[data-choir-delivery]').filter({hasText:/Automatic acting · Slightly amused[.,] conversational/}).isVisible(),true,JSON.stringify(await page.locator('[data-choir-delivery]').allTextContents()));
  assert.equal(await page.locator('[data-choir-delivery]').filter({hasText:'Base style only · Measured narration'}).count(),2);
  assert.ok(!(await page.locator('[data-choir-delivery]').allTextContents()).some(text=>text.includes('theatrical')),'show effective delivery, not the overridden dramatic base');
  if(process.env.CHOIR_EMOTION_SCREENSHOTS){await mkdir(process.env.CHOIR_EMOTION_SCREENSHOTS,{recursive:true});await page.locator('main').screenshot({path:path.join(process.env.CHOIR_EMOTION_SCREENSHOTS,`delivery-${mobile?'mobile':'desktop'}-${openRouter?'openrouter':'native'}.png`)});}
  await play();
  let calls=await page.evaluate(()=>window.calls),fish=calls.find(call=>call.voice==='m');assert.equal(calls.length,3);assert.ok(fish);assert.match(fish.text,/^\[Slightly amused\]\[conversational\] /);
  if(!openRouter)assert.equal(fish.parameters.voice_direction,'','native direction must not duplicate the injected cues');
  assert.ok(calls.filter(call=>call.voice==='n').every(call=>call.parameters.speech_style==='Measured narration' && !call.text.includes('[Slightly amused]')),'Gemini narrator retains its own stable delivery');
  await play();assert.equal(await page.evaluate(()=>window.calls.length),3,'unchanged playback reuses the effective emotion request');
  await page.evaluate(()=>{window.fixtureStyle='Clearly sorrowful; softly spoken';});await plan();await play();
  calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,4,'a newly planned emotion regenerates only that Fish passage');fish=calls.at(-1);
  assert.equal(fish.voice,'m');assert.match(fish.text,/^\[Clearly sorrowful\]\[softly spoken\] /);
  await page.evaluate(()=>{window.calls=[];window.fixtureStyle='angry; shouting';window.fixtureMessage.content='The hall fell silent. "This is [whispering] important." A new story begins.';});await plan();await play();
  calls=await page.evaluate(()=>window.calls);fish=calls.find(call=>call.voice==='m');assert.ok(fish);assert.equal((fish.text.match(/\[whispering\]/g) || []).length,1);
  assert.ok(!JSON.stringify(fish).includes('shouting') && !JSON.stringify(fish).includes('angry'),'preset cue suppresses generated acting even inside the line');
  await page.evaluate(async()=>{
   await window.cleanup();const saved=window.fixtureStore.get('chat:fixture');Object.assign(saved,{batchSpeech:true,normalizeLoudness:false});
   window.fixtureStore.set('settings:global',{...window.fixtureStore.get('settings:global'),batchSpeech:true,normalizeLoudness:false});
   saved.fixed.push({speaker:'Nora',voice:'y',style:'',route:'native:b'});window.fixtureStore.set('chat:fixture',saved);
   window.fixtureStyle='sad; whispering';window.fixtureMessage.content='"Mira speaks. [whispering] Welcome." "Nora speaks. Goodbye."';window.calls=[];window.cleanup=await window.mountChoir();
  });await plan();await play();
  const grouped=await page.evaluate(()=>window.calls.find(call=>call.parameters.turns?.length===2));assert.ok(grouped,'compatible Fish actors use a grouped request');
  assert.equal((grouped.parameters.turns[0].text.match(/\[whispering\]/g) || []).length,1);assert.ok(!grouped.parameters.turns[0].text.includes('[sad]'));
  assert.match(grouped.parameters.turns[1].text,/^\[sad\]\[whispering\] /);assert.ok(grouped.parameters.turns.every(turn=>turn.style===''),'grouped relays must not add another style');
  await page.evaluate(()=>{window.fixtureMessage.content='"Welcome home."';});await plan();
  await page.getByRole('tab',{name:'Cast',exact:true}).click();await page.getByRole('button',{name:'Edit Mira',exact:true}).click();
  assert.equal(await page.getByRole('combobox',{name:'Delivery',exact:true}).inputValue(),'auto');assert.equal(await page.getByRole('textbox',{name:'Base style',exact:true}).inputValue(),'Dramatic and theatrical','planning preserves the saved base without stacking it on automatic delivery');
  const callsBeforeSettings=await page.evaluate(()=>window.calls.length);
  await page.getByRole('combobox',{name:'Delivery',exact:true}).selectOption('base');
  await page.getByRole('tab',{name:'Playback',exact:true}).click();await page.getByRole('button',{name:'Speech plan →',exact:true}).click();
  assert.equal(await page.locator('[data-choir-delivery]').filter({hasText:'Base style only · Dramatic and theatrical'}).count(),1,'guidance updates immediately when a base overrides planned emotion');
  await page.getByRole('tab',{name:'Cast',exact:true}).click();await page.getByRole('button',{name:'Edit Mira',exact:true}).click();
  await page.getByRole('combobox',{name:'Delivery',exact:true}).selectOption('off');
  await page.getByRole('tab',{name:'Playback',exact:true}).click();await page.getByRole('button',{name:'Speech plan →',exact:true}).click();
  assert.equal(await page.locator('[data-choir-delivery]').filter({hasText:'Tone directions off · No added direction'}).count(),1,'the selected Fish turn shows that generated acting is disabled');
  assert.equal(await page.evaluate(()=>window.calls.length),callsBeforeSettings,'viewing directions and changing modes makes no TTS requests');
  assert.equal(await page.locator('.ensemble-tts').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  if(process.env.CHOIR_EMOTION_SCREENSHOTS){await mkdir(process.env.CHOIR_EMOTION_SCREENSHOTS,{recursive:true});await page.locator('main').screenshot({path:path.join(process.env.CHOIR_EMOTION_SCREENSHOTS,`${mobile?'mobile':'desktop'}-${openRouter?'openrouter':'native'}.png`)});}
  console.log(`PASS ${mobile?'mobile':'desktop'} S2 ${openRouter?'OpenRouter':'native'} automatic TTS injection, emotion changes, voice stability, cache reuse, preset priority, Gemini isolation and grouped dialogue`);
  await page.evaluate(()=>window.cleanup());await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
