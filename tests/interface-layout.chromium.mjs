// Real-browser coverage for cast visibility and personal mixer layouts. Uses synthetic audio only.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {playbackFixture} from './fixtures/playback.mjs';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),errors=[];
const layoutFixture=playbackFixture.replace('state:{subscribe:()=>()=>{}}','state:{subscribe:(key,callback)=>{events.set(key,callback);return()=>events.delete(key);}}');
assert.notEqual(layoutFixture,playbackFixture,'The fixture must expose reply-change subscriptions.');
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(layoutFixture);return;}
  if(!/^\/(src|dist)\/[a-z]+\.js$/.test(req.url)){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('..'+req.url,import.meta.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
  for(const mobile of [false,true]){
    const page=await browser.newPage({viewport:mobile?{width:320,height:740}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
    await page.evaluate(async()=>{
      window.cleanup();const config=window.fixtureStore.get('chat:fixture');
      config.fixed.push({speaker:'Kova',voice:'n',aliases:['Armand'],sayAs:'KO-vah',accent:'Irish'});config.enableMusic=true;
      window.fixtureMessage.content='The hall fell silent. "Mira speaks. Welcome." A new story begins.';
      window.fixtureStore.set('ui:mixer',{enabled:true,master:.7,playbackRate:1.75,voiceGapMs:250});
      window.cleanup=await window.mountChoir();
    });
    await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
    assert.equal(await page.locator('[data-et="otherCast"]').isVisible(),true);
    assert.equal(await page.locator('[data-et="otherCast"]').evaluate(node=>node.open),false);
    assert.equal(await page.locator('[data-et="otherCastRows"] strong').filter({hasText:/^Kova$/}).count(),1);
    await page.getByText('Advanced Settings',{exact:true}).click();
    await page.locator('[data-et="chunk"]').fill('1700');await page.locator('[data-et="chunk"]').dispatchEvent('change');
    await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture').chunk===1700);
    assert.deepEqual(await page.evaluate(()=>{const a=window.fixtureStore.get('chat:fixture').fixed.find(a=>a.speaker==='Kova');return [a.voice,a.aliases,a.sayAs,a.accent];}),['n',['Armand'],'KO-vah','Irish']);
    await page.getByText('Advanced Settings',{exact:true}).click();
    await page.getByRole('button',{name:'Customize mixer',exact:true}).click();
    assert.equal(await page.locator('[data-choir-mixer]').getAttribute('data-collapsed'),'true');
    assert.equal(await page.locator('[data-choir-mixer] [data-choir-customize]').count(),0);
    await page.getByRole('checkbox',{name:'Show speed presets',exact:true}).uncheck();
    for(const name of ['Show global speed slider','Show gap between voices','Show individual voice speeds'])await page.getByRole('checkbox',{name,exact:true}).check();
    await page.getByRole('checkbox',{name:'Show Music',exact:true}).uncheck();
    await page.getByRole('checkbox',{name:'Show Follow narration',exact:true}).check();
    await page.getByRole('checkbox',{name:'Show Channel levels',exact:true}).uncheck();
    await page.getByRole('button',{name:'Move SFX earlier',exact:true}).click();
    if(mobile){
      const targets=await page.locator('.cm-customize-row button,.cm-reset-layout,[data-et="customizeMixer"],[data-et="closeMixerLayout"]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
      assert.ok(targets.every(t=>t.width>=44 && t.height>=44),JSON.stringify(targets));
    }
    assert.equal(await page.locator('[data-et="mixerLayout"]').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    if(process.env.CHOIR_LAYOUT_SCREENSHOTS)await page.screenshot({path:path.join(process.env.CHOIR_LAYOUT_SCREENSHOTS,`choir-layout-${mobile?'mobile':'desktop'}.png`)});
    await page.locator('[data-et="closeMixerLayout"]').click();
    assert.equal(await page.getByRole('button',{name:'Customize mixer',exact:true}).evaluate(n=>n===document.activeElement),true);
    await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
    assert.equal(await page.locator('.cm-speed-options').isVisible(),false);
    assert.equal(await page.getByRole('spinbutton',{name:'Playback speed in mixer value',exact:true}).isVisible(),true);
    assert.equal(await page.locator('[data-choir-action="music"]').isVisible(),false);
    assert.equal(await page.getByRole('button',{name:'Channel levels',exact:true}).isVisible(),false);
    const follow=page.getByRole('button',{name:'Follow narration',exact:true});
    assert.equal(await follow.getAttribute('aria-pressed'),'false');await follow.click();assert.equal(await page.locator('[data-et="followNarration"]').isChecked(),true);
    await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture').followNarration===true);
    assert.equal(await page.evaluate(()=>window.fixtureStore.get('chat:fixture').enableMusic),true);
    assert.equal(await page.evaluate(()=>window.plans),1);assert.equal(await page.evaluate(()=>window.calls.length),0);
    await page.waitForFunction(()=>window.fixtureStore.get('ui:mixer')?.layout?.voiceSpeeds===true);
    await page.evaluate(async()=>{window.cleanup();window.cleanup=await window.mountChoir();});
    await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
    assert.equal(await page.locator('.cm-speed-options').isVisible(),false);
    assert.equal(await page.getByRole('spinbutton',{name:'Playback speed in mixer value',exact:true}).inputValue(),'1.75');
    assert.equal(await page.getByRole('spinbutton',{name:'Gap between voices in mixer value',exact:true}).inputValue(),'250');
    assert.equal(await page.locator('[data-choir-action="music"]').isVisible(),false);
    assert.equal(await follow.getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByRole('button',{name:'Channel levels',exact:true}).isVisible(),false);
    await page.getByRole('button',{name:'Collapse Choir voice mixer',exact:true}).click();
    await page.getByRole('button',{name:'Customize mixer',exact:true}).click();
    await page.getByRole('checkbox',{name:'Show Channel levels',exact:true}).check();
    await page.getByRole('checkbox',{name:'Show Music',exact:true}).check();
    await page.locator('[data-et="closeMixerLayout"]').click();
    await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
    await page.getByRole('button',{name:'Channel levels',exact:true}).click();
    const quickTargets=await page.locator('.cm-auto-plan button:visible').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top};}));
    assert.equal(quickTargets.length,6);assert.ok(quickTargets.every((r,i)=>!i || r.left>=quickTargets[i-1].right-1 || r.top>quickTargets[i-1].top));
    if(mobile)assert.ok(quickTargets.every(r=>r.width>=44 && r.height>=44),JSON.stringify(quickTargets));
    const characterSpeed=page.getByRole('spinbutton',{name:'Narrator speed in mixer value',exact:true});
    await characterSpeed.fill('0.75');await characterSpeed.press('Tab');
    await page.waitForFunction(()=>window.fixtureStore.get('ui:mixer')?.channels?.Narrator?.speed===.75);
    const order=await page.locator('.cm-auto-plan>[data-choir-action]').evaluateAll(nodes=>nodes.map(n=>n.dataset.choirAction));
    assert.deepEqual(order,['auto-plan','sfx','auto-play','ambience','music','follow']);
    const bounds=await page.locator('[data-choir-mixer]').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,viewport:innerWidth,scroll:n.scrollWidth,client:n.clientWidth};});
    assert.ok(bounds.x>=0 && bounds.right<=bounds.viewport+1 && bounds.scroll<=bounds.client+1,JSON.stringify(bounds));
    if(process.env.CHOIR_LAYOUT_SCREENSHOTS)await page.screenshot({path:path.join(process.env.CHOIR_LAYOUT_SCREENSHOTS,`choir-controls-${mobile?'mobile':'desktop'}.png`)});
    await page.getByRole('button',{name:'Collapse Choir voice mixer',exact:true}).click();
    await page.getByRole('button',{name:'Customize mixer',exact:true}).click();
    await page.getByRole('button',{name:'Reset mixer layout',exact:true}).click();
    assert.equal(await page.locator('[data-et="followNarration"]').isChecked(),true,'Resetting the layout preserves following.');
    await page.locator('[data-et="closeMixerLayout"]').press('Escape');
    assert.equal(await page.locator('[data-et="mixerLayout"]').isVisible(),false);
    await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
    assert.equal(await page.locator('.cm-speed-options').isVisible(),true);
    assert.equal(await page.getByRole('spinbutton',{name:'Narrator speed in mixer value',exact:true}).count(),0);
    assert.equal(await follow.isVisible(),false);
    await page.waitForFunction(()=>window.fixtureStore.get('ui:mixer')?.layout?.voiceSpeeds===false);
    assert.deepEqual(await page.evaluate(()=>{const m=window.fixtureStore.get('ui:mixer');return [m.master,m.playbackRate,m.voiceGapMs,m.channels.Narrator.speed];}),[.7,1.75,250,.75]);
    await page.getByRole('button',{name:'Collapse Choir voice mixer',exact:true}).click();
    await page.evaluate(()=>window.fixtureMessage.content='ARMAND entered. "Mira speaks. Welcome."');
    await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:') && window.plans===2);
    assert.equal(await page.locator('[data-et="fixed"] strong').filter({hasText:/^Kova$/}).count(),1);
    assert.equal(await page.locator('[data-et="otherCastRows"] strong').filter({hasText:/^Kova$/}).count(),0);
    await page.getByRole('button',{name:'Edit Kova',exact:true}).click();
    await page.evaluate(()=>{window.fixtureMessage.content='The hall fell silent. "Mira speaks. Welcome."';window.fixtureEvents.get('chat.messageCount')();});
    assert.equal(await page.locator('[data-et="fixed"] strong').filter({hasText:/^Kova$/}).count(),1,'The open editor stays available.');
    await page.getByRole('button',{name:'Close Kova editor',exact:true}).click();
    assert.equal(await page.locator('[data-et="fixed"] strong').filter({hasText:/^Kova$/}).count(),0);
    assert.equal(await page.locator('[data-et="otherCastRows"] strong').filter({hasText:/^Kova$/}).count(),1);
    assert.equal(await page.locator('[data-et="otherCast"]>summary').evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.evaluate(()=>window.plans),2,'Reply visibility does not ask for another plan.');
    await page.evaluate(()=>window.cleanup());await page.close();
    console.log(`PASS: ${mobile?'320px touch':'desktop'} cast collapse/restore, preserved voices, saved mixer options, quick button ordering, optional voice speeds and layout reset.`);
  }
  assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
