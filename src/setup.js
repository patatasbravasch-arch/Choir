// Onboarding owns a draft only. All provider, voice and storage operations are
// supplied by Choir's frontend so the wizard cannot diverge from playback.
import { SETUP_GUIDES } from './setup-guides.js';
import { SETUP_CSS, SETUP_LOGO } from './setup-ui.js';
export const ONBOARDING_KEY = 'onboarding:state';
export const SETUP_STEPS = ['Connect', 'Voices', 'Try it'];

export function shouldOpenSetup(state) {
  return !state?.completed && !state?.deferred;
}

export function setupDraft(value, preset, existing) {
  const draft = structuredClone(value);
  for (const [key, fallback] of Object.entries({chunk:1800, prefetch:1, concurrency:1, retention:'forever',
    normalizeLoudness:true, batchSpeech:false, fishVoiceSource:'community'})) draft[key] ??= fallback;
  draft.fixed = ['Narrator','Persona','Character'].map((speaker,index)=>draft.fixed[index] || {speaker,voice:'',style:''});
  if (preset?.leadVoices) draft.fixed = draft.fixed.map((actor, index) => ({...actor, ...preset.leadVoices[index]}));
  if (preset?.npcPolicy) draft.npcPolicy = structuredClone(preset.npcPolicy);
  // Legacy defaults enable Foley without a key. New installations opt in.
  if (!existing) {
    Object.assign(draft, {enableSfx:false, enableAmbience:false, enableMusic:false, autoDesignNPCs:false,
      auto:false, autoPlan:false, allowLlmFallback:false, enableMixer:true, plannerMode:'heuristic', useFastClassifier:true, useJev:false});
    draft.npcPolicy = {...draft.npcPolicy, mode:'skip'};
  }
  delete draft.jevApiKey;
  delete draft.apiKey;
  for(const field of ['mode','model','autoDesignNPCs','allowVoiceFallback'])delete draft[field];
  return draft;
}

// These are structural checks, never evidence that a provider was tested.
export function setupIssues(draft, connections, session = {}) {
  const issues = [];
  const route = `native:${draft.connection}`;
  const requireRoute = (selected, label, step = 1) => {
    const connection = connections.tts.find(item => `native:${item.id}` === selected);
    if (!connection?.model) issues.push({step, message:`Choose an available TTS connection with a model for ${label}.`});
  };
  requireRoute(route, 'Default speech');
  const llm = connections.llm.find(item => draft.planner ? item.id === draft.planner : item.is_default);
  const decision = connections.decision.find(item => draft.decisionConnection ? item.id === draft.decisionConnection : item.is_default);
  if (!['heuristic','jev','llm'].includes(draft.plannerMode)) issues.push({step:1,message:'Choose a planner engine.'});
  if (draft.plannerMode === 'llm' && !llm?.model) issues.push({step:1,message:'Choose an available Planner LLM connection with a model.'});
  if (draft.plannerMode === 'jev' && !decision && !(connections.directJev && session.jev)) issues.push({step:1,message:connections.directJev?'Choose a Decision connection or provide a session Jev key.':'Choose an available Decision connection in Lumiverse’s Connect panel.'});
  if (draft.plannerMode === 'jev' && draft.allowLlmFallback && !llm?.model) issues.push({step:1,message:'LLM fallback needs an available Planner LLM connection with a model.'});
  for (const actor of draft.fixed) {
    if (actor.gender != null && !['auto','female','male','neutral'].includes(actor.gender)) issues.push({step:2,message:`Choose a valid voice gender preference for ${actor.speaker}.`});
    if (actor.excluded) continue;
    requireRoute(draft.connectionMode === 'one' ? route : actor.route || route, actor.speaker, 2);
    if (!actor.voice && draft.plannerMode==='heuristic') issues.push({step:2,message:`Choose a voice for ${actor.speaker}, turn off that voice, or switch to Standard LLM on Connections to let the LLM choose. Heuristic attribution needs an assigned voice.`});
    if (actor===draft.fixed[0] && !actor.voice && jevNeedsNarratorVoice(draft,connections)) issues.push({step:2,message:'Choose a narrator voice for Jev on this connection, turn off narrator speech, or switch to the Standard LLM planner.'});
  }
  const policy = draft.npcPolicy || {mode:'skip'};
  if (policy.mode !== 'skip') requireRoute(draft.connectionMode === 'one' ? route : policy.route || route, 'discovered character speech', 2);
  if (policy.mode === 'single' && !policy.voice) issues.push({step:2,message:'Choose a shared voice.'});
  if (policy.mode === 'preferred' && !policy.voices?.length) issues.push({step:2,message:'Select at least one preferred voice.'});
  if (policy.mode === 'llm' && draft.plannerMode === 'heuristic') issues.push({step:2,message:'Automatic voice selection needs Jev or an LLM planner. Choose shared, preferred, or disabled discovered character speech.'});
  if ((draft.enableSfx || draft.enableAmbience) && !draft.freesoundApiKey?.trim()) issues.push({step:3,message:'Sound effects and ambient sound need a Freesound API key.'});
  if ((draft.enableSfx || draft.enableAmbience || draft.enableMusic) && !llm?.model) issues.push({step:3,message:'Sound effects, ambience, and music need a Planner LLM connection for cue selection.'});
  if (draft.fishVoiceSource != null && !['community','own','both'].includes(draft.fishVoiceSource)) issues.push({step:2,message:'Choose a valid Fish voice source.'});
  if (draft.retention != null && !['session','1','7','30','forever'].includes(draft.retention)) issues.push({step:3,message:'Choose a valid audio retention policy.'});
  for (const [key,min,max,label] of [['prefetch',0,4,'Prefetch passages'],['concurrency',1,4,'Concurrent TTS requests'],['chunk',80,10000,'Max characters per request']]) {
    if (draft[key] != null && (!Number.isInteger(draft[key]) || draft[key]<min || draft[key]>max)) issues.push({step:3,message:`${label} must be a whole number from ${min} to ${max}.`});
  }
  return issues.filter((item,index,all) => all.findIndex(other => other.message === item.message) === index);
}

function isFishConnection(connection) {
  return connection?.provider==='fish_audio' || connection?.provider==='openrouter_tts' && /fish-audio\//i.test(connection.model || '');
}

function jevNeedsNarratorVoice(draft, connections) {
  if(draft.plannerMode!=='jev')return false;
  const route=draft.connectionMode==='one'?`native:${draft.connection}`:draft.fixed[0]?.route || `native:${draft.connection}`;
  const connection=connections.tts.find(item=>`native:${item.id}`===route);
  const community=isFishConnection(connection);
  return !community || draft.fishVoiceSource==='own';
}

// Spindle settings writes are separate requests. Complete last, compensate on
// failure, and leave completion unset if any write fails so retry remains safe.
export async function saveSetupSettings(settings, writes, completedState) {
  const all = [...writes, [ONBOARDING_KEY, completedState]];
  const previous = await Promise.all(all.map(async ([key]) => [key, await settings.get(key)]));
  const applied = [];
  try {
    for (const [key,value] of all) {
      applied.push(key);
      await settings.set(key, structuredClone(value));
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const key of applied.reverse()) {
      const value = previous.find(item => item[0] === key)[1];
      try {
        if (value == null && settings.remove) await settings.remove(key);
        else await settings.set(key, value ?? null);
      } catch { rollbackFailed = true; }
    }
    throw new Error(`Setup could not be saved: ${error.message}.${rollbackFailed ? ' Some settings may have saved; review them and retry.' : ' Previous settings were restored. Retry when storage is available.'}`);
  }
}

export function createSetupWizard(ctx, adapter) {
  let active = null, opening = false, disposed = false, saving = false;
  const removeStyle = ctx.dom.addStyle(SETUP_CSS);
  const report = error => adapter.report(error.message);
  async function open(automatic = false) {
    if (disposed || opening || active || saving) return;
    if (typeof ctx.ui.showModal !== 'function') {
      if (!automatic) adapter.report('Setup needs a Lumiverse staging build with ctx.ui.showModal(). Update Lumiverse and reload.');
      return;
    }
    opening = true;
    let snapshot;
    try {
      const state = await ctx.settings.get(ONBOARDING_KEY);
      if (disposed || automatic && !shouldOpenSetup(state)) return;
      snapshot = await adapter.snapshot();
      if (disposed) return;
      mount(snapshot, state);
    } catch (error) { report(error); }
    finally { opening = false; }
  }
  function mount(snapshot, previousState) {
    const modal = ctx.ui.showModal({title:'Set up Choir', width:800, maxHeight:820, persistent:true});
    const doc = modal.root.ownerDocument;
    const shell = doc.createElement('div');shell.className='choir-setup';shell.dataset.choirSetup='';modal.root.append(shell);
    const draft = setupDraft(snapshot.config, snapshot.preset, snapshot.existing);
    let mode='',helpGuide='',connections = snapshot.connections, step = 0, visited = 1, busy = false, closed = false, completed = false, ctrl = null, renderId = 0, cancellable = false, activeRole = 0;
    const tests = new Map();
    const element = (tag,text,parent) => {const node=doc.createElement(tag);if(text)node.textContent=text;parent?.append(node);return node;};
    // All modes edit this one draft. Switching mode never saves or resets it.
    if(!snapshot.existing){
      const first=(connections.tts || []).find(item=>item.model && item.is_default) || connections.tts.find(item=>item.model);
      if(!connections.tts.some(item=>item.id===draft.connection && item.model) && first)draft.connection=first.id;
      const llm=connections.llm.find(item=>item.model && item.is_default) || connections.llm.find(item=>item.model);
      const decision=connections.decision.find(item=>item.model);
      if(llm){draft.plannerMode='llm';draft.planner=llm.id;draft.useFastClassifier=false;draft.npcPolicy.mode='llm';}
      else if(decision){draft.plannerMode='jev';draft.decisionConnection=decision.id;draft.useJev=true;draft.useFastClassifier=false;draft.npcPolicy.mode='llm';}
    }
    const modes=element('div','',shell);modes.className='cs-modes';modes.setAttribute('aria-label','Setup mode');
    const modeButtons=new Map();
    function chooseMode(value){if(busy || completed)return;mode=value;step=value==='quick'?5:[1,2,3,6,7].includes(step)?step:1;helpGuide='';say('');render();body.scrollTop=0;body.querySelector('h2')?.focus();}
    for(const [key,title] of [['quick','Quick start'],['guided','Guided'],['custom','Custom']]){const node=element('button',title,modes);node.type='button';node.dataset.setupMode=key;node.onclick=()=>chooseMode(key);modeButtons.set(key,node);}
    const nav = element('ol','',shell);nav.className='cs-progress';nav.setAttribute('aria-label','Setup progress');
    const navButtons = SETUP_STEPS.map((title,index) => {
      const li=element('li','',nav),node=element('button','',li);node.type='button';
      element('span',String(index+1),node).setAttribute('aria-hidden','true');element('b',title,node);
      node.setAttribute('aria-label',`Step ${index+1}: ${title}`);node.onclick=()=>navigate(index+1);return node;
    });
    const categories=element('div','',shell);categories.className='cs-categories';categories.setAttribute('aria-label','Setup categories');
    const categoryButtons=[];for(const [target,title] of [[1,'Connections'],[2,'Voices'],[3,'Playback'],[6,'Soundscape'],[7,'Performance & filters']]){const node=element('button',title,categories);node.type='button';node.onclick=()=>navigate(target);categoryButtons.push([target,node]);}
    const caption = element('p','',shell);caption.className='cs-step-caption';
    const body = element('section','',shell);body.dataset.setupBody='';
    const feedback = element('p','',shell);feedback.className='cs-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const actions = element('div','',shell);actions.className='cs-actions';
    const button = (text,parent,action) => {const node=element('button',text,parent);node.type='button';node.onclick=action;return node;};
    const back = button('Back',actions,()=>navigate(step-1));
    const skip = button('Skip for now',actions,()=>task(async()=>{await defer();modal.dismiss();},'Saving your choice…',false));skip.className='cs-skip';
    const cancel = button('Cancel',actions,()=>{if(cancellable){ctrl?.abort();adapter.stopTest();}});cancel.hidden=true;
    const next = button('Next',actions,()=>step>=3?finish():navigate(step+1));next.className='cs-primary';
    const say = (message,error=false) => {if(closed)return;feedback.textContent=message;feedback.classList.toggle('cs-error',error);feedback.setAttribute('role',error?'alert':'status');};
    const session = () => adapter.session();
    const safeError = error => {
      let message=error.message || String(error);
      for(const secret of [session().jev,draft.freesoundApiKey].filter(Boolean)) message=message.split(secret).join('[redacted]');
      return message;
    };
    const lock = () => {
      shell.setAttribute('aria-busy',String(busy));
      for(const node of body.querySelectorAll('input,select,textarea,button'))node.disabled=busy || node.dataset.unavailable==='true';
      navButtons.forEach((node,index)=>{node.disabled=busy || completed || mode==='guided' && index+1>visited;node.setAttribute('aria-current',index+1===(step>3?3:step)?'step':'false');});
      for(const [target,node] of categoryButtons){node.disabled=busy || completed;node.setAttribute('aria-pressed',String(step===target));}
      for(const [key,node] of modeButtons){node.disabled=busy || completed;node.setAttribute('aria-pressed',String(key===mode));}
      back.hidden=step<=1 || step>3 || mode!=='guided' || completed || busy || Boolean(helpGuide);skip.hidden=completed || busy;back.disabled=busy || completed || step<=1;skip.disabled=busy || completed;next.disabled=busy;
      cancel.hidden=!busy || !cancellable;cancel.disabled=!busy || !cancellable;
    };
    async function task(operation,message,canCancel=true) {
      if(busy || closed)return;
      busy=true;cancellable=canCancel;const current=new AbortController();ctrl=current;say(message);lock();
      let aborted;
      const cancellation=new Promise((_,reject)=>{aborted=()=>reject(Object.assign(new Error('Operation cancelled.'),{name:'AbortError'}));current.signal.addEventListener('abort',aborted,{once:true});});
      try {await Promise.race([operation(current.signal),cancellation]);}
      catch(error){if(!closed)say(error.name==='AbortError'?'Operation cancelled.':safeError(error),error.name!=='AbortError');}
      finally {current.signal.removeEventListener('abort',aborted);busy=false;cancellable=false;ctrl=null;if(!closed)lock();}
    }
    async function defer() {
      if(completed || previousState?.completed)return;
      if((await ctx.settings.get(ONBOARDING_KEY))?.completed)return;
      const state={version:1,completed:false,deferred:true};await ctx.settings.set(ONBOARDING_KEY,state);adapter.onState?.(state);
    }
    const cleanup = (persistDismissal = true) => {
      if(closed)return;closed=true;++renderId;ctrl?.abort();adapter.stopTest();active=null;
      unsubDismiss();
      if(persistDismissal && !completed && !saving) void defer().catch(error=>adapter.report(`Could not remember setup dismissal: ${safeError(error)}. You may see setup again on reload.`));
      shell.remove();snapshot=null;
    };
    const unsubDismiss = modal.onDismiss(()=>cleanup());
    active = {dispose(){cleanup(false);modal.dismiss();}};
    function field(label,input,parent,hint,visibleLabel=label) {
      const wrap=element('label',visibleLabel,parent);input.setAttribute('aria-label',label);wrap.append(input);
      if(hint)element('small',hint,wrap);return input;
    }
    function select(label,options,value,parent,onChange,hint) {
      const node=element('select');for(const [id,title] of options){const option=element('option',title,node);option.value=id;}
      if(value && !options.some(item=>item[0]===value)){const missing=element('option',`${value} · unavailable`,node);missing.value=value;}
      node.value=value || '';node.onchange=()=>{onChange(node.value);};return field(label,node,parent,hint);
    }
    function input(label,value,parent,onChange,{password=false,hint='',placeholder=''}={}) {
      const node=element('input');node.type=password?'password':'text';node.value=value || '';node.autocomplete='off';node.placeholder=placeholder;
      node.oninput=()=>onChange(node.value.trim());return field(label,node,parent,hint);
    }
    function check(label,value,parent,onChange,hint) {
      const node=element('input');node.type='checkbox';node.checked=Boolean(value);node.onchange=()=>onChange(node.checked);
      const wrap=element('label','',parent);wrap.className='cs-check';node.setAttribute('aria-label',label);wrap.append(node);const text=element('span',label,wrap);
      if(hint)element('small',hint,text);return node;
    }
    function number(label,key,min,max,parent,hint) {
      const node=element('input');node.type='number';node.min=min;node.max=max;node.step=1;node.value=draft[key];
      node.oninput=()=>{draft[key]=node.value===''?NaN:Number(node.value);};return field(label,node,parent,hint);
    }
    function disclosure(title,parent) {
      const node=element('details','',parent);node.className='cs-guide';element('summary',title,node);return node;
    }
    const defaultRoute = () => `native:${draft.connection}`;
    const effectiveRoute = actor => draft.connectionMode==='one'?defaultRoute():actor.route || defaultRoute();
    const hasFishRoute = () => [...draft.fixed.filter(actor=>!actor.excluded),...(draft.npcPolicy.mode!=='skip'?[draft.npcPolicy]:[])].some(actor=>isFishConnection(connections.tts.find(item=>`native:${item.id}`===effectiveRoute(actor))));
    function changeSpeechRouting(change) {
      const actors=[...draft.fixed,draft.npcPolicy],before=actors.map(effectiveRoute);change();
      actors.forEach((actor,index)=>{if(before[index]!==effectiveRoute(actor)){actor.voice='';if(actor===draft.npcPolicy)actor.voices=[];}});
      tests.delete('tts');render();
    }
    const routes = () => [['','Use default speech connection'],...connections.tts.map(item=>[`native:${item.id}`,`${item.name} · ${item.provider} · ${item.model || 'no model'}`])];
    const signature = kind => JSON.stringify(kind==='planner'?[draft.plannerMode,draft.planner,draft.decisionConnection,draft.allowLlmFallback,Boolean(session().jev)]:[defaultRoute(),draft.connectionMode,draft.fixed[0]?.route,draft.fixed[0]?.voice,draft.fixed[0]?.accent,draft.fixed[0]?.style,draft.fixed[0]?.deliveryMode,draft.fixed[0]?.excluded]);
    function navigate(target) {
      if(busy || completed || ![1,2,3,6,7].includes(target))return;
      if(mode==='guided' && step<3 && target>step){
        const issues=setupIssues(draft,connections,session()).filter(item=>item.step===step);
        if(issues.length){showIssues(issues);return;}
      }
      step=target;visited=Math.max(visited,step);say('');render();body.querySelector('h2')?.focus();
      body.scrollTop=0;modal.root.scrollTop=0;
    }
    function showIssues(issues) {
      if(mode==='quick')mode='guided';
      step=issues[0].step;visited=Math.max(visited,step);
      if(step===2){const index=draft.fixed.findIndex(actor=>issues.some(item=>item.message.includes(actor.speaker)));if(index>=0)activeRole=index;}
      if(step===3)step=issues.some(item=>/Freesound|cue selection/.test(item.message))?6:issues.some(item=>/Prefetch passages|Concurrent TTS requests|Max characters per request/.test(item.message))?7:3;
      render();say(issues.map(item=>item.message).join('\n'),true);body.scrollTop=0;body.querySelector('h2')?.focus();
    }
    function refresh() {
      return task(async signal=>{const latest=await adapter.connections(signal);if(closed || signal.aborted)return;connections=latest;tests.clear();render();say('Connections refreshed. No synthesis or planner test was run.');},'Refreshing connection lists…');
    }
    function testPlanner() {
      const key=signature('planner');
      return task(async signal=>{const result=await adapter.testPlanner(draft,signal);if(closed || signal.aborted)return;tests.set('planner',{key,message:result});say(result);},draft.plannerMode==='heuristic'?'Checking local attribution…':'Sending one planner test request…');
    }
    function testVoice(actor = draft.fixed[0]) {
      if(!actor?.voice){say('This voice is set to automatic selection. Choir chooses it when you plan a reply. Select a specific voice to audition it now.',true);return;}
      const key=signature('tts');
      return task(async signal=>{await adapter.testVoice(draft,actor,signal);if(closed || signal.aborted)return;if(actor===draft.fixed[0])tests.set('tts',{key,message:'A narrator sample was synthesized and played.'});say(`Voice test passed: ${actor.voice}. A sample was synthesized and played.`);},'Synthesizing a short voice sample…');
    }
    function voiceField(actor,parent,label,changed,allowAutomatic=false,onLabel) {
      const row=element('div','',parent),id=renderId;row.className='cs-voice-fields';
      const effective=()=>draft.connectionMode==='one'?defaultRoute():actor.route || defaultRoute();
      const automaticLabel=draft.plannerMode==='jev'?'Let Choir choose (Jev)':'Let the LLM choose';
      const emptyLabel=allowAutomatic?automaticLabel:'Choose a voice';
      let voiceId,catalogue=[];
      const isLead=draft.fixed.includes(actor);
      const paired=element('div','',row);paired.className='cs-voice-choices';
      if(isLead){const gender=select(`${label} voice gender`,[['auto','Any gender'],['female','Female'],['male','Male'],['neutral','Neutral']],actor.gender || 'auto',paired,value=>{actor.gender=value;populate();});gender.parentElement.className='cs-gender';gender.parentElement.firstChild.textContent='Gender preference';}
      const choices=select(`${label} voice`,[['',emptyLabel]],actor.voice,paired,value=>{actor.voice=value;if(voiceId)voiceId.value=value;populate();changed?.();});choices.parentElement.className='cs-voice';choices.parentElement.firstChild.textContent='Voice';
      const note=element('small','Loading voices…',row);
      function populate() {
        const known=new Map(catalogue.map(item=>[item.id,item])),gender=isLead?actor.gender || 'auto':'auto';
        choices.replaceChildren();const empty=element('option',emptyLabel,choices);empty.value='';
        for(const item of known.values()){
          const metadata=['female','male','neutral'].includes(item.gender)?item.gender:'';
          const mismatch=gender!=='auto' && metadata && metadata!==gender;
          if(mismatch && item.id!==actor.voice)continue;
          const description=metadata?metadata[0].toUpperCase()+metadata.slice(1):'Gender unknown';
          const option=element('option',`${item.name || item.id} · ${description}${mismatch?' · selected voice differs from preference':''}`,choices);option.value=item.id;
        }
        if(actor.voice && !known.has(actor.voice)){const option=element('option',`${actor.voice} · custom or saved ID`,choices);option.value=actor.voice;}
        choices.value=actor.voice || '';
        const selected=known.get(actor.voice),mismatch=gender!=='auto' && ['female','male','neutral'].includes(selected?.gender) && selected.gender!==gender;
        note.textContent=[selected?.description,mismatch?'Selected voice differs from the gender preference.':''].filter(Boolean).join(' ');
        if(automaticNote)automaticNote.hidden=Boolean(actor.voice);
        onLabel?.(selected?.name || actor.voice);
      }
      const automaticNote=allowAutomatic && draft.plannerMode!=='heuristic'?element('small','Chosen during planning. Assign a voice to keep its identity and audition it here.',row):null;
      const custom=element('div','',row);custom.className='cs-provider-id';const customToggle=button('Use a provider voice ID',custom,()=>{customField.hidden=!customField.hidden;customToggle.setAttribute('aria-expanded',String(!customField.hidden));});customToggle.setAttribute('aria-expanded','false');const customField=element('div','',custom);customField.hidden=true;
      voiceId=input(`${label} voice ID`,actor.voice,customField,value=>{
        actor.voice=value;populate();changed?.();
      },{hint:'Paste a voice ID from this provider, then test it. This selects an existing voice; it does not create or clone one.'});
      const token=effective();
      void adapter.voices(token).then(list=>{
        if(closed || id!==renderId || token!==effective())return;
        catalogue=list;populate();
      }).catch(error=>{if(!closed && id===renderId){note.textContent=`Voice list unavailable: ${safeError(error)}. Retry or enter a provider voice ID.`;button('Retry voice list',row,()=>{render();});}});
      return choices;
    }
    function externalLink(parent,title,url) {
      const node=element('a',title,parent);node.href=url;node.target='_blank';node.rel='noopener noreferrer';return node;
    }
    function illustratedGuide(parent,id) {
      const link=button(SETUP_GUIDES[id].title+' →',parent,()=>{helpGuide=id;render();body.scrollTop=0;});link.dataset.setupGuideLink=id;link.className='cs-help-link';
    }
    function renderGuide(id){
      const data=SETUP_GUIDES[id],guide=element('section','',body);guide.className='cs-guide';guide.dataset.setupGuide=id;
      button('← Back to setup',guide,()=>{helpGuide='';render();body.scrollTop=0;});element('h3',data.title,guide);
      element('p',data.intro,guide);element('p',data.note,guide).className='cs-hint';
      const steps=element('ol','',guide);steps.className='cs-guide-steps';
      for(const step of data.steps){
        const item=element('li','',steps);item.dataset.guideStep=step.id;
        element('h4',step.title,item);element('p',step.body,item);
        if(step.links?.length){const links=element('div','',item);links.className='cs-guide-links';for(const link of step.links)externalLink(links,link.label,link.url);}
        const figure=element('figure','',item),picture=element('div','',figure);picture.className='cs-guide-picture';picture.dataset.pictureKind=step.kind;
        const image=element('img','',picture);image.src=step.picture;image.alt=step.alt;image.width=step.width;image.height=step.height;image.loading='lazy';image.decoding='async';
        const caption=element('figcaption',step.caption,figure);caption.id=`cs-${step.id}-caption`;picture.setAttribute('aria-describedby',caption.id);
        const toggle=button('Enlarge picture',figure,()=>{
          const enlarged=picture.classList.toggle('cs-picture-large');toggle.textContent=enlarged?'Reduce picture':'Enlarge picture';
          toggle.setAttribute('aria-expanded',String(enlarged));toggle.setAttribute('aria-label',`${enlarged?'Reduce':'Enlarge'} picture: ${step.title}`);
          picture.tabIndex=enlarged?0:-1;if(enlarged)picture.focus();
        });
        toggle.className='cs-picture-toggle';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label',`Enlarge picture: ${step.title}`);
      }
      const help=element('section','',guide);element('h3','If something does not work',help);const items=element('ul','',help);items.className='cs-guide-help';
      for(const message of data.troubleshooting)element('li',message,items);
      const sources=element('div','',guide);sources.className='cs-guide-links';
      for(const link of data.sources)externalLink(sources,link.label,link.url);
    }
    function render() {
      ++renderId;body.replaceChildren();
      shell.dataset.setupComplete=String(completed);shell.dataset.setupMode=mode || 'choose';modes.hidden=!mode || completed;categories.hidden=completed || mode!=='custom' || Boolean(helpGuide);nav.hidden=completed || mode==='custom' || !mode || mode==='quick' || Boolean(helpGuide);caption.hidden=completed || !mode || mode==='quick' || Boolean(helpGuide);
      caption.textContent=mode==='custom'?'Edit any category. Save when you are ready.':`Step ${step>3?3:step} of 3 · ${SETUP_STEPS[(step>3?3:step)-1] || ''}`;
      const titles={0:'Choose your setup',1:'Connect',2:'Voices',3:mode==='custom'?'Playback':'Try it',5:'Quick start',6:'Soundscape',7:'Performance & text filters'};
      const heading=element('h2',completed?'Choir is ready':helpGuide?SETUP_GUIDES[helpGuide].title:titles[step],body);heading.tabIndex=-1;
      next.hidden=!mode || Boolean(helpGuide);next.textContent=completed?'Close':mode==='custom'?'Save setup':step>=3?'Finish setup':'Next';next.onclick=completed?()=>modal.dismiss():()=>mode==='custom' || step>=3?finish():navigate(step+1);
      if(helpGuide){renderGuide(helpGuide);lock();return;}
      const section=(title,parent=body)=>{const node=element('section','',parent);node.className='cs-section';node.dataset.setupSection=title;element('h3',title,node);return node;};
      const card=(title,parent=body)=>{const node=element('section','',parent);node.className='cs-card';element('h3',title,node);return node;};
      const row=parent=>{const node=element('div','',parent);node.className='cs-row';return node;};
      const changeVoice=()=>tests.delete('tts');
      const delivery=(actor,index)=>['auto','base','off'].includes(actor.deliveryMode)?actor.deliveryMode:index===0?'base':'auto';
      const voiceNames=['Narrator','Persona','Main character'];
      const routeName=token=>connections.tts.find(item=>`native:${item.id}`===token)?.name || 'Unavailable connection';
      const brand=parent=>{const logo=element('img','',parent);logo.className='cs-logo';logo.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(SETUP_LOGO)}`;logo.alt='';logo.width=60;logo.height=96;};
      if(completed){
        const hero=row(body);hero.classList.add('cs-hero');brand(hero);
        element('p','Your preferences and voice defaults are saved.',hero).className='cs-lead';
        const steps=element('ol','',body);steps.className='cs-map';
        for(const [index,title,detail] of [[1,'Plan a reply','Open Choir and select Plan latest.'],[2,'Listen','Press Play in the message controls or mixer.'],[3,'Make it yours','Adjust voices in Cast; change mixer controls in Playback.']]){
          const li=element('li','',steps);element('span',String(index),li).className='cs-map-number';const info=element('div','',li);element('strong',title,info);element('small',detail,info);
        }
        element('p','New chats use these voice defaults. Existing chats keep their voices; use Settings → Cast tools → Apply default to replace them.',body).className='cs-hint';
        const actor=draft.fixed.find(actor=>!actor.excluded && actor.voice);
        if(actor){button('Test final playback',body,()=>testVoice(actor));element('small','Optional: synthesizes and plays one short sample. Provider charges may apply.',body);}
        lock();return;
      }
      if(step===0){
        const hero=row(body);hero.classList.add('cs-hero');brand(hero);element('p','Give your story a voice.',hero).className='cs-lead';
        element('p','Use connections already saved in Lumiverse. Choose how much guidance you want.',body);
        const choices=element('div','',body);choices.className='cs-mode-cards';
        for(const [key,title,detail] of [['quick','Quick start','One screen: speech provider, narrator voice and automatic character voices.'],['guided','Guided setup','Three short steps: connect, choose voices, then try your setup.'],['custom','Custom setup','Open categories directly and adjust every preference at your own pace.']]){
          const choice=button('',choices,()=>chooseMode(key));choice.dataset.setupChoose=key;choice.setAttribute('aria-label',title);element('strong',title,choice);element('small',detail,choice);element('span','→',choice);
        }
        if(snapshot.existing)element('p','Your existing setup was found. We will start from it and preserve your chat casts.',body).className='cs-notice';
        element('p','Nothing changes until you finish. Tests are optional, may incur provider charges, and only run when you press Test.',body).className='cs-hint';
      } else if(step===5){
        element('p','Start with speech. Soundscapes, accents and mixer controls are available in Guided or Custom.',body).className='cs-hint';
        const connectionsCard=card('Connect');
        select('Default TTS connection',[['','Choose a connection'],...connections.tts.map(item=>[item.id,item.name])],draft.connection,connectionsCard,value=>changeSpeechRouting(()=>{draft.connection=value;}));
        select('Planner engine',[['llm','LLM · best for several speakers'],['jev','Jev · fast speaker detection'],['heuristic','Local · simple scenes, manual voices']],draft.plannerMode,connectionsCard,value=>{draft.plannerMode=value;draft.useFastClassifier=value==='heuristic';draft.useJev=value==='jev';if(value==='heuristic' && draft.npcPolicy.mode==='llm')draft.npcPolicy.mode='skip';tests.delete('planner');render();});
        if(draft.plannerMode==='llm')select('Planner LLM connection',[['','Default LLM connection'],...connections.llm.map(item=>[item.id,item.name])],draft.planner,connectionsCard,value=>{draft.planner=value;tests.delete('planner');});
        if(draft.plannerMode==='jev')select('Decision connection',[['','Default Decision connection'],...connections.decision.map(item=>[item.id,item.name])],draft.decisionConnection,connectionsCard,value=>{draft.decisionConnection=value;tests.delete('planner');});
        element('small',draft.plannerMode==='heuristic'?'Local speaker detection makes no planner request. Assign every role a voice in Guided or Custom.':'Speaker detection uses your selected connection. Provider charges may apply.',connectionsCard);
        if(!connections.tts.length)element('p','Add a TTS connection in Lumiverse’s Connect panel, then refresh below.',connectionsCard).className='cs-notice';
        const narrator=card('Narrator');
        if(draft.connectionMode==='several' && draft.fixed[0].route)select('Narrator connection',routes(),draft.fixed[0].route,narrator,value=>{draft.fixed[0].route=value;draft.fixed[0].voice='';render();});
        check('Enable narrator speech',!draft.fixed[0].excluded,narrator,value=>{draft.fixed[0].excluded=!value;tests.delete('tts');});
        voiceField(draft.fixed[0],narrator,'Narrator',()=>tests.delete('tts'),draft.plannerMode!=='heuristic' && !jevNeedsNarratorVoice(draft,connections));
        if(draft.plannerMode!=='heuristic')check('Choose new character voices automatically',draft.npcPolicy.mode==='llm',narrator,value=>{draft.npcPolicy.mode=value?'llm':'skip';},'Existing assigned voices stay saved. Other automatic roles are chosen when you plan a reply.');
        const tools=row(body);button('Test narrator voice',tools,()=>testVoice());button('Refresh connections',tools,refresh);
        illustratedGuide(body,'fish');element('small','Finish saves preferences and voice defaults for new chats. Existing chats keep their voices. Saving makes no planner or speech request.',body);
      } else if(step===1){
        element('p','Choose where speech comes from and how Choir identifies speakers.',body);
        const grid=element('div','',body);grid.className='cs-grid';
        const speech=card('Speech provider',grid);
        select('Default TTS connection',[['','Choose a connection'],...connections.tts.map(item=>[item.id,item.name])],draft.connection,speech,value=>changeSpeechRouting(()=>{draft.connection=value;}));
        const selected=connections.tts.find(item=>item.id===draft.connection);
        element('small',selected?`${selected.provider} · ${selected.model || 'Choose a model in Connect'}`:'Add a TTS connection in Lumiverse’s Connect panel to continue.',speech);
        element('p','API keys and models are managed in Lumiverse. Test speech with a voice on the next step.',speech).className='cs-hint';
        select('Voice connection mode',[['one','One connection for the whole cast'],['several','A connection for each character']],draft.connectionMode,speech,value=>changeSpeechRouting(()=>{draft.connectionMode=value;}));
        const planner=card('Speaker detection',grid);
        select('Planner engine',[['heuristic','Heuristic · local'],['jev','Jev · Decision connection'],['llm','Standard LLM planner']],draft.plannerMode,planner,value=>{draft.plannerMode=value;draft.useFastClassifier=value==='heuristic';draft.useJev=value==='jev';tests.delete('planner');render();});
        element('p',draft.plannerMode==='heuristic'?'For narration and simple dialogue. Assign every speaking role a voice; ambiguous speakers may need manual help.':draft.plannerMode==='jev'?'Classifies dialogue using a Decision connection. Provider charges may apply.':'Identifies speakers and can choose voices. Planning uses your LLM and may incur charges.',planner).className='cs-hint';
        if(draft.plannerMode==='jev'){
          select('Decision connection',[['','Default Decision connection'],...connections.decision.map(item=>[item.id,`${item.name} · ${item.model || 'Jev'}`])],draft.decisionConnection,planner,value=>{draft.decisionConnection=value;tests.delete('planner');});
          check('Allow LLM fallback after Jev fails',draft.allowLlmFallback,planner,value=>{draft.allowLlmFallback=value;tests.delete('planner');render();},'A failed classification can add a paid LLM request.');
          if(connections.directJev){
            const advanced=disclosure('Session Jev key for older Lumiverse hosts',planner);
            input('Jev session API key',session().jev,advanced,value=>{adapter.setSession('jev',value);tests.delete('planner');},{password:true,hint:'Only for hosts without Decision APIs. Never saved.'});
          }
        }
        if(draft.plannerMode==='llm' || draft.plannerMode==='jev' && draft.allowLlmFallback){
          select('Planner LLM connection',[['','Default LLM connection'],...connections.llm.map(item=>[item.id,`${item.name} · ${item.model || 'no model'}`])],draft.planner,planner,value=>{draft.planner=value;tests.delete('planner');});
        }
        button('Test planner connection',planner,testPlanner);element('small',draft.plannerMode==='heuristic'?'Checks local attribution. No planner API request.':'Optional: sends one small planner request.',planner);
        const help=section('Connections & help');
        const tools=row(help);element('p','Add or edit connections in Lumiverse’s Connect panel, then refresh this list.',tools).className='cs-hint';
        button('Refresh connections',tools,refresh);button('Configure connections later',tools,()=>task(async()=>{await defer();modal.dismiss();adapter.connectionGuide();},'Saving your choice…',false));
        for(const error of connections.errors || [])element('p',error,help).className='cs-error';
        illustratedGuide(help,'fish');
      } else if(step===2){
        element('p','Voice defaults for new chats. Select a role to edit.',body);
        const picker=element('div','',body);picker.className='cs-role-picker';picker.setAttribute('aria-label','Voice roles');
        const panels=[],roleButtons=[],summaries=[];
        const updateRoles=()=>draft.fixed.forEach((actor,index)=>{const summary=summaries[index];if(summary){summary.textContent=actor.excluded?'Speech off':actor.voice && summary.dataset.voiceId===actor.voice?summary.dataset.voiceName:actor.voice || (draft.plannerMode==='heuristic'?'Choose a voice':'Automatic voice');summary.title=summary.textContent;}});
        const showRole=index=>{activeRole=index;panels.forEach((panel,i)=>panel.hidden=i!==index);roleButtons.forEach((node,i)=>node.setAttribute('aria-pressed',String(i===index)));};
        draft.fixed.forEach((actor,index)=>{
          const name=voiceNames[index],choice=button('',picker,()=>showRole(index));choice.setAttribute('aria-label',`Edit ${name.toLowerCase()} setup voice`);element('strong',index===2?'Character':name,choice);summaries.push(element('small','',choice));roleButtons.push(choice);
        });
        draft.fixed.forEach((actor,index)=>{
          const name=voiceNames[index],panel=element('section','',body);panel.className='cs-card';panel.dataset.setupRole=String(index);panel.setAttribute('aria-label',`${name} voice settings`);panels.push(panel);
          const title=element('div','',panel);title.className='cs-voice-title';element('h3',name,title);
          const enabled=check(`Enable ${name.toLowerCase()} speech`,!actor.excluded,title,value=>{actor.excluded=!value;fishSourceWrap.hidden=!hasFishRoute();changeVoice();updateRoles();});enabled.nextElementSibling.firstChild.textContent='Enable speech';
          if(draft.connectionMode==='several')select(`${name} connection`,routes(),actor.route || '',panel,value=>{actor.route=value;actor.voice='';changeVoice();render();});
          voiceField(actor,panel,name,()=>{changeVoice();updateRoles();},draft.plannerMode!=='heuristic' && (index!==0 || !jevNeedsNarratorVoice(draft,connections)),label=>{const summary=summaries[index];summary.dataset.voiceId=actor.voice;summary.dataset.voiceName=label || '';updateRoles();});
          const customId=panel.querySelector('.cs-provider-id');
          const acting=element('div','',panel);acting.className='cs-grid';
          const accent=input(`${name} accent`,actor.accent,acting,value=>{actor.accent=value;changeVoice();},{placeholder:'e.g. light Irish accent'});accent.maxLength=300;accent.parentElement.firstChild.textContent='Accent preference';
          const mode=select(`${name} delivery`,[['auto','Automatic acting'],['base','Base style only'],['off','No tone directions']],delivery(actor,index),acting,value=>{actor.deliveryMode=value;changeVoice();});mode.parentElement.firstChild.textContent='Delivery';
          const style=input(`${name} base delivery`,actor.style,panel,value=>{actor.style=value;changeVoice();},{placeholder:index===0?'e.g. calm, measured narration':'e.g. warm, direct',hint:'Automatic adds planner acting. Base style only ignores planner emotions; accents stay active. Accent accuracy depends on the voice and provider.'});style.parentElement.firstChild.textContent='Base delivery style (optional)';
          panel.append(customId);
          button(`Test ${name.toLowerCase()} voice`,panel,()=>testVoice(actor));element('small','Optional: generates and plays a short sample. Provider charges may apply.',panel);
        });
        updateRoles();showRole(activeRole);
        const connection=row(body);element('p',`Default speech: ${routeName(defaultRoute())}`,connection).className='cs-hint';button('Change connection',connection,()=>navigate(1));
        const fishSourceWrap=element('div','',body);fishSourceWrap.hidden=!hasFishRoute();
        select('Voices the planner picks from',[['community','Fish community library'],['own','My Fish voices'],['both','Both']],draft.fishVoiceSource,fishSourceWrap,value=>{draft.fishVoiceSource=value;render();},'For automatic Fish casting. Explicit assignments stay unchanged. Add your provider voice IDs above or in Cast.');
        const npc=section('New speakers');
        const policy=draft.npcPolicy;
        select('Automatic casting',[['skip','Disabled · assign new speakers yourself'],['single','Shared voice'],['preferred','Preferred voices'],['llm','Automatic selection']],policy.mode,npc,value=>{policy.mode=value;render();});
        if(policy.mode!=='skip' && draft.connectionMode==='several')select('Casting connection',routes(),policy.route || '',npc,value=>{policy.route=value;policy.voice='';policy.voices=[];render();});
        if(policy.mode==='single')voiceField(policy,npc,'Shared');
        if(policy.mode==='preferred'){
          input('Preferred voice IDs',(policy.voices || []).join(', '),npc,value=>{policy.voices=value.split(',').map(id=>id.trim()).filter(Boolean);},{hint:'Comma-separated IDs from this casting connection.'});
          const id=renderId;void adapter.voices(effectiveRoute(policy)).then(list=>{if(!closed && id===renderId)element('small',`Available: ${list.map(item=>item.id).join(', ')}`,npc);}).catch(error=>{if(!closed && id===renderId)say(safeError(error),true);});
        }
        element('p',policy.mode==='skip'?'Unassigned new speakers stay silent until you give them a voice.':policy.mode==='llm'?'Automatic selection needs Jev or an LLM and may incur planner charges.':'Shared and preferred voices can be used with local heuristic attribution.',npc).className='cs-hint';
      } else if(step===3){
        element('p','Choose everyday controls. Soundscapes and automation are optional.',body);
        const playback=card('Playback & saved audio',body);
        const controls=element('div','',playback);controls.className='cs-grid';
        check('Floating audio mixer',draft.enableMixer,controls,value=>{draft.enableMixer=value;});
        check('Show message play controls',draft.sectionButtons,controls,value=>{draft.sectionButtons=value;});
        check('Match passage loudness',draft.normalizeLoudness,playback,value=>{draft.normalizeLoudness=value;},'Reduce volume differences between speech passages.');
        select('Audio retention for new recordings',[['session','This session only'],['1','1 day'],['7','7 days'],['30','30 days'],['forever','Indefinitely']],draft.retention,playback,value=>{draft.retention=value;},'Audio is saved on this device for replay and download. For existing recordings, change Audio retention in Saved.');
        const reading=section('Reading',body);
        select('Highlight spoken text',[['off','Off'],['passage','Passage'],['word','Word by word']],draft.readAlong || 'off',reading,value=>{draft.readAlong=value;});
        check('Follow narration',Boolean(draft.followNarration),reading,value=>{draft.followNarration=value;},'Keep the spoken passage in view.');
        const automation=section('Automatic replies',body),automatic=row(automation);
        check('Auto-plan new replies',draft.autoPlan,automatic,value=>{draft.autoPlan=value;});
        check('Auto-play new replies',draft.auto,automatic,value=>{draft.auto=value;});
        element('small','Automatic planning and speech can incur provider charges. Nothing plays or calls a planner while saving setup.',automation);
        const summary=section('Your choices');
        const selectedPlanner=(draft.plannerMode==='jev'?connections.decision:connections.llm).find(item=>draft.plannerMode==='jev'?(draft.decisionConnection?item.id===draft.decisionConnection:item.is_default):(draft.planner?item.id===draft.planner:item.is_default));
        element('p',draft.plannerMode==='heuristic'?'Local speaker detection':`${draft.plannerMode==='jev'?'Jev':'LLM'} · ${selectedPlanner?.name || 'Default connection'} · ${selectedPlanner?.model || ''}`,summary).className='cs-hint';
        element('p',draft.fixed.map((actor,index)=>`${voiceNames[index]}: ${actor.excluded?'off':actor.voice || (draft.plannerMode==='llm'?'LLM chooses during planning':'Choir chooses during planning')}`).join(' · '),summary).className='cs-hint';
        const editVoice=button('Edit voices',summary,()=>navigate(2));editVoice.setAttribute('aria-label','Edit narrator');
        const trying=section('Try your setup',body),tryButtons=row(trying);button('Test planner connection',tryButtons,testPlanner);button('Test narrator voice',tryButtons,()=>testVoice());element('small','Optional: provider tests may incur charges. You can finish without running them.',trying);
        for(const kind of ['tts','planner']){const test=tests.get(kind);element('small',test?.key===signature(kind)?`${kind==='tts'?'Speech':'Planner'} test passed: ${test.message}`:`${kind==='tts'?'Speech':'Planner'} connection has not been tested with these choices.`,trying);}
        const more=section('Optional settings');button('Soundscape →',more,()=>navigate(6));button('Performance & text filters →',more,()=>navigate(7));
      } else if(step===6){
        button('← Back to playback',body,()=>navigate(3));
        const sound=section('Soundscape',body),toggles=row(sound);
        check('Sound effects',draft.enableSfx,toggles,value=>{draft.enableSfx=value;updateSound();});
        check('Ambient sound',draft.enableAmbience,toggles,value=>{draft.enableAmbience=value;updateSound();});
        check('Background music',draft.enableMusic,toggles,value=>{draft.enableMusic=value;updateSound();});
        const requirements=element('div','',sound),freesound=element('div','',requirements);
        input('Freesound API key',draft.freesoundApiKey,freesound,value=>{draft.freesoundApiKey=value;},{password:true,hint:'Required for sound effects and ambience. Saved in Choir preferences.'});
        select('Sound cue LLM connection',[['','Default LLM connection'],...connections.llm.map(item=>[item.id,`${item.name} · ${item.model || 'no model'}`])],draft.planner,requirements,value=>{draft.planner=value;tests.delete('planner');});
        element('small','Sound cue selection uses your LLM and may incur charges. Music needs no Freesound key.',requirements);
        const loop=element('div','',sound);check('Loop music between replies',draft.loopMusic,loop,value=>{draft.loopMusic=value;});
        function updateSound(){requirements.hidden=!(draft.enableSfx || draft.enableAmbience || draft.enableMusic);freesound.hidden=!(draft.enableSfx || draft.enableAmbience);loop.hidden=!draft.enableMusic;}
        updateSound();illustratedGuide(sound,'freesound');
      } else if(step===7){
        button('Back to playback',body,()=>navigate(3));
        const buffering=section('Buffering and request limits',body);
        element('p','Lookahead prepares speech before you reach it. More requests can reduce gaps, but can generate unused audio and increase provider load.',buffering).className='cs-hint';
        const numbers=element('div','',buffering);numbers.className='cs-grid';
        number('Prefetch passages','prefetch',0,4,numbers,'0 turns lookahead off. Try 2 for faster playback.');
        number('Concurrent TTS requests','concurrency',1,4,numbers,'Try 2 if your provider permits it.');
        number('Max characters per request','chunk',80,10000,buffering,'Smaller requests can start sooner, but require more calls.');
        check('Group speech requests',draft.batchSpeech,buffering,value=>{draft.batchSpeech=value;},'Combines compatible passages into fewer calls. Gemini can use two speakers per call, including the narrator. Loudness matching balances the shared Gemini clip. A voice gap, different channel volumes or character speeds keep voices separate. Requires multi-speaker support on your Lumiverse server.');
        const filtering=section('Text filters',body);
        check('Skip non-story blocks',draft.skipMeta!==false,filtering,value=>{draft.skipMeta=value;},'Filter trackers, recaps and interface panels. LLM and Jev modes can also run a planner check.');
        const skipped=element('textarea');skipped.rows=2;skipped.value=draft.ignoredTags || '';skipped.placeholder='summary, .status-panel, #phone-panel';skipped.oninput=()=>{draft.ignoredTags=skipped.value;};
        field('Skip tags and blocks',skipped,filtering,'Tag names, classes or IDs, separated by commas. Applies across chats.');
        check('Show automatic planning shortcut',draft.showAutoPlanAction,body,value=>{draft.showAutoPlanAction=value;},'Shows a shortcut; does not turn Auto-plan on.');
        element('p','Set name pronunciation in the character’s Cast editor after setup.',body).className='cs-hint';
      }
      lock();
    }

    function finish() {
      const issues=setupIssues(draft,connections,session());
      if(issues.length){showIssues(issues);return;}
      return task(async signal=>{
        let committing=false;
        try {
        // Re-read connections to catch deleted connections before committing.
        const latestConnections=await adapter.connections(signal);
        if(closed || signal.aborted)return;
        connections=latestConnections;
        const latest=setupIssues(draft,connections,session());
        if(latest.length)throw new Error(latest.map(item=>item.message).join('\n'));
        await adapter.save(draft,snapshot.config,signal,()=>{committing=true;saving=true;cancellable=false;lock();});
        if(closed || signal.aborted)return;
        completed=true;adapter.onState?.({completed:true,deferred:false});if(!closed){render();say('Setup completed successfully.');}
        } finally {if(committing)saving=false;}
      },'Validating and saving setup…');
    }
    render();
  }
  return {open, async start(){await open(true);}, dispose(){disposed=true;active?.dispose();removeStyle();}};
}
