import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {playbackFixture} from './fixtures/playback.mjs';
import {withDrawerControl} from './fixtures/drawer.mjs';

const require=createRequire(path.join(process.env.CHOIR_BROWSER_MODULES || '.', 'package.json')),{chromium}=require('playwright');
const mixed=playbackFixture
 .replace("providers:[{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}}]","providers:[{id:'google_tts',capabilities:{parameters:{speech_style:{type:'string'}},multiSpeaker:{maxSpeakers:2,models:['gemini-3.8-flash-tts']}}},{id:'fish_audio',capabilities:{parameters:{voice_direction:{type:'string',models:['s2.1-pro']}},multiSpeaker:{maxSpeakers:5,models:['s2.1-pro']}}}]")
 .replace("provider:'openai_tts',model:'model-a'","provider:'google_tts',model:'gemini-3.8-flash-tts',api_key:'DO_NOT_DISPLAY_CONNECTION_SECRET'")
 .replace("provider:'openai_tts',model:'model-b'","provider:'fish_audio',model:'s2.1-pro',api_key:'DO_NOT_DISPLAY_CONNECTION_SECRET'")
 .replace("voice:actor.voice,style:''","voice:actor.voice,style:unit.kind==='dialogue'?(window.fixtureStyle || 'Slightly amused, conversational'):''")
 .replaceAll("request.action==='plan'","['plan','planJev'].includes(request.action)");
assert.ok(mixed.includes("window.fixtureStyle || 'Slightly amused, conversational'"));
assert.ok(mixed.includes('DO_NOT_DISPLAY_CONNECTION_SECRET'));
const gemini=mixed.replace("provider:'fish_audio',model:'s2.1-pro',api_key:","provider:'google_tts',model:'gemini-3.8-flash-tts',api_key:")
 .replaceAll("voice:'n'","voice:'Charon'").replaceAll("voice:'m'","voice:'Kore'");
const server=createServer(async(req,res)=>{
 try{res.setHeader('Content-Type',['/mixed','/gemini'].includes(req.url)?'text/html':'text/javascript');res.end(req.url==='/mixed'?mixed:req.url==='/gemini'?gemini:await readFile(new URL('..'+req.url,import.meta.url)));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
 for(const provider of ['mixed','gemini'])for(const planner of ['llm','jev']){
  const mobile=planner==='jev',page=await browser.newPage({viewport:mobile?{width:360,height:900}:{width:1280,height:1000},hasTouch:mobile,isMobile:mobile});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${provider}`);await page.waitForFunction(()=>window.ready);
  await page.evaluate(async({provider,planner})=>{
   await window.cleanup();const saved=window.fixtureStore.get('chat:fixture');
   Object.assign(saved,{connectionMode:'several',plannerMode:planner,useStyle:true,skipMeta:false,batchSpeech:provider==='gemini',normalizeLoudness:true,enableMixer:false,enableSfx:false,enableAmbience:false,enableMusic:false});
   Object.assign(saved.fixed[2],{style:'Dramatic and theatrical',deliveryMode:'auto'});
   if(provider==='gemini')for(const actor of saved.fixed)actor.route='native:a';
   window.fixtureStore.set('chat:fixture',saved);window.cleanup=await window.mountChoir();
  },{provider,planner});
  const plan=async()=>{await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));};
  const play=async()=>{await withDrawerControl(page,'drawerPlay',()=>page.locator('[data-et="drawerPlay"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));};
  const inspect=async view=>{await withDrawerControl(page,'ttsInspectorOpen',()=>page.locator('[data-et="ttsInspectorOpen"]').click());await page.locator('[data-et="ttsInspectorView"]').selectOption(view);};
  const bodies=async kind=>page.locator(`[data-choir-tts-payload="${kind}"]`).evaluateAll(nodes=>nodes.map(node=>JSON.parse(node.value)));
  assert.equal(await page.locator('[data-et="ttsInspectorOpen"]').isVisible(),false,'mode is off by default');
  await withDrawerControl(page,'paranoidMode',()=>page.locator('[data-et="paranoidMode"]').check());
  await inspect('sent');assert.deepEqual(await bodies('sent'),[]);assert.equal(await page.evaluate(()=>window.calls.length),0);
  await plan();const plansBeforeInspect=await page.evaluate(()=>window.plans);
  await inspect('prepared');const prepared=await bodies('prepared');assert.ok(prepared.length);
  assert.equal(await page.evaluate(()=>window.plans),plansBeforeInspect,'inspection makes no planner requests');assert.equal(await page.evaluate(()=>window.calls.length),0,'preview makes no TTS requests');
  if(provider==='gemini'){
   assert.ok(prepared.some(body=>body.parameters.turns?.length===3),'Gemini grouped preview contains all alternating turns');
   const turns=prepared.find(body=>body.parameters.turns).parameters.turns;
   assert.equal(turns[0].voice,'Charon');assert.equal(turns[1].voice,'Kore');assert.equal(turns[1].style,'Slightly amused, conversational');
  }else{
   assert.ok(prepared.some(body=>body.voice==='m' && body.text.startsWith('[Slightly amused][conversational]')));
   assert.ok(prepared.some(body=>body.voice==='n' && body.parameters.speech_style==='Measured narration'));
  }
  await play();const actual=await page.evaluate(()=>window.calls);
  const sorted=bodies=>bodies.map(body=>JSON.stringify(body)).sort();assert.deepEqual(sorted(actual),sorted(prepared),'prepared payloads equal the actual POST bodies');
  await inspect('sent');assert.deepEqual(sorted(await bodies('sent')),sorted(actual),'captured calls equal actual requests without reconstructing them later');
  assert.ok((await page.locator('.et-tts-request strong').allTextContents()).every(text=>text.includes('Succeeded')));
  assert.ok(!(await page.locator('[data-choir-destination="ttsInspector"]').innerText()).includes('DO_NOT_DISPLAY_CONNECTION_SECRET'));
  assert.ok(!JSON.stringify(await bodies('sent')).includes('DO_NOT_DISPLAY_CONNECTION_SECRET'));
  if(process.env.CHOIR_INSPECTOR_SCREENSHOTS){await mkdir(process.env.CHOIR_INSPECTOR_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.CHOIR_INSPECTOR_SCREENSHOTS,`${provider}-${planner}-${mobile?'mobile':'desktop'}.png`)});}
  await play();await inspect('sent');assert.equal(await page.evaluate(()=>window.calls.length),actual.length,'unchanged playback uses cache');assert.equal((await bodies('sent')).length,actual.length,'cache hits add no invented calls');
  const saved=await page.evaluate(()=>JSON.stringify([...window.fixtureStore]));assert.ok(!saved.includes('DO_NOT_DISPLAY_CONNECTION_SECRET'),'connection secrets are never saved with settings');
  for(const body of actual)assert.ok(!saved.includes(JSON.stringify(body)) && !saved.includes(JSON.stringify(JSON.stringify(body))),'raw request bodies are never persisted as objects or strings');
  await withDrawerControl(page,'paranoidMode',()=>page.locator('[data-et="paranoidMode"]').uncheck());assert.equal(await page.locator('[data-et="ttsInspectorOpen"]').isVisible(),false);
  await withDrawerControl(page,'paranoidMode',()=>page.locator('[data-et="paranoidMode"]').check());await inspect('sent');assert.deepEqual(await bodies('sent'),[],'disabling clears captured text');
  await page.evaluate(()=>{window.fixtureStyle='Clearly sorrowful, softly spoken';window.ttsError='Synthetic TTS failure';});await plan();
  await withDrawerControl(page,'drawerPlay',()=>page.locator('[data-et="drawerPlay"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Synthetic TTS failure'));
  await inspect('sent');const failed=await bodies('sent');assert.ok(failed.length);assert.deepEqual(failed[0],await page.evaluate(()=>window.calls.at(-1)));assert.ok((await page.locator('.et-tts-request strong').allTextContents()).some(text=>text.includes('Failed')),'failed synthesis still exposes its attempted payload');
  await page.locator('[data-et="clearTtsLog"]').click();assert.deepEqual(await bodies('sent'),[],'clear removes retained request text');
  await page.evaluate(async()=>{await window.cleanup();window.cleanup=await window.mountChoir();});
  await withDrawerControl(page,'paranoidMode',async()=>assert.equal(await page.locator('[data-et="paranoidMode"]').isChecked(),true));
  await inspect('sent');assert.deepEqual(await bodies('sent'),[],'the option persists while request bodies do not');
  assert.equal(await page.locator('.ensemble-tts').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'inspector fits the drawer');
  console.log(`PASS ${provider} ${planner} ${mobile?'mobile':'desktop'} exact prepared and attempted payloads, voice IDs, grouped turns, no extra calls, cache reuse, credential exclusion, failures and session-only logs`);
  await page.evaluate(()=>window.cleanup());await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
