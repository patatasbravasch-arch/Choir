// Move the existing controls; their listeners and persistence remain shared.
export function createDrawerNavigation(root) {
  const host=root.querySelector('.ensemble-tts'),doc=root.ownerDocument;
  const field=name=>host.querySelector(`[data-et="${name}"]`);
  const el=(tag,text,parent)=>{const node=doc.createElement(tag);if(text)node.textContent=text;parent?.append(node);return node;};
  const button=(text,parent,action)=>{const node=el('button',text,parent);node.type='button';node.onclick=action;return node;};
  const panels=new Map(),buttons=new Map(),pages=new Map();let focusedCast;
  const nav=el('nav');nav.className='et-task-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Choir tasks');
  for(const [key,title] of [['cast','Cast'],['play','Playback'],['recordings','Saved'],['settings','Settings']]){
    const tab=button(title,nav,()=>{closeCast();closePages();select(key);});tab.dataset.choirTab=key;tab.id=`choir-tab-${key}`;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`choir-panel-${key}`);
    const panel=el('section','',host);panel.className='et-task-panel';panel.dataset.choirPanel=key;panel.id=`choir-panel-${key}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
    for(const source of [...host.querySelectorAll(`[data-choir-page="${key}"]`)]){panel.append(...source.childNodes);source.remove();}
    buttons.set(key,tab);panels.set(key,panel);
    tab.onkeydown=event=>{const keys=[...buttons.keys()],i=keys.indexOf(key),next=event.key==='ArrowRight'?(i+1)%4:event.key==='ArrowLeft'?(i+3)%4:event.key==='Home'?0:event.key==='End'?3:-1;if(next>=0){event.preventDefault();buttons.get(keys[next]).click();buttons.get(keys[next]).focus();}};
  }
  host.querySelector('[data-et="feedback"]').after(nav);
  const cast=panels.get('cast'),playback=panels.get('play'),saved=panels.get('recordings'),settings=panels.get('settings');
  const home=new Map();for(const [key,panel] of panels){const content=el('div');content.className='et-tab-home';content.append(...panel.childNodes);panel.append(content);home.set(key,content);}
  function select(key,focus=false){if(!panels.has(key))return;if(key!=='cast')closeCast();for(const [id,panel] of panels){panel.hidden=id!==key;buttons.get(id).setAttribute('aria-selected',String(id===key));buttons.get(id).tabIndex=id===key?0:-1;}if(focus)buttons.get(key).focus();}
  function closePages(){for(const page of pages.values())page.hidden=true;for(const content of home.values())content.hidden=false;field('customizeMixer')?.setAttribute('aria-expanded','false');}
  function openPage(key){const page=pages.get(key);if(!page)return;closeCast();closePages();select(page.closest('[data-choir-panel]').dataset.choirPanel);home.get(page.closest('[data-choir-panel]').dataset.choirPanel).hidden=true;page.hidden=false;if(key==='mixer')field('customizeMixer').setAttribute('aria-expanded','true');page.querySelector('h3')?.focus();}
  function page(key,title,tab,trigger){const node=el('section','',panels.get(tab));node.dataset.choirDestination=key;node.hidden=true;const bar=el('div','',node);bar.className='et-pagebar';const back=()=>{closePages();trigger?.focus();};button(`← ${buttons.get(tab).textContent}`,bar,back);node.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();back();}};const heading=el('h3',title,bar);heading.tabIndex=-1;pages.set(key,node);if(trigger){trigger.dataset.choirOpen=key;trigger.onclick=()=>openPage(key);}return node;}
  const move=(name,parent)=>{const node=field(name);if(node)parent.append(node);return node;};
  const moveLabel=(name,parent)=>{const node=field(name);if(node)parent.append(node.closest('label') || node);};
  const group=(title,parent)=>{const section=el('section','',parent);section.className='et-control-group';el('h4',title,section);return section;};
  // The host supplies the Choir title. Keep a single persistent setup entry.
  const header=host.querySelector('.et-header');header.querySelector('.et-title-group').hidden=true;
  const setup=move('setupWizard',header);setup.textContent='Setup guide';setup.className='et-setup-link';header.prepend(setup);move('saveState',header);move('save',header);
  const current=el('div');current.className='et-current-message';header.after(current);const currentLabel=el('div','',current);currentLabel.className='et-current-label';el('span','Latest reply',currentLabel).dataset.et='currentMessageLabel';
  const transport=el('div','',current);transport.className='et-btn-group';const start=button('Play',transport);start.dataset.et='drawerPlay';start.disabled=true;start.className='et-btn-primary';
  move('latest',transport);move('stop',transport);move('showMixer',transport);const download=button('↓',transport);download.dataset.et='drawerDownload';download.hidden=true;download.setAttribute('aria-label','Download latest reply audio');
  const notice=move('latestNotice',currentLabel);notice.textContent='Planned';notice.title='Plan latest again to rebuild the plan.';
  const reminder=button('Continue setup →',header,()=>setup.click());reminder.dataset.et='continueSetup';reminder.hidden=true;
  // Cast is a filtered list, never an accordion of old characters.
  const castHome=home.get('cast');castHome.querySelector('h3').textContent='Characters';
  const filter=el('select');filter.dataset.et='castFilter';filter.setAttribute('aria-label','Show characters');for(const [value,title] of [['current','In this reply'],['all','All saved']]){const option=el('option',title,filter);option.value=value;}
  castHome.querySelector('.et-section-header').after(filter);
  const other=field('otherCast');other.querySelector('summary')?.remove();other.querySelector('p')?.remove();
  const casting=button('Automatic voices →',null);casting.className='et-link-row';castHome.append(casting);const castingPage=page('casting','Automatic voices','cast',casting);
  const subhead=castHome.querySelector('.et-subhead');subhead?.remove();castHome.querySelector('.et-hint')?.remove();move('npcPolicyRoot',castingPage);
  const defaults=el('div','',castingPage);defaults.className='et-default-actions';move('captureDefaults',defaults);move('applyDefaults',defaults);
  function updateCastFilter(count=Number(field('otherCastCount').textContent)){filter.options[1].textContent=`All saved${count?` (+${count})`:''}`;other.hidden=filter.value!=='all' || !count;}
  filter.onchange=()=>updateCastFilter();
  function closeCast(){if(!focusedCast)return;const {row,onClose}=focusedCast;focusedCast=null;row.classList.remove('et-focused-cast');cast.removeAttribute('data-editing');updateCastFilter();onClose?.();}
  // Playback groups hold everyday settings; both mixer editors are peers.
  const playHome=home.get('play'),originalPlay=[...playHome.childNodes];
  const automation=group('New replies',playHome),checks=el('div','',automation);checks.className='et-check-grid';
  const autoLabel=el('label','',checks);autoLabel.className='et-check';const auto=el('input','',autoLabel);auto.type='checkbox';auto.dataset.et='drawerAutoPlan';autoLabel.append(doc.createTextNode('Auto-plan'));moveLabel('auto',checks);
  const tuning=group('Playback',playHome);tuning.append(field('playbackSpeedSlot').closest('.et-tuning-grid'));moveLabel('normalizeLoudness',tuning);
  const reading=group('Reading',playHome);moveLabel('readAlong',reading);moveLabel('followNarration',reading);
  const sound=group('Soundscape',playHome),soundChecks=el('div','',sound);soundChecks.className='et-check-grid';for(const name of ['enableSfx','enableAmbience','enableMusic','loopMusic'])moveLabel(name,soundChecks);moveLabel('freesoundApiKey',sound);field('enableSfx').closest('label').title='Freesound sound effects; requires the key below.';
  const mixer=group('Mixer',playHome);moveLabel('enableMixer',mixer);const mixerActions=el('div','',mixer);mixerActions.className='et-action-grid';move('customizeMixer',mixerActions);
  const limits=button('Volume limits',mixerActions);limits.dataset.choirVolumeLimits='';
  // Keep hidden compatibility inputs, discard only emptied display wrappers.
  for(const node of originalPlay)if(node.parentElement===playHome){if(node.nodeType===1 && node.querySelector('[data-et]'))node.hidden=true;else node.remove();}
  const layout=move('mixerLayout',playback);layout.dataset.choirDestination='mixer';pages.set('mixer',layout);field('customizeMixer').dataset.choirOpen='mixer';
  const volumePage=page('volume','Volume limits','play',limits);volumePage.dataset.choirVolumePage='';
  // Saved recordings and their lifetime belong together.
  const recent=field('messages').closest('details');recent.querySelector('summary')?.remove();home.get('recordings').append(...recent.childNodes);recent.remove();
  const savedHome=home.get('recordings'),savedTitle=el('div');savedTitle.className='et-section-header';el('h3','This chat',savedTitle);const all=button('Download all',savedTitle);all.dataset.et='downloadAll';all.disabled=true;savedHome.prepend(savedTitle);moveLabel('retention',savedHome);savedHome.append(field('deleteChatAudio').parentElement);
  // Settings is a short directory of peer pages, with no advanced-settings nesting.
  const settingsHome=home.get('settings'),originalSettings=[...settingsHome.childNodes];
  const destinations={};for(const [key,title,description] of [['connections','Connections','Speech provider and voice sources'],['planner','Planner','Speaker detection and fallback'],['filters','Text filters','Choose what gets read aloud'],['performance','Performance','Buffering and request sizes'],['interface','Interface','Message buttons and mixer appearance'],['castTools','Cast tools','Defaults, additional voices and import / export']]){
    const link=button('',settingsHome);link.className='et-settings-link';el('strong',title,link);el('small',description,link);el('span','›',link);destinations[key]=page(key,title,'settings',link);
  }
  for(const name of ['connectionMode','connection','styleParam','fishVoiceSource'])moveLabel(name,destinations.connections);move('testTts',destinations.connections);move('load',destinations.connections);
  for(const name of ['plannerMode','planner','decisionConnection','allowLlmFallback','plannerTokens'])moveLabel(name,destinations.planner);for(const name of ['jevKey','jevEndpoint','plannerHint','testPlanner'])move(name,destinations.planner);
  moveLabel('paranoidMode',destinations.planner);
  const filters=field('ignoredTags').closest('details');filters.querySelector('summary')?.remove();destinations.filters.append(...filters.childNodes);filters.remove();
  const performance=field('concurrency').closest('section');for(const name of ['concurrency','chunk','prefetch','apiBase'])moveLabel(name,destinations.performance);destinations.performance.append(field('batchSpeech').closest('.et-row'));for(const hint of [...performance.querySelectorAll(':scope>p')])destinations.performance.append(hint);
  for(const name of ['sectionButtons','abyssalMixerTheme','showAutoPlanAction'])moveLabel(name,destinations.interface);
  move('extraVoicesWrap',destinations.castTools);const castTools=field('castJson').closest('details');castTools.querySelector('summary')?.remove();destinations.castTools.append(...castTools.childNodes);castTools.remove();
  destinations.castTools.querySelector('.et-pagebar').after(defaults,field('defaultStatus'));
  // Plan and JSON editors are separate destinations too.
  const plan=move('planDetails',playHome);plan.hidden=false;
  const planLink=button('Speech plan →',plan);planLink.className='et-link-row';
  const planPage=page('plan','Speech plan','play',planLink);move('planSummary',planPage);
  const deliveryHint=el('p','Automatic acting chooses emotion and intensity per spoken line, such as “slightly amused”. Directions below reflect your current voice settings. Play uses these directions; Replay keeps the saved performance. Preset cues remain in the text.',planPage);deliveryHint.className='et-hint';
  move('preview',planPage);const json=field('planJson').closest('details');json.querySelector('summary')?.remove();const jsonLink=button('Edit attribution JSON →',plan);jsonLink.className='et-link-row';const jsonPage=page('attribution','Attribution JSON','play',jsonLink);jsonPage.append(...json.childNodes);json.remove();
  const inspect=button('TTS inspector →',plan);inspect.dataset.et='ttsInspectorOpen';inspect.className='et-link-row';inspect.hidden=true;
  const inspectorPage=page('ttsInspector','TTS inspector','play',inspect),inspector=field('ttsInspector');inspectorPage.append(...inspector.childNodes);inspector.remove();
  const inspectPlan=button('TTS inspector →',planPage,()=>openPage('ttsInspector'));inspectPlan.dataset.et='ttsInspectorFromPlan';inspectPlan.className='et-link-row';inspectPlan.hidden=true;
  for(const node of originalSettings)if(node.parentElement===settingsHome){if(node.nodeType===1 && (node.matches('[data-et]') || node.querySelector('[data-et]')))node.hidden=true;else node.remove();}
  for(const control of settings.querySelectorAll('select'))control.closest('label')?.classList.add('et-inline-field');
  select('cast');
  return {select,closeCast,openPage,closePages,updateCastFilter,volumePage,
    setSetupReminder(show){reminder.hidden=!show;},
    openCast(row,onClose){closeCast();closePages();if(other.contains(row))other.hidden=false;focusedCast={row,onClose};row.classList.add('et-focused-cast');cast.dataset.editing='true';select('cast');},
    showMixer(open){if(open)openPage('mixer');else closePages();select('play');}
  };
}

export const DRAWER_UI_CSS=`
.ensemble-tts{padding:12px;max-width:540px}.ensemble-tts .et-header{margin-bottom:10px;padding-bottom:0;border:0;gap:6px}.ensemble-tts h2{font-size:18px}.ensemble-tts .et-save-state{font-size:11px}
.ensemble-tts h3,.ensemble-tts h4{font-size:13px;text-transform:none;letter-spacing:0;margin:12px 0 8px}.ensemble-tts .et-task-panel>.et-hint{display:none}
.ensemble-tts .et-current-message{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;margin-bottom:8px}.ensemble-tts .et-current-message>span{flex:1}.ensemble-tts .et-current-message .et-btn-group{gap:5px;flex-wrap:wrap;order:2}.ensemble-tts .et-current-message button{font-size:12px;padding:5px 8px}.ensemble-tts [data-et="latestNotice"]{font-size:11px;opacity:.65;margin:0;order:1}
.ensemble-tts .et-task-tabs{margin:0 0 10px;padding:0;background:none;border:0;border-bottom:1px solid #8884;border-radius:0;gap:0}.ensemble-tts .et-task-tabs button{border-radius:0;min-height:40px;font-size:13px;padding:8px 4px}.ensemble-tts .et-task-tabs button[aria-selected="true"]{background:none;color:inherit;box-shadow:inset 0 -2px var(--lumiverse-primary,#c4b5fd)}
.ensemble-tts .et-task-panel{padding:0;min-width:0}.ensemble-tts .et-status{padding:6px 0;background:none;font-size:12px;margin:4px 0;overflow-wrap:anywhere}.ensemble-tts .et-section-header{margin:4px 0 8px;gap:8px}.ensemble-tts .et-section-header h3{margin:0}
.ensemble-tts .et-cast-row{padding:6px 0;margin:0;border:0;border-bottom:1px solid #8883;background:none;border-radius:0}.ensemble-tts .et-cast-header{display:grid;grid-template-columns:minmax(70px,.8fr) minmax(0,1.2fr) auto auto;gap:8px;min-height:34px}.ensemble-tts .et-cast-header strong{position:static;transform:none;text-align:left;max-width:none;overflow-wrap:anywhere;white-space:normal;font-size:13px;grid-column:1;grid-row:1}.ensemble-tts .et-cast-header>[data-choir-remove]{display:inline-flex;opacity:1;align-items:center;justify-content:center;grid-column:4;grid-row:1;min-height:32px;padding:4px 8px}.ensemble-tts .et-cast-summary{font-size:11px;opacity:.75;overflow-wrap:anywhere;min-width:0;grid-column:2;grid-row:1}.ensemble-tts .et-cast-header>[data-choir-edit]{grid-column:3;grid-row:1;margin:0!important;min-height:32px}
.ensemble-tts [data-editing="true"]>:not(:has(.et-focused-cast)),.ensemble-tts [data-editing="true"] .et-cast-row:not(.et-focused-cast),.ensemble-tts [data-editing="true"] [data-et="otherCast"]>summary{display:none!important}.ensemble-tts .et-cast-header>.et-cast-audition{display:none}.ensemble-tts .et-focused-cast{border:0;padding:0}.ensemble-tts .et-focused-cast .et-cast-header{display:flex;gap:8px;margin-bottom:10px}.ensemble-tts .et-focused-cast .et-cast-header strong{flex:1;order:1}.ensemble-tts .et-focused-cast .et-cast-header>[data-choir-edit]{order:0}.ensemble-tts .et-focused-cast .et-cast-summary{display:none}.ensemble-tts .et-focused-cast [data-choir-preview]{display:inline-flex;order:2}.ensemble-tts .et-focused-cast [data-choir-remove]{order:3}
.ensemble-tts .et-cast-editor{display:block;border:0;padding:0;margin:0}.ensemble-tts .et-cast-editor>label{margin:8px 0;min-width:0}.ensemble-tts .et-edit-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:8px 0}.ensemble-tts .et-edit-pair>label{min-width:0}.ensemble-tts .et-inline-field{display:grid!important;grid-template-columns:80px minmax(0,1fr);align-items:center;gap:8px!important}.ensemble-tts .et-cast-editor label{font-size:12px}.ensemble-tts .et-cast-editor .et-hint{font-size:11px;opacity:.7}
.ensemble-tts [data-choir-voice-page]>label,.ensemble-tts [data-choir-pronunciation-page]>label{margin:8px 0}.ensemble-tts [data-choir-voice-page] select{width:100%;text-overflow:ellipsis}.ensemble-tts [data-choir-voice-page] label>div{min-width:0}.ensemble-tts [data-choir-voice-page] label>div>button{font-size:11px;margin-top:5px}.ensemble-tts .et-setup-actions{margin:0 0 10px}.ensemble-tts .et-section-header>.et-row{gap:4px}.ensemble-tts .et-check-grid .et-inline-field{grid-column:1 / -1}.ensemble-tts [data-et="mixerLayoutOptions"]>.et-inline-field{grid-template-columns:minmax(100px,1fr) minmax(80px,1fr)}
.ensemble-tts input,.ensemble-tts select{padding:6px 8px;min-height:34px;min-width:0}.ensemble-tts button{min-height:34px;font-size:12px;padding:5px 9px}.ensemble-tts .et-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ensemble-tts .et-task-panel>.et-subhead{margin-top:14px;padding-top:12px}
.ensemble-tts .et-pagebar{display:flex;align-items:center;gap:8px;margin:0 0 10px}.ensemble-tts .et-pagebar h3{margin:0;flex:1}.ensemble-tts .et-pagebar button{min-width:34px}.ensemble-tts .et-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}.ensemble-tts .et-check-grid label{display:flex;align-items:center;gap:6px;min-height:34px;font-size:12px;font-weight:400}.ensemble-tts .et-check-grid input{min-height:0}
.ensemble-tts .et-link-row{width:100%;justify-content:space-between;border:0;border-top:1px solid #8883;background:none;border-radius:0;padding:9px 0;margin-top:10px;text-align:left}.ensemble-tts [data-advanced="true"]>:not([data-choir-advanced]){display:none!important}.ensemble-tts [data-choir-panel="play"][data-customizing="true"]>:not([data-et="mixerLayout"]){display:none!important}
.ensemble-tts .et-mixer-layout{padding:0;margin:0;border:0;background:none}.ensemble-tts .et-mixer-layout p{font-size:11px;opacity:.75;margin:6px 0}.ensemble-tts [data-et="mixerLayoutOptions"]{display:grid;gap:10px}.ensemble-tts .cm-customize-options,.ensemble-tts .cm-customize-quick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}.ensemble-tts .cm-customize-row{display:flex;align-items:center;gap:2px;min-width:0;font-size:12px}.ensemble-tts .cm-customize-row label{display:flex;align-items:center;gap:5px;flex:1;min-width:0;font-weight:400;min-height:34px}.ensemble-tts .cm-customize-row input{width:auto;min-height:0}.ensemble-tts .cm-customize-row button{font-size:11px;padding:0;min-height:28px;min-width:24px}
.ensemble-tts .et-volume-limits{display:grid;gap:6px}.ensemble-tts .et-volume-limits label{display:flex;align-items:center;gap:6px;font-size:12px}.ensemble-tts .et-volume-limits label>span:first-child{flex:1}.ensemble-tts .et-volume-limits input{width:76px}
.ensemble-tts .et-default-actions{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.ensemble-tts [data-et="otherCast"]{border:0;padding:0;margin:6px 0}.ensemble-tts [data-et="otherCast"] summary{padding:8px 0;font-size:12px}.ensemble-tts .et-message{padding:10px 0;margin:0;border:0;border-bottom:1px solid #8883;border-radius:0;background:none}.ensemble-tts .et-message>span{flex:1;min-width:120px}.ensemble-tts .et-message .et-btn-group{flex-wrap:wrap}.ensemble-tts .et-message small{display:block;font-size:11px;opacity:.7}
.ensemble-tts .et-tuning-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ensemble-tts .et-tuning{padding:8px 0;border:0;background:none}.ensemble-tts .et-tuning-hint{display:none}.ensemble-tts .et-tuning-title{font-size:12px}.ensemble-tts .et-character-speed{margin-top:8px}
@media(max-width:400px){.ensemble-tts .et-grid:has([data-et="connection"]){grid-template-columns:1fr}.ensemble-tts .et-current-message>.et-btn-group{width:100%}.ensemble-tts .et-cast-header{grid-template-columns:minmax(60px,.8fr) minmax(0,1.2fr) auto auto}.ensemble-tts .et-inline-field{grid-template-columns:72px minmax(0,1fr)}}
@media(pointer:coarse),(max-width:600px){.ensemble-tts button,.ensemble-tts .et-task-tabs button,.ensemble-tts .cm-customize-row button,.ensemble-tts .et-pagebar button,.ensemble-tts .et-cast-header>[data-choir-edit],.ensemble-tts .et-cast-header>[data-choir-remove]{min-height:44px;min-width:44px}.ensemble-tts .et-check-grid label,.ensemble-tts .cm-customize-row label{min-height:44px;font-size:13px}.ensemble-tts input:not([type="checkbox"]),.ensemble-tts select{font-size:16px;min-height:44px}.ensemble-tts .cm-customize-quick{grid-template-columns:1fr}}

/* Flat task pages. Each destination has one return path. */
.ensemble-tts .et-title-group[hidden],.ensemble-tts .et-toolbar:empty{display:none!important}
.ensemble-tts .et-header{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 8px}.ensemble-tts .et-header .et-save-state{margin-left:auto}.ensemble-tts .et-setup-link{background:transparent;border:0;padding-left:0;font-weight:600}.ensemble-tts [data-et="continueSetup"]{width:100%;text-align:left;border-color:var(--lumiverse-primary,#c4b5fd)}
.ensemble-tts .et-current-message{align-items:center;gap:4px 8px}.ensemble-tts .et-current-label{display:flex;align-items:center;flex:1;gap:6px;white-space:nowrap}.ensemble-tts .et-current-message .et-btn-group{order:0}.ensemble-tts .et-current-message [data-et="latestNotice"]{flex:none;font-size:10px;line-height:1.4;padding:2px 6px;border-radius:4px;background:#8882;opacity:.8}
.ensemble-tts .et-task-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.ensemble-tts .et-tab-home{min-width:0}.ensemble-tts .et-tab-home>h3{margin-top:0}
.ensemble-tts .et-control-group{margin:0 0 16px;padding:0 0 12px;border-bottom:1px solid #8883}.ensemble-tts .et-control-group>h4{margin:0 0 8px;font-weight:600}.ensemble-tts .et-control-group>label{margin:8px 0}.ensemble-tts .et-control-group:last-child{border-bottom:0}
.ensemble-tts .et-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.ensemble-tts .et-action-grid>:last-child:nth-child(odd){grid-column:1 / -1}
.ensemble-tts .et-settings-link{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;text-align:left;width:100%;background:none;border:0;border-bottom:1px solid #8883;border-radius:0;padding:12px 2px}.ensemble-tts .et-settings-link strong{font-size:13px}.ensemble-tts .et-settings-link small{font-size:11px;opacity:.7;grid-column:1}.ensemble-tts .et-settings-link>span{grid-column:2;grid-row:1 / 3}
.ensemble-tts [data-choir-destination]>label{display:block;margin:12px 0}.ensemble-tts [data-choir-destination] p,.ensemble-tts [data-choir-destination] small{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.ensemble-tts [data-choir-destination]>button{margin:4px 6px 4px 0}.ensemble-tts .et-pagebar{border-bottom:1px solid #8883;padding-bottom:10px;align-items:center}.ensemble-tts .et-pagebar button{font-size:12px}.ensemble-tts .et-pagebar h3{font-size:14px;text-align:right;outline:none}
.ensemble-tts [data-et="castFilter"]{width:100%;margin-bottom:6px}.ensemble-tts [data-editing="true"] .et-tab-home>:not(:has(.et-focused-cast)){display:none!important}.ensemble-tts .et-cast-row.et-focused-cast{padding-top:0}.ensemble-tts .et-focused-cast .et-cast-editor .et-control-group{padding-top:12px;border-top:1px solid #8883;border-bottom:0}.ensemble-tts [data-choir-pronunciation-page]>label{display:grid;gap:4px}
.ensemble-tts .et-volume-limits>.et-pagebar{display:flex}.ensemble-tts .et-volume-limits>label{display:flex}.ensemble-tts .et-volume-limits input{width:76px}.ensemble-tts [data-et="planDetails"]{padding-top:10px;border-top:1px solid #8883}
@media(max-width:400px){.ensemble-tts .et-current-message>.et-btn-group{width:100%}.ensemble-tts .et-settings-link{padding:14px 2px}.ensemble-tts .et-edit-pair,.ensemble-tts .et-tuning-grid{grid-template-columns:1fr}}
`;
