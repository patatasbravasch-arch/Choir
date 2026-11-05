import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

// Reuse the actual frontend fixture without registering its unrelated tests.
const url=new URL('./reliability.browser.mjs',import.meta.url),source=readFileSync(url,'utf8'),require=createRequire(url);
const start=source.indexOf('const tick='),end=source.indexOf('\nasync function elizaFixture',start);
const header=source.slice(0,Math.min(start,source.indexOf('\ntest('))).replace(/from '([^']+)'/g,(_,specifier)=>`from '${specifier.startsWith('.')?new URL(specifier,url).href:specifier.startsWith('node:')?specifier:pathToFileURL(require.resolve(specifier)).href}'`);
const fixture=(header+source.slice(start,end)+'\nexport {harness,until,tick};').replaceAll('import.meta.url',JSON.stringify(url.href));
const {harness,until,tick}=await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));

test('a speaker correction persists in its own chat while navigating during the settings save',async()=>{
  const h=await harness();let release;
  try{
    Object.assign(h.store.get('chat:chat-a'),{skipMeta:false,enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false});
    await h.reload();await h.plan();
    const set=h.ctx.settings.set;let held=false;
    h.ctx.settings.set=async(key,value)=>{
      if(key==='chat:chat-a' && !held){held=true;await new Promise(resolve=>release=resolve);}
      return set(key,value);
    };
    const select=h.$('preview').querySelector('select[aria-label="Speaker of block 2"]');
    select.value='Guard';select.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>release);
    h.state.active='chat-b';const navigation=h.subscriptions.get('chat.active')();await tick();
    release();release=null;await navigation;
    const saved=[...h.store].find(([key,value])=>key.startsWith('plan:') && value.chatId==='chat-a')?.[1];
    assert.equal(saved?.attribution.segments[1].speaker,'Guard','the save uses its captured plan after the active chat changes');
    h.state.active='chat-a';await h.subscriptions.get('chat.active')();
    assert.equal(JSON.parse(h.$('planJson').value).segments[1].speaker,'Guard');
  }finally{release?.();await h.close();}
});

test('speaker choices stay locked until a correction saves and unlock after a failed save',async()=>{
  const h=await harness();let release;
  try{
    Object.assign(h.store.get('chat:chat-a'),{skipMeta:false,enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false});
    await h.reload();await h.plan();
    const set=h.ctx.settings.set;let held=false;
    h.ctx.settings.set=async(key,value)=>{
      if(key.startsWith('plan:') && !held){held=true;await new Promise(resolve=>release=resolve);}
      return set(key,value);
    };
    const select=h.$('preview').querySelector('select[aria-label="Speaker of block 2"]');
    select.value='Guard';select.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>release);
    assert.ok([...h.$('preview').querySelectorAll('.et-plan-speaker')].every(select=>select.disabled));
    release();release=null;await until(()=>h.$('status').textContent.startsWith('Block 2 is now read by Guard'));
    assert.ok([...h.$('preview').querySelectorAll('.et-plan-speaker')].every(select=>!select.disabled));
    h.state.failPlanSave=true;
    const next=h.$('preview').querySelector('select[aria-label="Speaker of block 2"]');next.value='Narrator';next.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>/storage failed/i.test(h.$('status').textContent));
    assert.equal(h.$('preview').querySelector('select[aria-label="Speaker of block 2"]').value,'Guard');
    assert.ok([...h.$('preview').querySelectorAll('.et-plan-speaker')].every(select=>!select.disabled));
  }finally{release?.();h.state.failPlanSave=false;await h.close();}
});

test('a failed injection sync retries on the next ordinary settings save',async()=>{
  const h=await harness();
  try{
    const send=h.ctx.sendToBackend;let attempts=0;
    h.ctx.sendToBackend=request=>{
      if(request.action==='injectContext' && request.input.delivery==='auto' && ++attempts===1)throw Error('Backend restarting');
      return send(request);
    };
    h.$('injectPlan').value='auto';h.$('injectPlan').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>attempts===1);await until(()=>h.$('saveState').textContent==='Saved automatically');
    h.$('prefetch').value='2';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    await until(()=>h.store.get('chat:chat-a').prefetch===2);
    assert.equal(attempts,2);assert.equal(h.injectContexts.at(-1).input.delivery,'auto');
  }finally{await h.close();}
});

test('clearing or switching chats clears planner logs from every inspector view',async()=>{
  const h=await harness();
  try{
    h.$('paranoidMode').checked=true;h.$('paranoidMode').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    for(const view of ['prepared','sent']){
      h.$('ttsInspectorView').value=view;
      h.emitBackend({namespace:'choir',call:{at:Date.now(),kind:'LLM',purpose:'Private Chat A',ms:5}});
      h.$('clearTtsLog').click();
      h.$('ttsInspectorView').value='calls';h.$('ttsInspectorView').dispatchEvent(new h.dom.window.Event('change'));
      assert.equal(h.$('ttsInspectorView').options[2].textContent,'All calls (0)');
    }
    h.$('ttsInspectorView').value='prepared';
    h.emitBackend({namespace:'choir',call:{at:Date.now(),kind:'LLM',purpose:'Private Chat A',ms:5}});
    h.state.active='chat-b';await h.subscriptions.get('chat.active')();
    h.$('ttsInspectorView').value='calls';h.$('ttsInspectorView').dispatchEvent(new h.dom.window.Event('change'));
    assert.doesNotMatch(h.$('ttsRequests').textContent,/Private Chat A/);assert.equal(h.$('ttsInspectorView').options[2].textContent,'All calls (0)');
  }finally{await h.close();}
});
