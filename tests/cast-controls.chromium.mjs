import {playbackFixture} from './fixtures/playback.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.CHOIR_BROWSER_MODULES || '.', 'package.json')),{chromium}=require('playwright');
const server=createServer(async(req,res)=>{
  try{res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?playbackFixture:await readFile(new URL('..'+req.url,import.meta.url)));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[];
try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  for(const mobile of [false,true])for(const mode of ['one','several']){
    const page=await browser.newPage({viewport:mobile?{width:320,height:800}:{width:1280,height:1000},hasTouch:mobile,isMobile:mobile});page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
    await page.evaluate(async mode=>{
      window.cleanup();const saved=window.fixtureStore.get('chat:fixture');saved.connectionMode=mode;
      saved.fixed.push({...saved.fixed[2],voice:'n',route:'native:a'},{speaker:'Kieran',voice:'m',route:'native:b',style:'Quiet',accent:'Irish'});
      saved.casts={'native:a':[{speaker:'Mira',voice:'n',style:''},{speaker:'Guard',voice:'y',style:''},{speaker:'Guard',voice:'n',style:''}],'native:b':[{speaker:'Mira',voice:'n',style:''}]};
      window.fixtureStore.set('chat:fixture',saved);window.cleanup=await window.mountChoir();
    },mode);
    const cast=page.locator('[data-choir-panel="cast"]'),row=cast.locator('.et-cast-row').filter({has:page.locator('.et-cast-header strong',{hasText:/^Mira$/})});
    assert.equal(await row.count(),1);assert.equal(await page.evaluate(()=>window.fixtureStore.get('chat:fixture').fixed.find(actor=>actor.speaker==='Mira').voice),'m');
    const fits=async()=>assert.equal(await page.locator('.ensemble-tts').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
    await fits();assert.equal(await row.locator('[data-choir-remove]').isVisible(),true);
    for(const name of ['Narrator','You'])assert.equal(await cast.locator('.et-cast-row').filter({has:page.locator('.et-cast-header strong',{hasText:new RegExp(`^${name}$`)})}).locator('[data-choir-remove]').count(),0);
    const shot=async name=>{if(process.env.CHOIR_CAST_SCREENSHOTS){await mkdir(process.env.CHOIR_CAST_SCREENSHOTS,{recursive:true});await page.locator('main').screenshot({path:path.join(process.env.CHOIR_CAST_SCREENSHOTS,`${mobile?'mobile':'desktop'}-${mode}-${name}.png`)});}};
    await shot('cast');await row.getByRole('button',{name:'Edit Mira',exact:true}).click();
    const remove=row.getByRole('button',{name:'Remove character',exact:true});assert.equal(await remove.textContent(),'Remove');assert.equal(await remove.isVisible(),true);await fits();
    const bounds=await remove.boundingBox(),viewport=page.viewportSize();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=viewport.width+1);
    if(mobile)assert.ok(bounds.width>=44 && bounds.height>=44,JSON.stringify(bounds));
    assert.equal(await row.locator('[data-choir-pronunciation-page]').isVisible(),false);await shot('editor');await remove.click();
    await page.waitForFunction(()=>document.querySelector('[data-et="saveState"]').textContent==='Saved automatically');
    assert.equal(await page.evaluate(()=>window.fixtureStore.get('chat:fixture').fixed.some(actor=>actor.speaker==='Mira')),false);
    await page.evaluate(async()=>{window.cleanup();window.cleanup=await window.mountChoir();});
    assert.equal(await row.count(),0);await fits();assert.equal(await page.evaluate(()=>window.calls.length),0);
    await page.close();console.log(`PASS ${mobile?'320px touch':'desktop'} ${mode}: duplicate repair preserves the first voice, visible Remove fits list/editor, and removal survives remount without provider calls.`);
  }
  assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
