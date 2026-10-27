// Synthetic TTS responses: verifies the actual outgoing mixed-provider requests.
import {showDrawerControl} from './fixtures/drawer.mjs';
import {playbackFixture} from './fixtures/playback.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url),{chromium}=require('playwright');
const server=createServer(async(req,res)=>{try{res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?playbackFixture:await readFile(new URL('..'+req.url,import.meta.url)));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[];
const shots=process.env.CHOIR_LAYOUT_SCREENSHOTS;if(shots)await mkdir(shots,{recursive:true});
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL||'chrome',args:['--autoplay-policy=no-user-gesture-required']});
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:320,height:800}:{width:1440,height:1050},isMobile:mobile,hasTouch:mobile});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
  const tab=name=>page.getByRole('tab',{name,exact:true});
  assert.equal(await tab('Cast').getAttribute('aria-selected'),'true');
  await tab('Cast').press('ArrowRight');assert.equal(await tab('Playback').getAttribute('aria-selected'),'true');assert.equal(await tab('Playback').evaluate(n=>n===document.activeElement),true);await tab('Cast').click();
  assert.equal(await page.locator('[data-et="fixed"]').isVisible(),true);
  await tab('Cast').press('End');assert.equal(await tab('Settings').getAttribute('aria-selected'),'true');
  assert.equal(await page.getByRole('button',{name:'Setup guide',exact:true}).isVisible(),true);
  await tab('Playback').click();assert.equal(await page.locator('[data-choir-panel="play"]').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);await page.getByRole('button',{name:'Customize mixer',exact:true}).click();
  await page.getByRole('combobox',{name:'Mixer buttons per row',exact:true}).selectOption('2');
  await page.getByRole('checkbox',{name:'Show Follow narration',exact:true}).check();
  await page.getByRole('checkbox',{name:'Show Message controls',exact:true}).check();
  await page.waitForFunction(()=>window.fixtureStore.get('ui:mixer')?.quickButtonColumns===2);
  await page.getByRole('button',{name:'Back to playback',exact:true}).click();await tab('Playback').click();await page.locator('[data-et="showMixer"]').click();
  const positions=await page.locator('.cm-auto-plan button:visible').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
  assert.equal(positions[0].y,positions[1].y);assert.ok(positions[2].y>positions[0].y);assert.ok(positions.every(p=>p.w>=44 && p.h>=(mobile?44:30)));
  assert.equal(await page.locator('[data-choir-mixer]').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  if(shots)await page.screenshot({path:path.join(shots,`ui-cleanup-${mobile?'mobile':'desktop'}-play.png`)});
  await page.getByRole('button',{name:'Collapse Choir voice mixer',exact:true}).click();await tab('Saved').click();assert.equal(await page.locator('[data-et="retention"]').isVisible(),true);assert.equal(await page.locator('[data-et="deleteChatAudio"]').isVisible(),true);
  await page.evaluate(async()=>{
   window.cleanup();const config=window.fixtureStore.get('chat:fixture');config.batchSpeech=false;config.fixed[0]={speaker:'Narrator',voice:'Charon',style:'Measured narration',accent:'Irish'};config.fixed[2]={speaker:'Mira',voice:'fish-voice',route:'native:b',style:'whispering',accent:'Irish'};window.fixtureStore.set('chat:fixture',config);
   const original=window.fetch;window.fetch=async(url,options)=>{
    if(String(url).endsWith('/tts-connections?limit=200'))return Response.json({data:[{id:'a',name:'Gemini',provider:'google_tts',model:'gemini-3.8-flash-tts'},{id:'b',name:'Fish',provider:'fish_audio',model:'s2.1-pro'}]});
    if(String(url).endsWith('/tts-connections/providers'))return Response.json({providers:[{id:'google_tts',capabilities:{parameters:{speech_style:{type:'string'}},multiSpeaker:{maxSpeakers:2,models:['gemini-3.8-flash-tts']}}},{id:'fish_audio',capabilities:{parameters:{voice_direction:{type:'string',models:['s2.1-pro']}}}}]});
    if(String(url).endsWith('/voices'))return Response.json({voices:[{id:'Charon',name:'Charon'},{id:'Kore',name:'Kore'},{id:'y',name:'You'},{id:'fish-voice',name:'Mira'}]});return original(url,options);
   };window.cleanup=await window.mountChoir();
  });
  await tab('Cast').click();await page.getByRole('button',{name:'Edit Narrator',exact:true}).click();
  const narrator=page.locator('.et-cast-row').filter({has:page.locator('strong').filter({hasText:/^Narrator$/})});
  assert.equal(await narrator.locator('[data-choir-delivery-mode]').inputValue(),'base');
  if(shots)await page.screenshot({path:path.join(shots,`ui-cleanup-${mobile?'mobile':'desktop'}-cast.png`)});
  await tab('Playback').click();await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  assert.equal(await page.getByRole('status').filter({hasText:/^Planned$/}).isVisible(),true);assert.equal(await page.locator('.et-current-message').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  await page.locator('[data-et="showMixer"]').click();await page.locator('[data-choir-action="playback"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'),{timeout:20000});
  const calls=await page.evaluate(()=>window.calls),gemini=calls.find(c=>c.connectionId==='a'),fish=calls.find(c=>c.connectionId==='b');
  assert.ok(gemini && fish,JSON.stringify(calls));assert.equal(gemini.parameters.speech_style,'Measured narration. Accent: Irish');assert.equal(fish.parameters.voice_direction,'');assert.match(fish.text,/\[whispering\]/);assert.match(fish.text,/Irish/);assert.ok(!fish.text.includes('[cheerful]'));assert.ok(!gemini.text.includes('Accent:'));
  await page.getByRole('button',{name:'Collapse Choir voice mixer',exact:true}).click();await tab('Settings').click();await tab('Playback').click();await page.getByRole('button',{name:'Customize mixer',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'Mixer buttons per row',exact:true}).inputValue(),'2');
  await page.getByRole('button',{name:'Reset mixer layout',exact:true}).click();await page.waitForFunction(()=>window.fixtureStore.get('ui:mixer')?.quickButtonColumns===0);
  const before=await page.evaluate(()=>window.calls.length);
  await showDrawerControl(page,'batchSpeech');await page.locator('[data-et="batchSpeech"]').check();
  assert.equal(await page.locator('[data-et="groupingStatus"]').isVisible(),true);assert.match(await page.locator('[data-et="groupingStatus"]').innerText(),/Loudness matching keeps different voices/);
  await page.evaluate(async()=>{window.cleanup();const config=window.fixtureStore.get('chat:fixture');config.batchSpeech=true;config.normalizeLoudness=false;config.fixed[0].accent='Scottish';config.fixed[2].route='';config.fixed[2].voice='Kore';window.fixtureStore.set('chat:fixture',config);window.cleanup=await window.mountChoir();});
  await showDrawerControl(page,'normalizeLoudness');await page.locator('[data-et="normalizeLoudness"]').uncheck();await page.waitForFunction(()=>window.fixtureStore.get('settings:global')?.normalizeLoudness===false);
  await showDrawerControl(page,'batchSpeech');await page.locator('[data-et="batchSpeech"]').check();await page.waitForFunction(()=>window.fixtureStore.get('settings:global')?.batchSpeech===true);await tab('Playback').click();
  await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  await page.locator('[data-et="drawerPlay"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
  const grouped=await page.evaluate(before=>window.calls.slice(before),before);assert.equal(grouped.length,1,JSON.stringify({grouped,settings:await page.evaluate(()=>({saved:window.fixtureStore.get('chat:fixture'),checked:document.querySelector('[data-et="batchSpeech"]').checked,mixer:window.fixtureStore.get('ui:mixer')}))}));assert.equal(grouped[0].parameters.turns.length,3);
  await showDrawerControl(page,'batchSpeech');assert.match(await page.locator('[data-et="groupingStatus"]').innerText(),/1 speech batch/);assert.doesNotMatch(await page.locator('[data-et="groupingStatus"]').innerText(),/Loudness matching keeps different voices/);
  assert.equal(grouped[0].parameters.turns[0].style,'Measured narration. Accent: Scottish');assert.equal(grouped[0].parameters.turns[1].style,'whispering. Accent: Irish');assert.equal(grouped[0].parameters.speech_style,'');
  await showDrawerControl(page,'captureDefaults');await page.locator('[data-et="captureDefaults"]').click();
  await page.getByRole('dialog',{name:'Set default',exact:true}).getByRole('button',{name:'Save default',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-et="defaultStatus"]').textContent==='Default saved. New chats use it.');
  assert.equal(await page.getByRole('status').filter({hasText:'Default saved. New chats use it.'}).isVisible(),true);
  await page.locator('[data-et="applyDefaults"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="defaultStatus"]').textContent==='Default applied to this chat.');
  assert.equal(await page.getByRole('status').filter({hasText:'Default applied to this chat.'}).isVisible(),true);
  await page.close();console.log(`PASS ${mobile?'mobile':'desktop'} task tabs, keyboard, row layout, persistence, visible feedback and mixed-provider accents`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
