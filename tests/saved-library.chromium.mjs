import {withDrawerControl} from './fixtures/drawer.mjs';
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
 if(!/^\/(src|dist)\/[a-z-]+\.js$/.test(request.url)){response.writeHead(404);response.end();return;}
 try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL(`..${request.url}`,import.meta.url)));}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--disable-crash-reporter']});
 const page=await browser.newPage({acceptDownloads:true});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
 await page.locator('[data-et="drawerPlay"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
 const calls=await page.evaluate(()=>window.calls.length);
 // Lumiverse sets up inactive drawer tabs before their roots enter the document.
 await page.evaluate(async()=>{await window.cleanup();const host=document.querySelector('main');host.remove();window.cleanup=await window.mountChoir();document.body.append(host);});
 await page.getByRole('tab',{name:'Saved',exact:true}).click();
 const saved=page.getByRole('tabpanel',{name:'Saved',exact:true}),download=saved.locator('[data-choir-download]');
 await download.waitFor({state:'visible',timeout:3000});assert.match(await saved.innerText(),/Complete playback · WAV ready/);
 const pending=page.waitForEvent('download');await download.click();const wav=await readFile(await (await pending).path());assert.equal(wav.toString('ascii',0,4),'RIFF');
 const archivePending=page.waitForEvent('download');await saved.getByRole('button',{name:'Download all',exact:true}).click();const archive=await readFile(await (await archivePending).path());
 assert.equal(archive.readUInt32LE(0),0x04034b50);assert.equal(archive.readUInt16LE(8),0);const start=30+archive.readUInt16LE(26)+archive.readUInt16LE(28),size=archive.readUInt32LE(18);assert.deepEqual(archive.subarray(start,start+size),wav);
 assert.equal(await page.evaluate(()=>window.calls.length),calls);assert.deepEqual(errors,[]);
 console.log('PASS: a Saved drawer mounted off-document retains its complete-mix badge and download button; individual and Download all WAV bytes match without new TTS.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
