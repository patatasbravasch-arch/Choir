// Provider adapters keep acting instructions out of the spoken transcript.
export function characterDeliveryMode(actor, narrator = false) {
  return ['auto', 'base', 'off'].includes(actor?.deliveryMode) ? actor.deliveryMode : narrator ? 'base' : 'auto';
}

const deliveryText = value => String(value || '').replace(/[\[\]<>]/g, ' ').replace(/\s+/g, ' ').trim();
const S1_CUES = new Set(['happy','sad','angry','excited','calm','nervous','confident','surprised','satisfied','delighted','scared','worried','upset','frustrated','depressed','empathetic','embarrassed','disgusted','moved','proud','relaxed','grateful','curious','sarcastic','whispering','shouting']);

export function voiceDelivery({segment, actor, narrator = false, family, connection = {}, supported = {}, styleParam, useStyle = true}) {
  const mode = characterDeliveryMode(actor, narrator), base = deliveryText(actor?.style);
  const acting = useStyle && mode !== 'off' ? mode === 'base' ? base || (narrator ? 'Steady, neutral narration' : '') : deliveryText(segment.style) || base : '';
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
  if (family === 'gemini') parameter = supports('speech_style') || /gemini-3\.8-flash(?:-lite)?-tts/.test(connection.model || '') ? 'speech_style' : supports('instructions') ? 'instructions' : undefined;
  else if (family === 'fish_audio') parameter = openRouter ? 'instructions' : supports('voice_direction') ? 'voice_direction' : undefined;
  else parameter = styleParam && supports(styleParam) ? styleParam : ['instructions', 'instruct', 'prompt'].find(supports);
  // Empty explicitly overrides the relay's conversational Gemini default.
  if (parameter && (instructions || ['gemini','fish_audio'].includes(family))) parameters[parameter] = instructions;
  let text = segment.text;
  if (family === 'fish_audio' && !parameter && instructions) {
    const s1 = /(?:^|\/)s1$/.test(connection.model || '');
    const cues = s1 ? [...new Set(acting.split(/[.,;]+/).map(cue=>cue.trim().toLowerCase()).filter(cue=>S1_CUES.has(cue)))].slice(0,3).map(cue=>`(${cue})`).join('') : `[${deliveryText(instructions)}]`;
    text = cues ? `${cues} ${text}` : text;
  }
  // Older Google relays accept the direction as a natural-language prompt.
  // New Gemini uses metadata and never receives this prompt wrapper.
  const modernGemini = /gemini-3\.8-flash(?:-lite)?-tts/.test(connection.model || '');
  if (family === 'gemini' && !modernGemini && !openRouter && instructions) text = `Read the text below verbatim. Delivery: ${instructions}\n\nText:\n${text}`;
  return {text, style: ['gemini','fish_audio'].includes(family) ? instructions : acting, parameters};
}

export function normalizeMixerColumns(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 7 ? number : 0;
}
