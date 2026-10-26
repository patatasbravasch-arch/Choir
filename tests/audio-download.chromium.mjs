import {playbackFixture} from './fixtures/playback.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const errors=[],server=createServer(async(request,response)=>{
 if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(playbackFixture);return;}
 if(!/^\/(src|dist)\/[a-z]+\.js$/.test(request.url)){response.writeHead(404);response.end();return;}
 try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL(`..${request.url}`,import.meta.url)));}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--disable-crash-reporter']});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 assert.equal(await page.getByRole('heading',{name:'Cast',exact:true}).count(),1);
 assert.equal(await page.getByRole('heading',{name:'NPC Cast',exact:true}).count(),0);
 const download=page.locator('footer [data-choir-download]');await download.click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Play this whole message first'));
 await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
 await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
 await page.locator('[data-choir-action="playback"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
 const calls=await page.evaluate(()=>window.calls.length);assert.equal(calls,3);
 const save=async()=>{const pending=page.waitForEvent('download');await download.click();const result=await pending;assert.match(result.suggestedFilename(),/\.wav$/);return readFile(await result.path());};
 const wav=await save();assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
 assert.equal(wav.readUInt32LE(4),wav.length-8);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav.readUInt32LE(40),3*48000*2);
 assert.equal(await page.evaluate(()=>window.calls.length),calls);
 // Decode the downloaded container again in Chrome, rather than only checking its name/header.
 const decoded=await page.evaluate(async bytes=>{const context=new AudioContext();try{const audio=await context.decodeAudioData(Uint8Array.from(bytes).buffer);return {duration:audio.duration,channels:audio.numberOfChannels};}finally{await context.close();}},[...wav]);
 assert.equal(decoded.duration,3);assert.equal(decoded.channels,1);
 await page.locator('[data-et="voiceGapMsEntry"]').fill('500');await page.locator('[data-et="voiceGapMsEntry"]').press('Tab');
 const spaced=await save();assert.equal(spaced.readUInt32LE(40),4*48000*2);assert.equal(await page.evaluate(()=>window.calls.length),calls);
 // Verify that the active chat can add multiple Fish IDs without using Set default.
 const policy=page.locator('[data-et="npcPolicyRoot"]');await page.locator('details').filter({has:policy}).locator('summary').click();await policy.locator('select').first().selectOption('preferred');
 await policy.getByRole('combobox',{name:'Casting connection',exact:true}).selectOption('native:c');
 for(const id of ['1'.repeat(32),'2'.repeat(32)]){
  await policy.getByRole('button',{name:'Paste Fish voice ID for Preferred voices',exact:true}).click();
  await policy.getByRole('textbox',{name:'Fish voice ID for Preferred voices',exact:true}).fill(id);
  await policy.getByRole('button',{name:'Use Fish voice ID for Preferred voices',exact:true}).click();
 }
 await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture').npcPolicy?.voices?.length===2);
 assert.deepEqual(await policy.getByRole('listbox',{name:'Preferred voices',exact:true}).locator('option:checked').evaluateAll(options=>options.map(option=>option.value)),['1'.repeat(32),'2'.repeat(32)]);
 assert.equal(await page.evaluate(()=>window.calls.length),calls);assert.deepEqual(errors,[]);
 await page.setViewportSize({width:320,height:900});
 assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'Download actions and preferred IDs must fit on mobile');
 if(process.env.CHOIR_DOWNLOAD_SCREENSHOT)await page.locator('main').screenshot({path:process.env.CHOIR_DOWNLOAD_SCREENSHOT});
 console.log('PASS: Chrome downloads and decodes one complete message WAV, preserves clip duration and gaps, reuses saved speech without TTS, exposes one cast, and saves two preferred Fish IDs in the active chat.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
