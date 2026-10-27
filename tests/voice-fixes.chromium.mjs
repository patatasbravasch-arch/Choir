import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {playbackFixture} from './fixtures/playback.mjs';
import {withDrawerControl} from './fixtures/drawer.mjs';

const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),errors=[];
const html=playbackFixture
 .replace("wav(input.voice==='m'?0.4:0.06)","wav(input.voice==='m'?0.0141421356:0.8)")
 .replace("{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}}","{id:'fish_audio',capabilities:{parameters:{voice_direction:{type:'string',models:['s2.1-pro']}},multiSpeaker:{maxSpeakers:5,models:['s2.1-pro']}}}")
 .replaceAll("provider:'openai_tts',model:'model-a'","provider:'fish_audio',model:'s2.1-pro'")
 .replaceAll("provider:'openai_tts',model:'model-b'","provider:'fish_audio',model:'s2.1-pro'");
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(!/^\/(src|dist)\/[a-z-]+\.js$/.test(req.url)){res.writeHead(404);res.end();return;}
 try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('..'+req.url,import.meta.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
// Keep artifacts next to the task's other reports, outside the application.
const screenshots=new URL('../../../outputs/voice-fixes/',import.meta.url);await mkdir(screenshots,{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
 for(const mobile of [false,true])for(const preset of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
  await page.evaluate(async preset=>{
   await window.cleanup();window.calls=[];window.gains=[];
   const saved=window.fixtureStore.get('chat:fixture');
   Object.assign(saved,{connectionMode:'one',connection:'a',batchSpeech:true,normalizeLoudness:true,skipMeta:false,enableSfx:false,enableAmbience:false,enableMusic:false,useStyle:true,chunk:1800});
   saved.fixed=[{speaker:'Narrator',voice:'n',style:'Measured'},{speaker:'You',voice:'y',style:''},{speaker:'Kian',voice:'m',style:'Theatrical',accent:'Irish'},{speaker:'Kian Frost',voice:'y',style:''}];saved.casts={'native:a':[]};
   window.fixtureStore.set('settings:global',{normalizeLoudness:true,batchSpeech:true,skipMeta:false,enableSfx:false,enableAmbience:false,enableMusic:false});
   window.fixtureMessage.name='Kian';window.fixtureMessage.content='The hall fell silent. "Kian speaks. '+(preset?'[whispering] ':'')+'Welcome." A new story begins.';
   window.cleanup=await window.mountChoir();
  },preset);
  await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
  await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
  const actual=await page.evaluate(()=>({calls:window.calls,gains:window.gains.map(gain=>gain.gain.value),fixed:window.fixtureStore.get('chat:fixture').fixed}));
  assert.equal(actual.fixed.length,3);assert.equal(actual.fixed[2].speaker,'Kian');assert.equal(actual.fixed[2].voice,'m');assert.ok(actual.fixed[2].aliases.includes('Kian Frost'));
  assert.equal(actual.calls.length,3);assert.ok(actual.calls.every(call=>!call.parameters.turns));
  const kian=actual.calls.find(call=>call.voice==='m');assert.ok(kian.parameters.voice_direction.includes('Accent: Irish'));
  if(preset){assert.equal(kian.text.match(/\[whispering\]/g).length,1);assert.ok(!kian.parameters.voice_direction.includes('Theatrical'));}
  else assert.ok(kian.parameters.voice_direction.includes('Theatrical'));
  const loud=.8/Math.SQRT2*actual.gains[0],quiet=.0141421356/Math.SQRT2*actual.gains[1];
  assert.ok(Math.abs(loud-.12)<.002,JSON.stringify(actual.gains));assert.ok(Math.abs(quiet-.12)<.002,JSON.stringify(actual.gains));
  await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
  assert.equal(await page.evaluate(()=>window.calls.length),3,'replay reuses the balanced individual clips');
  await page.screenshot({path:path.join(fileURLToPath(screenshots),`${mobile?'mobile':'desktop'}-${preset?'preset':'theatrical'}.png`),fullPage:true});
  console.log(JSON.stringify({mobile,preset,calls:actual.calls.length,loudRms:loud,quietRms:quiet,cast:actual.fixed.map(actor=>actor.speaker)}));
  await page.evaluate(()=>window.cleanup());await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile identity repair, Fish theatrical delivery and preset precedence, equal loudness and cached replay.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
