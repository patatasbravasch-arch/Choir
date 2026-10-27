import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {validatePlan,speechSourceUnits} from '../src/core.js';
import {setup} from '../dist/frontend.js';
const require=process.env.CHOIR_TEST_MODULES?createRequire(path.join(process.env.CHOIR_TEST_MODULES,'package.json')):createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,15));
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await tick();}throw new Error('UI did not reach the expected state.');};

test('frontend plans, persists NPCs, plays sequentially, stops, switches chat and disposes',async()=>{
  const dom=new JSDOM('<body><main></main></body>',{url:'https://lumiverse.test'});
  const old={document:globalThis.document,Audio:globalThis.Audio,fetch:globalThis.fetch,indexedDB:globalThis.indexedDB};
  globalThis.indexedDB=new (require('fake-indexeddb').IDBFactory)();
  globalThis.document=dom.window.document;
  let onBackend,active='chat-a';const listeners=new Map(),events=new Map(),store=new Map(),requests=[],audios=[];
  const message={id:'message-a',chat_id:'chat-a',name:'Mira',is_user:false,content:'The hall fell silent. Hello, stranger. Welcome.',extra:{}};
  const nativeRequests=[];
  store.set('settings:global', { connectionMode: 'one' });
  let blockAudio=false;
  class FakeAudio {
    constructor(url){this.url=url;this.paused=true;audios.push(this);}
    play(){this.paused=false;if(!blockAudio)setTimeout(()=>this.onended?.(),2);return Promise.resolve();}
    pause(){this.paused=true;}
  }
  globalThis.Audio=FakeAudio;
  let activeTTS=0,peakTTS=0;
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/tts/synthesize')){nativeRequests.push(JSON.parse(options.body));activeTTS++;peakTTS=Math.max(peakTTS,activeTTS);await new Promise(resolve=>setTimeout(resolve,20));activeTTS--;return new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'audio/mpeg'}});}
    let value;
    if(url.includes('/providers'))value={providers:[{id:'openai_tts',capabilities:{parameters:{instructions:{type:'string'}}}}]};
    else if(url.includes('/google-a/voices'))value={voices:[]};
    else if(url.endsWith('/voices'))value={voices:['alloy','coral','onyx','echo'].map((id,index)=>({id,name:id,gender:['female','feminine','masculine','NEUTRAL'][index]}))};
    else if(url.includes('/connections?'))value={data:[{id:'planner-a',name:'GPT planner',provider:'openai',model:'gpt-text-test'}]};
    else value={data:[{id:'google-a',name:'Google',provider:'google_tts',model:'gemini-3.8-flash-tts'},{id:'native-a',name:'OpenAI',provider:'openai_tts',model:'gpt-4o-mini-tts'}]};
    return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  };
  const root=dom.window.document.querySelector('main');
  const settingsRoot=dom.window.document.createElement('section');
  const settingsMount=dom.window.document.createElement('section');
  const placementListeners=new Map();
  const messageActions=dom.window.document.createElement('div');
  const minimalFooter=dom.window.document.createElement('div');
  const ctx={
    registerDomDecorator:options=>{
      assert.equal(options.mount,'message_footer');
      const bubbleCleanup=options.render(messageActions,{scope:'message:message-a:bubble:footer'});
      const minimalCleanup=options.render(minimalFooter,{scope:'message:message-a:minimal:footer'});
      return ()=>{bubbleCleanup();minimalCleanup();};
    },
    settings:{get:async key=>{assert.match(key,/^[a-z][a-z0-9_]*:[A-Za-z0-9._-]+$/);return store.get(key);},set:async(key,value)=>{assert.match(key,/^[a-z][a-z0-9_]*:[A-Za-z0-9._-]+$/);store.set(key,structuredClone(value));}},
    messages:{getRecent:()=>active==='chat-a'?[message]:[],getContent:id=>id===message.id?message.content:null},
    state:{subscribe:(key,fn)=>{listeners.set(key,fn);return()=>listeners.delete(key);}},
    connections:{list:()=>[]},characters:{get:async()=>({name:'Mira'})},getActiveChat:()=>({chatId:active,characterId:'character-a'}),
    dom:{addStyle:()=>()=>{}},
    ui:{
      registerDrawerTab:()=>({root,activate(){placementListeners.get('drawer')?.();},destroy(){root.replaceChildren();},onActivate(fn){placementListeners.set('drawer',fn);return()=>placementListeners.delete('drawer');}}),
      registerSettingsTab:options=>{assert.equal(options.id,'choir');return {root:settingsRoot,activate(){placementListeners.get('settings')?.();},destroy(){settingsRoot.replaceChildren();},onActivate(fn){placementListeners.set('settings',fn);return()=>placementListeners.delete('settings');}};},
      mount:name=>{assert.equal(name,'settings_extensions');return settingsMount;},
      registerInputBarAction:()=>({onClick(){},destroy(){}})
    },
    events:{on:(key,fn)=>{events.set(key,fn);return()=>events.delete(key);}},
    onBackendMessage:fn=>{onBackend=fn;return()=>onBackend=null;},
    sendToBackend:message=>{
      requests.push(message);if(message.action==='cancel')return;
      setTimeout(()=>{
        let result;
        if(message.action==='ping')result={version:'1.0.18',ready:true};
        else if(message.action==='testPlanner')result={model:'gpt-text-test',provider:'openai',response:'READY'};
        else if(message.action==='skipCheck')result={skip:[]};
        else if(message.action==='plan' && (message.input.transcript.trim().startsWith('Long narration') || message.input.transcript.trim().startsWith('"Welcome."')))result=validatePlan({segments:speechSourceUnits(message.input.transcript).map(unit=>({
          speaker:unit.kind==='dialogue'?'Traveler':'Narrator',text:unit.text,
          voice:message.input.config.voices.filter(voice=>voice.route===message.input.config.defaultRoute).at(-1).id
        }))},message.input.transcript,message.input.config);
        else if(message.action==='plan')result=validatePlan({segments:[
          {speaker:'Narrator',voice:'Charon',text:'The hall fell silent.',style:'Calm'},
          {speaker:'Mira',voice:(message.input.config.voices.find(v=>v.gender==='female') || message.input.config.voices[1]).id,text:message.input.transcript.match(/Hello, [^.]+\./)[0],style:'Curious'},
          {speaker:'Guard',voice:message.input.config.voices.filter(voice=>voice.route===message.input.config.defaultRoute).at(-1).id,text:'Welcome.',style:'Warm'}]},message.input.transcript,message.input.config);
        else result={base64:'UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=',mimeType:'audio/wav'};
        if(message.action==='plan')onBackend?.({namespace:'choir',id:message.id,progress:{stage:'Waiting for planner response',model:'gpt-text-test'}});
        onBackend?.({namespace:'choir',id:message.id,result});
      },2);
    }
  };
  try {
    let cleanup=await setup(ctx);
    const $=name=>(root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`)) || settingsRoot.querySelector(`[data-et="${name}"]`);
    assert.match(minimalFooter.querySelector('button').title,/Play Choir/);
    assert.match($('planner').textContent,/GPT planner · openai · gpt-text-test/);
    $('planner').value='planner-a';$('testPlanner').click();await until(()=>$('status').textContent.includes('Planner test passed'));
    assert.equal(requests.find(request=>request.action==='testPlanner').input.connectionId,'planner-a');
    assert.equal($('fixed').querySelectorAll('.et-card').length,3);
    $('fixed').querySelectorAll('[data-choir-gender]')[2].value='female';
    $('fixed').querySelectorAll('[data-choir-gender]')[2].dispatchEvent(new dom.window.Event('change'));
    const characterVoices=[...$('fixed').querySelectorAll('[data-choir-voice]')[2].options].map(option=>option.textContent);
    assert.ok(characterVoices.some(label=>label.includes('Kore · Female')));
    assert.ok(!characterVoices.some(label=>label.includes('Puck · Male')));
    assert.equal(settingsMount.children.length,0);
    assert.ok(root.querySelector('[data-et="fixed"]'));
    placementListeners.get('drawer')();
    assert.ok(root.querySelector('[data-et="fixed"]'));
    // Drawer roots can be detached when the user is looking at the story.
    root.remove();
    messageActions.querySelector('button').click();await until(()=>$('status').textContent.includes('Playback finished'));
    assert.equal(audios.length,3);audios.length=0;
    assert.match(messageActions.textContent,/Playback finished/);
    assert.match(minimalFooter.textContent,/Playback finished/);
    assert.equal($('preview').querySelectorAll('.et-card').length,3);
    assert.equal(store.get('chat:chat-a').casts['native:google-a'][0].speaker,'Guard');
    assert.equal(store.get('chat:chat-a').singleVoices['native:google-a'].Mira,'Zephyr');
    assert.equal(store.get('chat:chat-a').fixed.find(actor=>actor.speaker==='Mira').gender,'female');
    assert.equal(requests.find(request=>request.action==='plan').input.config.fixed[2].gender,'female');
    $('play').click();await until(()=>$('status').textContent.includes('finished'));
    assert.equal(audios.length,3);assert.match($('status').textContent,/finished/);
    assert.match($('status').textContent,/Audio saved/);
    const googleCalls=()=>nativeRequests.filter(request=>request.connectionId==='google-a').length,generated=googleCalls();
    $('play').click();await until(()=>$('status').textContent.includes('finished'));
    assert.equal(googleCalls(),generated);
    cleanup();cleanup=await setup(ctx);
    const replay=[...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay');
    replay.click();await until(()=>$('status').textContent==='Replay finished.');
    assert.equal(googleCalls(),generated);
    $('latest').click();await until(()=>$('preview').querySelectorAll('.et-card').length===3 && !$('latest').disabled);
    blockAudio=true;const previousAudioCount=audios.length;$('play').click();await until(()=>audios.length>previousAudioCount && !audios.at(-1).paused);const previous=googleCalls();
    $('stop').click();await tick();assert.equal(googleCalls(),previous);
    assert.ok(audios.at(-1).paused);
    blockAudio=false;
    $('connectionMode').value='several';$('connectionMode').dispatchEvent(new dom.window.Event('change'));await until(()=>$('status').textContent.startsWith('Several TTS restored'));
    const speakerRoute=$('fixed').querySelectorAll('[data-choir-route]')[2];
    speakerRoute.value='native:native-a';speakerRoute.dispatchEvent(new dom.window.Event('change'));
    await until(()=>$('fixed').querySelectorAll('[data-choir-voice]')[2].textContent.includes('coral'));
    $('fixed').querySelectorAll('[data-choir-voice]')[2].value='coral';
    $('save').click();await until(()=>$('status').textContent.includes('retention saved'));
    $('latest').click();await until(()=>$('preview').querySelectorAll('.et-card').length===3 && !$('latest').disabled);
    nativeRequests.length=0;
    $('play').click();await until(()=>$('status').textContent.includes('Audio saved'));
    assert.equal(nativeRequests.length,1);assert.equal(nativeRequests[0].voice,'coral');
    assert.equal(nativeRequests[0].parameters.instructions,'Curious');
    assert.equal(store.get('chat:chat-a').fixed[2].route,'native:native-a');
    $('play').click();await until(()=>$('status').textContent.includes('Audio saved'));
    assert.equal(nativeRequests.length,1);
    nativeRequests.length=0;
    $('connection').value='native-a';$('connection').dispatchEvent(new dom.window.Event('change'));await tick();
    assert.match($('fixed').querySelector('[data-choir-voice]').textContent,/coral · Female/);
    assert.match($('fixed').querySelector('[data-choir-voice]').textContent,/onyx · Male/);
    for(const [index,select] of [...$('fixed').querySelectorAll('[data-choir-voice]')].entries())select.value=['alloy','coral','onyx'][index];
    $('styleParam').value='instructions';$('concurrency').value='2';$('save').click();await tick();
    $('latest').click();await until(()=>$('preview').querySelectorAll('.et-card').length===3 && !$('latest').disabled);
    $('play').click();await until(()=>$('status').textContent.includes('finished'));
    assert.equal(nativeRequests.length,3);
    assert.equal(peakTTS,2);assert.equal(store.get('chat:chat-a').concurrency,2);
    assert.equal(nativeRequests[0].voice,'alloy');assert.equal(nativeRequests[0].connectionId,'native-a');
    assert.equal(nativeRequests[0].parameters.instructions,'Clear, measured narration');
    assert.equal(nativeRequests[2].voice,'echo'); // The LLM chooses the unassigned NPC voice on the new route.
    assert.equal(store.get('chat:chat-a').casts['native:native-a'].find(actor=>actor.speaker==='Guard').voice,'echo');
    $('retention').value='1';$('save').click();await until(()=>$('status').textContent.includes('retention saved'));
    assert.equal(store.get('chat:chat-a').retention,'1');
    const realNow=Date.now;
    try {
      Date.now=()=>realNow()+2*86400000;
      [...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
      await until(()=>$('status').textContent.includes('No saved audio'));
    } finally {Date.now=realNow;}
    $('retention').value='session';$('save').click();await until(()=>$('status').textContent.includes('retention saved'));
    $('latest').click();await until(()=>$('preview').querySelectorAll('.et-card').length===3 && !$('latest').disabled);
    $('play').click();await until(()=>$('status').textContent.includes('kept for this session'));
    const syntheses=nativeRequests.length;
    [...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
    await until(()=>$('status').textContent==='Replay finished.');assert.equal(nativeRequests.length,syntheses);
    cleanup();cleanup=await setup(ctx);
    [...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
    await until(()=>$('status').textContent.includes('No saved audio'));
    // Create a persistent recording for the edit and deletion checks.
    $('retention').value='forever';$('save').click();await until(()=>$('status').textContent.includes('retention saved'));
    $('latest').click();await until(()=>$('preview').querySelectorAll('.et-card').length===3 && !$('latest').disabled);
    $('play').click();await until(()=>$('status').textContent.includes('Audio saved'));
    $('deleteChatAudio').click();await until(()=>$('status').textContent.includes('All Choir audio deleted'));
    [...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
    await until(()=>$('status').textContent.includes('No saved audio'));
    const beforeRegeneration=nativeRequests.length;
    $('play').click();await until(()=>$('status').textContent.includes('Audio saved'));
    assert.equal(nativeRequests.length,beforeRegeneration+3);
    message.content='The hall fell silent. Hello, {{user}}. Welcome.';
    events.get('MESSAGE_EDITED')({messageId:'message-a'});
    $('fixed').querySelectorAll('.et-card')[1].querySelector('input').value='Sona';
    $('latest').click();await until(()=>$('status').textContent.startsWith('Ready:'));
    assert.ok(requests.filter(request=>request.action==='plan').at(-1).input.transcript.includes('Hello, Sona.'));
    assert.ok(!requests.filter(request=>request.action==='plan').at(-1).input.transcript.includes('{{user}}'));
    message.content='Edited reply.';events.get('MESSAGE_EDITED')({messageId:'message-a'});
    assert.equal($('play').disabled,false);assert.equal($('play').getAttribute('aria-label'),'Play latest reply');
    [...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
    await until(()=>$('status').textContent.includes('message changed'));
    [...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Delete audio').click();
    await until(()=>$('status').textContent.includes('deleted'));
    assert.ok([...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').disabled);
    events.get('MESSAGE_EDITED')({messageId:'message-a'});
    [...$('messages').querySelectorAll('button')].find(button=>button.textContent==='Replay').click();
    await until(()=>$('status').textContent.includes('No saved audio'));
    message.content=Array.from({length:100},()=> 'Long narration. "Welcome."').join('\n');
    events.get('MESSAGE_EDITED')({messageId:'message-a'});
    const beforeLong=requests.filter(request=>request.action==='plan').length;
    $('latest').click();await until(()=>$('status').textContent.startsWith('Ready: 200 turns'));
    const longRequests=requests.filter(request=>request.action==='plan').slice(beforeLong);
    assert.equal(longRequests.length,1);
    assert.equal(longRequests[0].input.transcript,message.content);assert.equal(longRequests[0].input.timeoutMs,240000);
    assert.equal(store.get('chat:chat-a').casts['native:native-a'].find(actor=>actor.speaker==='Traveler').voice,'echo');
    active='chat-b';listeners.get('chat.active')();await tick();await tick();
    assert.equal($('npcs').children.length,0);
    cleanup();assert.equal(root.children.length,0);assert.equal(listeners.size,0);assert.equal(events.size,0);
    assert.equal(settingsMount.children.length,0);assert.equal(placementListeners.size,0);
  } finally {Object.assign(globalThis,old);dom.window.close();}
});

test('older hosts show a visible settings diagnostic rather than disappearing',async()=>{
  const dom=new JSDOM('<body><main></main><section></section></body>');
  const previous=globalThis.document;globalThis.document=dom.window.document;
  const root=dom.window.document.querySelector('main');const mount=dom.window.document.querySelector('section');
  try {
    const cleanup=await setup({messages:{},ui:{registerDrawerTab:()=>({root,activate(){},destroy(){root.replaceChildren();}}),mount:()=>mount}});
    assert.match(root.textContent,/newer Lumiverse staging/);
    assert.equal(mount.children.length,0);
    cleanup();assert.equal(root.children.length,0);assert.equal(mount.children.length,0);
  } finally {globalThis.document=previous;dom.window.close();}
});


test('a long reply is planned in one request and then played in order', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  let onBackend;
  const store = new Map(), requests = [], audios = [];
  const message = {
    id: 'message-multi',
    chat_id: 'chat-multi',
    name: 'Mira',
    is_user: false,
    content: Array.from({length: 12}, (_, i) => `Sentence ${i}. "Quote ${i}."\n`).join(''),
    extra: {}
  };
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; audios.push(this); }
    play() { this.paused = false; setTimeout(() => this.onended?.(), 10); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/tts/synthesize')) return new Response(new Uint8Array([1, 2]), {headers: {'Content-Type': 'audio/mpeg'}});
    if (url.includes('/providers')) return new Response(JSON.stringify({providers: []}), {headers: {'Content-Type': 'application/json'}});
    if (url.endsWith('/voices')) return new Response(JSON.stringify({voices: [{id: 'Charon', name: 'Charon', gender: 'male'}, {id: 'Zephyr', name: 'Zephyr', gender: 'female'}]}), {headers: {'Content-Type': 'application/json'}});
    if (url.includes('/tts-connections?')) return new Response(JSON.stringify({data: [{id: 'google-a', name: 'Google', provider: 'google_tts', model: 'gemini-3.8-flash-tts'}]}), {headers: {'Content-Type': 'application/json'}});
    return new Response(JSON.stringify({data: []}), {headers: {'Content-Type': 'application/json'}});
  };
  const messageActions = dom.window.document.createElement('div');
  const root = dom.window.document.createElement('div');
  const ctx = {
    registerDomDecorator: options => options.render(messageActions, {scope: 'message:message-multi:bubble:footer'}),
    settings: {
      get: async key => store.get(key) || null,
      set: async (key, value) => { store.set(key, structuredClone(value)); }
    },
    messages: {
      getRecent: () => [message],
      getContent: id => id === message.id ? message.content : null
    },
    state: {subscribe: () => () => {}},
    connections: {list: () => []},
    characters: {get: async () => ({name: 'Mira'})},
    getActiveChat: () => ({chatId: 'chat-multi', characterId: 'character-a'}),
    dom: {addStyle: () => () => {}},
    ui: {
      registerDrawerTab: () => ({root, activate() {}, destroy() {}}),
      mount: () => dom.window.document.createElement('div'), registerInputBarAction: () => ({onClick() {}, destroy() {}})
    },
    events: {on: () => () => {}},
    onBackendMessage: fn => { onBackend = fn; return () => null; },
    sendToBackend: message => {
      requests.push(message);
      setTimeout(() => {
        if (message.action === 'ping') onBackend?.({namespace: 'choir', id: message.id, result: {version: '1.0.18', ready: true}});
        else if (message.action === 'skipCheck') onBackend?.({namespace: 'choir', id: message.id, result: {skip: []}});
        else if (message.action === 'plan') {
          const units = speechSourceUnits(message.input.transcript);
          onBackend?.({namespace: 'choir', id: message.id, result: {segments: units.map(u => ({
            speaker: u.kind === 'dialogue' ? 'Mira' : 'Narrator',
            text: u.text,
            voice: u.kind === 'dialogue' ? 'Zephyr' : 'Charon'
          }))}});
        }
      }, 5);
    }
  };
  try {
    const cleanup = await setup(ctx);
    const $ = name => (root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`));
    messageActions.querySelector('button').click();
    await until(() => audios.length > 0);
    await until(() => $('status').textContent.includes('Playback finished'));
    const planRequests = requests.filter(r => r.action === 'plan');
    assert.equal(planRequests.length, 1);assert.equal(planRequests[0].input.transcript, message.content.trim());
    assert.ok(audios.length >= 8);
    cleanup();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});


test('settings saved in the retired Gemini mode load on the Lumiverse connection picker', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  let onBackend;
  const store = new Map(), requests = [], audios = [];
  store.set('settings:global', {mode: 'gemini', model: 'gemini-3.8-flash-tts'});
  store.set('chat:chat-audition', {mode: 'gemini', connectionMode: 'several', fixed: [{speaker: 'Narrator', voice: 'Charon', style: '', route: 'gemini'}, {speaker: 'Persona', voice: '', style: ''}, {speaker: 'Mira', voice: 'Kore', style: ''}],
    casts: {gemini: [{speaker: 'Guard', voice: 'Puck', style: ''}]}, singleVoices: {gemini: {Mira: 'Kore'}}, npcPolicy: {mode: 'llm', route: 'gemini', voice: '', voices: []}});
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; audios.push(this); }
    play() { this.paused = false; setTimeout(() => this.onended?.(), 5); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async (url, options) => {
    if (url.includes('/providers')) return new Response(JSON.stringify({providers: []}), {headers: {'Content-Type': 'application/json'}});
    if (url.endsWith('/voices')) return new Response(JSON.stringify({voices: []}), {headers: {'Content-Type': 'application/json'}});
    if (url.includes('/tts-connections?')) return new Response(JSON.stringify({data: [{id: 'google-a', name: 'Google', provider: 'google_tts', model: 'gemini-3.8-flash-tts'}]}), {headers: {'Content-Type': 'application/json'}});
    return new Response(JSON.stringify({data: []}), {headers: {'Content-Type': 'application/json'}});
  };
  const root = dom.window.document.createElement('div');
  const ctx = {
    registerDomDecorator: () => () => {},
    settings: {
      get: async key => store.get(key) || null,
      set: async (key, value) => { store.set(key, structuredClone(value)); }
    },
    messages: { getRecent: () => [], getContent: () => null },
    state: { subscribe: () => () => {} },
    connections: { list: () => [] },
    characters: { get: async () => ({name: 'Mira'}) },
    getActiveChat: () => ({chatId: 'chat-audition', characterId: 'character-a'}),
    dom: { addStyle: () => () => {} },
    ui: {
      registerDrawerTab: () => ({root, activate() {}, destroy() {}}),
      mount: () => dom.window.document.createElement('div'),
      registerInputBarAction: () => ({onClick() {}, destroy() {}})
    },
    events: { on: () => () => {} },
    onBackendMessage: fn => { onBackend = fn; return () => null; },
    sendToBackend: message => {
      requests.push(message);
      setTimeout(() => {
        if (message.action === 'ping') onBackend?.({namespace: 'choir', id: message.id, result: {version: '1.0.18', ready: true}});
      }, 5);
    }
  };
  try {
    const cleanup = await setup(ctx);
    const $ = name => (root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`));
    await until(() => $('fixed').querySelectorAll('[data-choir-route]').length === 3);
    root.querySelector('[data-choir-tab="settings"]').click();
    assert.equal($('connection').value, 'google-a');assert.equal($('connection').closest('[hidden]'), null);
    assert.equal(root.querySelector('[data-et="key"]'), null);
    assert.ok(![...root.querySelectorAll('option')].some(option => option.value === 'gemini'));
    assert.deepEqual([...$('fixed').querySelectorAll('[data-choir-route]')].map(select => select.value), ['', '', '']);
    $('save').click();await until(() => $('status').textContent.includes('retention saved'));
    const saved = store.get('chat:chat-audition');
    assert.equal(saved.mode, undefined);assert.equal(saved.casts.gemini, undefined);assert.equal(saved.singleVoices.gemini, undefined);
    assert.equal(saved.fixed[0].route, '');assert.equal(saved.npcPolicy.route, '');
    cleanup();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});

test('character row allows inline voice search and community voice discovery directly on the card', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  const store = new Map(), requests = [];
  globalThis.fetch = async (url) => {
    if (url.includes('/providers')) return new Response(JSON.stringify({providers: []}), {headers: {'Content-Type': 'application/json'}});
    if (url.endsWith('/voices')) return new Response(JSON.stringify({voices: []}), {headers: {'Content-Type': 'application/json'}});
    if (url.includes('/tts-connections?')) return new Response(JSON.stringify({data: [{id: 'google-a', name: 'Google', provider: 'google_tts', model: 'gemini-3.8-flash-tts'}]}), {headers: {'Content-Type': 'application/json'}});
    return new Response(JSON.stringify({data: []}), {headers: {'Content-Type': 'application/json'}});
  };
  const root = dom.window.document.createElement('div');
  const ctx = {
    registerDomDecorator: () => () => {},
    settings: {
      get: async key => store.get(key) || null,
      set: async (key, value) => { store.set(key, structuredClone(value)); }
    },
    messages: { getRecent: () => [{id: 'msg-1', name: 'Char', content: 'Story text.'}], getContent: () => 'Story text.' },
    state: { get: () => null, subscribe: () => () => {} },
    events: { on: () => () => {} },
    getActiveChat: () => ({chatId: 'chat-search', characterId: 'char-1'}),
    characters: { get: async () => ({name: 'Nia'}) },
    dom: { addStyle: () => () => {}, getMessageId: () => null },
    ui: { registerDrawerTab: () => ({root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {}}), registerInputBarAction: () => ({onClick(){}, destroy(){}}), createTab: () => ({root, activate: () => {}, onActivate: () => () => {}, destroy: () => {}}), mount: () => null },
    onBackendMessage: () => () => {},
    sendToBackend: (msg) => requests.push(msg)
  };
  
  const cleanup = await setup(ctx);
  await until(() => root.querySelector('[data-et="fixed"]')?.querySelectorAll('.et-card')?.length >= 2);
  const firstCard = root.querySelector('[data-et="fixed"]').querySelector('.et-card');
  assert.ok(firstCard);
  
  const voiceSearchInput = firstCard.querySelector('input[placeholder*="Filter"]');
  assert.ok(voiceSearchInput, 'Inline voice search input should exist on character card');
  
  // Test local filtering
  voiceSearchInput.value = 'Charon';
  voiceSearchInput.dispatchEvent(new dom.window.Event('input'));
  const voiceSelect = firstCard.querySelector('[data-choir-voice]');
  const optionTexts = [...voiceSelect.options].map(o => o.textContent);
  assert.ok(optionTexts.some(t => t.includes('Charon')), 'Charon should match filter');
  assert.ok(!optionTexts.some(t => t.includes('Zephyr')), 'Zephyr should be filtered out');

  cleanup?.();
  Object.assign(globalThis, old);
});

test('detects Fish Audio vs Gemini/Vertex provider and dynamically adapts UI controls, syntax, and libraries', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  const store = new Map();
  globalThis.fetch = async (url) => {
    if (url.includes('/tts-connections/providers')) {
      return new Response(JSON.stringify({providers: [{id: 'fish_audio'}, {id: 'google_vertex_tts'}]}), {headers: {'Content-Type': 'application/json'}});
    }
    if (url.includes('/tts-connections') && !url.includes('/voices')) {
      return new Response(JSON.stringify({data: [
        {id: 'conn-fish', name: 'Fish TTS Profile', provider: 'fish_audio', model: 's2.1-pro'},
        {id: 'conn-vertex', name: 'Vertex Profile', provider: 'google_vertex_tts', model: 'gemini-3.8-flash-tts'}
      ]}), {headers: {'Content-Type': 'application/json'}});
    }
    if (url.includes('/voices')) {
      if (url.includes('conn-fish')) {
        return new Response(JSON.stringify({voices: [{id: 'fish-voice-1', name: 'Fish Star', gender: 'female'}]}), {headers: {'Content-Type': 'application/json'}});
      }
      return new Response(JSON.stringify({voices: [{id: 'Charon', name: 'Charon', gender: 'male'}]}), {headers: {'Content-Type': 'application/json'}});
    }
    return new Response(JSON.stringify({data: []}), {headers: {'Content-Type': 'application/json'}});
  };
  const root = dom.window.document.createElement('div');
  const ctx = {
    registerDomDecorator: () => () => {},
    settings: {
      get: async key => store.get(key) || null,
      set: async (key, value) => { store.set(key, structuredClone(value)); }
    },
    messages: { getRecent: () => [], getContent: () => '' },
    state: { get: () => null, subscribe: () => () => {} },
    events: { on: () => () => {} },
    getActiveChat: () => ({chatId: 'chat-prov', characterId: 'char-1'}),
    characters: { get: async () => ({name: 'Nia'}) },
    dom: { addStyle: () => () => {}, getMessageId: () => null },
    ui: {
      registerDrawerTab: () => ({root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {}}),
      registerInputBarAction: () => ({onClick(){}, destroy(){}}),
      mount: () => null
    },
    onBackendMessage: () => () => {},
    sendToBackend: () => {}
  };
  
  const cleanup = await setup(ctx);
  const $ = name => (root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`));
  await until(() => $('fixed')?.querySelectorAll('.et-card')?.length >= 2);

  // 1. Fish Audio connection
  $('connection').value = 'conn-fish';
  $('connection').dispatchEvent(new dom.window.Event('change'));
  await until(() => $('fixed')?.querySelector('input[placeholder="Filter / search Fish library…"]') && /Provider selected|Choose valid voices/.test($('status').textContent));
  const searchBtn = $('fixed').querySelector('.et-card button[title*="Fish"]');
  assert.ok(searchBtn && !searchBtn.hidden, 'Search button should be visible for Fish Audio');

  // 2. Vertex connection uses Gemini voices and delivery metadata
  $('connection').value = 'conn-vertex';
  $('connection').dispatchEvent(new dom.window.Event('change'));
  await until(() => $('fixed')?.querySelector('input[placeholder="Filter Gemini voices…"]'));
  assert.ok($('fixed').querySelector('.et-card button[title*="Fish"]').hidden, 'Fish search should be hidden for Vertex');
  assert.match($('extraVoicesLabel').textContent, /Gemini voices/);

  cleanup?.();
  Object.assign(globalThis, old);
});

test('opens Fish Audio voice library overlay modal with avatars, audio preview, and voice selection', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  const store = new Map();
  const audioPlays = [];
  class MockAudio {
    constructor(src) { this.src = src; this.paused = true; }
    play() { audioPlays.push(this.src); this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = MockAudio;

  globalThis.fetch = async (url) => {
    if (url.includes('/tts-connections/providers')) {
      return new Response(JSON.stringify({providers: [{id: 'fish_audio'}]}), {headers: {'Content-Type': 'application/json'}});
    }
    if (url.includes('/tts-connections') && !url.includes('/voices')) {
      return new Response(JSON.stringify({data: [
        {id: 'conn-fish', name: 'Fish TTS Profile', provider: 'fish_audio', model: 's2.1-pro'}
      ]}), {headers: {'Content-Type': 'application/json'}});
    }
    if (url.includes('/voices')) {
      return new Response(JSON.stringify({voices: [{id: 'default-fish-1', name: 'Default Fish'}]}), {headers: {'Content-Type': 'application/json'}});
    }
    return new Response(JSON.stringify({data: []}), {headers: {'Content-Type': 'application/json'}});
  };
  const root = dom.window.document.createElement('div');
  const requests = [];
  const ctx = {
    registerDomDecorator: () => () => {},
    settings: {
      get: async key => store.get(key) || null,
      set: async (key, value) => { store.set(key, structuredClone(value)); }
    },
    messages: { getRecent: () => [], getContent: () => '' },
    state: { get: () => null, subscribe: () => () => {} },
    events: { on: () => () => {} },
    getActiveChat: () => ({chatId: 'chat-modal', characterId: 'char-1'}),
    characters: { get: async () => ({name: 'Nia'}) },
    dom: { addStyle: () => () => {}, getMessageId: () => null },
    ui: {
      registerDrawerTab: () => ({root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {}}),
      registerInputBarAction: () => ({onClick(){}, destroy(){}}),
      mount: () => null
    },
    onBackendMessage: () => () => {},
    sendToBackend: (msg) => {
      requests.push(msg);
      if (msg.action === 'searchVoices') {
        setTimeout(() => {
          dom.window.dispatchEvent(new dom.window.CustomEvent('backend-reply', {detail: msg}));
          // Mock response back
          const reply = {
            namespace: 'choir',
            id: msg.id,
            result: {
              query: msg.input.query,
              results: [
                {
                  id: '0327fdb5da9e4fd782899a8058c8ae2b',
                  name: 'Epic Narrator',
                  description: 'Deep authoritative documentary voice',
                  coverImage: 'https://public-platform.r2.fish.audio/coverimage/0327fdb5da9e4fd782899a8058c8ae2b',
                  sampleAudio: 'https://platform.r2.fish.audio/task/sample1.mp3',
                  author: 'Max N',
                  tags: ['narration', 'deep', 'calm']
                }
              ]
            }
          };
          globalThis.__onBackend?.(reply);
        }, 10);
      }
    }
  };

  // Capture onBackendMessage
  ctx.onBackendMessage = (fn) => { globalThis.__onBackend = fn; return () => {}; };

  const cleanup = await setup(ctx);
  const $ = name => (root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`));
  await until(() => $('fixed')?.querySelectorAll('.et-card')?.length >= 2);

  // Switch to Fish Audio
  $('connection').value = 'conn-fish';
  $('connection').dispatchEvent(new dom.window.Event('change'));
  await until(() => $('fixed')?.querySelector('input[placeholder*="Fish"]'));

  // Click 🔍 on the character card
  const firstCard = $('fixed').querySelector('.et-card');
  const searchBtn = firstCard.querySelector('button[title*="Fish"]');
  assert.ok(searchBtn, 'Search button on card exists');
  searchBtn.click();

  // Modal overlay should be rendered in document.body
  await until(() => dom.window.document.querySelector('.et-modal-overlay'));
  const modal = dom.window.document.querySelector('.et-modal-overlay');
  assert.ok(modal, 'Modal overlay should be open');
  assert.match(modal.textContent, /Fish Audio Voice Library/);

  // Wait for mock search results to populate
  await until(() => modal.querySelector('.et-voice-card'));
  const voiceCard = modal.querySelector('.et-voice-card');
  assert.ok(voiceCard, 'Voice card should be rendered in modal');
  assert.match(voiceCard.textContent, /Epic Narrator/);
  assert.match(voiceCard.textContent, /by Max N/);

  // Check cover image
  const img = voiceCard.querySelector('img');
  assert.ok(img, 'Voice cover image element should exist');
  assert.equal(img.src, 'https://public-platform.r2.fish.audio/coverimage/0327fdb5da9e4fd782899a8058c8ae2b');

  // Test Listen audio preview
  const listenBtn = voiceCard.querySelector('button[textContent*="Listen"], button');
  const listenBtnEl = [...voiceCard.querySelectorAll('button')].find(b => b.textContent.includes('Listen'));
  assert.ok(listenBtnEl, 'Listen preview button should exist');
  listenBtnEl.click();
  assert.ok(audioPlays.includes('https://platform.r2.fish.audio/task/sample1.mp3'), 'Audio sample should play');

  // Test Use Voice button
  const useBtn = [...voiceCard.querySelectorAll('button')].find(b => b.textContent.includes('Use Voice'));
  assert.ok(useBtn, 'Use Voice button should exist');
  useBtn.click();

  // Modal should close
  await until(() => !dom.window.document.querySelector('.et-modal-overlay'));
  assert.ok(!dom.window.document.querySelector('.et-modal-overlay'), 'Modal should close after selection');

  // Selected voice should be assigned to the character card
  const voiceSelect = firstCard.querySelector('[data-choir-voice]');
  assert.equal(voiceSelect.value, '0327fdb5da9e4fd782899a8058c8ae2b', 'Voice should be assigned to character');

  cleanup?.();
  Object.assign(globalThis, old);
});

test('fast classifier setting resolves speech plan locally in 0ms without sending plan RPC', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  const requests = [], audios = [];
  const message = {
    id: 'message-fc',
    chat_id: 'chat-fc',
    name: 'Mira',
    is_user: false,
    content: 'The valley was quiet and peaceful.',
    extra: {}
  };
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; audios.push(this); }
    play() { this.paused = false; setTimeout(() => this.onended?.(), 2); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async url => url.endsWith('/tts/synthesize') ? new Response(new Uint8Array([1, 2]), {headers: {'Content-Type': 'audio/mpeg'}})
    : new Response(JSON.stringify({voices: [{id: 'Charon', name: 'Charon', gender: 'male'}], data: url.includes('/tts-connections?') ? [{id: 'google-a', name: 'Google', provider: 'google_tts', model: 'gemini-3.8-flash-tts'}] : []}), {headers: {'Content-Type': 'application/json'}});

  const messageActions = dom.window.document.createElement('div');
  const root = dom.window.document.createElement('div');
  const ctx = {
    registerDomDecorator: options => options.render(messageActions, {scope: 'message:message-fc:bubble:footer'}),
    settings: {
      get: async () => ({useFastClassifier: true, casts: {}, fixed: [{speaker: 'Narrator', voice: 'Charon', style: ''}], voices: [{id: 'Charon'}]}),
      set: async () => {}
    },
    messages: {
      getRecent: () => [message],
      getContent: id => id === message.id ? message.content : null
    },
    state: {subscribe: () => () => {}},
    connections: {list: () => []},
    characters: {get: async () => ({name: 'Mira'})},
    getActiveChat: () => ({chatId: 'chat-fc', characterId: 'character-a'}),
    dom: {addStyle: () => () => {}},
    ui: {
      registerDrawerTab: () => ({root, activate() {}, destroy() {}}),
      mount: () => dom.window.document.createElement('div'),
      registerInputBarAction: () => ({onClick() {}, destroy() {}})
    },
    events: {on: () => () => {}},
    onBackendMessage: () => () => null,
    sendToBackend: msg => {
      requests.push(msg);
      if (msg.action === 'ping') onBackend?.({namespace: 'choir', id: msg.id, result: {ready: true}});
    }
  };
  let onBackend;
  ctx.onBackendMessage = fn => { onBackend = fn; return () => null; };

  try {
    const cleanup = await setup(ctx);
    const $ = name => (root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`));
    messageActions.querySelector('button').click();
    await until(() => audios.length > 0 || $('status').textContent.includes('Speech plan ready'));
    // Zero plan RPC requests because fastClassifyPlan handled it locally!
    assert.equal(requests.filter(r => r.action === 'plan').length, 0);
    cleanup();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});

test('plannerMode toggles Jev System 1 inputs directly in Speech & Planner section', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  const requests = [];
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; }
    play() { return Promise.resolve(); }
    pause() {}
  }
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async url => new Response(JSON.stringify({voices: [{id: 'Charon'}], data: url.includes('/tts-connections?') ? [{id: 'google-a', name: 'Google', provider: 'google_tts', model: 'gemini-3.8-flash-tts'}] : []}), {headers: {'Content-Type': 'application/json'}});

  const root = dom.window.document.createElement('div');
  let onBackend;
  const ctx = {
    registerDomDecorator: () => () => {},
    settings: {
      get: async () => ({plannerMode: 'llm', casts: {}, fixed: [{speaker: 'Narrator', voice: 'Charon', style: ''}], voices: [{id: 'Charon'}]}),
      set: async () => {}
    },
    messages: { getRecent: () => [], getContent: () => null },
    state: { subscribe: () => () => {} },
    connections: { list: () => [] },
    characters: { get: async () => ({name: 'Mira'}) },
    getActiveChat: () => ({chatId: 'chat-test', characterId: 'char-1'}),
    dom: { addStyle: () => () => {} },
    ui: {
      registerDrawerTab: () => ({root, activate() {}, destroy() {}}),
      mount: () => dom.window.document.createElement('div'),
      registerInputBarAction: () => ({onClick() {}, destroy() {}})
    },
    events: { on: () => () => {} },
    onBackendMessage: fn => { onBackend = fn; return () => null; },
    sendToBackend: msg => {
      requests.push(msg);
      if (msg.action === 'ping') onBackend?.({namespace: 'choir', id: msg.id, result: {ready: true}});
      if (msg.action === 'testPlanner') onBackend?.({namespace: 'choir', id: msg.id, result: {provider: 'TypeSafe AI', model: 'Jev System 1', response: 'READY · 18ms'}});
    }
  };

  try {
    const cleanup = await setup(ctx);
    const $ = name => (root.querySelector(`[data-et="${name}"]`) || root.ownerDocument.querySelector(`[data-choir-action="${["play","pause","resumePosition"].includes(name)?"playback":name}"]`));

    // Initially in LLM mode
    assert.equal($('plannerMode').value, 'llm');
    assert.equal($('llmPlannerBox').hidden, false);
    assert.equal($('jevPlannerBox').hidden, true);

    // Switch to Jev System 1
    $('plannerMode').value = 'jev';
    $('plannerMode').dispatchEvent(new dom.window.Event('change'));
    assert.equal($('llmPlannerBox').hidden, false);
    assert.equal($('jevPlannerBox').hidden, false);

    // Enter Jev key and test planner
    $('jevKey').value = 'test-jev-key';
    $('testPlanner').click();
    await until(() => $('status').textContent.includes('Planner test passed') && $('status').textContent.includes('Jev System 1'));
    const testReq = requests.find(r => r.action === 'testPlanner');
    assert.ok(testReq);
    assert.equal(testReq.input.plannerMode, 'jev');
    assert.equal(testReq.input.jevApiKey, 'test-jev-key');

    cleanup?.();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});


test('muteNarrator skips narrator synthesis and badges preview cards', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB, Blob: globalThis.Blob, URL: globalThis.URL};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  globalThis.URL = class extends (old.URL || URL) { static createObjectURL() { return 'blob:test-choir'; } static revokeObjectURL() {} };

  const requests = [], nativeRequests = [];
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; }
    play() { this.paused = false; setTimeout(() => this.onended?.(), 2); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/tts/synthesize')) {
      nativeRequests.push(JSON.parse(options.body));
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/wav' } });
    }
    if (url.includes('/providers')) {
      return new Response(JSON.stringify({ providers: [{ id: 'native-prov', capabilities: { parameters: {} } }] }));
    }
    if (url.endsWith('/voices')) {
      return new Response(JSON.stringify({
        voices: [
          { id: 'voice-narrator', name: 'Narrator Voice' },
          { id: 'voice-jack', name: 'Jack Voice' }
        ]
      }));
    }
    if (url.includes('/connections?')) {
      return new Response(JSON.stringify({ data: [] }));
    }
    return new Response(JSON.stringify({
      data: [{ id: 'conn-native', name: 'Local Engine', provider: 'native-prov', model: 'v1' }]
    }));
  };

  const root = dom.window.document.createElement('div');
  const store = new Map();
  let onBackend;
  const ctx = {
    root,
    dom: {
      addStyle: () => () => {},
      getMessageId: () => null
    },
    characters: { get: async () => ({ name: 'Jack' }) },
    ui: {
      registerDrawerTab: () => ({ root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {} }),
      registerInputBarAction: () => ({ onClick() {}, destroy() {} }),
      mount: () => null
    },
    getActiveChat: () => ({ chatId: 'chat-mute', characterId: 'char-1' }),
    messages: {
      getContent: id => id === 'm-mixed'
        ? 'The storm raged outside. "Hold on tight!" warned Jack.'
        : 'The sun set slowly behind the crimson horizon.',
      getRecent: () => [
        { id: 'm-pure', content: 'The sun set slowly behind the crimson horizon.' },
        { id: 'm-mixed', content: 'The storm raged outside. "Hold on tight!" warned Jack.' }
      ]
    },
    settings: {
      get: async (key) => store.get(key) || null,
      set: async (key, val) => { store.set(key, val); }
    },
    state: { subscribe: () => () => {}, get: () => null },
    events: { on: () => () => {} },
    onBackendMessage: fn => { onBackend = fn; return () => null; },
    sendToBackend: msg => {
      requests.push(msg);
      setTimeout(() => {
        if (msg.action === 'ping') onBackend?.({ namespace: 'choir', id: msg.id, result: { ready: true } });
        else if (msg.action === 'skipCheck') onBackend?.({ namespace: 'choir', id: msg.id, result: { skip: [] } });
        else if (msg.action === 'plan') {
          const units = speechSourceUnits(msg.input.transcript);
          onBackend?.({
            namespace: 'choir',
            id: msg.id,
            result: {
              segments: units.map(u => ({
                speaker: u.kind === 'dialogue' ? 'Jack' : 'Narrator',
                voice: u.kind === 'dialogue' ? 'voice-jack' : 'voice-narrator',
                route: 'native:conn-native',
                style: '',
                text: u.text,
                unit_ids: [u.id]
              })),
              newNPCs: [{ name: 'Jack', voice: 'voice-jack', route: 'native:conn-native' }]
            }
          });
        }
      }, 5);
    }
  };

  try {
    const cleanup = await setup(ctx);
    const $ = name => root.querySelector(`[data-et="${name}"]`);

    $('connection').value = 'conn-native';
    $('connection').dispatchEvent(new dom.window.Event('change'));
    await tick();
    const voiceSelects = $('fixed').querySelectorAll('[data-choir-voice]');
    if (voiceSelects[0]) voiceSelects[0].value = 'voice-narrator';

    // Narrator controls live in the mixer; the companion API remains available.
    assert.equal($('muteNarrator'), null);
    assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(), false);

    // Plan the mixed message
    const planBtns = [...$('messages').querySelectorAll('button')].filter(b => b.textContent === 'Plan');
    planBtns[1].click(); // m-mixed, the latest assistant reply
    await until(() => $('preview').querySelectorAll('.et-card').length === 3);

    let previewCards = $('preview').querySelectorAll('.et-card');
    assert.ok(!previewCards[0].textContent.includes('Muted'));

    // Cue can still mute narration through the companion bridge.
    globalThis.__CHOIR_API__.setNarratorMuted(true);
    await tick();

    // Preview cards should now show Narrator muted
    previewCards = $('preview').querySelectorAll('.et-card');
    assert.ok(previewCards[0].textContent.includes('Muted'));
    assert.equal(previewCards[0].style.opacity, '0.55');
    assert.ok(!previewCards[1].textContent.includes('Muted'));
    assert.ok(previewCards[2].textContent.includes('Muted'));
    assert.equal(previewCards[2].style.opacity, '0.55');

    // Play mixed plan: only Jack dialogue should be synthesized, Narrator is skipped
    nativeRequests.length = 0;
    const playBtn = $('play') || dom.window.document.querySelector('[data-choir-action="playback"]');
    playBtn.click();
    await until(() => $('status').textContent.includes('finished'));

    assert.equal(nativeRequests.length, 1);
    assert.equal(nativeRequests[0].voice, 'voice-jack');
    assert.equal(nativeRequests[0].text, '"Hold on tight!"');

    cleanup?.();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});


test('__CHOIR_API__ companion bridge exposes controls and handles paragraph playback', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener, dispatchEvent: globalThis.dispatchEvent, CustomEvent: globalThis.CustomEvent, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB, Blob: globalThis.Blob, URL: globalThis.URL, __CHOIR_API__: globalThis.__CHOIR_API__};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
  globalThis.dispatchEvent = dom.window.dispatchEvent.bind(dom.window);
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  globalThis.URL = class extends (old.URL || URL) { static createObjectURL() { return 'blob:test-choir'; } static revokeObjectURL() {} };

  const nativeRequests = [];
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; }
    play() { this.paused = false; setTimeout(() => this.onended?.(), 2); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/tts/synthesize')) {
      nativeRequests.push(JSON.parse(options.body));
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/wav' } });
    }
    if (url.includes('/providers')) {
      return new Response(JSON.stringify({ providers: [{ id: 'native-prov', capabilities: { parameters: {} } }] }));
    }
    if (url.endsWith('/voices')) {
      return new Response(JSON.stringify({
        voices: [
          { id: 'voice-narrator', name: 'Narrator Voice' },
          { id: 'voice-jack', name: 'Jack Voice' }
        ]
      }));
    }
    if (url.includes('/connections?')) {
      return new Response(JSON.stringify({ data: [] }));
    }
    return new Response(JSON.stringify({
      data: [{ id: 'conn-native', name: 'Local Engine', provider: 'native-prov', model: 'v1' }]
    }));
  };

  const root = dom.window.document.createElement('div');
  const store = new Map();
  const ctx = {
    root,
    dom: { addStyle: () => () => {}, getMessageId: () => null },
    characters: { get: async () => ({ name: 'Jack' }) },
    ui: {
      registerDrawerTab: () => ({ root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {} }),
      registerInputBarAction: () => ({ onClick() {}, destroy() {} }),
      mount: () => null
    },
    getActiveChat: () => ({ chatId: 'chat-bridge', characterId: 'char-1' }),
    messages: {
      getContent: () => 'Some text',
      getRecent: () => []
    },
    settings: {
      get: async (key) => store.get(key) || null,
      set: async (key, val) => { store.set(key, val); }
    },
    state: { subscribe: () => () => {}, get: () => null },
    events: { on: () => () => {} },
    onBackendMessage: () => () => null,
    sendToBackend: () => {}
  };

  let availableEventSeen = false;
  const onAnnounce = () => { availableEventSeen = true; };
  globalThis.addEventListener('choir-available-v1', onAnnounce);

  try {
    const cleanup = await setup(ctx);
    const $ = name => root.querySelector(`[data-et="${name}"]`);

    $('connection').value = 'conn-native';
    $('connection').dispatchEvent(new dom.window.Event('change'));
    await tick();

    assert.ok(globalThis.__CHOIR_API__, 'choir API should be mounted on globalThis');
    assert.equal(globalThis.__CHOIR_API__.isAvailable(), true);
    assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(), false);

    // Toggle mute narrator via bridge
    globalThis.__CHOIR_API__.setNarratorMuted(true);
    assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(), true);
    assert.equal($('muteNarrator'), null);
    assert.equal(dom.window.document.querySelector('[aria-label="Narrator no voice"]'), null, 'No channels appear before a plan or playback');

    // Plan mixed paragraph text
    const mixedText = 'The storm raged outside. "Hold on tight!" warned Jack.';
    const plan = globalThis.__CHOIR_API__.planParagraph(mixedText);
    assert.equal(plan.segments.length, 3);

    // Play mixed paragraph text with narrator muted: only Jack speech is synthesized
    nativeRequests.length = 0;
    const playResult = await globalThis.__CHOIR_API__.playParagraph({
      text: mixedText,
      chatId: 'chat-bridge',
      paragraphIndex: 0
    });
    assert.equal(playResult.played, 1);
    assert.equal(dom.window.document.querySelector('[aria-label="Narrator no voice"]').getAttribute('aria-pressed'), 'true');
    assert.equal(nativeRequests.length, 1);
    assert.equal(nativeRequests[0].text, '"Hold on tight!"');

    cleanup?.();
    assert.equal(globalThis.__CHOIR_API__, undefined);
  } finally {
    globalThis.removeEventListener('choir-available-v1', onAnnounce);
    Object.assign(globalThis, old);
    dom.window.close();
  }
});



test('Cue companion keeps narration when no Freesound key is configured and points to the missing key', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB, Blob: globalThis.Blob, URL: globalThis.URL, __CHOIR_API__: globalThis.__CHOIR_API__};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  globalThis.URL = class extends (old.URL || URL) { static createObjectURL() { return 'blob:test-choir'; } static revokeObjectURL() {} };

  const nativeRequests = [];
  const audiosPlayed = [];
  const backendRequests = [];
  let freesoundRequests=0;
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; }
    play() {
      this.paused = false;
      audiosPlayed.push(this.url);
      setTimeout(() => this.onended?.(), 2);
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;

  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('freesound.org') || url.includes('/freesound')) {
      freesoundRequests++;
      return new Response(JSON.stringify({
        results: [
          {
            id: 12345,
            name: 'Page turn 1',
            duration: 0.8,
            previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/123/12345-hq.mp3' }
          }
        ]
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('.mp3')) {
      return new Response(new Uint8Array([70, 79, 76, 69, 89]), { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    if (url.endsWith('/tts/synthesize')) {
      nativeRequests.push(JSON.parse(options.body));
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/wav' } });
    }
    if (url.includes('/providers')) {
      return new Response(JSON.stringify({ providers: [{ id: 'native-prov', capabilities: { parameters: {} } }] }));
    }
    if (url.endsWith('/voices')) {
      return new Response(JSON.stringify({
        voices: [
          { id: 'voice-narrator', name: 'Narrator Voice' },
          { id: 'voice-jack', name: 'Jack Voice' }
        ]
      }));
    }
    if (url.includes('/connections?')) {
      return new Response(JSON.stringify({ data: [] }));
    }
    return new Response(JSON.stringify({
      data: [{ id: 'conn-native', name: 'Local Engine', provider: 'native-prov', model: 'v1' }]
    }));
  };

  const root = dom.window.document.createElement('div');
  const store = new Map();
  const ctx = {
    root,
    dom: { addStyle: () => () => {}, getMessageId: () => null },
    characters: { get: async () => ({ name: 'Jack' }) },
    ui: {
      registerDrawerTab: () => ({ root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {} }),
      registerInputBarAction: () => ({ onClick() {}, destroy() {} }),
      mount: () => null
    },
    getActiveChat: () => ({ chatId: 'chat-foley', characterId: 'char-1' }),
    messages: {
      getContent: () => 'The page snapped under her thumb.',
      getRecent: () => []
    },
    settings: {
      get: async (key) => store.get(key) || null,
      set: async (key, val) => { store.set(key, val); }
    },
    state: { subscribe: () => () => {}, get: () => null },
    events: { on: () => () => {} },
    onBackendMessage: () => () => null,
    sendToBackend: request => backendRequests.push(request)
  };

  try {
    const cleanup = await setup(ctx);
    const $ = name => root.querySelector(`[data-et="${name}"]`);

    $('connection').value = 'conn-native';
    $('connection').dispatchEvent(new dom.window.Event('change'));
    await tick();

    // Verify SFX toggle is present and on by default
    assert.ok($('enableSfx'), 'enableSfx toggle should exist in settings UI');
    assert.equal($('enableSfx').checked, true);
    assert.equal(globalThis.__CHOIR_API__.getConfig().enableSfx,true);

    // Without a Freesound key no effects are chosen, so no LLM or Freesound request is made.
    const textWithCue = 'The page snapped under her thumb.';
    const plan = globalThis.__CHOIR_API__.planParagraph(textWithCue);
    assert.ok(plan.segments.length > 0);
    assert.ok(plan.segments.every(s => s.kind !== 'sfx'));

    audiosPlayed.length = 0;
    nativeRequests.length = 0;
    const playRes = await globalThis.__CHOIR_API__.playParagraph({
      text: textWithCue,
      chatId: 'chat-foley',
      paragraphIndex: 0
    });

    assert.equal(playRes.played,1);assert.equal(audiosPlayed.length,1);assert.equal(freesoundRequests,0);assert.equal(backendRequests.length,0);
    assert.equal(nativeRequests.length,1);assert.equal(nativeRequests[0].text,textWithCue);assert.equal(playRes.warnings,undefined);
    assert.equal($('sfxStatus').hidden,false);assert.match($('sfxStatus').textContent,/Freesound API key/);

    cleanup?.();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});



test('Settings changes (checkboxes and dropdowns) auto-persist globally and across chat switches', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB, Blob: globalThis.Blob, URL: globalThis.URL};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  globalThis.URL = class extends (old.URL || URL) { static createObjectURL() { return 'blob:test-choir'; } static revokeObjectURL() {} };

  globalThis.fetch = async (url) => {
    if (url.includes('/providers')) return new Response(JSON.stringify({ providers: [{ id: 'gemini', capabilities: { parameters: {} } }] }));
    if (url.endsWith('/voices')) return new Response(JSON.stringify({ voices: [{ id: 'Charon', name: 'Charon' }] }));
    return new Response(JSON.stringify({ data: [] }));
  };

  const root = dom.window.document.createElement('div');
  const store = new Map();
  let currentChat = { chatId: 'chat-1', characterId: 'char-1' };
  const ctx = {
    root,
    dom: { addStyle: () => () => {}, getMessageId: () => null },
    characters: { get: async () => ({ name: 'Jack' }) },
    ui: {
      registerDrawerTab: () => ({ root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {} }),
      registerInputBarAction: () => ({ onClick() {}, destroy() {} }),
      mount: () => null
    },
    getActiveChat: () => currentChat,
    messages: { getContent: () => '', getRecent: () => [] },
    settings: {
      get: async (key) => store.get(key) || null,
      set: async (key, val) => { store.set(key, val); }
    },
    state: { subscribe: () => () => {}, get: () => null },
    events: { on: () => () => {} },
    onBackendMessage: () => () => null,
    sendToBackend: () => {}
  };

  try {
    const cleanup = await setup(ctx);
    const $ = name => root.querySelector(`[data-et="${name}"]`);

    // Initially defaults
    assert.equal($('muteNarrator'), null);
    assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(), false);
    assert.equal($('useFastClassifier').checked, false);

    // Companion and drawer changes save without a manual Save settings button.
    globalThis.__CHOIR_API__.setNarratorMuted(true);
    $('plannerMode').value = 'heuristic';
    $('plannerMode').dispatchEvent(new dom.window.Event('change'));
    await tick();

    await until(() => $('saveState').textContent === 'Saved automatically');
    // Verify global settings store was updated
    const globalSaved = store.get('settings:global');
    assert.ok(globalSaved, 'Global settings should be saved');
    assert.equal(globalSaved.muteNarrator, undefined);
    assert.equal(store.get('chat:chat-1').muteNarrator,true);
    assert.equal(globalSaved.useFastClassifier, true);
    assert.equal(globalSaved.plannerMode, 'heuristic');

    // Switch to a brand new chat that never had settings saved
    currentChat = { chatId: 'chat-brand-new', characterId: 'char-2' };
    await tick();

    // Re-simulate setup in new chat or reload
    cleanup?.();

    const root2 = dom.window.document.createElement('div');
    const ctx2 = {
      ...ctx,
      root: root2,
      ui: {
        ...ctx.ui,
        registerDrawerTab: () => ({ root: root2, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {} })
      }
    };
    const cleanup2 = await setup(ctx2);
    const $2 = name => root2.querySelector(`[data-et="${name}"]`);
    await tick();

    // User's choices must be preserved!
    assert.equal($2('muteNarrator'), null);
    assert.equal(globalThis.__CHOIR_API__.isNarratorMuted(), false, 'narrator exclusion belongs to this chat cast');
    assert.equal($2('useFastClassifier').checked, true, 'useFastClassifier should be preserved in new chat / reload');
    assert.equal($2('plannerMode').value, 'heuristic');

    cleanup2?.();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});



test('playParagraph uses attributed character voice when speaker is provided or tagged', async () => {
  const dom = new JSDOM('<body><main></main></body>', {url: 'https://lumiverse.test'});
  const old = {document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch, indexedDB: globalThis.indexedDB, Blob: globalThis.Blob, URL: globalThis.URL};
  globalThis.indexedDB = new (require('fake-indexeddb').IDBFactory)();
  globalThis.document = dom.window.document;
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  globalThis.URL = class extends (old.URL || URL) { static createObjectURL() { return 'blob:test-choir'; } static revokeObjectURL() {} };

  const requests = [];
  class FakeAudio {
    constructor(url) { this.url = url; this.paused = true; }
    play() { this.paused = false; setTimeout(() => this.onended?.(), 2); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;

  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/tts/synthesize')) {
      requests.push(JSON.parse(options.body));
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/wav' } });
    }
    if (url.includes('/providers')) return new Response(JSON.stringify({ providers: [{ id: 'native-prov', capabilities: { parameters: {} } }] }));
    if (url.endsWith('/voices')) {
      return new Response(JSON.stringify({
        voices: [
          { id: 'v-narrator', name: 'Charon' },
          { id: 'v-jay', name: 'Jay' },
          { id: 'v-natsuki', name: 'Natsuki' }
        ]
      }));
    }
    return new Response(JSON.stringify({ data: [{ id: 'conn-native', name: 'Local Engine', provider: 'native-prov', model: 'v1' }] }));
  };

  const root = dom.window.document.createElement('div');
  const store = new Map();
  // Fixed cast: Narrator, Jay (Persona), Natsuki (Character)
  store.set('settings:global', {
    fixed: [
      { speaker: 'Narrator', voice: 'v-narrator', route: 'native:conn-native', style: '' },
      { speaker: 'Jay', voice: 'v-jay', route: 'native:conn-native', style: '' },
      { speaker: 'Natsuki', voice: 'v-natsuki', route: 'native:conn-native', style: '' }
    ],
    mode: 'native',
    connection: 'conn-native'
  });

  const ctx = {
    root,
    dom: { addStyle: () => () => {}, getMessageId: () => null },
    characters: { get: async () => ({ name: 'Natsuki' }) },
    ui: {
      registerDrawerTab: () => ({ root, activate: () => {}, onActivate: (fn) => { fn(); return () => {}; }, destroy: () => {} }),
      registerInputBarAction: () => ({ onClick() {}, destroy() {} }),
      mount: () => null
    },
    getActiveChat: () => ({ chatId: 'chat-jay', characterId: 'char-natsuki' }),
    messages: { getContent: () => '', getRecent: () => [] },
    settings: {
      get: async (key) => store.get(key) || null,
      set: async (key, val) => { store.set(key, val); }
    },
    state: { subscribe: () => () => {}, get: () => null },
    events: { on: () => () => {} },
    onBackendMessage: () => () => null,
    sendToBackend: () => {}
  };

  try {
    const cleanup = await setup(ctx);
    const text = '"I\'m just saying," Jay murmured, keeping his tone quiet. "The stakes feel pretty low."';

    // Play paragraph with speaker "Jay"
    requests.length = 0;
    const res = await globalThis.__CHOIR_API__.playParagraph({
      text,
      speaker: 'Jay',
      chatId: 'chat-jay'
    });

    assert.ok(requests.length >= 1, 'Should synthesize segments');
    // Dialogue requests must use Jay voice (v-jay), NOT Natsuki (v-natsuki)
    const jayReq = requests.find(r => r.voice === 'v-jay');
    assert.ok(jayReq, 'Dialogue must be synthesized with Jay voice v-jay');

    cleanup?.();
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
  }
});

