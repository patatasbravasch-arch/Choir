import {showDrawerControl,withDrawerControl} from './fixtures/drawer.mjs';
// Synthetic audio, disposable settings/IndexedDB, no live provider requests.
import {playbackFixture} from './fixtures/playback.mjs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),errors=[];
const sharedSettings="settings:{get:async key=>{const raw=localStorage.getItem('v40:'+key);return raw===null?structuredClone(store.get(key)??null):JSON.parse(raw);},set:async(key,value)=>{window.fixtureWrites=(window.fixtureWrites||[]).concat(key);localStorage.setItem('v40:'+key,JSON.stringify(value));store.set(key,structuredClone(value));}}";
function fixture(shared){
 let html=playbackFixture;
 if(shared)html=html.replace('settings:{get:async key=>structuredClone(store.get(key)??null),set:async(key,value)=>store.set(key,structuredClone(value))}',sharedSettings);
 const markup='<div data-component="SwipeControls"><button aria-label="Previous swipe">‹</button><span>1 / 2</span><button aria-label="Next swipe">›</button></div><span data-spindle-mount="message_footer"><footer></footer></span>';
 html=html.replace('<footer></footer>','').replace('</div></div><nav',`</div>${markup}</div><nav`)
  .replace("registerDomDecorator:options=>options.render(footer,{messageId:'reply'})","registerDomDecorator:options=>{window.fixtureDecorator=options;return options.render(footer,{messageId:'reply',node:footer.parentElement});}")
  .replace('</style>','article{display:block!important;min-width:0}[data-message-id]{display:flex;flex-direction:column;padding:12px;border-radius:16px;overflow:hidden;contain:layout style paint}[data-component="SwipeControls"]{display:flex;align-items:center;gap:4px;margin-top:12px}[data-component="SwipeControls"]>button{width:28px;height:28px}[data-component="SwipeControls"]>span{font:12px system-ui}</style>');
 assert.ok(html.includes('window.fixtureDecorator=options'));
 return html;
}
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/?')){res.setHeader('Content-Type','text/html');res.end(fixture(req.url.includes('shared')));return;}
 if(!/^\/(src|dist)\/[a-z]+\.js$/.test(req.url)){res.writeHead(404);res.end();return;}
 try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('..'+req.url,import.meta.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const until=async check=>{const end=Date.now()+15000;while(!await check()){if(Date.now()>end)throw Error('Timed out waiting for regression state');await new Promise(r=>setTimeout(r,25));}};
const openDetails=(page,field)=>showDrawerControl(page,field);
const mount=async(context,shared=false)=>{const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/?${shared?'shared':'single'}`);await page.waitForFunction(()=>window.ready);return page;};
const paragraph=(page,text,messageId='reply')=>page.evaluate(({text,messageId})=>window.__CHOIR_API__.playParagraph({text,messageId}),{text,messageId});
const calls=page=>page.evaluate(()=>window.calls.length);
const clear=async page=>{await openDetails(page,'messages');await withDrawerControl(page,'deleteChatAudio',()=>page.locator('[data-et="deleteChatAudio"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('All Choir audio deleted'));};
const change=async(page,name,value)=>{await openDetails(page,name);await page.locator(`[data-et="${name}"]`).selectOption(value);await page.waitForFunction(()=>document.querySelector('[data-et="saveState"]').textContent==='Saved automatically');};
const sharedValue=(page,key)=>page.evaluate(key=>JSON.parse(localStorage.getItem('v40:'+key)||'null'),key);
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome'});
 {
  const context=await browser.newContext(),page=await mount(context);
  await paragraph(page,'A private sentence.');const first=await calls(page);await paragraph(page,'A private sentence.');assert.equal(await calls(page),first);
  await paragraph(page,'Another message.','other');const both=await calls(page);
  await openDetails(page,'messages');await page.locator('[data-et="messages"]').getByRole('button',{name:'Delete audio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Saved audio deleted'));
  await paragraph(page,'Another message.','other');assert.equal(await calls(page),both,'deleting one message preserves the other cached message');
  await paragraph(page,'A private sentence.');assert.equal(await calls(page),both+1,'deleted speech must be generated again');
  await clear(page);await paragraph(page,'Another message.','other');assert.equal(await calls(page),both+2,'clear removes remaining cached paragraphs');
  await page.evaluate(()=>{window.holdSpeechText='Held work';window.pendingParagraph=window.__CHOIR_API__.playParagraph({text:'Held work.',messageId:'reply'}).then(()=>({ok:true}),e=>({error:e.name}));});
  await page.waitForFunction(()=>typeof window.releaseSpeech==='function');const pendingCalls=await calls(page);await clear(page);
  await page.evaluate(()=>{window.releaseSpeech();window.holdSpeechText='';});assert.equal((await page.evaluate(()=>window.pendingParagraph)).error,'AbortError');
  await paragraph(page,'Held work.');assert.equal(await calls(page),pendingCalls+1,'late cancelled work cannot repopulate the cache');
  console.log('PASS: Cue delete/clear invalidates speech, preserves another message, and rejects late synthesis.');await context.close();
 }
 {
  const context=await browser.newContext();
  await context.addInitScript(()=>{const now=Date.now.bind(Date);window.fixtureTimeOffset=0;Date.now=()=>now()+window.fixtureTimeOffset;});
  const page=await mount(context);await change(page,'retention','7');
  await withDrawerControl(page,'freesoundApiKey',()=>page.locator('[data-et="freesoundApiKey"]').fill('synthetic-key'));await page.waitForFunction(()=>document.querySelector('[data-et="saveState"]').textContent==='Saved automatically');
  const soundResult=await paragraph(page,'Rain drummed. The page snapped.');const first=await page.evaluate(()=>({speech:window.calls.length,effects:window.foleyDownloads+(window.bedDownloads||0)}));assert.ok(first.effects>=2,JSON.stringify({first,soundResult,state:await page.locator('[data-et="sfxStatus"]').textContent()}));
  await paragraph(page,'Rain drummed. The page snapped.');assert.deepEqual(await page.evaluate(()=>({speech:window.calls.length,effects:window.foleyDownloads+(window.bedDownloads||0)})),first);
  await page.evaluate(()=>{window.fixtureTimeOffset=8*86400000;document.dispatchEvent(new Event('visibilitychange'));});
  await paragraph(page,'Rain drummed. The page snapped.');const expired=await page.evaluate(()=>({speech:window.calls.length,effects:window.foleyDownloads+(window.bedDownloads||0)}));assert.ok(expired.speech>first.speech && expired.effects>first.effects);
  await clear(page);await paragraph(page,'Rain drummed. The page snapped.');const cleared=await page.evaluate(()=>({speech:window.calls.length,effects:window.foleyDownloads+(window.bedDownloads||0)}));assert.ok(cleared.speech>expired.speech && cleared.effects>expired.effects);
  await page.evaluate(()=>{window.fixtureTimeOffset=10*86400000;});await change(page,'retention','1');await paragraph(page,'Rain drummed. The page snapped.');const shortened=await page.evaluate(()=>({speech:window.calls.length,effects:window.foleyDownloads+(window.bedDownloads||0)}));assert.ok(shortened.speech>cleared.speech && shortened.effects>cleared.effects,'shortening retention invalidates already-old Cue speech and scene assets');
  console.log('PASS: Cue speech, effects and ambience expire, clear and follow shorter retention; valid cached audio is reused.');await context.close();
 }
 {
  const context=await browser.newContext(),a=await mount(context,true),b=await mount(context,true);
  await paragraph(a,'Shared deleted speech.');const before=await calls(a);
  await a.evaluate(()=>{window.heardInvalidation=new Promise(resolve=>{const channel=new BroadcastChannel('choir-audio:'+window.fixtureStore.get('audio:namespace'));channel.onmessage=e=>{if(e.data.kind==='chat'){channel.close();resolve(true);}};});});
  await clear(b);await a.evaluate(()=>window.heardInvalidation);await paragraph(a,'Shared deleted speech.');assert.equal(await calls(a),before+1);
  await a.evaluate(()=>window.__CHOIR_API__.playParagraph({text:'Unscoped cached speech.'}));
  await a.evaluate(()=>{window.holdSpeechText='Still playing elsewhere';window.otherPlayback=window.__CHOIR_API__.playParagraph({text:'Still playing elsewhere.',messageId:'other'}).then(result=>result,e=>({error:e.name}));window.heardDelete=new Promise(resolve=>{const channel=new BroadcastChannel('choir-audio:'+window.fixtureStore.get('audio:namespace'));channel.onmessage=e=>{if(e.data.kind==='delete'){channel.close();resolve(true);}};});});
  await a.waitForFunction(()=>typeof window.releaseSpeech==='function');await b.locator('[data-et="messages"]').getByRole('button',{name:'Delete audio',exact:true}).click();await a.evaluate(()=>window.heardDelete);
  await a.evaluate(()=>{window.releaseSpeech();window.holdSpeechText='';});const otherPlayback=await a.evaluate(()=>window.otherPlayback);assert.equal(otherPlayback.error,undefined);assert.ok(otherPlayback.played>0,'deleting one reply in another tab must not stop a different reply');
  await withDrawerControl(a,'add',()=>a.getByRole('button',{name:'+ Add character',exact:true}).click());await until(async()=>(await sharedValue(a,'chat:fixture'))?.fixed?.length===4);
  await withDrawerControl(a,'fixed',()=>a.getByRole('button',{name:'Edit Mira',exact:true}).click());const mira=a.locator('.et-cast-row').filter({has:a.locator('strong').filter({hasText:/^Mira$/})});await mira.getByRole('button',{name:'Pronunciation & voice speed ›',exact:true}).click();await mira.getByLabel('Aliases (comma separated)',{exact:true}).fill('Captain');await mira.getByLabel('Say name as',{exact:true}).fill('Mee-rah');
  await until(async()=>{const actor=(await sharedValue(a,'chat:fixture'))?.fixed?.find(actor=>actor.speaker==='Mira');return actor?.aliases?.includes('Captain') && actor?.sayAs==='Mee-rah';});
  await withDrawerControl(b,'followNarration',()=>b.locator('[data-et="followNarration"]').check());await until(async()=>(await sharedValue(a,'chat:fixture'))?.followNarration===true);const mergedCast=(await sharedValue(a,'chat:fixture')).fixed;assert.equal(mergedCast.length,4);assert.deepEqual(mergedCast.find(actor=>actor.speaker==='Mira').aliases,['Captain']);assert.equal(mergedCast.find(actor=>actor.speaker==='Mira').sayAs,'Mee-rah');
  const c=await mount(context,true);const beforeLeave=await c.evaluate(()=>window.fixtureWrites?.filter(k=>k==='ui:mixer').length || 0);await c.evaluate(()=>dispatchEvent(new Event('pagehide')));
  await c.evaluate(()=>new Promise(r=>setTimeout(r,100)));assert.equal(await c.evaluate(()=>window.fixtureWrites?.filter(k=>k==='ui:mixer').length || 0),beforeLeave,'an untouched mixer does not save on pagehide');
  for(const p of [a,b])await withDrawerControl(p,'customizeMixer',()=>p.getByRole('button',{name:'Customize mixer',exact:true}).click());
  await a.getByRole('checkbox',{name:'Show Music',exact:true}).uncheck();await until(async()=>(await sharedValue(a,'ui:mixer'))?.layout?.music===false);
  await b.getByRole('checkbox',{name:'Show SFX',exact:true}).uncheck();await until(async()=>(await sharedValue(a,'ui:mixer'))?.layout?.sfx===false);assert.equal((await sharedValue(a,'ui:mixer')).layout.music,false);
  await c.evaluate(()=>dispatchEvent(new Event('pagehide')));await c.evaluate(()=>new Promise(r=>setTimeout(r,100)));assert.equal((await sharedValue(a,'ui:mixer')).layout.music,false);
  // Exercise overlapping writes, not just sequential stale saves.
  await Promise.all([a.getByRole('checkbox',{name:'Show Follow narration',exact:true}).check(),b.getByRole('checkbox',{name:'Show Message controls',exact:true}).check()]);
  await until(async()=>{const value=await sharedValue(a,'ui:mixer');return value?.layout?.follow && value?.layout?.['message-controls'];});
  console.log('PASS: cross-tab clear, cast merge, independent/overlapping mixer edits and stale pagehide preserve newer state.');await context.close();
 }
 for(const native of [false,true]){
  const context=await browser.newContext({viewport:{width:320,height:900},isMobile:true,hasTouch:true});
  if(!native)await context.addInitScript(()=>{delete HTMLElement.prototype.showPopover;delete HTMLElement.prototype.hidePopover;});
  const page=await mount(context);await page.evaluate(async()=>{await window.cleanup();window.fixtureStore.set('chat:fixture',{...window.fixtureStore.get('chat:fixture'),sectionButtons:true});window.cleanup=await window.mountChoir();});
  await withDrawerControl(page,'latest',()=>page.locator('[data-et="latest"]').click());await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  const summary=page.locator('[data-choir-message-controls] summary');await summary.click();const menu=page.locator('.choir-section-list');await menu.waitFor({state:'visible'});
  const hits=await menu.locator('button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {hit:node===hit || node.contains(hit),height:r.height};}));assert.ok(hits.length);assert.ok(hits.every(r=>r.hit && r.height>=44));
  const box=await menu.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=320 && box.y>=0 && box.y+box.height<=900,JSON.stringify(box));
  if(!native){assert.equal(await menu.evaluate(n=>n.parentElement===document.body),true);if(process.env.CHOIR_LAYOUT_SCREENSHOTS)await page.screenshot({path:path.join(process.env.CHOIR_LAYOUT_SCREENSHOTS,'choir-v40-sections-mobile.png')});}
  await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert.equal(await summary.evaluate(n=>n===document.activeElement),true);assert.equal(await summary.locator('..').evaluate(n=>n.open),false);
  await summary.click();await menu.waitFor({state:'visible'});await menu.locator('button').first().click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
  await page.keyboard.press('Escape');await summary.click();await menu.waitFor({state:'visible'});await page.evaluate(()=>window.cleanup());assert.equal(await page.locator('.choir-section-list[data-portal]').count(),0);
  console.log(`PASS: ${native?'native':'fallback'} Sections: 320px touch hit targets, bounds, real selection, Escape/focus and disposal.`);await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
