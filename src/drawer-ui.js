// Arrange existing controls without changing their listeners or saved settings.
export function createDrawerNavigation(root) {
  const host = root.querySelector('.ensemble-tts'), document = root.ownerDocument;
  const navigation = document.createElement('nav');
  navigation.className = 'et-task-tabs'; navigation.setAttribute('role', 'tablist'); navigation.setAttribute('aria-label', 'Choir tasks');
  const panels = new Map(), buttons = new Map();
  for (const [key, title, hint] of [
    ['play','Play','Play the latest reply, adjust sound and follow the story.'],
    ['cast','Cast','Choose a voice, accent and delivery for each character.'],
    ['recordings','Recordings','Replay or download saved messages, and manage their storage.'],
    ['settings','Settings','Set up connections, planning and your mixer.']
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
    for (const [id, panel] of panels) { panel.hidden = id !== key; buttons.get(id).setAttribute('aria-selected', String(id === key)); buttons.get(id).tabIndex = id === key ? 0 : -1; }
    if (focus) buttons.get(key).focus();
  };
  for (const [key, button] of buttons) {
    button.onclick = () => select(key);
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
  select('play');
  return {select};
}
