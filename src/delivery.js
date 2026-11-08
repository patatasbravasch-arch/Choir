import { vocalEvent } from './core.js';
// Provider adapters keep acting instructions out of the spoken transcript.
export function characterDeliveryMode(actor, narrator = false) {
  return ['auto', 'base', 'off'].includes(actor?.deliveryMode) ? actor.deliveryMode : narrator ? 'base' : 'auto';
}

const deliveryText = value => String(value || '').replace(/[\[\]<>]/g, ' ').replace(/\s+/g, ' ').trim();
// Canonical provider markers for emotions the planner can emit. Each entry is a
// clear synonym of a documented Fish S2/Gemini marker. Distinct emotions (amused,
// delighted) and degree-modified free-form cues are deliberately absent, so their
// intent and intensity survive — "slightly amused" must never become "happy".
const DELIVERY_SYNONYMS = [
  [/\b(?:whisper|hush|murmur)\b/i, 'whispering'],
  [/\b(?:sigh)\b/i, 'sighing'],
  [/\b(?:gasp)\b/i, 'gasping'],
  [/\b(?:pant)\b/i, 'panting'],
  [/\b(?:shout|yell)\b/i, 'shouting'],
  [/\b(?:scream)\b/i, 'screaming'],
  [/\b(?:laugh|giggle)\b/i, 'laughing'],
  [/\b(?:chuckle)\b/i, 'chuckling'],
  [/\b(?:cry)\b/i, 'crying'],
  [/\b(?:sob|weep)\b/i, 'sobbing'],
  [/\b(?:cheerful|joyful)\b/i, 'happy'],
  [/\b(?:afraid|fearful)\b/i, 'scared'],
  [/\b(?:sorrowful|sorrow|melancholy|mournful)\b/i, 'sad'],
  [/\b(?:anxious|uneasy)\b/i, 'nervous'],
  [/\b(?:irritated|annoyed|exasperated)\b/i, 'frustrated'],
  [/\b(?:ironic|sardonic)\b/i, 'sarcastic'],
  [/\b(?:teasing|mischievous)\b/i, 'playful'],
];
const NEGATION = /\b(?:no|not|never|without|don'?t|doesn'?t|didn'?t|won'?t|can'?t|cannot|neither|nor|hardly|barely)\b/i;
function canonicalDeliveryCue(text) {
  const token = deliveryText(text);
  if (!token) return '';
  const key = token.toLowerCase();
  for (const [pattern, marker] of DELIVERY_SYNONYMS) {
    const match = pattern.exec(key);
    if (!match) continue;
    // A negated emotion means the opposite; keep the instruction verbatim.
    if (NEGATION.test(key.slice(0, match.index))) return token;
    // Replace only the matched word, preserving surrounding qualifiers and degree.
    return token.replace(pattern, marker);
  }
  return token;
}
// A direction made only of these words asks for nothing in particular; sent to
// Fish it is just another cue that can tip ordinary lines into odd delivery.
const FILLER_CUE = /^(?:\s|,|and|a|the|natural(?:ly)?|neutral|normal|plain|default|conversational|delivery|tone|voice|matching|scene|narration)*$/i;
// S2 accepts both documented markers and free-form directions. Normalize clear
// synonyms at the TTS boundary and keep degree-modified cues verbatim, without
// another model request. A comma-separated description is one direction
// ("[warm, slightly amused]"): split pieces such as "[not sarcastic]" or
// "[Clear]" read as separate, contradictory instructions. Only full stops and
// semicolons, which join a base style to a turn or Jev labels, separate cues.
export function fishStyleCues(value) {
  const cues=[];
  for(const match of String(value || '').matchAll(/\[([^\[\]\r\n]+)\]|\(([^()\r\n]+)\)|([^()[\]]+)/gu)){
    const parts=match[1] || match[2] ? [match[1] || match[2]] : match[3].split(/[.;]+/u);
    for(const part of parts){
      const cue=canonicalDeliveryCue(part).replace(/^[\s,]+|[\s,]+$/g,'');
      if(FILLER_CUE.test(cue))continue;
      // S2 accepts free-form directions, including degree and negative constraints.
      // Keep "barely amused" and "scared but not panicked" intact; filtering by
      // negation words would silently discard their positive delivery guidance.
      if(cue && !cues.some(item=>item.toLowerCase()===cue.toLowerCase()))cues.push(cue);
    }
  }
  return cues.slice(0,3);
}
// Gemini's speech_style/instructions stay free-form but concise: normalize clear
// synonyms per token while preserving the original punctuation between tokens.
function conciseDeliveryStyle(value) {
  return String(value || '').split(/(\s*[.,;]+\s*)/u)
    .map((part, index) => index % 2 ? part : canonicalDeliveryCue(part))
    .join('').replace(/\s+/g, ' ').trim();
}
const S1_CUES = new Set(['happy','sad','angry','excited','calm','nervous','confident','surprised','satisfied','delighted','scared','worried','upset','frustrated','depressed','empathetic','embarrassed','disgusted','moved','proud','relaxed','grateful','curious','sarcastic','disdainful','unhappy','anxious','hysterical','indifferent','uncertain','doubtful','confused','disappointed','regretful','guilty','ashamed','jealous','envious','hopeful','optimistic','pessimistic','nostalgic','lonely','bored','contemptuous','sympathetic','compassionate','determined','resigned','in a hurry tone','shouting','screaming','whispering','soft tone','laughing','chuckling','sobbing','crying loudly','sighing','groaning','panting','gasping','yawning','snoring','audience laughing','background laughter','crowd laughing','break','long-break']);

// Fish S1 keeps only its own marker names, so generated phrases ("Intensely angry",
// "Quiet whisper, restrained") are translated: an exact marker, any marker word in the
// phrase, then a few common synonyms. Words after a negation never become markers.
const S1_SYNONYMS = [[/\bwhisper/, 'whispering'], [/\b(?:shout|yell)/, 'shouting'], [/\bscream/, 'screaming'], [/\b(?:quiet|soft|gentle|hushed|restrained)\b/, 'soft tone'],
  [/\b(?:cheerful|upbeat|warm)\b/, 'happy'], [/\bamused\b/, 'chuckling'], [/\blaugh/, 'laughing'], [/\bsigh/, 'sighing'], [/\b(?:furious|irritated|annoyed)\b/, 'angry'], [/\b(?:afraid|frightened|terrified)\b/, 'scared'], [/\b(?:tense|uneasy)\b/, 'nervous'], [/\b(?:tearful|grieving)\b/, 'sad']];
const S1_WORDS = [...S1_CUES].filter(cue => !cue.includes(' ') && !cue.includes('-'));
export function fishS1Cues(acting) {
  const cues = [];
  for (const raw of String(acting || '').split(/[.,;]+/)) {
    const phrase = raw.trim().replace(/^\(([^()]+)\)$/, '$1').toLowerCase();
    if (!phrase) continue;
    if (S1_CUES.has(phrase)) { cues.push(phrase); continue; }
    const kept = phrase.split(/\b(?:not|cannot|never|no|without|rather than|instead of)\b|n't\b/)[0];
    for (const word of S1_WORDS) if (new RegExp(`\\b${word}\\b`).test(kept)) cues.push(word);
    for (const [pattern, cue] of S1_SYNONYMS) if (pattern.test(kept)) cues.push(cue);
  }
  return [...new Set(cues)].slice(0, 3);
}

// The cast-wide acting dial scales whatever direction a line already has (planned or
// base style), from -2 (barely there) to +2 (big). It never invents a direction for an
// unmarked line, and narration keeps its steady delivery.
export const ACTING_INTENSITY_LEVELS=[[-2,'Very subtle'],[-1,'Subtle'],[0,'Natural'],[1,'Expressive'],[2,'Very expressive']];
export const normalizeActingIntensity=value=>{const number=Number(value);return Number.isInteger(number) && number>=-2 && number<=2?number:0;};
const INTENSITY_WORDS={'-2':'barely there, very understated','-1':'understated, low-key','1':'expressive, fully committed','2':'intense, big and theatrical'};
const FISH_INTENSITY_WORDS={'-2':'very subtle','-1':'subtle','1':'expressive','2':'intense'};
// Fish S1 markers have no degree; dialling down drops the loudest ones instead.
const S1_STRONG=new Set(['shouting','screaming','hysterical','crying loudly','sobbing','laughing','angry']);
export function voiceDelivery({segment, actor, narrator = false, family, connection = {}, supported = {}, styleParam, useStyle = true, intensity = 0}) {
  const mode = characterDeliveryMode(actor, narrator);
  const modernGemini = family==='gemini' && /(?:^|\/)gemini-3\.8-flash(?:-lite)?-tts(?:$|[-:])/i.test(connection.model || '');
  const s1=family==='fish_audio' && /(?:^|\/)s1$/.test(connection.model || '');
  const fishS2=family==='fish_audio' && !s1;
  const baseSource=String(actor?.style || ''),combined=String(segment.style || '');
  // Validated plans prepend the saved base for attribution/cache compatibility.
  // Automatic acting uses the turn direction OR that base, not both: a strong
  // base must not overpower a deliberately mild or neutral planned delivery.
  // Remove the exact raw prefix before provider sanitizing changes whitespace
  // around brackets or punctuation in an imported base style.
  const planned=baseSource && combined.startsWith(`${baseSource}. `)?combined.slice(baseSource.length+2):combined===baseSource?'':combined;
  const base=fishS2?baseSource.trim():deliveryText(baseSource);
  const turn=fishS2?planned.trim():deliveryText(planned);
  const inline=family==='fish_audio' && (s1?[...String(segment.text).matchAll(/\(([^()]+)\)/gu)].some(match=>S1_CUES.has(match[1].trim().toLowerCase())):/\[[^\]\r\n]+\]/u.test(segment.text));
  // Explicit inline delivery belongs to the preset. Do not stack generated
  // acting on it; persistent accent and pronunciation still travel separately.
  const rawActing = useStyle && mode !== 'off' && !inline ? mode === 'base' ? base || (narrator && !modernGemini ? 'Steady, neutral narration' : '') : turn || base : '';
  const level=narrator?0:normalizeActingIntensity(intensity);
  const cues=fishS2?fishStyleCues(rawActing):[];
  if(level && cues.length)cues[0]=`${FISH_INTENSITY_WORDS[level]}, ${cues[0]}`;
  const scaled=level && rawActing && !fishS2?`${INTENSITY_WORDS[level]}: ${rawActing}`:rawActing;
  const acting=fishS2?cues.join('. '):family==='gemini'?conciseDeliveryStyle(scaled):deliveryText(scaled);
  const parameters = {};
  const supports = key => supported[key] && (!supported[key].models || supported[key].models.includes(connection.model));
  if (actor?.accent && supports('accent')) {
    const allowed = supported.accent.enum || supported.accent.options;
    if (Array.isArray(allowed) && !allowed.some(value => (value.id ?? value) === actor.accent)) throw new Error(`Accent ${actor.accent} is not supported by ${connection.name || 'this connection'}.`);
    parameters.accent = actor.accent;
  }
  const ignoreStyle = !['gemini','fish_audio'].includes(family) && styleParam === 'none';
  const instructions = [ignoreStyle ? '' : acting, actor?.pronunciation, actor?.accent && !supports('accent') ? `Accent: ${actor.accent}` : ''].filter(Boolean).join('. ');
  const openRouter = connection.provider === 'openrouter_tts';
  let parameter;
  if (family === 'gemini') parameter = modernGemini || !openRouter && supports('speech_style') ? 'speech_style' : !openRouter && supports('instructions') ? 'instructions' : undefined;
  else if (family === 'fish_audio') parameter = !openRouter && supports('voice_direction') ? 'voice_direction' : undefined;
  else parameter = styleParam && styleParam !== 'none' && supports(styleParam) ? styleParam : ['instructions', 'instruct', 'prompt'].find(supports);
  // Clear native Fish directions because its cues are already in the text;
  // empty Gemini instructions override the relay's conversational default.
  if (parameter && (instructions || ignoreStyle || ['gemini','fish_audio'].includes(family))) parameters[parameter] = fishS2?'':instructions;
  let text = segment.text;
  // Sustained acting stays in Gemini metadata. Preserve explicit point events
  // there, translate them for Fish S2, and omit unsupported cues elsewhere.
  if (!modernGemini) text = text.replace(/<[^>]+>/g, tag => {
    const event=vocalEvent(tag);
    return event ? fishS2 ? `[${event==='short pause'?'break':event==='long pause'?'long-break':event}]` : '' : tag;
  });
  if (family === 'fish_audio' && (!parameter || !s1) && instructions) {
    const prefix = s1 ? fishS1Cues(acting).filter(cue=>level>=0 || !S1_STRONG.has(cue)).slice(0,level<=-2?1:3).map(cue=>`(${cue})`).join('') : [...cues,...[actor?.pronunciation,actor?.accent && !supports('accent')?`Accent: ${actor.accent}`:''].filter(Boolean).map(deliveryText)].map(cue=>`[${cue}]`).join('');
    text = prefix ? `${prefix} ${text}` : text;
  }
  // Older Google relays accept the direction as a natural-language prompt.
  // New Gemini uses metadata and never receives this prompt wrapper.
  if (family === 'gemini' && !modernGemini && (!openRouter || !parameter) && instructions) text = `Read the text below verbatim. Delivery: ${instructions}\n\nText:\n${text}`;
  return {text, style: ['gemini','fish_audio'].includes(family) ? instructions : ignoreStyle ? '' : acting, parameters};
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
