// Real Chrome check for the setup wizard, name respelling and reading controls.
// Providers are local fixtures; no API keys or paid provider requests are used.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.CHOIR_BROWSER_MODULES?path.join(process.env.CHOIR_BROWSER_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');

const html=String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Choir lunch-test preview</title>
<style>:root{color-scheme:dark;--lumiverse-bg:#141923;--lumiverse-bg-surface:#1d2432;--lumiverse-bg-elevated:#242d3e;--lumiverse-text:#e5e9f0;--lumiverse-text-muted:#adb8cb;--lumiverse-border:#465168;--lumiverse-primary:#c4b5fd;--lumiverse-fill:#283349;--lumiverse-fill-hover:#34415c}body{margin:0;background:var(--lumiverse-bg);color:var(--lumiverse-text);font:15px system-ui}main{max-width:820px;margin:24px auto;background:var(--lumiverse-bg-surface);border-radius:14px}article{max-width:780px;margin:24px auto;padding:0 20px}dialog{width:min(760px,calc(100vw - 32px));max-height:calc(100dvh - 40px);box-sizing:border-box;padding:20px;border:1px solid var(--lumiverse-border);border-radius:16px;color:var(--lumiverse-text);background:var(--lumiverse-bg-surface);overflow:auto}dialog::backdrop{background:#000a}.modal-close{float:right;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer}dialog>h1{font-size:16px;margin:0 0 22px}footer{display:flex;gap:8px}button{font:inherit}@media(max-width:560px){main{margin:12px}dialog{padding:14px}}</style></head>
<body><article><h1>Choir · lunch-test</h1><div data-message-id="reply"><div data-component="MessageContent"><p>Eliza opened the door.</p><aside class="tracker">Hidden tracker.</aside><p>“Hello, Eliza.”</p><p>The evening was quiet.</p></div></div><footer></footer></article><main></main>
<script type="module">
import {setup} from '/dist/frontend.js';
import {validatePlan,speechSourceUnits} from '/src/core.js';
const store=new Map(),events=new Map(),root=document.querySelector('main'),footer=document.querySelector('footer');let backend;
window.calls=[];window.plans=0;window.errors=[];
const message={id:'reply',name:'Eliza',content:'<p>Eliza opened the door.</p><aside class="tracker">Hidden tracker.</aside><p>"Hello, Eliza."</p><p>The evening was quiet.</p>'};
store.set('chat:fixture',{connection:'fish',plannerMode:'llm',skipMeta:false,enableSfx:false,enableAmbience:false,enableMixer:true,styleParam:'',prefetch:0,concurrency:1,chunk:500,normalizeLoudness:false,fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'You',voice:'p',style:''},{speaker:'Eliza',voice:'e',style:''}],casts:{'native:fish':[]}});
const voices=['n','p','e','g'].map((id,index)=>({id,name:['Storyteller','Player','Eliza voice','Supporting voice'][index]}));
function wav(){const count=12000,buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);function text(offset,value){for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));}text(0,'RIFF');view.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,12000,true);view.setUint32(28,24000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/12000)*1200,true);return buffer;}
window.fetch=async(url,options={})=>{
 if(url.endsWith('/tts/synthesize')){window.calls.push(JSON.parse(options.body));return new Response(wav(),{headers:{'Content-Type':'audio/wav'}});}
 if(url.endsWith('/spindle'))return Response.json({extensions:[{identifier:'choir',metadata:{branch:'lunch-test'}}]});
 if(url.includes('/providers'))return Response.json({providers:[{id:'fish_audio',displayName:'Fish Audio',capabilities:{parameters:{}}}]});
 if(url.endsWith('/voices'))return Response.json({voices});
 if(url.includes('/tts-connections?'))return Response.json({data:[{id:'fish',name:'Fish Audio · My connection',provider:'fish_audio',model:'s2.1-pro'}]});
 if(url.includes('/decision-connections?'))return Response.json({data:[]});
 if(url.includes('/connections?'))return Response.json({data:[{id:'planner',name:'Story planner',provider:'test',model:'text-model',is_default:true}]});
 return Response.json({});
};
const ctx={settings:{get:async key=>structuredClone(store.get(key)??null),set:async(key,value)=>store.set(key,structuredClone(value)),remove:async key=>store.delete(key)},messages:{getRecent:()=>[message],getContent:()=>message.content},state:{subscribe:()=>()=>{}},events:{on:(name,fn)=>{events.set(name,fn);return()=>events.delete(name);}},getActiveChat:()=>({chatId:'fixture',characterId:'eliza'}),characters:{get:async()=>({name:'Eliza'})},dom:{addStyle:css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);return()=>style.remove();},findMessageElement:()=>document.querySelector('[data-message-id="reply"]')},ui:{
 registerDrawerTab:()=>({root,activate(){},destroy(){root.replaceChildren();}}),registerInputBarAction:()=>({onClick(){},destroy(){}}),registerDomDecorator:options=>options.render(footer,{messageId:'reply'}),
 showModal:options=>{const dialog=document.createElement('dialog'),heading=document.createElement('h1'),content=document.createElement('section'),close=document.createElement('button');heading.textContent=options.title;close.textContent='×';close.className='modal-close';close.setAttribute('aria-label','Close setup');dialog.setAttribute('aria-label',options.title);dialog.append(close,heading,content);document.body.append(dialog);let onDismiss;const dismiss=()=>{dialog.close();dialog.remove();onDismiss?.();};close.onclick=dismiss;dialog.oncancel=event=>{event.preventDefault();dismiss();};dialog.showModal();return {root:content,onDismiss(fn){onDismiss=fn;return()=>onDismiss=null;},dismiss};}
},onBackendMessage:fn=>{backend=fn;return()=>backend=null;},sendToBackend:request=>{if(request.action==='cancel')return;setTimeout(()=>{let result;if(request.action==='ping')result={ready:true,decisionsAvailable:true};else if(request.action==='skipCheck')result={skip:[]};else if(request.action==='plan'){window.plans++;result=validatePlan({segments:speechSourceUnits(request.input.transcript).map(unit=>({speaker:unit.kind==='dialogue'?'Eliza':'Narrator',voice:unit.kind==='dialogue'?'e':'n',text:unit.text,style:''}))},request.input.transcript,request.input.config);}else if(request.action==='testPlanner')result={provider:'Fixture',model:'text-model',response:'READY'};backend?.({namespace:'choir',id:request.id,result});},5);}};
window.fixtureStore=store;window.fixtureMessage=message;window.cleanup=await setup(ctx);window.ready=true;
</script></body></html>`;
const server=createServer(async(request,response)=>{
  if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(html);return;}
  if(!/^\/(src|dist)\/[a-z]+\.js$/.test(request.url)){response.writeHead(404);response.end();return;}
  try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL(`..${request.url}`,import.meta.url)));}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const errors=[];
try{
  browser=await chromium.launch({headless:true,channel:process.env.CHOIR_BROWSER_CHANNEL || 'chrome',args:['--no-proxy-server']});
  const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
  const wizard=page.getByRole('dialog',{name:'Set up Choir',exact:true});await wizard.waitFor();
  await wizard.getByRole('button',{name:'Next',exact:true}).click();await wizard.getByText('How to connect Fish Audio',{exact:true}).click();
  assert.equal(await wizard.getByRole('link',{name:'Open API Keys',exact:true}).getAttribute('href'),'https://fish.audio/app/api-keys');
  assert.equal(await wizard.getByLabel('Speech mode',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.calls.length),0);
  if(process.env.CHOIR_SETUP_SCREENSHOT)await wizard.screenshot({path:process.env.CHOIR_SETUP_SCREENSHOT});
  await wizard.getByRole('button',{name:'Next',exact:true}).click();await wizard.getByLabel('Narrator voice gender',{exact:true}).selectOption('female');
  assert.match(await wizard.getByLabel('Narrator voice',{exact:true}).textContent(),/Gender unknown/);
  assert.equal(await wizard.getByLabel('Voices the planner picks from',{exact:true}).inputValue(),'community');
  await wizard.getByRole('button',{name:'Next',exact:true}).click();
  await wizard.getByText('Buffering and request limits',{exact:true}).click();
  await wizard.getByLabel('Prefetch passages',{exact:true}).fill('2');await wizard.getByLabel('Concurrent TTS requests',{exact:true}).fill('2');
  await wizard.getByLabel('Audio retention for new recordings',{exact:true}).selectOption('7');
  await wizard.getByText('Playback & saved audio',{exact:true}).scrollIntoViewIfNeeded();
  if(process.env.CHOIR_WIZARD_PLAYBACK_SCREENSHOT)await wizard.screenshot({path:process.env.CHOIR_WIZARD_PLAYBACK_SCREENSHOT});
  await wizard.getByLabel('Skip tags and blocks',{exact:true}).fill('.tracker');await wizard.getByLabel('Highlight spoken text',{exact:true}).selectOption('word');
  await wizard.getByRole('button',{name:'Next',exact:true}).click();await wizard.getByRole('button',{name:'Finish setup',exact:true}).click();
  await wizard.getByText('Setup completed successfully.',{exact:true}).waitFor();await wizard.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.fixtureStore.get('settings:global').ignoredTags),'.tracker');assert.equal(await page.evaluate(()=>window.calls.length),0);
  assert.equal(await page.evaluate(()=>window.fixtureStore.get('settings:global').prefetch),2);assert.equal(await page.evaluate(()=>window.fixtureStore.get('settings:global').concurrency),2);
  assert.equal(await page.evaluate(()=>window.fixtureStore.get('settings:global').retention),'7');assert.equal(await page.evaluate(()=>window.fixtureStore.get('settings:captured-defaults').leadVoices[0].gender),'female');
  await page.getByRole('button',{name:'Edit Eliza',exact:true}).click();const spelling=page.locator('[data-et="fixed"] [data-choir-say-as]').nth(2);await spelling.fill('Eh-Lee-Zah');
  await page.waitForFunction(()=>document.querySelector('[data-et="saveState"]').textContent==='Saved automatically');
  await page.getByRole('button',{name:'Test pronunciation of Eliza',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent==='Audition finished.');
  assert.match(await page.evaluate(()=>window.calls[0].text),/Eh-Lee-Zah opened the door/);
  if(process.env.CHOIR_PRONUNCIATION_SCREENSHOT)await page.locator('main').screenshot({path:process.env.CHOIR_PRONUNCIATION_SCREENSHOT});
  await page.getByText('Skip tags and blocks',{exact:true}).click();await page.getByRole('button',{name:'Preview text to read',exact:true}).click();
  assert.doesNotMatch(await page.locator('[data-et="readingPreview"]').textContent(),/Hidden tracker/);
  const original=await page.locator('[data-component="MessageContent"]').innerHTML();
  await page.locator('[data-et="latest"]').click();await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.startsWith('Ready:'));
  await page.evaluate(()=>{window.highlightLog=[];const tick=()=>{const text=[...(CSS.highlights.get('choir-speaking') || [])].map(String).join('|');if(text!==window.highlightLog.at(-1))window.highlightLog.push(text);window.highlightFrame=requestAnimationFrame(tick);};tick();});
  await page.getByRole('button',{name:'Open Choir voice mixer',exact:true}).click();await page.locator('[data-choir-action="playback"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-et="status"]').textContent.includes('Playback finished'));
  const spoken=await page.evaluate(()=>window.calls.slice(1));assert.equal(spoken.length,3);assert.ok(spoken.filter(input=>input.text.includes('Eh-Lee-Zah')).length===2);assert.ok(spoken.every(input=>!input.text.includes('Eliza')));
  assert.equal(await page.locator('[data-component="MessageContent"]').innerHTML(),original);assert.ok((await page.evaluate(()=>window.highlightLog)).includes('Eliza'));
  await page.evaluate(()=>cancelAnimationFrame(window.highlightFrame));await page.evaluate(()=>window.cleanup());await page.close();
  const mobile=await browser.newPage({viewport:{width:320,height:700},isMobile:true,hasTouch:true});mobile.on('pageerror',error=>errors.push(error.message));await mobile.goto(`http://127.0.0.1:${server.address().port}`);await mobile.waitForFunction(()=>window.ready);
  const compact=mobile.getByRole('dialog',{name:'Set up Choir',exact:true});await compact.getByRole('button',{name:'Next',exact:true}).click();await compact.getByText('How to connect Fish Audio',{exact:true}).click();
  assert.equal(await compact.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  const actions=await compact.locator('.cs-actions button').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,height:rect.height};}));assert.ok(actions.every(rect=>rect.left>=0 && rect.right<=320 && rect.height<=50),JSON.stringify(actions));
  if(process.env.CHOIR_SETUP_MOBILE_SCREENSHOT)await compact.screenshot({path:process.env.CHOIR_SETUP_MOBILE_SCREENSHOT});
  await compact.getByRole('button',{name:'Next',exact:true}).click();await compact.getByRole('button',{name:'Next',exact:true}).click();
  await compact.getByText('Buffering and request limits',{exact:true}).click();await compact.getByText('Drawer and message controls',{exact:true}).click();
  await compact.getByLabel('Prefetch passages',{exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await compact.evaluate(node=>node.scrollWidth<=node.clientWidth+1 && [...node.querySelectorAll('input,select,textarea')].every(field=>field.getBoundingClientRect().right<=320)),true);
  const footer=await compact.locator('.cs-actions').boundingBox();assert.ok(footer.y>=0 && footer.y+footer.height<=700,JSON.stringify(footer));
  if(process.env.CHOIR_WIZARD_MOBILE_SCREENSHOT)await compact.screenshot({path:process.env.CHOIR_WIZARD_MOBILE_SCREENSHOT});
  await mobile.keyboard.press('Escape');await mobile.waitForFunction(()=>window.fixtureStore.get('onboarding:state')?.deferred);await mobile.locator('[data-et="setupWizard"]').click();await compact.waitFor();await compact.getByRole('button',{name:'Skip for now',exact:true}).click();
  await mobile.evaluate(()=>window.cleanup());await mobile.close();assert.deepEqual(errors,[]);
  console.log('PASS: Chrome setup, Fish guide, voice gender, saved buffering/retention settings, reading settings, actual-name audition, respelled narration/dialogue, original text highlights, and expanded 320px modal layout. No external provider requests.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
