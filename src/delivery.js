// Provider adapters keep acting instructions out of the spoken transcript.
export function characterDeliveryMode(actor, narrator = false) {
  return ['auto', 'base', 'off'].includes(actor?.deliveryMode) ? actor.deliveryMode : narrator ? 'base' : 'auto';
}

const deliveryText = value => String(value || '').replace(/[\[\]<>]/g, ' ').replace(/\s+/g, ' ').trim();
const S1_CUES = new Set(['happy','sad','angry','excited','calm','nervous','confident','surprised','satisfied','delighted','scared','worried','upset','frustrated','depressed','empathetic','embarrassed','disgusted','moved','proud','relaxed','grateful','curious','sarcastic','disdainful','unhappy','anxious','hysterical','indifferent','uncertain','doubtful','confused','disappointed','regretful','guilty','ashamed','jealous','envious','hopeful','optimistic','pessimistic','nostalgic','lonely','bored','contemptuous','sympathetic','compassionate','determined','resigned','in a hurry tone','shouting','screaming','whispering','soft tone','laughing','chuckling','sobbing','crying loudly','sighing','groaning','panting','gasping','yawning','snoring','audience laughing','background laughter','crowd laughing','break','long-break']);

export function voiceDelivery({segment, actor, narrator = false, family, connection = {}, supported = {}, styleParam, useStyle = true}) {
  const mode = characterDeliveryMode(actor, narrator), base = deliveryText(actor?.style);
  const s1=family==='fish_audio' && /(?:^|\/)s1$/.test(connection.model || '');
  const inline=family==='fish_audio' && (s1?[...String(segment.text).matchAll(/\(([^()]+)\)/gu)].some(match=>S1_CUES.has(match[1].trim().toLowerCase())):/\[[^\]\r\n]+\]/u.test(segment.text));
  // Explicit inline delivery belongs to the preset. Do not stack generated
  // acting on it; persistent accent and pronunciation still travel separately.
  const acting = useStyle && mode !== 'off' && !inline ? mode === 'base' ? base || (narrator ? 'Steady, neutral narration' : '') : deliveryText(segment.style) || base : '';
  const parameters = {};
  const supports = key => supported[key] && (!supported[key].models || supported[key].models.includes(connection.model));
  if (actor?.accent && supports('accent')) {
    const allowed = supported.accent.enum || supported.accent.options;
    if (Array.isArray(allowed) && !allowed.some(value => (value.id ?? value) === actor.accent)) throw new Error(`Accent ${actor.accent} is not supported by ${connection.name || 'this connection'}.`);
    parameters.accent = actor.accent;
  }
  const instructions = [acting, actor?.pronunciation, actor?.accent && !supports('accent') ? `Accent: ${actor.accent}` : ''].filter(Boolean).join('. ');
  const openRouter = connection.provider === 'openrouter_tts';
  let parameter;
  const modernGemini = /gemini-3\.8-flash(?:-lite)?-tts/.test(connection.model || '');
  if (family === 'gemini') parameter = modernGemini || !openRouter && supports('speech_style') ? 'speech_style' : !openRouter && supports('instructions') ? 'instructions' : undefined;
  else if (family === 'fish_audio') parameter = !openRouter && supports('voice_direction') ? 'voice_direction' : undefined;
  else parameter = styleParam && supports(styleParam) ? styleParam : ['instructions', 'instruct', 'prompt'].find(supports);
  // Empty explicitly overrides the relay's conversational Gemini default.
  if (parameter && (instructions || ['gemini','fish_audio'].includes(family))) parameters[parameter] = instructions;
  let text = segment.text;
  if (family === 'fish_audio' && !parameter && instructions) {
    const cues = s1 ? [...new Set(acting.split(/[.,;]+/).map(cue=>cue.trim().replace(/^\(([^()]+)\)$/,'$1').toLowerCase()).filter(cue=>S1_CUES.has(cue)))].slice(0,3).map(cue=>`(${cue})`).join('') : `[${deliveryText(instructions)}]`;
    text = cues ? `${cues} ${text}` : text;
  }
  // Older Google relays accept the direction as a natural-language prompt.
  // New Gemini uses metadata and never receives this prompt wrapper.
  if (family === 'gemini' && !modernGemini && (!openRouter || !parameter) && instructions) text = `Read the text below verbatim. Delivery: ${instructions}\n\nText:\n${text}`;
  return {text, style: ['gemini','fish_audio'].includes(family) ? instructions : acting, parameters};
}

export function normalizeMixerColumns(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 7 ? number : 0;
}

export function normalizeMixerVolumeLimits(value={}) {
  return Object.fromEntries(['master','voices','music','ambience','sfx'].map(key=>{
    const maximum=key==='master'?1:3,number=Number(value?.[key]);
    return [key,Number.isFinite(number)&&number>0?Math.max(.01,Math.min(maximum,Math.round(number*100)/100)):maximum];
  }));
}
