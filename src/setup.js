// Onboarding owns a draft only. All provider, voice and storage operations are
// supplied by Choir's frontend so the wizard cannot diverge from playback.
export const ONBOARDING_KEY = 'onboarding:state';
export const SETUP_STEPS = ['Welcome', 'Connections', 'TTS & Voices', 'Optional Features', 'Review'];

export function shouldOpenSetup(state) {
  return !state?.completed && !state?.deferred;
}

export function setupDraft(value, preset, existing) {
  const draft = structuredClone(value);
  draft.fixed = ['Narrator','Persona','Character'].map((speaker,index)=>draft.fixed[index] || {speaker,voice:'',style:''});
  if (preset?.leadVoices) draft.fixed = draft.fixed.map((actor, index) => ({...actor, ...preset.leadVoices[index]}));
  if (preset?.npcPolicy) draft.npcPolicy = structuredClone(preset.npcPolicy);
  // Legacy defaults enable Foley without a key. New installations opt in.
  if (!existing) {
    Object.assign(draft, {enableSfx:false, enableAmbience:false, enableMusic:false, autoDesignNPCs:false,
      auto:false, autoPlan:false, plannerMode:'heuristic', useFastClassifier:true, useJev:false});
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
  const requireRoute = (selected, label) => {
    const connection = connections.tts.find(item => `native:${item.id}` === selected);
    if (!connection?.model) issues.push({step:1, message:`Choose an available TTS connection with a model for ${label}.`});
  };
  requireRoute(route, 'Default speech');
  const llm = connections.llm.find(item => draft.planner ? item.id === draft.planner : item.is_default);
  const decision = connections.decision.find(item => draft.decisionConnection ? item.id === draft.decisionConnection : item.is_default);
  if (!['heuristic','jev','llm'].includes(draft.plannerMode)) issues.push({step:1,message:'Choose a planner engine.'});
  if (draft.plannerMode === 'llm' && !llm?.model) issues.push({step:1,message:'Choose an available Planner LLM connection with a model.'});
  if (draft.plannerMode === 'jev' && !decision && !(connections.directJev && session.jev)) issues.push({step:1,message:connections.directJev?'Choose a Decision connection or provide a session Jev key.':'Choose an available Decision connection in Lumiverse’s Connect panel.'});
  for (const actor of draft.fixed) {
    if (actor.excluded) continue;
    requireRoute(draft.connectionMode === 'one' ? route : actor.route || route, actor.speaker);
    if (!actor.voice && draft.plannerMode==='heuristic') issues.push({step:2,message:`Choose a voice for ${actor.speaker}, turn off that voice, or switch to Standard LLM on Connections to let the LLM choose. Heuristic attribution needs an assigned voice.`});
  }
  const policy = draft.npcPolicy || {mode:'skip'};
  if (policy.mode !== 'skip') requireRoute(draft.connectionMode === 'one' ? route : policy.route || route, 'NPC speech');
  if (policy.mode === 'single' && !policy.voice) issues.push({step:2,message:'Choose a shared NPC voice.'});
  if (policy.mode === 'preferred' && !policy.voices?.length) issues.push({step:2,message:'Select at least one preferred NPC voice.'});
  if (policy.mode === 'llm' && draft.plannerMode === 'heuristic') issues.push({step:2,message:'Automatic NPC voice selection needs Jev or an LLM planner. Choose shared, preferred, or disabled NPC speech.'});
  if ((draft.enableSfx || draft.enableAmbience) && !draft.freesoundApiKey?.trim()) issues.push({step:3,message:'Sound effects and ambient sound need a Freesound API key.'});
  if ((draft.enableSfx || draft.enableAmbience || draft.enableMusic) && !llm?.model) issues.push({step:3,message:'Sound effects, ambience, and music need a Planner LLM connection for cue selection.'});
  return issues.filter((item,index,all) => all.findIndex(other => other.message === item.message) === index);
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
  const removeStyle = ctx.dom.addStyle(`
    .choir-setup{font:inherit;line-height:1.5;color:var(--lumiverse-text,inherit);min-width:0;display:flex;flex-direction:column;max-height:min(700px,calc(100dvh - 150px))}
    .choir-setup [data-setup-body]{min-height:0;overflow:auto;padding-right:4px}
    .choir-setup .cs-progress,.choir-setup .cs-actions,.choir-setup .cs-feedback{flex-shrink:0}
    .choir-setup *{box-sizing:border-box}
    .choir-setup [hidden]{display:none!important}
    .choir-setup h2{font-size:1.35em;margin:0 0 10px;letter-spacing:-.02em}
    .choir-setup h3{font-size:1em;margin:0 0 8px}
    .choir-setup p{margin:8px 0 16px}
    .choir-setup small,.choir-setup .cs-hint{color:var(--lumiverse-text-muted,inherit);font-size:.88em}
    .choir-setup small{display:block;margin-top:6px}
    .choir-setup .cs-progress{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:0 0 24px;padding:0;list-style:none}
    .choir-setup .cs-progress button{width:100%;padding:9px 4px;font-size:.8em;display:grid;justify-items:center;gap:5px;background:transparent}
    .choir-setup .cs-progress span{display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--lumiverse-border,#8886);border-radius:50%}
    .choir-setup .cs-progress [aria-current="step"]{color:var(--lumiverse-primary,inherit);border-color:var(--lumiverse-primary,#888)}
    .choir-setup .cs-progress [aria-current="step"] span{background:var(--lumiverse-primary-010,#8882);border-color:currentColor}
    .choir-setup .cs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .choir-setup .cs-card{background:var(--lumiverse-fill-subtle,#8881);border:1px solid var(--lumiverse-border,#8884);border-radius:12px;padding:16px;margin:0 0 14px;min-width:0}
    .choir-setup .cs-guide{margin:12px 0 18px;font-size:.92em}
    .choir-setup .cs-guide summary{cursor:pointer;font-weight:600}
    .choir-setup .cs-guide ol{padding-left:22px;margin:12px 0;list-style:decimal}
    .choir-setup .cs-guide li{display:list-item;list-style:decimal;margin:8px 0;overflow-wrap:anywhere}
    .choir-setup .cs-guide a{color:var(--lumiverse-primary,inherit);text-decoration:underline;text-underline-offset:3px}
    .choir-setup label{display:flex;flex-direction:column;gap:6px;margin:8px 0;font-size:.92em;min-width:0}
    .choir-setup input,.choir-setup select,.choir-setup textarea{font:inherit;width:100%;min-width:0;min-height:42px;padding:8px 10px;border:1px solid var(--lumiverse-border,#8886);border-radius:8px;background:var(--lumiverse-bg-elevated,transparent);color:inherit}
    .choir-setup option{background:var(--lumiverse-bg,Canvas);color:var(--lumiverse-text,CanvasText)}
    .choir-setup button{font:inherit;min-height:42px;padding:8px 14px;border:1px solid var(--lumiverse-border,#8886);border-radius:8px;background:var(--lumiverse-fill,#8881);color:inherit;cursor:pointer}
    .choir-setup button:hover:enabled{background:var(--lumiverse-fill-hover,#8882);border-color:var(--lumiverse-primary,#888)}
    .choir-setup button:disabled{opacity:.5;cursor:default}
    .choir-setup :focus-visible{outline:2px solid var(--lumiverse-primary,currentColor);outline-offset:3px}
    .choir-setup .cs-primary{background:var(--lumiverse-primary-010,#8883);border-color:var(--lumiverse-primary,#888);font-weight:600}
    .choir-setup .cs-check{flex-direction:row;align-items:center;gap:10px}
    .choir-setup .cs-check input{width:18px;min-height:18px;flex-shrink:0;accent-color:var(--lumiverse-primary)}
    .choir-setup .cs-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:14px 0 0;margin-top:12px;border-top:1px solid var(--lumiverse-border,#8884)}
    .choir-setup .cs-actions .cs-primary{margin-left:auto}
    .choir-setup .cs-feedback{white-space:pre-line;overflow-wrap:anywhere;min-height:1.5em}
    .choir-setup .cs-error{color:var(--lumiverse-danger,#c05252)}
    .choir-setup .cs-review{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .choir-setup .cs-review small{display:block;overflow-wrap:anywhere}
    .choir-setup .cs-status{border:1px solid var(--lumiverse-border,#8885);border-radius:20px;padding:3px 10px;white-space:nowrap;font-size:.8em}
    .choir-setup .cs-mark{font-size:2.1em;color:var(--lumiverse-primary,inherit);margin-bottom:10px}
    @media(max-width:560px){.choir-setup .cs-grid{grid-template-columns:1fr}.choir-setup .cs-progress button{font-size:.68em;padding:6px 1px}.choir-setup .cs-card{padding:12px}.choir-setup .cs-review{flex-wrap:wrap}.choir-setup input,.choir-setup select,.choir-setup textarea{font-size:16px}.choir-setup .cs-actions{gap:6px}.choir-setup .cs-actions button{flex:1;padding:8px 6px;font-size:.9em;white-space:nowrap}.choir-setup .cs-actions .cs-primary{margin-left:0}}
    @media(max-width:400px){.choir-setup .cs-progress b{display:none}.choir-setup .cs-progress button{padding:6px 2px;gap:0}}
    @media(prefers-reduced-motion:reduce){.choir-setup *{scroll-behavior:auto}}
  `);
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
    const modal = ctx.ui.showModal({title:'Set up Choir', width:760, maxHeight:820, persistent:true});
    const doc = modal.root.ownerDocument;
    const shell = doc.createElement('div');shell.className='choir-setup';shell.dataset.choirSetup='';modal.root.append(shell);
    const draft = setupDraft(snapshot.config, snapshot.preset, snapshot.existing);
    let connections = snapshot.connections, step = 0, visited = 0, busy = false, closed = false, completed = false, ctrl = null, renderId = 0;
    const tests = new Map();
    const element = (tag,text,parent) => {const node=doc.createElement(tag);if(text)node.textContent=text;parent?.append(node);return node;};
    const nav = element('ol','',shell);nav.className='cs-progress';nav.setAttribute('aria-label','Setup progress');
    const navButtons = SETUP_STEPS.map((title,index) => {
      const li=element('li','',nav),button=element('button','',li);button.type='button';
      element('span',String(index+1),button).setAttribute('aria-hidden','true');element('b',title,button);
      button.setAttribute('aria-label',`Step ${index+1}: ${title}`);button.onclick=()=>navigate(index);return button;
    });
    const body = element('section','',shell);body.dataset.setupBody='';
    const feedback = element('p','',shell);feedback.className='cs-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const actions = element('div','',shell);actions.className='cs-actions';
    const button = (text,parent,action) => {const node=element('button',text,parent);node.type='button';node.onclick=action;return node;};
    const back = button('Back',actions,()=>navigate(step-1));
    const skip = button('Skip for now',actions,()=>task(async()=>{await defer();modal.dismiss();},'Saving your choice…'));
    const next = button('Next',actions,()=>step===4?finish():navigate(step+1));next.className='cs-primary';
    const say = (message,error=false) => {if(closed)return;feedback.textContent=message;feedback.classList.toggle('cs-error',error);feedback.setAttribute('role',error?'alert':'status');};
    const session = () => adapter.session();
    const safeError = error => {
      let message=error.message || String(error);
      for(const secret of [session().jev,draft.freesoundApiKey].filter(Boolean)) message=message.split(secret).join('[redacted]');
      return message;
    };
    const lock = () => {
      shell.setAttribute('aria-busy',String(busy));
      for(const node of body.querySelectorAll('input,select,button'))node.disabled=busy || node.dataset.unavailable==='true';
      navButtons.forEach((node,index)=>{node.disabled=busy || completed || index>visited;node.setAttribute('aria-current',index===step?'step':'false');});
      back.disabled=busy || completed || step===0;skip.disabled=busy || completed;next.disabled=busy;
    };
    async function task(operation,message) {
      if(busy || closed)return;
      busy=true;ctrl=new AbortController();say(message);lock();
      try {await operation(ctrl.signal);}
      catch(error){if(!closed && error.name!=='AbortError')say(safeError(error),true);}
      finally {busy=false;ctrl=null;if(!closed)lock();}
    }
    async function defer() {
      if(completed || previousState?.completed)return;
      if((await ctx.settings.get(ONBOARDING_KEY))?.completed)return;
      await ctx.settings.set(ONBOARDING_KEY,{version:1,completed:false,deferred:true});
    }
    const cleanup = (persistDismissal = true) => {
      if(closed)return;closed=true;++renderId;ctrl?.abort();adapter.stopTest();active=null;
      unsubDismiss();
      if(persistDismissal && !completed && !saving) void defer().catch(error=>adapter.report(`Could not remember setup dismissal: ${safeError(error)}. You may see setup again on reload.`));
      shell.remove();snapshot=null;
    };
    const unsubDismiss = modal.onDismiss(()=>cleanup());
    active = {dispose(){cleanup(false);modal.dismiss();}};
    function field(label,input,parent,hint) {
      const wrap=element('label',label,parent);input.setAttribute('aria-label',label);wrap.append(input);
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
      const wrap=element('label','',parent);wrap.className='cs-check';node.setAttribute('aria-label',label);wrap.append(node);element('span',label,wrap);
      if(hint)element('p',hint,parent).className='cs-hint';return node;
    }
    const defaultRoute = () => `native:${draft.connection}`;
    const routes = () => [['','Use default speech connection'],...connections.tts.map(item=>[`native:${item.id}`,`${item.name} · ${item.provider} · ${item.model || 'no model'}`])];
    const signature = kind => JSON.stringify(kind==='planner'?[draft.plannerMode,draft.planner,draft.decisionConnection,Boolean(session().jev)]:[defaultRoute(),draft.connectionMode,draft.fixed[0]?.route,draft.fixed[0]?.voice]);
    function navigate(target) {
      if(busy || completed || target<0 || target>4)return;
      if(target>step){
        const issues=setupIssues(draft,connections,session()).filter(item=>item.step===step);
        if(issues.length){say(issues.map(item=>item.message).join('\n'),true);return;}
      }
      step=target;visited=Math.max(visited,step);say('');render();body.querySelector('h2')?.focus();
      body.scrollTop=0;modal.root.scrollTop=0;
    }
    function refresh() {
      return task(async signal=>{connections=await adapter.connections(signal);tests.clear();render();say('Connections refreshed. No synthesis or planner test was run.');},'Refreshing connection lists…');
    }
    function testPlanner() {
      const key=signature('planner');
      return task(async signal=>{const result=await adapter.testPlanner(draft,signal);tests.set('planner',{key,message:result});say(result);},draft.plannerMode==='heuristic'?'Checking local attribution…':'Sending one planner test request…');
    }
    function testVoice(actor = draft.fixed[0]) {
      if(!actor?.voice){say('This voice is set to automatic selection. Choir chooses it when you plan a reply. Select a specific voice to audition it now.',true);return;}
      const key=signature('tts');
      return task(async signal=>{await adapter.testVoice(draft,actor,signal);if(actor===draft.fixed[0])tests.set('tts',{key,message:'A narrator sample was synthesized and played.'});say(`Voice test passed: ${actor.voice}. A sample was synthesized and played.`);},'Synthesizing a short voice sample…');
    }
    function voiceField(actor,parent,label,changed,allowAutomatic=false) {
      const row=element('div','',parent),id=renderId;
      const effective=()=>draft.connectionMode==='one'?defaultRoute():actor.route || defaultRoute();
      const automaticLabel=draft.plannerMode==='jev'?'Let Choir choose (Jev)':'Let the LLM choose';
      const emptyLabel=allowAutomatic?automaticLabel:'Choose a voice';
      const choices=select(`${label} voice`,[['',emptyLabel]],actor.voice,row,value=>{actor.voice=value;changed?.();});
      const note=element('small','Loading voices…',row);
      if(allowAutomatic)element('small',draft.plannerMode==='heuristic'?'Let the LLM choose requires switching the planner to Standard LLM on Connections.':'Automatic selection happens during planning, using this connection’s catalogue and Choir’s existing casting logic. Planner calls may incur charges.',row);
      const custom=element('details','',row);element('summary','Use a provider voice ID',custom);
      input(`${label} voice ID`,actor.voice,custom,value=>{
        actor.voice=value;if(value && ![...choices.options].some(item=>item.value===value)){const entry=element('option',`${value} · custom ID`,choices);entry.value=value;}
        choices.value=value;changed?.();
      },{hint:'Use an ID from this provider. Choir validates it with the selected route; a successful test confirms synthesis.'});
      const token=effective();
      void adapter.voices(token).then(catalogue=>{
        if(closed || id!==renderId || token!==effective())return;
        const known=new Map(catalogue.map(item=>[item.id,item]));
        choices.replaceChildren();const empty=element('option',emptyLabel,choices);empty.value='';
        for(const item of known.values()){const option=element('option',item.name || item.id,choices);option.value=item.id;}
        if(actor.voice && !known.has(actor.voice)){const option=element('option',`${actor.voice} · custom or saved ID`,choices);option.value=actor.voice;}
        choices.value=actor.voice || '';note.textContent='Voice IDs belong to this connection. Test before relying on them.';
      }).catch(error=>{if(!closed && id===renderId){note.textContent=`Voice list unavailable: ${safeError(error)}. Retry or enter a provider voice ID.`;button('Retry voice list',row,()=>{render();});}});
      return choices;
    }
    function externalLink(parent,title,url) {
      const node=element('a',title,parent);node.href=url;node.target='_blank';node.rel='noopener noreferrer';return node;
    }
    function fishGuide(parent) {
      const guide=element('details','',parent);guide.className='cs-guide';element('summary','How to connect Fish Audio',guide);
      const steps=element('ol','',guide);
      const account=element('li','',steps);externalLink(account,'Sign in to Fish Audio','https://fish.audio/auth/signup');account.append(' or create an account.');
      const key=element('li','',steps);externalLink(key,'Open API Keys','https://fish.audio/app/api-keys');key.append(' and create a key with a name such as Choir. Copy the key when Fish shows it.');
      element('li','In Lumiverse, open Connect → TTS, add a Fish Audio connection, paste the API key, choose a model available to your account, and save.',steps);
      element('li','Return to this wizard and choose Refresh connections, then select your saved Fish Audio connection above.',steps);
      element('li','On TTS & Voices, choose a voice and use Test narrator voice to check that speech plays.',steps);
      element('p','The API key gives Lumiverse access to Fish Audio. A voice ID selects a particular voice; they are different values. Keep the API key in the Lumiverse connection, not the voice ID field.',guide).className='cs-hint';
      element('p','If a test fails, check the reported error: an invalid key, account access or balance, and an unavailable voice require different fixes.',guide).className='cs-hint';
      externalLink(guide,'Official Fish Audio getting-started guide','https://docs.fish.audio/developer-guide/getting-started/quickstart');
    }
    function render() {
      ++renderId;body.replaceChildren();
      const heading=element('h2',completed?'Choir is ready':SETUP_STEPS[step],body);heading.tabIndex=-1;
      next.textContent=completed?'Close':step===4?'Finish setup':'Next';next.onclick=completed?()=>modal.dismiss():()=>step===4?finish():navigate(step+1);
      if(completed){
        element('div','♪',body).className='cs-mark';
        element('p','Your setup is saved. New chats will use these cast defaults. Existing chats keep their voices.',body);
        button('Test final playback',body,()=>testVoice());element('p','Optional: this synthesizes and plays one short narrator sample and may incur provider charges.',body).className='cs-hint';lock();return;
      }
      if(step===0){
        element('div','♪',body).className='cs-mark';
        element('p','Give your story a voice. Choir reads narration and dialogue with different voices, and can add a soundscape when you want one.',body);
        const card=element('div','',body);card.className='cs-card';
        element('h3',snapshot.existing?'Your existing setup was found':'A few choices, then you’re ready',card);
        element('p',snapshot.existing?'We’ll start from your saved preferences and cast defaults. Nothing changes until you finish. Your existing chat casts are preserved.':'You need a speech provider and voices. Start with local heuristic attribution, or choose an LLM or Jev for more complex dialogue.',card);
        element('p','Sound effects, ambience, music, and automatic playback are optional. Connection and voice tests run only when you ask; they may use paid APIs.',body);
        element('p','Speech & Planner preferences are shared across chats. Voice defaults are used by new chats; existing chat casts stay independent. Skip saves no configuration.',body).className='cs-hint';
      } else if(step===1){
        element('p','Choose a speech connection saved in Lumiverse. Your API key and model are managed in Lumiverse’s Connect panel.',body);
        select('Default TTS connection',[['','Choose a connection'],...connections.tts.map(item=>[item.id,`${item.name} · ${item.provider} · ${item.model || 'no model'}`])],draft.connection,body,value=>{draft.connection=value;tests.delete('tts');render();});
        fishGuide(body);
        select('Planner engine',[['heuristic','Heuristic · local, no planner API'],['jev','Jev · Decision classification'],['llm','Standard LLM planner']],draft.plannerMode,body,value=>{draft.plannerMode=value;draft.useFastClassifier=value==='heuristic';draft.useJev=value==='jev';tests.delete('planner');render();});
        element('p',draft.plannerMode==='heuristic'?'Heuristic attribution works locally for narration and simple dialogue. Ambiguous speakers can stop planning. Assign voices explicitly; use Jev or LLM for complex scenes. Speech still uses your TTS provider.':draft.plannerMode==='jev'?'Jev classifies dialogue through a Decision connection. LLM fallback stays controlled by your existing Choir preference. Tests and classification can incur charges.':'An LLM identifies speakers and chooses voices. Planning and connection tests can incur charges.',body).className='cs-hint';
        if(draft.plannerMode==='jev'){
          select('Decision connection',[['','Default Decision connection'],...connections.decision.map(item=>[item.id,`${item.name} · ${item.provider} · ${item.model || 'Jev'}`])],draft.decisionConnection,body,value=>{draft.decisionConnection=value;tests.delete('planner');});
          if(connections.directJev){
            const advanced=element('details','',body);element('summary','Session Jev key for older Lumiverse hosts',advanced);
            input('Jev session API key',session().jev,advanced,value=>{adapter.setSession('jev',value);tests.delete('planner');},{password:true,hint:'Used by Choir’s existing fallback on hosts without Decision APIs. Never saved.'});
          }
        }
        if(draft.plannerMode!=='heuristic' || draft.enableSfx || draft.enableAmbience || draft.enableMusic){
          select('Planner LLM connection',[['','Default LLM connection'],...connections.llm.map(item=>[item.id,`${item.name} · ${item.provider} · ${item.model || 'no model'}`])],draft.planner,body,value=>{draft.planner=value;tests.delete('planner');});
        }else{
          const optional=element('details','',body);element('summary','Optional LLM for sound cues and card analysis',optional);
          select('Planner LLM connection',[['','Default LLM connection'],...connections.llm.map(item=>[item.id,`${item.name} · ${item.model || 'no model'}`])],draft.planner,optional,value=>{draft.planner=value;tests.delete('planner');});
        }
        button('Test planner connection',body,testPlanner);element('small',' Sends one small request unless Heuristic is selected.',body);
        element('p','TTS connection testing is on the next step, using an actual voice sample.',body).className='cs-hint';
        const guide=element('div','',body);guide.className='cs-card';element('h3','Missing a connection?',guide);
        element('p','Open Lumiverse’s Connect panel and select TTS, LLM, or Decision. Create or edit your connection there, choose its model, then reopen this wizard and refresh. Choir uses your connections; it does not create host-managed connections.',guide);
        button('Configure connections later',guide,()=>task(async()=>{await defer();modal.dismiss();adapter.connectionGuide();},'Saving your choice…'));
        button('Refresh connections',guide,refresh);
        for(const error of connections.errors || [])element('p',error,guide).className='cs-error';
      } else if(step===2){
        element('p','Choose voices for new chats. Existing chats keep their cast. A voice test synthesizes and plays one short sample.',body);
        select('Voice connection mode',[['one','One connection for the whole cast'],['several','A connection for each character']],draft.connectionMode,body,value=>{draft.connectionMode=value;render();});
        {
          const selected=connections.tts.find(item=>item.id===draft.connection);
          const provider=select('Default TTS provider',[['','Choose provider'],...[...new Set(connections.tts.map(item=>item.provider))].map(id=>[id,id])],selected?.provider,body,value=>{draft.connection=connections.tts.find(item=>item.provider===value)?.id || '';tests.delete('tts');render();});
          select('TTS model and connection',[['','Choose model'],...connections.tts.filter(item=>item.provider===provider.value).map(item=>[item.id,`${item.model || 'No model configured'} · ${item.name}`])],draft.connection,body,value=>{draft.connection=value;tests.delete('tts');render();},'Native models are configured in Lumiverse’s Connect panel. Selecting one here selects its saved connection.');
        }
        const grid=element('div','',body);grid.className='cs-grid';
        draft.fixed.forEach((actor,index)=>{
          const name=['Narrator','Persona','Main character'][index],card=element('div','',grid);card.className='cs-card';element('h3',name,card);
          if(draft.connectionMode==='several') select(`${name} connection`,routes(),actor.route || '',card,value=>{actor.route=value;actor.voice='';tests.delete('tts');render();});
          voiceField(actor,card,name,()=>tests.delete('tts'),true);
          check(`Enable ${name.toLowerCase()} speech`,!actor.excluded,card,value=>{actor.excluded=!value;});
          button(`Test ${name.toLowerCase()} voice`,card,()=>testVoice(actor));
        });
        const npc=element('div','',body);npc.className='cs-card';element('h3','NPC casting',npc);
        const policy=draft.npcPolicy;
        select('NPC casting',[['skip','Disabled'],['single','Shared voice'],['preferred','Preferred voices'],['llm','Automatic selection']],policy.mode,npc,value=>{policy.mode=value;render();});
        if(policy.mode!=='skip' && draft.connectionMode==='several') select('NPC connection',routes(),policy.route || '',npc,value=>{policy.route=value;policy.voice='';policy.voices=[];render();});
        if(policy.mode==='single')voiceField(policy,npc,'Shared NPC');
        if(policy.mode==='preferred'){
          input('Preferred NPC voice IDs',(policy.voices || []).join(', '),npc,value=>{policy.voices=value.split(',').map(id=>id.trim()).filter(Boolean);},{hint:'Comma-separated IDs from the selected NPC connection.'});
          const id=renderId;void adapter.voices(draft.connectionMode==='one'?defaultRoute():policy.route || defaultRoute()).then(list=>{if(!closed && id===renderId)element('small',`Available: ${list.map(item=>item.id).join(', ')}`,npc);}).catch(error=>{if(!closed && id===renderId)say(safeError(error),true);});
        }
        element('p','Automatic NPC selection needs Jev or an LLM and may make planner calls. Shared or disabled NPC speech is easiest for local heuristic attribution.',npc).className='cs-hint';
      } else if(step===3){
        element('p','Start with speech, then add the extras you want. Unconfigured features should stay off.',body);
        const sound=element('div','',body);sound.className='cs-card';element('h3','A soundscape for your story',sound);
        input('Freesound API key',draft.freesoundApiKey,sound,value=>{draft.freesoundApiKey=value;},{password:true,hint:'Saved in Choir’s existing preferences. Sound effects and ambience need this key plus an LLM for cue selection.'});
        const guide=element('details','',sound);guide.className='cs-guide';element('summary','How to get a Freesound API key',guide);
        const link=(parent,title,url)=>{const node=element('a',title,parent);node.href=url;node.target='_blank';node.rel='noopener noreferrer';return node;};
        const steps=element('ol','',guide);
        const account=element('li','',steps);link(account,'Sign in to Freesound','https://freesound.org/');account.append(' or create an account. Verify your email if Freesound asks.');
        const apply=element('li','',steps);link(apply,'Open the API key page','https://freesound.org/apiv2/apply/');apply.append(' and request an API credential for your Choir setup. Suggested application name: Choir. Describe your use, such as sound effects and ambience for personal story playback.');
        element('li','Copy the value labelled “Client secret/Api key” from your credentials. The Client ID is a different value; Choir needs the API key.',steps);
        element('li','Return here, paste the key above, enable Sound effects and/or Ambient sound, and choose a Sound cue LLM connection. Select Finish setup on Review to save.',steps);
        element('p','You can leave these features off and finish without a key. Choir uses the key to search sounds and play previews; no OAuth setup is needed.',guide).className='cs-hint';
        link(guide,'Official Freesound key instructions','https://freesound.org/docs/api/authentication.html#token-authentication');
        check('Sound effects',draft.enableSfx,sound,value=>{draft.enableSfx=value;});
        check('Ambient sound',draft.enableAmbience,sound,value=>{draft.enableAmbience=value;});
        check('Background music',draft.enableMusic,sound,value=>{draft.enableMusic=value;},'Music uses Choir’s existing library and attribution. Sound cue planning uses your LLM and may incur charges.');
        select('Sound cue LLM connection',[['','Default LLM connection'],...connections.llm.map(item=>[item.id,`${item.name} · ${item.model || 'no model'}`])],draft.planner,sound,value=>{draft.planner=value;tests.delete('planner');});
        const reading=element('div','',body);reading.className='cs-card';element('h3','Reading',reading);
        check('Skip non-story blocks',draft.skipMeta!==false,reading,value=>{draft.skipMeta=value;},'Keep automatic filtering of trackers, recaps and interface panels. LLM and Jev modes can also use your planner to find non-story text.');
        const skipped=element('textarea');skipped.rows=2;skipped.value=draft.ignoredTags || '';skipped.placeholder='summary, .status-panel, #phone-panel';
        skipped.oninput=()=>{draft.ignoredTags=skipped.value;};field('Skip tags and blocks',skipped,reading,'Add tag names, classes or IDs separated by commas. These rules apply across chats; automatic filtering stays available.');
        select('Highlight spoken text',[['off','Off'],['passage','Passage'],['word','Word by word']],draft.readAlong || 'off',reading,value=>{draft.readAlong=value;});
        check('Follow narration',Boolean(draft.followNarration),reading,value=>{draft.followNarration=value;});
        element('p','Set name pronunciation in the character’s editor after setup. “Say name as” applies when any voice says that name in the chat.',reading).className='cs-hint';
        const automation=element('div','',body);automation.className='cs-card';element('h3','Automation',automation);
        const previousPolicy=draft.npcPolicy.mode==='llm'?'skip':draft.npcPolicy.mode;
        check('Automatic NPC voice casting',draft.npcPolicy.mode==='llm',automation,value=>{draft.npcPolicy.mode=value?'llm':previousPolicy;},'Chooses NPC voices with your Jev or LLM planner. It may use paid planner calls; local heuristic attribution needs shared, preferred, or disabled NPC speech.');
        check('Auto-plan new replies',draft.autoPlan,automation,value=>{draft.autoPlan=value;},'Plans incoming replies automatically. LLM or Jev calls may incur charges.');
        check('Auto-play new replies',draft.auto,automation,value=>{draft.auto=value;},'Automatically generates speech for new replies. Provider charges and browser playback restrictions can apply.');
        element('p','Automatic voice selection is controlled by NPC casting on the previous step. Nothing plays or calls a planner as part of saving setup.',body).className='cs-hint';
      } else {
        element('p','Review your choices. Ready means configuration is present; only a successful explicit test confirms a connection worked.',body);
        const issues=setupIssues(draft,connections,session());
        const review=(title,detail,target,status)=>{
          const row=element('div','',body);row.className='cs-card cs-review';const info=element('div','',row);element('h3',title,info);element('small',detail,info);element('span',status,row).className='cs-status';button('Edit',row,()=>navigate(target));
        };
        const tts=connections.tts.find(item=>item.id===draft.connection);
        review('Speech',`${tts?.name || 'Missing TTS connection'} · ${tts?.provider || ''} · ${tts?.model || 'no model'}`,1,issues.some(item=>item.step===1)?'Needs Attention':'Ready');
        review('Planner',draft.plannerMode==='heuristic'?'Local heuristic · ambiguous dialogue may need manual help':`${draft.plannerMode} · ${draft.planner || draft.decisionConnection || 'host default'}`,1,issues.some(item=>item.step===1)?'Needs Attention':'Ready');
        review('Cast defaults',draft.fixed.map((actor,index)=>`${['Narrator','Persona','Main character'][index]}: ${actor.excluded?'disabled':actor.voice || (draft.plannerMode==='llm'?'LLM chooses during planning':draft.plannerMode==='jev'?'Choir chooses with Jev':'needs a voice')}`).join(' · ')+` · NPCs: ${draft.npcPolicy.mode}`,2,issues.some(item=>item.step===2)?'Needs Attention':'Ready');
        review('Optional features',[['Sound effects',draft.enableSfx],['Ambience',draft.enableAmbience],['Music',draft.enableMusic],['Auto-plan',draft.autoPlan],['Auto-play',draft.auto]].filter(item=>item[1]).map(item=>item[0]).join(', ') || 'All optional features are off',3,issues.some(item=>item.step===3)?'Needs Attention':'Optional');
        review('Reading',`Custom skip rules: ${draft.ignoredTags || 'none'} · Automatic non-story filtering: ${draft.skipMeta===false?'off':'on'} · Highlight: ${draft.readAlong || 'off'}`,3,'Optional');
        for(const kind of ['tts','planner']){const test=tests.get(kind);element('p',test?.key===signature(kind)?`${kind==='tts'?'Speech':'Planner'} test passed: ${test.message}`:`${kind==='tts'?'Speech':'Planner'} connection has not been tested with these choices.`,body).className='cs-hint';}
        if(issues.length)say(issues.map(item=>item.message).join('\n'),true);
        element('p','Finish saves shared Speech & Planner preferences and defaults for new chats. Existing chat voice choices remain intact. You can run setup again from Choir settings.',body).className='cs-hint';
      }
      lock();
    }
    function finish() {
      const issues=setupIssues(draft,connections,session());
      if(issues.length){say(issues.map(item=>item.message).join('\n'),true);return;}
      return task(async signal=>{
        saving=true;
        try {
        // Re-read connections to catch deleted connections before committing.
        connections=await adapter.connections(signal);
        const latest=setupIssues(draft,connections,session());
        if(latest.length)throw new Error(latest.map(item=>item.message).join('\n'));
        await adapter.save(draft,snapshot.config,signal);
        completed=true;if(!closed){render();say('Setup completed successfully.');}
        } finally {saving=false;}
      },'Validating and saving setup…');
    }
    render();
  }
  return {open, async start(){await open(true);}, dispose(){disposed=true;active?.dispose();removeStyle();}};
}
