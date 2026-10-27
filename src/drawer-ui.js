// Arrange existing controls without changing their listeners or saved settings.
export function createDrawerNavigation(root) {
  const host = root.querySelector('.ensemble-tts'), document = root.ownerDocument;
  const navigation = document.createElement('nav');
  navigation.className = 'et-task-tabs'; navigation.setAttribute('role', 'tablist'); navigation.setAttribute('aria-label', 'Choir tasks');
  const panels = new Map(), buttons = new Map();let focusedCast;
  for (const [key, title, hint] of [
    ['cast','Cast','Choose a voice, accent and delivery for each character.'],
    ['play','Sound',''],
    ['recordings','Saved',''],
    ['settings','Setup','']
  ]) {
    const button = document.createElement('button'), panel = document.createElement('section'), intro = document.createElement('p');
    button.type = 'button'; button.textContent = title; button.id = `choir-tab-${key}`; button.dataset.choirTab = key;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `choir-panel-${key}`);
    panel.id = `choir-panel-${key}`; panel.className = 'et-task-panel'; panel.dataset.choirPanel = key;
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panel.tabIndex = 0;
    intro.className = 'et-hint'; intro.textContent = hint; panel.append(intro);
    for (const fragment of [...host.querySelectorAll(`[data-choir-page="${key}"]`)]) panel.append(...fragment.childNodes), fragment.remove();
    panels.set(key, panel); buttons.set(key, button); navigation.append(button); host.append(panel);
  }
  host.querySelector('[data-et="feedback"]').after(navigation);
  const select = (key, focus = false) => {
    if (!panels.has(key)) return;
    if(key!=='cast')closeCast();
    for (const [id, panel] of panels) { panel.hidden = id !== key; buttons.get(id).setAttribute('aria-selected', String(id === key)); buttons.get(id).tabIndex = id === key ? 0 : -1; }
    if (focus) buttons.get(key).focus();
  };
  for (const [key, button] of buttons) {
    button.onclick = () => {if(key==='cast')closeCast();select(key);};
    button.onkeydown = event => {
      const keys = [...buttons.keys()], index = keys.indexOf(key);
      const next = event.key === 'ArrowRight' ? (index + 1) % keys.length : event.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); select(keys[next], true); }
    };
  }
  const move = (name, key) => { const node = host.querySelector(`[data-et="${name}"]`); if (node) panels.get(key).append(node); };
  const playActions = document.createElement('div'); playActions.className = 'et-row';
  const play = document.createElement('button'); play.type = 'button'; play.dataset.et = 'drawerPlay'; play.textContent = 'Play latest reply'; play.className = 'et-btn-primary'; play.disabled = true; playActions.append(play);
  for (const name of ['latest', 'showMixer']) playActions.append(host.querySelector(`[data-et="${name}"]`));
  panels.get('play').querySelector('.et-hint').after(playActions);
  playActions.after(host.querySelector('[data-et="latestNotice"]'));
  const settingsActions = document.createElement('div'); settingsActions.className = 'et-row';
  for (const name of ['setupWizard', 'customizeMixer']) settingsActions.append(host.querySelector(`[data-et="${name}"]`));
  panels.get('settings').querySelector('.et-hint').after(settingsActions);
  settingsActions.after(host.querySelector('[data-et="mixerLayout"]'));
  const recordings = host.querySelector('[data-et="messages"]').closest('details');
  recordings.querySelector('summary').remove(); panels.get('recordings').append(...recordings.childNodes); recordings.remove();
  const retention = host.querySelector('[data-et="retention"]').closest('label'); panels.get('recordings').querySelector('.et-hint').after(retention);
  move('planDetails', 'play');
  const field=name=>host.querySelector(`[data-et="${name}"]`);
  const current=document.createElement('div');current.className='et-current-message';
  const label=document.createElement('span');label.dataset.et='currentMessageLabel';label.textContent='Latest reply';
  const download=document.createElement('button');download.type='button';download.dataset.et='drawerDownload';download.textContent='↓';download.setAttribute('aria-label','Download latest reply audio');download.hidden=true;
  playActions.append(download);playActions.className='et-btn-group';current.append(label,playActions,field('latestNotice'));host.querySelector('.et-header').after(current);
  field('latestNotice').textContent='Planned';field('latestNotice').title='Use Plan latest again to rebuild the plan. Saved audio remains reusable.';field('latestNotice').removeAttribute('role');
  const cast=panels.get('cast'),sound=panels.get('play'),settings=panels.get('settings'),saved=panels.get('recordings');
  cast.querySelector('h3').textContent='In this reply';cast.querySelector('.et-subhead').textContent='New characters';cast.querySelector('[data-et="otherCast"] p')?.remove();
  const defaults=document.createElement('div');defaults.className='et-default-actions';defaults.append(field('captureDefaults'),field('applyDefaults'));field('npcPolicyRoot').after(defaults);
  function closeCast(){if(!focusedCast)return;const {row,details,wasOpen,onClose}=focusedCast;focusedCast=null;row.classList.remove('et-focused-cast');if(details)details.open=wasOpen;cast.removeAttribute('data-editing');onClose?.();}
  const soundActions=document.createElement('div');soundActions.className='et-row';soundActions.append(field('customizeMixer'));sound.prepend(soundActions);sound.append(field('mixerLayout'));
  field('mixerLayout').classList.remove('et-card');
  const savedHeading=document.createElement('div');savedHeading.className='et-section-header';const heading=document.createElement('h3');heading.textContent='This chat';const all=document.createElement('button');all.type='button';all.dataset.et='downloadAll';all.textContent='Download all';all.disabled=true;savedHeading.append(heading,all);saved.prepend(savedHeading);saved.append(field('retention').closest('label'),field('deleteChatAudio').parentElement);
  const advanced=document.createElement('section');advanced.hidden=true;advanced.dataset.choirAdvanced='';
  const bar=document.createElement('div');bar.className='et-pagebar';const back=document.createElement('button');back.type='button';back.textContent='←';back.setAttribute('aria-label','Back to setup');const title=document.createElement('h3');title.textContent='Advanced settings';bar.append(back,title);advanced.append(bar);
  const performance=field('concurrency').closest('section');performance.querySelector('h4')?.remove();advanced.append(performance);
  for(const details of [...settings.querySelectorAll(':scope>details')])advanced.append(details);
  const importCast=field('castJson').closest('details');importCast.hidden=false;advanced.append(importCast);
  const advancedButton=document.createElement('button');advancedButton.type='button';advancedButton.className='et-link-row';advancedButton.dataset.et='advancedSettings';advancedButton.textContent='Advanced settings ›';settings.append(advancedButton,advanced);
  const showAdvanced=open=>{settings.dataset.advanced=String(open);advanced.hidden=!open;};advancedButton.onclick=()=>showAdvanced(true);back.onclick=()=>showAdvanced(false);
  const interfaceOptions=document.createElement('div');interfaceOptions.className='et-check-grid';for(const key of ['sectionButtons','enableMixer','abyssalMixerTheme','showAutoPlanAction'])interfaceOptions.append(field(key).closest('label'));sound.append(interfaceOptions);
  for(const key of ['enableSfx','followNarration'])field(key).closest('.et-row')?.classList.add('et-check-grid');
  field('readAlong').closest('label').classList.remove('et-check');field('readAlong').closest('label').classList.add('et-inline-field');
  settingsActions.className='et-setup-actions';settings.querySelector('h3').textContent='Connections';settings.querySelector('.et-section-header').after(settingsActions);
  const savedHint=document.createElement('p');savedHint.className='et-hint';savedHint.textContent='Recent messages below. Download all includes complete recordings throughout this chat.';savedHeading.after(savedHint);
  const auto=document.createElement('div');auto.className='et-check-grid';auto.append(field('auto').closest('label'));const autoPlan=document.createElement('label');autoPlan.className='et-check';const input=document.createElement('input');input.type='checkbox';input.dataset.et='drawerAutoPlan';autoPlan.append(input,document.createTextNode('Auto-plan new replies'));auto.prepend(autoPlan);advancedButton.before(auto);
  for(const control of settings.querySelectorAll('select'))control.closest('label')?.classList.add('et-inline-field');
  select('cast');
  return {select,closeCast,openCast(row,onClose){closeCast();const details=row.closest('details'),wasOpen=details?.open;focusedCast={row,details,wasOpen,onClose};if(details)details.open=true;row.classList.add('et-focused-cast');cast.dataset.editing='true';select('cast');},showMixer(open){sound.dataset.customizing=String(open);select('play');},showAdvanced};
}

export const DRAWER_UI_CSS=`
.ensemble-tts{padding:12px;max-width:540px}.ensemble-tts .et-header{margin-bottom:10px;padding-bottom:0;border:0;gap:6px}.ensemble-tts .et-badge{display:none}.ensemble-tts h2{font-size:18px}.ensemble-tts .et-save-state{font-size:11px}
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
`;
