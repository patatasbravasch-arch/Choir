import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {setup} from '../dist/frontend.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const until=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await tick();}throw Error('Setup connections did not reach the expected state');};

// Exercise the generated frontend and its real catalogue cache, not an adapter
// stub. Provider requests are deterministic and never leave this fixture.
async function connectionHarness({disabledNarrator=false}={}){
  const dom=new JSDOM('<body><main></main></body>',{url:'http://lumiverse.test'}),store=new Map();
  const original={document:globalThis.document,fetch:globalThis.fetch,Audio:globalThis.Audio,indexedDB:globalThis.indexedDB};
  Object.assign(globalThis,{document:dom.window.document,indexedDB:new IDBFactory()});
  const tts=[{id:'tts',name:'Speech',provider:'openai_tts',model:'first-model'},{id:'other',name:'Other speech',provider:'openai_tts',model:'other-model'}];
  const catalogues=new Map([['tts',['old-voice']],['other',['old-other']]]),holds=new Map();let backend;
  if(disabledNarrator){
    store.set('settings:global',{connection:'tts',plannerMode:'heuristic',enableSfx:false,enableAmbience:false,enableMusic:false});
    store.set('settings:captured-defaults',{version:2,npcPolicy:{mode:'skip',voices:[]},leadVoices:[
      {voice:'removed-voice',route:'native:deleted',excluded:true},{voice:'old-voice',route:'native:tts'},{voice:'old-voice',route:'native:tts'}
    ]});
  }
  globalThis.Audio=class {play(){return Promise.resolve();}pause(){}};
  globalThis.fetch=async url=>{
    const route=String(url).match(/\/tts-connections\/([^/]+)\/voices$/)?.[1];
    if(route){
      const voices=catalogues.get(route).map(id=>({id,name:id})),hold=holds.get(route);
      if(hold){holds.delete(route);return new Promise(resolve=>{hold.release=()=>resolve(Response.json({voices}));});}
      return Response.json({voices});
    }
    if(url.includes('/providers'))return Response.json({providers:[{id:'openai_tts',capabilities:{parameters:{}}}]});
    if(url.includes('/tts-connections?'))return Response.json({data:tts});
    if(url.includes('/decision-connections?'))return Response.json({data:[]});
    if(url.includes('/connections?'))return Response.json({data:[{id:'llm',name:'Planner',model:'text-model',is_default:true}]});
    return Response.json({extensions:[]});
  };
  const ctx={settings:{get:async key=>store.get(key),set:async(key,value)=>store.set(key,structuredClone(value)),remove:async key=>store.delete(key)},
    getActiveChat:()=>({chatId:null}),messages:{getRecent:()=>[],getContent:()=>''},state:{subscribe:()=>()=>{}},
    dom:{addStyle:()=>()=>{}},ui:{registerDrawerTab:()=>({root:document.querySelector('main'),destroy(){},activate(){}}),registerInputBarAction:()=>({onClick(){},destroy(){}}),
      showModal:options=>{const root=document.createElement('section');root.setAttribute('role','dialog');root.setAttribute('aria-label',options.title);document.body.append(root);let dismissed;return {root,onDismiss(fn){dismissed=fn;return()=>dismissed=null;},dismiss(){root.remove();dismissed?.();}};}},
    events:{on:()=>()=>{}},onBackendMessage:fn=>{backend=fn;return()=>backend=null;},
    sendToBackend:request=>{if(request.action!=='cancel')setTimeout(()=>backend?.({namespace:'choir',id:request.id,result:{ready:true,decisionsAvailable:true}}),1);}
  };
  const cleanup=await setup(ctx),root=()=>document.querySelector('[data-choir-setup]');
  const click=text=>{const node=[...root().querySelectorAll('button')].find(button=>button.textContent===text);assert.ok(node,`Missing ${text}`);assert.equal(node.disabled,false,`Disabled ${text}`);node.click();};
  const select=(label,value)=>{const node=root().querySelector(`[aria-label="${label}"]`);node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const options=()=>[...root().querySelector('[aria-label="Narrator voice"]').options].map(option=>option.value);
  return {store,root,click,select,options,change(id,model,ids){tts.find(connection=>connection.id===id).model=model;catalogues.set(id,ids);},holdNext(id){const value={};holds.set(id,value);return value;},cleanup(){cleanup();dom.window.close();Object.assign(globalThis,original);}};
}

test('setup refresh reloads an edited connection catalogue even when its ID is unchanged',async()=>{
  const h=await connectionHarness();try{
    await until(()=>h.root());h.click('Next');h.click('Next');await until(()=>h.options().includes('old-voice'));
    h.click('Back');h.change('tts','replacement-model',['new-voice']);h.click('Refresh connections');await until(()=>h.root().textContent.includes('Connections refreshed'));
    h.click('Next');await until(()=>h.options().includes('new-voice'));assert.ok(!h.options().includes('old-voice'));
  }finally{h.cleanup();}
});

test('a late catalogue response cannot replace voices loaded after setup refresh',async()=>{
  const h=await connectionHarness();let held;try{
    await until(()=>h.root());h.click('Next');h.click('Next');await until(()=>h.options().includes('old-voice'));
    held=h.holdNext('other');h.select('Narrator connection','native:other');await until(()=>held.release);
    h.click('Back');h.change('other','replacement-model',['new-other']);h.click('Refresh connections');await until(()=>h.root().textContent.includes('Connections refreshed'));
    h.click('Next');await until(()=>h.options().includes('new-other'));held.release();await tick();
    h.click('Back');h.click('Next');await until(()=>h.options().includes('new-other'));assert.ok(!h.options().includes('old-other'));
  }finally{held?.release?.();h.cleanup();}
});

test('setup saves a disabled narrator without requiring its deleted speech connection',async()=>{
  const h=await connectionHarness({disabledNarrator:true});try{
    await until(()=>h.root());h.click('Next');h.click('Next');await until(()=>h.options().length>1);
    h.click('Next');h.click('Next');h.click('Finish setup');
    await until(()=>h.root().textContent.includes('Setup completed successfully') || h.root().textContent.includes('Select an available TTS connection'));
    assert.match(h.root().textContent,/Setup completed successfully/);
    const narrator=h.store.get('settings:captured-defaults').leadVoices[0];
    assert.equal(narrator.excluded,true);assert.equal(narrator.route,'native:deleted');assert.equal(narrator.voice,'removed-voice');
  }finally{h.cleanup();}
});
