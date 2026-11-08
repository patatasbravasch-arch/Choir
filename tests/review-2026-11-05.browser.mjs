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

test('audit: paragraph playback keeps only the sound cues whose words are in that paragraph',async()=>{
  const h=await harness();
  try{
    Object.assign(h.store.get('chat:chat-a'),{skipMeta:false,enableSfx:true,enableAmbience:false,enableMusic:false,normalizeLoudness:false,freesoundApiKey:'k'});
    h.message.content='The hall was quiet.\n\nThen the door slammed behind them.';await h.reload();await h.plan();
    const json=JSON.parse(h.$('planJson').value),text=h.message.content;
    h.$('planJson').value=JSON.stringify({segments:[{speaker:'Narrator',voice:json.segments[0].voice,text,sfx:[{query:'door slam',trigger:'the door slammed'}]}]});
    h.$('apply').click();await until(()=>/Edited plan validated/.test(h.$('status').textContent));
    const bridge=globalThis.__CHOIR_API__,sounds=paragraph=>bridge.planParagraph(paragraph,{messageId:h.message.id}).segments.filter(segment=>segment.kind==='sfx').length;
    assert.equal(sounds('The hall was quiet.'),0,'the door slam belongs to the next paragraph');
    assert.equal(sounds('Then the door slammed behind them.'),1);
  }finally{await h.close();}
});

test('audit: the session-only Jev key survives a chat switch, and getConfig never exposes keys',async()=>{
  const h=await harness();
  try{
    h.$('jevKey').value='session-key';
    h.state.active='chat-b';await h.subscriptions.get('chat.active')();h.state.active='chat-a';await h.subscriptions.get('chat.active')();
    assert.equal(h.$('jevKey').value,'session-key');
    h.$('freesoundApiKey').value='fs-key';h.$('freesoundApiKey').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    await until(()=>h.store.get('settings:global')?.freesoundApiKey==='fs-key');
    const shared=globalThis.__CHOIR_API__.getConfig();
    assert.equal(shared.freesoundApiKey,undefined);assert.equal(shared.jevApiKey,undefined);assert.ok(Array.isArray(shared.fixed));
  }finally{await h.close();}
});

test('audit: plan-inside-the-reply lists known NPCs, not only the leads',async()=>{
  const h=await harness();
  try{
    h.$('injectPlan').value='auto';h.$('injectPlan').dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    await until(()=>h.injectContexts.some(request=>request.input.delivery==='auto'));
    assert.ok(h.injectContexts.at(-1).input.cast.includes('Guard'),JSON.stringify(h.injectContexts.at(-1).input.cast));
  }finally{await h.close();}
});

test('audit: Cue reuses the opening clips full-message playback already paid for',async()=>{
  const h=await harness();
  try{
    Object.assign(h.store.get('chat:chat-a'),{skipMeta:false,enableSfx:false,enableAmbience:false,enableMusic:false,normalizeLoudness:false,batchSpeech:false,chunk:1800});
    const long=`The rain had not stopped for three days, and ${'the gutters along the narrow street overflowed while lanterns swung in the wind, '.repeat(4)}until the watch bell rang.`;
    const paragraph=`${long} She waited at the door.`;
    h.message.content=`${paragraph}\n\nThe second paragraph is short.`;await h.reload();await h.plan();await h.play();
    const paid=h.synthesis.length;assert.ok(paid>=2,'the long opening is cut into startup clips');
    await globalThis.__CHOIR_API__.playParagraph({text:paragraph,messageId:h.message.id,paragraphIndex:0});
    assert.equal(h.synthesis.length,paid,'the same opening clips are reused, nothing is paid twice');
  }finally{await h.close();}
});

test('audit: Apply default sets the three leads and leaves further characters\x27 own voices',async()=>{
  const h=await harness();
  try{
    const chat=h.store.get('chat:chat-a');
    chat.fixed=[...chat.fixed.slice(0,3),{speaker:'Extra',voice:chat.fixed[2].voice,style:'extra style'}];
    h.store.set('settings:captured-defaults',{version:2,leadVoices:chat.fixed.slice(0,3).map(actor=>({voice:actor.voice,route:actor.route || '',style:'DEFAULT'}))});
    await h.reload();
    h.$('applyDefaults').click();await until(()=>h.$('defaultStatus').textContent.startsWith('Default applied'));
    const applied=h.store.get('chat:chat-a').fixed;
    assert.equal(applied[2].style,'DEFAULT');
    assert.equal(applied[3].speaker,'Extra');assert.equal(applied[3].style,'extra style','a fourth character keeps its own setup');
  }finally{await h.close();}
});

test('audit: a settings edit with no chat open says it was not saved',async()=>{
  const h=await harness();
  try{
    h.state.active=null;await h.subscriptions.get('chat.active')();
    h.$('prefetch').value='3';h.$('prefetch').dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    assert.match(h.$('saveState').textContent,/Open a chat to save settings/);
  }finally{await h.close();}
});
