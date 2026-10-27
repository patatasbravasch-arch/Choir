import {showDrawerControl,withDrawerControl} from './fixtures/drawer.mjs';
// Synthetic Lumiverse swipe bars and local audio; no external provider requests.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {playbackFixture} from './fixtures/playback.mjs';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),errors=[];
function fixture(variant){
 const markup=`<div data-component="SwipeControls"><button aria-label="Previous swipe">‹</button><span>1 / 2</span><button aria-label="Next swipe">›</button></div><span data-spindle-mount="message_footer" style="display:contents"><footer></footer></span>`;
 let html=playbackFixture.replace('<footer></footer>','').replace('</div></div><nav',`</div>${markup}</div><nav`)
  .replace('registerDomDecorator:options=>options.render(footer,{messageId:\'reply\'})',"registerDomDecorator:options=>{window.fixtureDecorator=options;return options.render(footer,{messageId:'reply',node:footer.parentElement});}");
 assert.ok(html.includes('window.fixtureDecorator=options'));
 return html.replace('</style>',`@media(max-width:800px){article{display:block!important}}article{min-width:0}[data-message-id]{display:flex;flex-direction:column;padding:12px;border:1px solid #ffffff30;border-radius:16px;overflow:hidden;contain:layout style paint}[data-component="SwipeControls"]{display:flex;align-items:center;gap:4px;align-self:${variant==='bubble'?'flex-end':'flex-start'};margin-top:12px;max-width:100%}[data-component="SwipeControls"]>button{width:28px;height:28px;flex-shrink:0;border:0;border-radius:6px;color:inherit;background:#ffffff12}[data-component="SwipeControls"]>span{font:12px system-ui;white-space:nowrap;min-width:32px;text-align:center}footer:empty{display:none}</style>`);
}
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/?')){res.setHeader('Content-Type','text/html');res.end(fixture(req.url.includes('minimal')?'minimal':'bubble'));return;}
 if(!/^\/(src|dist)\/[a-z]+\.js$/.test(req.url)){res.writeHead(404);res.end();return;}
 try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('..'+req.url,import.meta.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--no-proxy-server','--autoplay-policy=no-user-gesture-required']});
 for(const variant of ['bubble','minimal'])for(const mobile of [false,true]){
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:mobile?320:1440,height:900},isMobile:mobile,hasTouch:mobile});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?${variant}`);await page.waitForFunction(()=>window.ready);
  const actions=page.locator('[data-choir-message-controls]'),download=actions.locator('[data-choir-download]'),play=actions.getByRole('button',{name:'Play or stop Choir audio for this message',exact:true});
  assert.equal(await actions.isVisible(),false);assert.equal(await download.isVisible(),false);
  await withDrawerControl(page,'customizeMixer',()=>page.getByRole('button',{name:'Customize mixer',exact:true}).click());await page.getByRole('checkbox',{name:'Show Message controls',exact:true}).check();
  await page.getByRole('checkbox',{name:'Show Follow narration',exact:true}).check();await withDrawerControl(page,'closeMixerLayout',()=>page.locator('[data-et="closeMixerLayout"]').click());await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();
  const quick=page.getByRole('button',{name:'Show message play controls',exact:true});await quick.click();
  await page.waitForFunction(()=>window.fixtureStore.get('chat:fixture')?.sectionButtons===true);assert.equal(await quick.getAttribute('aria-pressed'),'true');
  assert.equal(await play.isVisible(),true);assert.equal(await download.isVisible(),false);assert.equal(await page.evaluate(()=>window.calls.length+window.plans),0);
  const switches=await page.locator('.cm-auto-plan button:visible').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};}));assert.equal(switches.length,7);
  assert.ok(switches.every((r,i)=>!i || r.left>=switches[i-1].right-1 || r.top>switches[i-1].top));if(mobile)assert.ok(switches.every(r=>r.width>=44 && r.height>=44));
  await page.getByRole('button',{name:'Collapse Choir voice mixer',exact:true}).click();await play.click();
  await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));await download.waitFor({state:'visible'});
  assert.equal(await download.innerText(),'');assert.equal(await download.locator('svg').count(),1);
  const bounds=await page.locator('[data-component="SwipeControls"]').evaluate(node=>{const row=node.getBoundingClientRect();return {left:row.left,right:row.right,width:innerWidth,children:[...node.querySelectorAll(':scope > button,[data-choir-message-controls] > button:not([hidden])')].map(n=>{const r=n.getBoundingClientRect();return {center:r.top+r.height/2,width:r.width,height:r.height};})};});
  assert.ok(bounds.left>=0 && bounds.right<=bounds.width+1,JSON.stringify(bounds));assert.equal(bounds.children.length,4);assert.ok(bounds.children.every(r=>Math.abs(r.center-bounds.children[0].center)<2),JSON.stringify(bounds));if(mobile)assert.ok(bounds.children.slice(2).every(r=>r.width>=44 && r.height>=44));
  const calls=await page.evaluate(()=>({speech:window.calls.length,plans:window.plans}));
  const pending=page.waitForEvent('download');await download.click();const wavDownload=await pending;const wav=await readFile(await wavDownload.path());assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wavDownload.suggestedFilename(),'Choir - M - fixture - 001.wav');
  await actions.locator('summary').click();const popup=await actions.locator('details>div').boundingBox();assert.ok(popup.x>=0 && popup.x+popup.width<=(mobile?320:1440)+1,JSON.stringify(popup));assert.equal(await actions.locator('details>div').evaluate(n=>n.matches(':popover-open') && n.contains(document.elementFromPoint(n.getBoundingClientRect().x+5,n.getBoundingClientRect().y+5))),true,'Sections escape paint containment and remain clickable.');await actions.locator('summary').click();
  if(process.env.CHOIR_LAYOUT_SCREENSHOTS)await page.locator('article').screenshot({path:path.join(process.env.CHOIR_LAYOUT_SCREENSHOTS,`choir-message-${variant}-${mobile?'mobile':'desktop'}.png`)});
  await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();await quick.click();assert.equal(await play.isVisible(),false);assert.equal(await download.isVisible(),true);await quick.click();await page.getByRole('button',{name:'Collapse Choir voice mixer',exact:true}).click();
  await page.evaluate(async()=>{window.cleanup();window.cleanup=await window.mountChoir();});assert.equal(await play.isVisible(),true);await download.waitFor({state:'visible'});
  await page.evaluate(()=>{window.originalSwipe=window.fixtureMessage.content;document.querySelector('[aria-label="Next swipe"]').onclick=()=>{window.fixtureMessage.content='A different swipe.';window.fixtureEvents.get('MESSAGE_SWIPED')({chatId:'fixture',messageId:'reply'});};document.querySelector('[aria-label="Previous swipe"]').onclick=()=>{window.fixtureMessage.content=window.originalSwipe;window.fixtureEvents.get('MESSAGE_SWIPED')({chatId:'fixture',messageId:'reply'});};});
  await page.getByRole('button',{name:'Next swipe',exact:true}).click();assert.equal(await download.isVisible(),false);await page.getByRole('button',{name:'Previous swipe',exact:true}).click();await download.waitFor({state:'visible'});
  await page.evaluate(()=>{const old=document.querySelector('[data-component="SwipeControls"]'),next=old.cloneNode(false);for(const child of [...old.children])if(!child.hasAttribute('data-choir-message-controls'))next.append(child);old.replaceWith(next);window.fixtureDecorator.update(document.querySelector('footer'));});assert.equal(await actions.count(),1);assert.equal(await actions.evaluate(n=>n.parentElement.dataset.component),'SwipeControls');
  await play.click();await page.waitForFunction(()=>document.querySelector('[data-choir-download]').disabled);await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));await download.waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>({speech:window.calls.length,plans:window.plans})),calls,'Layout, swipe checks and cached replay must not make provider requests.');
  if(variant==='bubble' && !mobile){
   await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('choir-recordings',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('recordings','readwrite'),cursor=tx.objectStore('recordings').openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item){item.update({...item.value,expiresAt:Date.now()-1});item.continue();}};tx.oncomplete=()=>{db.close();document.dispatchEvent(new Event('visibilitychange'));resolve();};};}));await download.waitFor({state:'hidden'});
  }else{
   await showDrawerControl(page,'messages');await page.getByRole('button',{name:'Delete audio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Saved audio deleted'));await download.waitFor({state:'hidden'});
  }
  await page.evaluate(()=>window.cleanup());await page.close();console.log(`PASS: ${variant}, ${mobile?'320px touch':'desktop'}: optional Messages switch, swipe-row icons, bounded sections, complete-only download, reload, swipe replacement, cached replay and retention/deletion.`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
