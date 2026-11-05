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
