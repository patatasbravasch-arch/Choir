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

test('the Acting dial is saved per chat and scales the directions sent on the next Play',async()=>{
  const h=await harness();
  try{
    Object.assign(h.store.get('chat:chat-a'),{skipMeta:false,enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false});
    await h.reload();await h.plan();await h.play();
    const directed=()=>h.synthesis.flatMap(input=>input.parameters.turns || [input]).map(input=>input.parameters?.instructions ?? input.parameters?.speech_style ?? input.style).filter(Boolean);
    const natural=directed();assert.ok(natural.length,'the fixture plans at least one directed line');
    assert.ok(natural.every(style=>!/understated/.test(style)));
    h.$('actingIntensity').value='-1';h.$('actingIntensity').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>h.store.get('chat:chat-a').actingIntensity===-1);
    const before=h.synthesis.length;await h.play();
    assert.ok(h.synthesis.length>before,'a new level makes fresh audio');
    assert.ok(h.synthesis.slice(before).some(input=>/understated, restrained/.test(JSON.stringify(input.parameters))));
  }finally{await h.close();}
});
