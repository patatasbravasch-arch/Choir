// HTTP LAN hosts expose getRandomValues, but not randomUUID or SubtleCrypto.
export function randomUuid(cryptoApi=globalThis.crypto) {
  if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID();
  const bytes=cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);

export async function sha256Hex(value,cryptoApi=globalThis.crypto) {
  const bytes=new TextEncoder().encode(value);
  if(typeof cryptoApi?.subtle?.digest==='function') {
    const digest=await cryptoApi.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  // Saved-plan keys must match the existing SHA-256 keys across HTTP and HTTPS.
  const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=0x80;
  const view=new DataView(padded.buffer);
  view.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000));view.setUint32(padded.length-4,(bytes.length*8)>>>0);
  const hash=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const words=new Uint32Array(64),rotate=(word,bits)=>(word>>>bits)|(word<<(32-bits));
  for(let offset=0;offset<padded.length;offset+=64) {
    for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4);
    for(let i=16;i<64;i++) {
      const x=words[i-15],y=words[i-2];
      words[i]=words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10));
    }
    let [a,b,c,d,e,f,g,h]=hash;
    for(let i=0;i<64;i++) {
      const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+SHA256_ROUND_CONSTANTS[i]+words[i])>>>0;
      const second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;
    }
    for(const [i,word] of [a,b,c,d,e,f,g,h].entries())hash[i]+=word;
  }
  return Array.from(hash,word=>word.toString(16).padStart(8,'0')).join('');
}

export const GEMINI_VOICES = [
  ['Zephyr','Bright'], ['Puck','Upbeat'], ['Charon','Informative'], ['Kore','Firm'],
  ['Fenrir','Excitable'], ['Leda','Youthful'], ['Orus','Firm'], ['Aoede','Breezy'],
  ['Callirrhoe','Easy-going'], ['Autonoe','Bright'], ['Enceladus','Breathy'],
  ['Iapetus','Clear'], ['Umbriel','Easy-going'], ['Algieba','Smooth'],
  ['Despina','Smooth'], ['Erinome','Clear'], ['Algenib','Gravelly'],
  ['Rasalgethi','Informative'], ['Laomedeia','Upbeat'], ['Achernar','Soft'],
  ['Alnilam','Firm'], ['Schedar','Even'], ['Gacrux','Mature'],
  ['Pulcherrima','Forward'], ['Achird','Friendly'], ['Zubenelgenubi','Casual'],
  ['Vindemiatrix','Gentle'], ['Sadachbia','Lively'], ['Sadaltager','Knowledgeable'], ['Sulafat','Warm']
].map(([id,description]) => ({id,name:id,description,
  gender:['Zephyr','Kore','Leda','Aoede','Callirrhoe','Autonoe','Despina','Erinome','Laomedeia','Achernar','Gacrux','Pulcherrima','Vindemiatrix','Sulafat'].includes(id)?'female':'male'}));

// Lumiverse's OpenAI provider exposes these built-in IDs without gender metadata.
export const OPENAI_VOICES = ['alloy','ash','ballad','cedar','coral','echo','fable','marin','nova','onyx','sage','shimmer','verse']
  .map(id=>({id,name:id[0].toUpperCase()+id.slice(1)}));

export function additionalVoices(value) {
  return String(value || '').split('\n').filter(line=>line.trim()).map(line=>{
    const [id,...description]=line.split('|');
    return {id:id.trim(),name:id.trim(),description:description.join('|').trim()};
  });
}

export function apiErrorMessage(raw,status) {
  let detail='';
  try {
    const body=JSON.parse(raw);
    detail=[body?.error?.message,body?.error?.detail,body?.error,body?.message,body?.detail,body?.error_description,typeof body==='string'?body:''].find(value=>typeof value==='string' && value.trim()) || '';
  } catch {detail=String(raw || '');}
  detail=detail.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
  if([502,504].includes(status) && /cloudflare/i.test(detail) && /Host Error/i.test(detail)){
    const ray=/Cloudflare Ray ID:\s*([a-f0-9]+)/i.exec(detail)?.[1];
    detail=`Cloudflare reports a Lumiverse host or gateway failure. Check Lumiverse and reverse proxy logs to identify the cause.${ray?` Cloudflare Ray ID: ${ray}.`:''}`;
  }
  detail=detail.slice(0,500);
  return `Lumiverse API HTTP ${status}${detail?`: ${detail}`:': The server or gateway returned no error details.'}`;
}

export function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Preserve older free-form instructions. Only unambiguous name mappings and
// hyphenated respellings are interpreted as pronunciation rules.
export function namePronunciation(actor) {
  if(Object.hasOwn(actor,'sayAs'))return typeof actor.sayAs==='string'?actor.sayAs.trim():'';
  const legacy=actor.pronunciation?.trim() || '';
  const name=escapePattern(actor.speaker || '');
  const explicit=name && legacy.match(new RegExp(`^(?:pronounce\\s+)?${name}\\s*(?::|=|is pronounced as|is pronounced|as)\\s*["“']?(.+?)["”']?\\.?$`,'iu'));
  const spelling=(explicit?.[1] || (/^[\p{L}\p{M}]+(?:[-‐‑][\p{L}\p{M}]+)+$/u.test(legacy)?legacy:'')).trim();
  return spelling.length<=120 && !/[<>\[\]\r\n]/u.test(spelling)?spelling:'';
}

export function namePronunciations(actors=[]) {
  const rules=new Map();
  for(const actor of actors){
    const name=actor.speaker?.trim(),sayAs=namePronunciation(actor);
    if(name && normalizeName(name)!=='narrator' && sayAs && sayAs!==name)rules.set(normalizeName(name),{name,sayAs});
  }
  return [...rules.values()].sort((a,b)=>b.name.length-a.name.length || a.name.localeCompare(b.name));
}

function wholeNamePattern(names) {
  return names.length?new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_-])(?:${names.map(escapePattern).join('|')})(?![\\p{L}\\p{M}\\p{N}_-])`,'giu'):null;
}

export function respellNames(text,actors=[]) {
  const rules=namePronunciations(actors),pattern=wholeNamePattern(rules.map(rule=>rule.name));
  const spellings=new Map(rules.map(rule=>[normalizeName(rule.name),rule.sayAs]));
  // One pass prevents rules from rewriting each other's replacement text.
  return pattern?text.replace(pattern,name=>spellings.get(normalizeName(name))):text;
}

// Multi-character cards commonly give each person a top-level heading or named XML section.
// Require those explicit profiles before splitting a title: "War and Peace" is not a cast list.
export function characterCardRoles(card={}) {return characterCardRoleDiscovery(card).roles;}

// These labels describe card structure or authoring rules, not a person's
// identity. A mention of "main character" inside them is not profile evidence.
const cardSectionName=value=>/^(?:speech|personality|appearance|background|history|relationships|likes|dislikes|behavio[u]?r|notes|details|voice|goals|traits|scenario|instructions?|guidelines?|rules?|examples?|example\s*dialogue|(?:narrative|narration|story|storytelling|writing|roleplay|role\s*play|response|dialogue|system|character|formatting|output)\s*(?:guidelines?|rules?|instructions?|requirements?|constraints?|style|format))$/i.test(String(value || '').replace(/[*_`]/g,'').replace(/[-:：]+/g,' ').trim());

// Check all card fields and keep each profile inside its own section.
export function characterCardRoleDiscovery(card={}) {
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const clean=value=>value.replace(/[*_`]/g,'').replace(/^character(?:\s+\d+)?\s*:\s*/i,'').replace(/(?:['’]s)?\s+(?:data|profile|details|character sheet)$/i,'').trim();
  const title=String(card.name || '').split(/\s*\|\s*/)[0];
  const titleNames=title.split(/\s+and\s+|\s*[&+]\s*|,\s*/i).map(name=>name.trim()).filter(Boolean);
  const nameFields=text=>[...text.matchAll(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:Character\s+)?Name(?:\*\*)?\s*:\s*([^\n\r]+)/gim)].map(match=>clean(match[1]));
  const aliasFields=text=>[...text.matchAll(/(?:^|[.!?][ \t]+)[ \t]*(?:[-*]\s*)?(?:\*\*)?(?:Alias(?:es)?|Also known as|Nicknames?)(?:\*\*)?[ \t]*:[ \t]*([^\n\r]+)/gim)]
    .flatMap(match=>clean(match[1]).replace(/[.!?]+$/g,'').split(/[,;|]|\s+\/\s+/u)).map(alias=>alias.trim())
    .filter(alias=>alias && alias.length<=100 && !/[.!?][ \t]+/.test(alias));
  const profiles=[];let needsAnalysis=false;
  const secondary=value=>/^(?:NPCs?|supporting (?:cast|characters?)|secondary (?:cast|characters?)|side characters?|incidental characters?)$/i.test(String(value || '').trim());
  const add=(name,aliases,description,start)=>profiles.push({name,aliases:[...new Set([...aliases,...aliasFields(description)])].slice(0,30),description:description.trim().slice(0,8000),__start:start});
  for(const field of ['description','personality','scenario','first_mes']){
  const fieldStart=profiles.length;
  const description=String(card[field] || '');
  if(!description.trim())continue;
  try{
    const data=JSON.parse(description.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,''));
    const entries=Array.isArray(data)?data:data.characters || data.cast || data.profiles;
    if(Array.isArray(entries) && entries.length){
      profiles.push(...validateCardRoles(entries.filter(entry=>!secondary(entry.role || entry.category || entry.type)).map(entry=>({name:entry.name,aliases:entry.aliases || [],description:typeof entry.description==='string'?entry.description:JSON.stringify(entry)}))));
      continue;
    }
  }catch{}
  const headings=[...description.matchAll(/^(#{1,6})[ \t]+([^#\n\r]{1,100})[ \t]*$/gm)].map(match=>({name:clean(match[2]),level:match[1].length,start:match.index,end:match.index+match[0].length}));
  const sections=[...description.matchAll(/(?=<([\w-]+)\b[^>]*>([\s\S]*?)<\/\1\s*>)/g)].map(match=>({tag:match[1],text:match[2],start:match.index})).sort((a,b)=>a.text.length-b.text.length);
  const excludedSpans=[...headings.filter(heading=>secondary(heading.name) || cardSectionName(heading.name)).map(heading=>[heading.start,headings.find(next=>next.start>heading.start && next.level<=heading.level)?.start ?? description.length]),...sections.filter(section=>secondary(section.tag.replace(/[_-]/g,' ')) || cardSectionName(section.tag)).map(section=>[section.start,section.start+section.text.length+section.tag.length*2+5])];
  const excludedProfile=(start,text)=>excludedSpans.some(([from,to])=>start>=from && start<to) || /^\s*(?:[-*]\s*)?(?:role|category|type)\s*:\s*(?:NPC|supporting character|secondary character)\b/im.test(text);
  const candidates=headings.flatMap((heading,index)=>{
    const next=headings[index+1];
    const block=description.slice(heading.end,next?.start),names=nameFields(block);
    if(excludedProfile(heading.start,block))return [];
    const inTitle=titleNames.some(name=>normalizeName(name)===normalizeName(heading.name));
    // A prefix such as "QA - " belongs to the card title, not the first
    // person's name. Require that person's own profile before accepting a
    // heading that only matches a decorated part of the title.
    const decoratedTitle=titleNames.some(name=>name.split(/\s+-\s+|\s*[–—:]\s*/u).some(part=>normalizeName(part)===normalizeName(heading.name)));
    const ownProfile=new RegExp(`^\\s*(?:\\*{1,2})?${escape(heading.name)}(?:\\*{1,2})?(?:\\s+(?:is|was|has|uses)\\b|\\s*[:：])`,'iu').test(block);
    const namedSection=sections.some(section=>normalizeName(section.tag.replace(/[_-]/g,' '))===normalizeName(heading.name));
    const explicitLead=/\b(?:lead|primary character|main character|playable character)\b/i.test(block);
    return names.length===1 || inTitle || decoratedTitle && ownProfile || namedSection || explicitLead?[{...heading,fullName:names.length===1?names[0]:undefined}]:[];
  });
  const spans=[],seenSections=new Set();
  for(const section of sections){
    if(excludedProfile(section.start,section.text))continue;
    const names=nameFields(section.text);
    const heading=candidates.find(item=>item.start>=section.start && item.start<section.start+section.text.length && (normalizeName(item.name)===normalizeName(section.tag.replace(/[_-]/g,' ')) || names.some(name=>normalizeName(name)===normalizeName(item.fullName))));
    const sectionTitle=titleNames.find(name=>normalizeName(name)===normalizeName(section.tag.replace(/[_-]/g,' ')));
    if(names.length!==1 && !sectionTitle && (!heading || normalizeName(heading.name)!==normalizeName(section.tag.replace(/[_-]/g,' '))))continue;
    const fullName=names[0] || heading?.name || sectionTitle,key=normalizeName(fullName);
    if(seenSections.has(key))continue;seenSections.add(key);
    const short=titleNames.find(name=>normalizeName(name)===normalizeName(heading?.name) || new RegExp(`^${escape(name)}(?:\\s|$)`,'i').test(fullName));
    add(short || fullName,[...(short && normalizeName(short)!==key?[fullName]:[]),...(!short && fullName.includes(' ')?[fullName.split(' ')[0]]:[])],section.text,section.start);
    spans.push([section.start,section.start+section.text.length+section.tag.length*2+5]);
  }
  for(const heading of candidates){
    if(spans.some(([start,end])=>heading.start>=start && heading.start<end))continue;
    const next=headings.find(item=>item.start>heading.start && (candidates.some(candidate=>candidate.start===item.start) || item.level<=heading.level && !/^(?:speech|personality|appearance|background|history|relationships|likes|dislikes|behavio[u]?r|notes|details|voice|goals|traits|scenario)$/i.test(item.name)));
    const profile=description.slice(heading.start,next?.start);
    add(heading.name,heading.fullName && normalizeName(heading.fullName)!==normalizeName(heading.name)?[heading.fullName]:[],profile,heading.start);
    spans.push([heading.start,next?.start ?? description.length]);
  }
  let remainder=description;
  for(const [start,end] of spans.sort((a,b)=>b[0]-a[0]))remainder=remainder.slice(0,start)+remainder.slice(end);
  if(remainder.replace(/<[^>]*>|^[ \t]*#{1,6}[^\n]*$/gm,'').trim())needsAnalysis=true;
  profiles.splice(fieldStart,profiles.length-fieldStart,...profiles.slice(fieldStart).sort((a,b)=>a.__start-b.__start));
  }
  const aliasOwners=new Map();
  for(const profile of profiles)for(const alias of profile.aliases){
    const key=normalizeName(alias),owners=aliasOwners.get(key) || new Set();
    owners.add(normalizeName(profile.name));aliasOwners.set(key,owners);
  }
  const ambiguousAliases=new Set([...aliasOwners].filter(([,owners])=>owners.size>1).map(([alias])=>alias));
  const roles=[];
  for(const profile of profiles){
    const names=[profile.name,...profile.aliases].map(normalizeName).filter(name=>!ambiguousAliases.has(name));
    const existing=roles.find(role=>normalizeName(role.name)===normalizeName(profile.name) || [role.name,...role.aliases].some(name=>!ambiguousAliases.has(normalizeName(name)) && names.includes(normalizeName(name))));
    if(existing){
      existing.aliases=[...new Set([...existing.aliases,profile.name,...profile.aliases])].filter(name=>normalizeName(name)!==normalizeName(existing.name));
      if(!existing.description.includes(profile.description))existing.description=(existing.description+'\n'+profile.description).slice(0,8000);
    }else roles.push(profile);
  }
  return {roles:roles.length?validateCardRoles(roles):[],needsAnalysis:needsAnalysis || !roles.length};
}

export function validateCardRoles(roles) {
  if(!Array.isArray(roles) || roles.length>20)throw new Error('Card analysis must return at most 20 lead characters.');
  const names=new Set();
  const result=roles.filter(role=>!cardSectionName(role?.name)).map(role=>{
    const name=typeof role?.name==='string'?role.name.trim():'';
    if(!name || name.length>100 || ['narrator','persona','user','{{user}}','{{char}}'].includes(normalizeName(name)) || names.has(normalizeName(name)))throw new Error('Card analysis returned invalid or duplicate character names.');
    names.add(normalizeName(name));
    if(role.aliases!==undefined && (!Array.isArray(role.aliases) || role.aliases.length>30 || role.aliases.some(alias=>typeof alias!=='string' || !alias.trim() || alias.length>100)))throw new Error('Invalid character profile aliases.');
    return {name,aliases:(role.aliases || []).map(alias=>alias.trim()).filter(alias=>normalizeName(alias)!==normalizeName(name)),description:String(role.description || '').slice(0,8000)};
  });
  // A short name shared by two people is not a usable alias.
  const aliasCounts=new Map();for(const role of result)for(const alias of new Set(role.aliases.map(normalizeName)))aliasCounts.set(alias,(aliasCounts.get(alias) || 0)+1);
  for(const role of result)role.aliases=[...new Set(role.aliases)].filter(alias=>!names.has(normalizeName(alias)) && aliasCounts.get(normalizeName(alias))===1);
  return result;
}

// Evidence must still occur in one card field. Normalize presentation only;
// paraphrases and invented excerpts are not evidence for a new lead.
export function cardAnalysisRoles(rawRoles,card={}) {
  const candidates=validateCardRoles(rawRoles);
  const normalize=value=>String(value || '')
    .replace(/<\/?(?:p|div|li|h[1-6]|br|section|article|blockquote)\b[^>]*>/gi,' ').replace(/<[^>]*>/g,'')
    .replace(/&(quot|apos|nbsp|amp|lt|gt|#\d+|#x[a-f0-9]+);/gi,(entity,name)=>{
      const known={quot:'"',apos:"'",nbsp:' ',amp:'&',lt:'<',gt:'>'},key=name.toLowerCase();
      if(Object.hasOwn(known,key))return known[key];
      const point=key.startsWith('#x')?parseInt(key.slice(2),16):Number(key.slice(1));
      return Number.isInteger(point) && point>0 && point<=0x10ffff?String.fromCodePoint(point):entity;
    })
    .normalize('NFKC').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/(\*{1,3}|_{1,3}|`{1,3})([^\n]*?)\1/g,'$2').replace(/\s+/gu,' ').trim().toLowerCase();
  const sources=['name','description','personality','scenario','first_mes'].map(field=>normalize(card[field]));
  const rawByName=new Map(rawRoles.map(role=>[normalizeName(role?.name),role]));
  const verified=new Set(candidates.flatMap(role=>{
    const quote=rawByName.get(normalizeName(role.name))?.evidence;
    if(typeof quote!=='string' || !quote.trim() || quote.length>600)return [];
    const evidence=normalize(quote);
    return evidence && sources.some(source=>source.includes(evidence))?[normalizeName(role.name)]:[];
  }));
  return validateCardRoles(rawRoles.filter(role=>verified.has(normalizeName(role?.name))));
}

// A decorated single-character card title is another name for an existing lead,
// not an NPC. Require a matching lead identity; scenario titles and group cards
// cannot safely be assigned to one person from their title alone.
export function reconcileCardCast(value,card={}) {
  const title=String(card.name || '').trim(),name=title.split(/\s*\|+\s*/)[0].trim();
  const roles=characterCardRoles(card);
  if(!title || !name || roles.length>1)return value;
  const identities=new Set([title,name].map(normalizeName));
  const profileNames=new Set(roles.flatMap(role=>[role.name,...role.aliases]).map(normalizeName));
  const leads=(value.fixed || []).slice(2).filter(actor=>[actor.speaker,...(actor.aliases || [])].some(alias=>identities.has(normalizeName(alias))) && (!roles.length || profileNames.has(normalizeName(name)) || [actor.speaker,...(actor.aliases || [])].some(alias=>profileNames.has(normalizeName(alias)))));
  if(leads.length!==1)return value;
  const lead=leads[0],canonical=normalizeName(lead.speaker);
  const occupied=new Set((value.fixed || []).filter(actor=>actor!==lead).flatMap(actor=>[actor.speaker,...(actor.aliases || [])]).map(normalizeName));
  const aliases=(lead.aliases || []).filter(alias=>normalizeName(alias)!==canonical);
  for(const alias of [name,title])if(alias.length<=100 && aliases.length<30 && normalizeName(alias)!==canonical && !occupied.has(normalizeName(alias)) && !aliases.some(existing=>normalizeName(existing)===normalizeName(alias)))aliases.push(alias);
  const known=new Set([lead.speaker,...aliases].map(normalizeName));
  const casts=Object.fromEntries(Object.entries(value.casts || {}).map(([route,actors])=>[route,actors.filter(actor=>!known.has(normalizeName(actor.speaker)))]));
  const singleVoices=Object.fromEntries(Object.entries(value.singleVoices || {}).map(([route,voices])=>[route,Object.fromEntries(Object.entries(voices).filter(([speaker])=>normalizeName(speaker)===canonical || !known.has(normalizeName(speaker))))]));
  return {...value,fixed:value.fixed.map(actor=>actor===lead?{...actor,aliases}:actor),casts,singleVoices};
}

export function normalizeVoiceCatalogue(catalogue) {
  return catalogue.map(voice=>{
    const supplied=voice.gender ?? voice.ssmlGender ?? voice.ssml_gender;
    const values=Array.isArray(supplied)?supplied:[supplied];
    const normalized=values.map(value=>String(value || '').toLowerCase().trim());
    let gender=normalized.some(value=>['female','feminine','f'].includes(value))?'female':
      normalized.some(value=>['male','masculine','m'].includes(value))?'male':
      normalized.some(value=>['neutral','androgynous','nonbinary','non-binary'].includes(value))?'neutral':undefined;
    gender ??= GEMINI_VOICES.find(v=>v.id===voice.id || String(voice.id).endsWith(`-Chirp3-HD-${v.id}`))?.gender;
    return {...voice,...(gender?{gender}:{gender:undefined})};
  });
}

export function ignoredTagNames(value) {
  const entries=Array.isArray(value)?value:String(value || '').split(/[\s,;]+/);
  return [...new Set(entries.map(tag=>String(tag).trim().replace(/^<\/?|\/?>$/g,'').toLowerCase()).filter(tag=>/^(?:[a-z][\w:-]*(?:[.#][\w:-]+)?|[.#][\w:-]+)$/.test(tag)))].slice(0,100);
}

function speechMarkupRanges(text,ignoredTags) {
  // Use the same DOM-independent filter in the frontend, backend and Cue.
  const tags=/<\/?([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  const selectors=ignoredTagNames(ignoredTags).map(entry=>{
    const selector=/^([a-z][\w:-]*)?([.#])([\w:-]+)$/.exec(entry);
    return selector?{tag:selector[1],attribute:selector[2]==='.'?'class':'id',value:selector[3]}:{tag:entry};
  });
  const metadata=/^(?:think|thinking|reasoning|analysis|redacted_thinking|tracker|stats|status|state|details|script|style|svg|canvas|input|button|select|textarea|option|progress|meter|nav|form|dialog|(?:loom|tool|function|ext_tracker)(?:[_-][\w-]+)?)$/i;
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const root={children:[]},stack=[root],nodes=[];let match;
  while((match=tags.exec(text))) {
    const closing=match[0].startsWith('</'),selfClosing=/\/\s*>$/.test(match[0]),tag=match[1].toLowerCase();
    if(closing){
      let index=stack.length-1;while(index>0 && stack[index].tag!==tag)index--;
      if(index>0){
        for(let inner=index+1;inner<stack.length;inner++)stack[inner].end=match.index;
        stack[index].end=tags.lastIndex;stack[index].closed=true;stack.length=index;
      }
      continue;
    }
    const attrs=Object.create(null);
    const attributePattern=/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;let attribute;
    const attributeText=match[0].slice(match[1].length+1,-1);
    while((attribute=attributePattern.exec(attributeText)))attrs[attribute[1].toLowerCase()]=(attribute[2] ?? attribute[3] ?? attribute[4] ?? '').toLowerCase();
    const node={tag,attrs,start:match.index,openEnd:tags.lastIndex,end:text.length,closed:false,children:[]};
    nodes.push(node);stack.at(-1).children.push(node);
    const classes=(attrs.class || '').split(/\s+/);
    node.ignored=metadata.test(tag) || selectors.some(selector=>(!selector.tag || selector.tag===tag) && (!selector.attribute || (selector.attribute==='class'?classes.includes(selector.value):attrs.id===selector.value))) ||
      /\b(?:tracker|stats|status-panel|hud)\b/i.test(`${attrs.class || ''} ${attrs.id || ''}`) ||
      /^(?:status|alert|navigation|toolbar|menu|menubar|dialog|alertdialog|progressbar)$/.test(attrs.role || '') ||
      Object.hasOwn(attrs,'hidden') || attrs['aria-hidden']==='true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(attrs.style || '');
    if(selfClosing || voidTags.has(tag)){node.end=tags.lastIndex;node.closed=true;}
    else if(tag==='style' || tag==='script'){
      // CSS and JavaScript can contain strings that look like HTML tags.
      const end=new RegExp(`</${tag}\\s*>`,'gi');end.lastIndex=tags.lastIndex;
      const found=end.exec(text);node.end=found?end.lastIndex:text.length;node.closed=Boolean(found);tags.lastIndex=node.end;
    }else stack.push(node);
  }

  // Recognize complete tabbed and CSS checkbox-controlled UI surfaces.
  // The smallest complete component wins, so a story wrapper around it survives.
  for(let index=nodes.length-1;index>=0;index--){
    const node=nodes[index],{attrs}=node,identity=`${attrs.class || ''} ${attrs.id || ''}`;
    const stats={tabs:attrs.role==='tab'?1:0,panels:attrs.role==='tabpanel' || /(?:^|[\s_-])tab(?:bed)?[-_](?:content|panel)(?:$|[\s_-])/.test(identity)?1:0,groups:new Map(),controls:new Set(),labels:new Set(),hasPanel:false};
    if(node.tag==='input' && attrs.type==='radio' && attrs.name && attrs.id)stats.groups.set(attrs.name,new Set([attrs.id]));
    if(node.tag==='input' && /^(?:checkbox|radio)$/.test(attrs.type) && attrs.id)stats.controls.add(attrs.id);
    if(node.tag==='label' && attrs.for)stats.labels.add(attrs.for);
    for(const child of node.children){
      stats.tabs+=child.stats.tabs;stats.panels+=child.stats.panels;stats.hasPanel ||= child.stats.hasPanel;
      for(const label of child.stats.labels)stats.labels.add(label);
      for(const control of child.stats.controls)stats.controls.add(control);
      for(const [group,ids] of child.stats.groups){if(!stats.groups.has(group))stats.groups.set(group,new Set());for(const id of ids)stats.groups.get(group).add(id);}
    }
    const tabs=stats.tabs>=2 && stats.panels>=1 || stats.panels>=2 && [...stats.groups.values()].some(ids=>[...ids].filter(id=>stats.labels.has(id)).length>=2);
    const css=node.children.filter(child=>child.tag==='style').map(child=>text.slice(child.openEnd,child.end)).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
    const cssSelectors=[...css.matchAll(/([^{}]+)\{[^{}]*}/g)].map(rule=>rule[1]);
    const toggle=[...stats.controls].some(id=>stats.labels.has(id) && cssSelectors.some(selector=>
      new RegExp(`#${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*:\\s*checked\\b`,'i').test(selector)));
    const surface=node.children.some(child=>child.tag==='style') || /(?:^|;)\s*(?:background(?:-color)?|border(?:-[\w-]+)?|box-shadow)\s*:/.test(attrs.style || '') || /(?:^|[\s_-])(?:widget|panel|browser|phone|device|dashboard)(?:$|[\s_-])/.test(identity);
    let directText='',cursor=node.openEnd;
    const separateParts=node.children.filter(child=>child.stats.tabs || child.stats.panels || child.stats.groups.size || child.stats.controls.size || child.stats.labels.size).length>=2;
    if((tabs || toggle) && surface && separateParts && node.closed && !stats.hasPanel && /^(?:div|section|article|aside)$/.test(node.tag)){
      for(const child of node.children){directText+=text.slice(cursor,child.start);cursor=child.end;}
      directText+=text.slice(cursor,text.lastIndexOf('</',node.end-1));
      if(!directText.replace(/&nbsp;|&#160;/gi,' ').trim()){node.ignored=true;stats.hasPanel=true;}
    }
    node.stats=stats;
  }
  const ranges=[];
  for(const node of nodes.filter(node=>node.ignored)){
    const previous=ranges.at(-1);
    if(previous && node.start<=previous[1])previous[1]=Math.max(previous[1],node.end);
    else ranges.push([node.start,node.end]);
  }
  return ranges;
}

export function transcriptFromMessage(value, ignoredTags=[]) {
  // Remove complete metadata panels before unwrapping ordinary story markup.
  let text=String(value || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/<!--[\s\S]*?(?:-->|$)/g,' ');
  const ranges=speechMarkupRanges(text,ignoredTags);
  for(const [start,end] of ranges.reverse())text=text.slice(0,start)+' '+text.slice(end);

    const hudKeys = 'Time|Date|Location|Place|Setting|Costume|Outfit|Clothing|Posture|Position|' +
    'Nearby(?:[ \t]+Races?)?|Races?|Health|HP|MP|SP|Stamina|Mana|Stats?|Status|State|' +
    'Mood|Affection|Love|Trust|Favor|Lust|Arousal|Karma|Gold|Money|Cash|Coins|' +
    'Inventory|Items?|Equipment|Weapons?|Armor|Objective|Quest|Goals?|Targets?|' +
    'Weather|Environment|Temperature|Atmosphere|Context|Scene|System(?:[ \t]+Note)?|OOC|Summary';

  const sysHeaders = 'Approved|Denied|Confirmed|Acknowledged|Response|Output|Roleplay[ \t]+Response|' +
    'Status[ \t]+Window|Character[ \t]+Sheet|Attributes?|Stats?[ \t]+Screen';

  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^[ \t]*[─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬+|-]{3,}[ \t]*$/gm, '')
    .replace(/^[ \t]*[-=_~*]{3,}[ \t]*$/gm, '')
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, '')
    .replace(/\[(?:OOC|System|Note|Author'?s?\s*Note|A\/N|AI\s*Note)[\s:][^\]]*\]/gi, '')
    // Status headers sit in brackets: drop pipe-separated blocks and lines made only of bracketed blocks.
    .replace(/\[[^\]\n]*\|[^\]\n]*\]/g, '')
    .replace(/^[ \t]*[*_]*(?:(?:\[[^\]\n]*\]|【[^】\n]*】|〔[^〕\n]*〕)[ \t]*)+[*_]*[ \t]*$/gm, '')
    .replace(new RegExp(`^[ \t]*(?:#{1,6}[ \t]*)?(?!["“])(?:${hudKeys})[ \t]*:[^\n]*$`, 'gim'), '')
    .replace(new RegExp(`^[ \\t]*(?:#{1,6}[ \\t]*)?(?:${sysHeaders})\\b[.: \\t]*$`, 'gim'), '')
    .replace(/^[ \t]*(?:#{1,6}[ \t]*)?(?:Chapter|Act|Episode|Scene|Part|Book|Volume)[ \t]+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?:[ \t]*[:\-.—–][^\n]*|[ \t]+[^\n]*)?$/gim, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/\*|`/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripAudioTags(text) {
  return String(text || '')
    .replace(/<\/?[\w\s="'-]+>|\[[\w\s,.:;!?'"-]+\]|\((?:happy|sad|excited|angry|whisper|sigh|fear|calm|cheerful|surprised|confused|shouting|crying|laughing|neutral)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePlanJson(value) {
  const raw = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if(!raw)throw new Error('Planner returned no text. Choose a text-generation LLM connection; check its model access and provider response.');
  try { return JSON.parse(raw); } catch {}
  // Locate complete objects without treating braces inside JSON strings as delimiters.
  // Never repair truncated JSON or use prose as a speech segment.
  for (let start=raw.indexOf('{');start>=0;start=raw.indexOf('{',start+1)) {
    let depth=0,quoted=false,escaped=false;
    for(let end=start;end<raw.length;end++) {
      const char=raw[end];
      if(quoted) {
        if(escaped)escaped=false;
        else if(char==='\\')escaped=true;
        else if(char==='"')quoted=false;
      } else if(char==='"')quoted=true;
      else if(char==='{')depth++;
      else if(char==='}' && --depth===0) {
        try {
          const parsed=JSON.parse(raw.slice(start,end+1));
          if(Array.isArray(parsed?.segments))return parsed;
        } catch {}
        break;
      }
    }
  }
  const preview=raw.replace(/\s+/g,' ').slice(0,240);
  throw new Error(`Planner returned no complete JSON speech plan. It may have answered in prose, refused, or stopped early. Response begins: ${preview}`);
}

export function validateCastConfig(config) {
  const communityRoute=route=>['community','both'].includes(config?.communityRoutes?.[route || config?.defaultRoute || '']);
  if (!config || !Array.isArray(config.voices) || !config.voices.length && !Object.values(config.communityRoutes || {}).some(source=>['community','both'].includes(source)) || config.voices.length > 1000) throw new Error('Load an available voice list first.');
  const voices = new Set(config.voices.map(v => v.id));
  const available=(actor)=>config.voices.some(v=>v.id===actor.voice && (v.route || '')===(actor.route || config.defaultRoute || ''));
  if ([...voices].some(id => typeof id !== 'string' || !id || id.length > 200)) throw new Error('Invalid voice catalogue.');
  if (!Array.isArray(config.fixed) || !config.fixed.length || config.fixed.length > 50) throw new Error('Configure narrator, persona and main characters.');
  const names = new Set();
  for (const entry of config.fixed) {
    if(!config.voices.some(v=>(v.route || '')===(entry.route || config.defaultRoute || '')) && !(communityRoute(entry.route) && entry.voice===''))throw new Error(`Load the voice catalogue for ${entry.speaker}'s TTS connection.`);
    if(entry.gender !== undefined && !['auto','female','male','neutral'].includes(entry.gender))throw new Error('Invalid voice gender preference.');
    const name = normalizeName(entry.speaker);
    if (!name || name.length > 100 || names.has(name)) throw new Error('Every fixed speaker must have a unique name.');
    if (entry.voice !== '' && !available(entry)) throw new Error(`Voice for ${entry.speaker} is not in the selected TTS connection's catalogue.`);
    if (typeof entry.style !== 'string' || entry.style.length > 600) throw new Error('Base style must be at most 600 characters.');
    names.add(name);
  }
  if (!names.has('narrator')) throw new Error('The fixed cast must include Narrator.');
  const policy=config.npcPolicy;
  if(policy){
    if(!['llm','skip','single','preferred'].includes(policy.mode))throw new Error('Choose a valid NPC casting mode.');
    const route=policy.route || config.defaultRoute || '',available=id=>config.voices.some(v=>v.id===id && (v.route || '')===route);
    if(policy.mode==='single' && !available(policy.voice))throw new Error('Choose an available shared NPC voice.');
    if(policy.mode==='preferred' && (!Array.isArray(policy.voices) || !policy.voices.length || policy.voices.some(id=>!available(id))))throw new Error('Select at least one available preferred NPC voice.');
  }
  if (!Array.isArray(config.npcs) || config.npcs.length > 500) throw new Error('Invalid NPC cast.');
  for (const npc of config.npcs) {
    if(!config.voices.some(v=>(v.route || '')===(npc.route || config.defaultRoute || '')) && !(communityRoute(npc.route) && npc.voice===''))throw new Error(`Load the voice catalogue for ${npc.speaker}'s TTS connection.`);
    if(npc.gender !== undefined && !['auto','female','male','neutral'].includes(npc.gender))throw new Error('Invalid NPC voice gender preference.');
    const name = normalizeName(npc.speaker);
    if (!name || names.has(name) || (npc.voice !== '' && !available(npc))) throw new Error(`Invalid or conflicting NPC assignment: ${npc.speaker}`);
    if (typeof npc.style !== 'string' || npc.style.length > 600) throw new Error('Invalid NPC base style.');
    names.add(name);
  }
  for (const actor of [...config.fixed, ...config.npcs]) {
    if (actor.aliases !== undefined && (!Array.isArray(actor.aliases) || actor.aliases.length > 30 || actor.aliases.some(alias=>typeof alias!=='string' || !alias.trim() || alias.length>100))) throw new Error('Aliases must be a list of up to 30 names.');
    // Repeating the speaker's own name or another of its aliases is harmless.
    const own=new Set([normalizeName(actor.speaker)]);
    for (const alias of actor.aliases || []) {
      const key=normalizeName(alias);
      if(own.has(key))continue;
      if(names.has(key))throw new Error(`Conflicting character alias: ${alias}`);
      names.add(key);own.add(key);
    }
    for(const field of ['pronunciation','accent'])if(actor[field] !== undefined && (typeof actor[field]!=='string' || actor[field].length>300))throw new Error(`Invalid ${field} preference.`);
    if(actor.sayAs!==undefined && (typeof actor.sayAs!=='string' || actor.sayAs.length>120 || /[<>\[\]\r\n]/u.test(actor.sayAs)))throw new Error('Say name as must be plain pronunciation spelling, up to 120 characters.');
    if(actor.excluded !== undefined && typeof actor.excluded!=='boolean')throw new Error('Invalid character exclusion.');
  }
  return config;
}

export function npcCastActor(actor,config){
  const policy=config.npcPolicy;
  if(policy?.mode==='single')return {...actor,route:policy.route || config.defaultRoute || '',voice:policy.voice,gender:'auto'};
  if(policy?.mode==='preferred')return {...actor,route:policy.route || config.defaultRoute || '',voice:(actor.route || config.defaultRoute || '')===(policy.route || config.defaultRoute || '') && policy.voices.includes(actor.voice)?actor.voice:''};
  return actor;
}

// An explicit collective speech tag applies to the quote, not its narration.
// Resolve plural pronouns from the nearby named people, never from the entire cast.
export function unisonSpeakers(transcript,unit,config) {
  if(unit.kind!=='dialogue')return null;
  const following=transcript.slice(unit.end).split(/[.!?\n"“”]/)[0];
  const preceding=transcript.slice(Math.max(0,unit.start-400),unit.start).split(/["“”]/).at(-1);
  const verbs=/\b(?:say|says|said|reply|replies|replied|ask|asks|asked|shout|shouts|shouted|yell|yells|yelled|scream|screams|screamed|whisper|whispers|whispered|call|calls|called|speak|speaks|spoke|answer|answers|answered|cry|cries|cried|exclaim|exclaims|exclaimed|chant|chants|chanted|sing|sings|sang|murmur|murmurs|murmured|declare|declares|declared)\b/i;
  const collective=/\b(?:in (?:perfect |complete )?unison|together|simultaneously)\b/i;
  const tag=[following,preceding.split(/[.!?\n]/).at(-1)].find(text=>text.length<=250 && verbs.test(text) && collective.test(text));
  if(!tag)return null;
  const cast=[...(config.fixed || []),...(config.npcs || [])].filter(actor=>normalizeName(actor.speaker)!=='narrator');
  const mentions=text=>cast.flatMap(actor=>[actor.speaker,...(actor.aliases || [])].flatMap(name=>name?[...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}_])`,'giu'))].map(match=>({speaker:actor.speaker,start:match.index,end:match.index+match[0].length})):[])).sort((a,b)=>a.start-b.start || b.end-a.end).filter((match,index,list)=>!list.slice(0,index).some(previous=>previous.start<=match.start && previous.end>=match.end));
  const groupIn=text=>{
    const names=mentions(text),groups=[];let group=[];
    for(const name of names){
      const previous=group.at(-1),between=previous && text.slice(previous.end,name.start);
      if(previous && !/^(?:\s*,\s*(?:(?:and|&)\s*)?|\s+(?:and|&|with|alongside)\s+)$/i.test(between)){if(group.length>1)groups.push(group);group=[];}
      group.push(name);
    }
    if(group.length>1)groups.push(group);
    return groups.at(-1)?.map(name=>name.speaker);
  };
  const subject=tag.slice(0,verbs.exec(tag).index);
  const resolveGroup=group=>{const names=[...new Set(group)];return names.length>=2 && (!/\bboth\b/i.test(subject) || names.length===2)?names:[];};
  const explicit=groupIn(subject);
  if(explicit)return resolveGroup(explicit);
  if(!/\b(?:they|both|all)\b/i.test(subject))return [];
  const clauses=preceding.split(/[.!?\n]/).filter(value=>value.trim());
  // Prefer the nearest named group. Recipients and observers do not join it.
  for(const clause of clauses.slice(-3).reverse()){
    const group=groupIn(clause);
    if(group)return resolveGroup(group);
  }
  const names=[...new Set(clauses.slice(-3).flatMap(clause=>{
    const named=mentions(clause);
    if(named.length!==1 || /\b(?:watch(?:ed|es)?|observ(?:e|es|ed)|listen(?:ed|s)?)\b/i.test(clause))return [];
    const first=named[0];
    return clause.slice(0,first.start).trim().replace(/^[,;]\s*/,'')?'':first.speaker;
  }).filter(Boolean))];
  return names.length>=2 && (!/\bboth\b/i.test(tag) || names.length===2)?names:[];
}

export function validatePlan(raw, transcript, config) {
  validateCastConfig(config);
  if (!raw || !Array.isArray(raw.segments) || !raw.segments.length) throw new Error('Expected at least one speech segment.');
  const voices = new Set(config.voices.map(v => v.id));
  const cast = new Map([...config.fixed, ...config.npcs.map(actor=>npcCastActor(actor,config))].map(v => [normalizeName(v.speaker), {...v}]));
  const fixedNames=new Set(config.fixed.map(actor=>normalizeName(actor.speaker)));
  const aliases = new Map([...config.fixed, ...config.npcs].flatMap(actor=>(actor.aliases || []).map(alias=>[normalizeName(alias),normalizeName(actor.speaker)])));
  const available=(voice,route)=>config.voices.some(v=>v.id===voice && (v.route || '')===route);
  const checkAutomaticGender=(voice,gender,route)=>{
    const choice=config.voices.find(v=>v.id===voice && (v.route || '')===route);
    if(gender && gender!=='auto' && choice?.gender && choice.gender!==gender)throw new Error(`Automatic casting must select a ${gender} voice, but selected ${voice} (${choice.gender}).`);
  };
  let cursor = 0;
    const actorForSegment=segment=>{
    const key = aliases.get(normalizeName(segment.speaker)) || normalizeName(segment.speaker);
    if (!key || key.length > 100) throw new Error('Invalid speech speaker.');
    let actor = cast.get(key);
    if (!actor) {
      const policy=config.npcPolicy,route=policy?.route || config.defaultRoute || segment.route || '';
      const voice=policy?.mode==='single'?policy.voice:segment.voice;
      if (!available(voice,route)) throw new Error(`NPC ${segment.speaker} needs a voice from its selected TTS connection's catalogue.`);
      if (cast.size >= 550) throw new Error('Too many NPCs. Reset the NPC cast.');
      actor = npcCastActor({speaker:segment.speaker.trim(), voice, style:'',
        ...(route?{route}:{}),
        gender:['female','male','neutral'].includes(segment.gender)?segment.gender:'auto'},config);
      checkAutomaticGender(actor.voice,actor.gender,route);
      cast.set(key, actor);
    }
    if (!actor.voice) {
      const route=actor.route || config.defaultRoute || '';
      if (!available(segment.voice,route)) throw new Error(`Speaker ${actor.speaker} needs an LLM-selected voice from its TTS connection's catalogue.`);
      checkAutomaticGender(segment.voice,actor.gender,route);
      actor.voice=segment.voice;
    }
    if(!fixedNames.has(key) && config.npcPolicy?.mode==='preferred' && !config.npcPolicy.voices.includes(actor.voice))throw new Error(`NPC ${actor.speaker} must use one of the preferred voices.`);
    return actor;
  };
  const segments = raw.segments.map((segment, index) => {
    if (!segment || typeof segment.text !== 'string' || !segment.text.trim()) throw new Error(`Segment ${index+1} has no transcript.`);
    const text = segment.text.trim();
    while (/\s/.test(transcript[cursor] || '') && cursor < transcript.length) cursor++;
    const sourceStart=cursor;
    if (transcript.startsWith(text, cursor)) {
      cursor += text.length;
    } else {
      const clean = stripAudioTags(text);
      let cIdx = 0, tIdx = cursor;
      while (cIdx < clean.length && /\s/.test(clean[cIdx])) cIdx++;
      let matchOk = true;
      while (cIdx < clean.length) {
        if (/\s/.test(clean[cIdx])) {
          while (cIdx < clean.length && /\s/.test(clean[cIdx])) cIdx++;
          if (cIdx < clean.length) {
            while (tIdx < transcript.length && /\s/.test(transcript[tIdx])) tIdx++;
          }
        } else {
          if (tIdx >= transcript.length || transcript[tIdx] !== clean[cIdx]) {
            matchOk = false;
            break;
          }
          tIdx++;
          cIdx++;
        }
      }
      if (!matchOk) throw new Error(`Segment ${index+1} changes or skips the original text. Copy exact consecutive substrings.`);
      cursor = tIdx;
    }
    const detected=/^["“][\s\S]*["”]$/.test(text)?unisonSpeakers(transcript,{kind:'dialogue',start:sourceStart,end:cursor},config):null;
    const supplied=segment.unison;
    if(supplied!==undefined && (!Array.isArray(supplied) || supplied.length<2 || supplied.length>5 || !/^["“][\s\S]*["”]$/.test(text)))throw new Error('Unison needs 2–5 speakers and one quoted dialogue turn.');
    // A collective tag without clear names keeps the planner's single speaker.
    const names=supplied?.map(member=>member?.speaker) || (detected?.length?detected:null);
    if(names && (names.length<2 || names.length>5))throw new Error('The unison tag needs 2–5 clearly identified cast members.');
    if(names && new Set(names.map(name=>aliases.get(normalizeName(name)) || normalizeName(name))).size!==names.length)throw new Error('Unison speakers must be distinct.');
    const inputs=names?names.map(name=>{
      const key=aliases.get(normalizeName(name)) || normalizeName(name);
      if(!cast.has(key) && !supplied)throw new Error('Unison members need a named cast assignment.');
      const member=supplied?.find(value=>(aliases.get(normalizeName(value.speaker)) || normalizeName(value.speaker))===key);
      return {...segment,...member,speaker:name,voice:member?.voice || (normalizeName(segment.speaker)===normalizeName(name)?segment.voice:undefined)};
    }):[segment];
    const actors=inputs.map(actorForSegment),actor=actors[0];
    // Assigned voices always win; blank fixed voices are cast once by the planner.
    const delivery = typeof segment.style === 'string' ? segment.style.trim() : '';
    if (delivery.length > 600) throw new Error('Turn styles must be at most 600 characters.');
    const sfx = segmentSoundCues(segment.sfx, text), ambience = segmentSoundCues(segment.ambience, text, 'ambience'), music = segmentSoundCues(segment.music, text, 'music');
    if(inputs.some(input=>typeof input.style!=='string' && input.style!=null || (input.style || '').length>600))throw new Error('Turn styles must be at most 600 characters.');
    const unison=names?actors.map((member,index)=>({speaker:member.speaker,voice:member.voice,route:member.route || config.defaultRoute || '',gender:member.gender || 'auto',style:config.useStyle===false?'':[member.style,inputs[index].style].filter(Boolean).join('. ')})):undefined;
    return {speaker:unison?unison.map(member=>member.speaker).join(' & '):actor.speaker, voice:actor.voice,...(unison?{unison}:{}),...((actor.route || config.defaultRoute)?{route:actor.route || config.defaultRoute}:{}), gender:actor.gender || 'auto', text,
      style: unison || config.useStyle === false ? '' : [actor.style, delivery].filter(Boolean).join('. '),
      ...(sfx ? {sfx} : {}), ...(ambience ? {ambience} : {}), ...(music ? {music} : {})};
  });
  if (transcript.slice(cursor).trim()) throw new Error('The plan omits the end of the original message.');
  const fixed = new Set(config.fixed.map(v => normalizeName(v.speaker)));
  return {segments, npcs:[...cast.values()].filter(v => !fixed.has(normalizeName(v.speaker)))};
}

// Persist attribution separately from synthesis choices so recasting is free.
export function attributionPlan(plan, config) {
  return {segments:plan.segments.map(segment=>{
    const actor=[...config.fixed,...config.npcs].find(a=>normalizeName(a.speaker)===normalizeName(segment.speaker));
    const prefix=actor?.style?`${actor.style}. `:'';
    return {speaker:segment.speaker,text:segment.text,...(segment.unison?{unison:segment.unison.map(member=>{const actor=[...config.fixed,...config.npcs].find(actor=>normalizeName(actor.speaker)===normalizeName(member.speaker));const prefix=actor?.style?`${actor.style}. `:'';return {speaker:member.speaker,style:prefix && member.style.startsWith(prefix)?member.style.slice(prefix.length):member.style===actor?.style?'':member.style};})}:{}),style:prefix && segment.style.startsWith(prefix)?segment.style.slice(prefix.length):segment.style===actor?.style?'':segment.style,...(segment.sfx?{sfx:segment.sfx}:{}),...(segment.ambience?{ambience:segment.ambience}:{}),...(segment.music?{music:segment.music}:{})};
  })};
}

export function restoreAttribution(saved, transcript, config) {
  const actors=[...config.fixed,...config.npcs];
  const selection=segment=>{
    const actor=actors.find(a=>normalizeName(a.speaker)===normalizeName(segment.speaker) || (a.aliases || []).some(alias=>normalizeName(alias)===normalizeName(segment.speaker)));
    const route=actor?.route || config.defaultRoute || '';
    const npc=!config.fixed.includes(actor);
    const policy=npc?config.npcPolicy:null;
    const selectedActor=npc?npcCastActor(actor || {route:policy?.route || route,voice:''},config):actor;
    const selectedRoute=selectedActor?.route || policy?.route || route;
    const choices=config.voices.filter(v=>(v.route || '')===selectedRoute && (policy?.mode!=='preferred' || policy.voices.includes(v.id)));
    const voice=selectedActor?.voice || choices.find(v=>!selectedActor?.gender || selectedActor.gender==='auto' || v.gender===selectedActor.gender)?.id;
    return {voice,route:selectedRoute};
  };
  return validatePlan({segments:saved.segments.map(segment=>{
    const unison=segment.unison?.map(member=>({...member,...selection(member)}));
    return {...segment,...selection(segment),...(unison?{unison}:{})};
  })},transcript,config);
}

export function passageKey(segment, settings, connection, parameters={}) {
  const effectiveParameters={...connection?.default_parameters,...parameters};
  // This preference changes the transport, not the generated audio.
  delete effectiveParameters.use_streaming_endpoint;
  const canonical=value=>Array.isArray(value)?value.map(canonical):value && typeof value==='object'
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  return JSON.stringify([2,segment.text,segment.voice,segment.route || settings.defaultRoute,
    segment.style || '',connection?.model,connection?.provider || '',
    connection?.api_url || connection?.base_url || '',
    // Formerly the direct Gemini voice fallback; kept so saved audio keys stay valid.
    false,canonical(effectiveParameters),
    ...(segment.turns?.length>1?[segment.turns.map(({speaker,voice,text,style})=>[speaker,voice,text,style || ''])]:[])]);
}

export const MAX_CHANNEL_VOLUME=3;

export function mixerVolume(master, speaker, channels) {
  const channel=Object.hasOwn(channels,speaker)?channels[speaker]:{}, solo=Object.values(channels).some(c=>c.solo);
  return Math.max(0,Math.min(1,Number(master ?? 1)))*Math.max(0,Math.min(MAX_CHANNEL_VOLUME,Number(channel.volume ?? 1)))*(channel.mute || (solo && !channel.solo)?0:1);
}

// Playback speed and the pause between spoken blocks. Stored values are clamped and snapped to these steps.
// Speed can be typed or stepped from 0.07 to 16 times, the browser maximum. The mixer slider shows the practical part, 0.25 to 4.
export const PLAYBACK_RATE_LIMITS={min:0.07,max:16,step:0.01,fallback:1};
export const VOICE_GAP_LIMITS={min:0,max:3000,step:50,fallback:0};
function snapToLimits(value,{min,max,step,fallback}){
  if(value===undefined || value===null || value==='' || typeof value==='boolean')return fallback;
  const number=Number(value);
  if(!Number.isFinite(number))return fallback;
  const clamped=Math.min(max,Math.max(min,number));
  return Number((min+Math.round((clamped-min)/step)*step).toFixed(2));
}
export const normalizePlaybackRate=value=>snapToLimits(value,PLAYBACK_RATE_LIMITS);
export const normalizeVoiceGap=value=>snapToLimits(value,VOICE_GAP_LIMITS);
// The user's top end for the speed sliders. Typed speeds still reach the full PLAYBACK_RATE_LIMITS range.
export const SPEED_SLIDER_MAX_LIMITS={min:1,max:16,step:0.25,fallback:4};
export const normalizeSpeedSliderMax=value=>snapToLimits(value,SPEED_SLIDER_MAX_LIMITS);
// A speaker's own speed lives beside its volume in the mixer state (channels[speaker].speed). It replaces the playback speed for that speaker. Null means no own speed: the speaker follows the playback speed.
export function speakerPlaybackRate(channels, speaker) {
  const channel=channels && Object.hasOwn(channels,speaker)?channels[speaker]:{};
  const value=channel?.speed;
  if(value===undefined || value===null || value==='' || typeof value==='boolean' || !Number.isFinite(Number(value)))return null;
  return normalizePlaybackRate(value);
}
// A speaker's own speed replaces the playback speed for that speaker. Without one, the playback speed applies.
export function effectivePlaybackRate(globalRate, channels, speaker) {
  return speakerPlaybackRate(channels,speaker) ?? normalizePlaybackRate(globalRate);
}
// Browsers play only inside their own range. A value outside it moves to the nearest end they accept.
export const BROWSER_PLAYBACK_RATE_LIMITS={min:0.0625,max:16};
export function browserPlaybackRate(rate) {
  const number=Number(rate);
  if(!Number.isFinite(number))return 1;
  return Math.min(BROWSER_PLAYBACK_RATE_LIMITS.max,Math.max(BROWSER_PLAYBACK_RATE_LIMITS.min,number));
}

export function loudnessGain(channels, target=0.12) {
  let squares=0,peak=0,count=0;
  for(const samples of channels)for(const sample of samples){squares+=sample*sample;peak=Math.max(peak,Math.abs(sample));count++;}
  const rms=count?Math.sqrt(squares/count):0;
  return rms>0.0001?Math.max(0.25,Math.min(4,target/rms,peak?0.95/peak:4)):1;
}

// All decoded tracks use the browser AudioContext's sample rate. Align their
// first audible sample, overlap them, and leave headroom in the resulting WAV.
export function mixUnisonAudio(tracks,sampleRate,{normalize=true}={}) {
  if(!Array.isArray(tracks) || tracks.length<2 || tracks.length>5 || !Number.isInteger(sampleRate) || sampleRate<8000 || sampleRate>192000)throw new Error('Invalid unison audio.');
  const prepared=tracks.map(track=>{
    const channels=track.channels;
    if(!Array.isArray(channels) || !channels.length || channels.some(channel=>!(channel instanceof Float32Array) || channel.length!==channels[0].length))throw new Error('Invalid unison audio channels.');
    let start=0;
    while(start<Math.min(channels[0].length,sampleRate) && channels.every(channel=>Math.abs(channel[start])<0.005))start++;
    const level=track.level ?? 1;
    if(!Number.isFinite(level) || level<0 || level>MAX_CHANNEL_VOLUME)throw new Error('Invalid unison level.');
    return {channels,start,gain:level*(normalize?loudnessGain(channels):1)};
  });
  const length=Math.max(...prepared.map(track=>track.channels[0].length-track.start));
  if(!length || length>sampleRate*300)throw new Error('Invalid unison audio length.');
  const channelCount=Math.min(2,Math.max(...prepared.map(track=>track.channels.length)));
  const channels=Array.from({length:channelCount},()=>new Float32Array(length));let peak=0;
  for(let channel=0;channel<channelCount;channel++)for(let index=0;index<length;index++){
    const value=prepared.reduce((sum,track)=>sum+(track.channels[Math.min(channel,track.channels.length-1)][index+track.start] || 0)*track.gain,0);
    channels[channel][index]=value;peak=Math.max(peak,Math.abs(value));
  }
  const headroom=peak>0.95?0.95/peak:1,data=new Uint8Array(44+length*channelCount*2),view=new DataView(data.buffer);
  for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])[...text].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
  view.setUint32(4,data.length-8,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channelCount,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channelCount*2,true);view.setUint16(32,channelCount*2,true);view.setUint16(34,16,true);view.setUint32(40,data.length-44,true);
  for(let index=0;index<length;index++)for(let channel=0;channel<channelCount;channel++)view.setInt16(44+(index*channelCount+channel)*2,Math.round(channels[channel][index]*headroom*32767),true);
  return data;
}

export function castExport(config) {
  const clean=castImport({format:'choir-cast',version:1,fixed:config.fixed,casts:config.casts,connectionMode:config.connectionMode,singleVoices:config.singleVoices});
  return {format:'choir-cast',version:1,...clean};
}

export function castImport(raw) {
  if(raw?.format!=='choir-cast' || raw.version!==1 || !Array.isArray(raw.fixed) || !raw.casts || typeof raw.casts!=='object' || Array.isArray(raw.casts))throw new Error('Expected a Choir cast export (version 1).');
  const routing={};
  if(raw.connectionMode!==undefined){if(!['one','several'].includes(raw.connectionMode))throw new Error('Invalid cast connection mode.');routing.connectionMode=raw.connectionMode;}
  if(raw.singleVoices!==undefined){
    if(!raw.singleVoices || typeof raw.singleVoices!=='object' || Array.isArray(raw.singleVoices))throw new Error('Invalid single-provider voice choices.');
    routing.singleVoices=Object.fromEntries(Object.entries(raw.singleVoices).map(([route,choices])=>{
      if(!/^native:[\w.-]+$/.test(route) || !choices || typeof choices!=='object' || Array.isArray(choices) || Object.keys(choices).length>550)throw new Error('Invalid single-provider voice choices.');
      return [route,Object.fromEntries(Object.entries(choices).map(([speaker,voice])=>{
        if(!speaker.trim() || speaker.length>100 || typeof voice!=='string' || voice.length>1000)throw new Error('Invalid single-provider voice choice.');return [speaker,voice];
      }))];
    }));
  }
  const clean=actor=>{
    if(!actor || typeof actor.speaker!=='string' || typeof actor.voice!=='string' || typeof actor.style!=='string')throw new Error('Invalid imported cast row.');
    if(actor.sayAs!==undefined && (typeof actor.sayAs!=='string' || actor.sayAs.length>120 || /[<>\[\]\r\n]/u.test(actor.sayAs)))throw new Error('Invalid imported name pronunciation.');
    return Object.fromEntries(['speaker','voice','style','route','gender','aliases','pronunciation','sayAs','accent','excluded'].filter(key=>actor[key]!==undefined).map(key=>[key,structuredClone(actor[key])]));
  };
  return {...routing,fixed:raw.fixed.map(clean),casts:Object.fromEntries(Object.entries(raw.casts).map(([route,actors])=>{
    if(!Array.isArray(actors) || actors.length>500 || !/^native:[\w.-]+$/.test(route))throw new Error('Invalid imported cast provider.');
    return [route,actors.map(clean)];
  }))};
}

export function speechSourceUnits(transcript) {
  const units=[];let sourceCursor=0;
  const add=(text,kind)=>{if(text.trim()) {
    const start=transcript.indexOf(text.trim(),sourceCursor),end=start+text.trim().length;
    units.push({id:units.length,kind,text:text.trim(),start,end});sourceCursor=end;
  }};
  const narration=text=>{
    let cursor=0;
    for(const match of text.matchAll(/[.!?…]+(?=\s|$)|\n+/g)) {
      const end=match.index+match[0].length;add(text.slice(cursor,end),'narration');cursor=end;
    }
    add(text.slice(cursor),'narration');
  };
  let cursor=0;
  for(const match of transcript.matchAll(/"[^"\n]*(?:\n[^"\n]*)*"|“[^”]*”/g)) {
    narration(transcript.slice(cursor,match.index));add(match[0],'dialogue');cursor=match.index+match[0].length;
  }
  narration(transcript.slice(cursor));return units;
}

export function resolvePlanReferences(raw, transcript, config) {
  if(!raw || !Array.isArray(raw.segments))return raw;
  if(!raw.segments.some(segment=>Array.isArray(segment?.unit_ids)))throw new Error('Return unit_ids for the supplied sourceUnits, without copying transcript text.');
  const units=speechSourceUnits(transcript),segments=[];
  let cursor=0;
  for(const [index,segment] of raw.segments.entries()) {
    if(!Array.isArray(segment?.unit_ids) || !segment.unit_ids.length)throw new Error(`Segment ${index+1} needs consecutive unit_ids.`);
    for(const id of segment.unit_ids) {
      if(!Number.isInteger(id) || id!==cursor || !units[id])throw new Error(`Segment ${index+1} skips or reorders source unit ${cursor}. Return every unit ID exactly once in order.`);
      const unit=units[cursor++];
      const speaker=unit.kind==='narration'?'Narrator':segment.speaker;
      const narrator=config.fixed.find(actor=>normalizeName(actor.speaker)==='narrator');
      segments.push({...segment,unison:unit.kind==='narration'?undefined:segment.unison,unit_ids:undefined,speaker,text:unit.text,__start:unit.start,__end:unit.end,
        voice:unit.kind==='narration' && narrator?.voice?narrator.voice:segment.voice});
    }
  }
  if(cursor!==units.length)throw new Error(`The plan omits source units starting at ${cursor}. Include all ${units.length} source units.`);
  // Coalesce only adjacent source pieces assigned to the same voice and delivery.
  const merged=[];
  for(const segment of segments) {
    const last=merged.at(-1);
    if(last && !last.unison && !segment.unison && !unisonSpeakers(transcript,{kind:/^["“]/.test(segment.text)?'dialogue':'narration',start:segment.__start,end:segment.__end},config) && last.speaker===segment.speaker && last.voice===segment.voice && last.style===segment.style && last.gender===segment.gender) {
      last.__end=segment.__end;last.text=transcript.slice(last.__start,last.__end);
    } else merged.push(segment);
  }
  return {segments:merged.map(({__start,__end,unit_ids,...segment})=>segment),
    ...(Array.isArray(raw.newNPCs)?{newNPCs:raw.newNPCs}:{})};
}

export const MAX_SPEECH_CHARS = 10000;
export const GEMINI_SPEECH_BYTES = 6000;

export function speechProviderFamily(provider='',model='') {
  const name=String(provider).toLowerCase();
  if(name==='openrouter_tts'){
    if(/^fish-audio\//i.test(model))return 'fish_audio';
    if(/^google\/gemini-.*tts/i.test(model))return 'gemini';
    if(/^openai\//i.test(model))return 'openai_tts';
  }
  if(name.includes('fish'))return 'fish_audio';
  if(['google_tts','google_vertex_tts','google','aistudio','vertex','google-ai-studio','vertex-ai','gemini'].includes(name) || name.includes('vertex') || name.includes('aistudio'))return 'gemini';
  return name;
}

export function speechRequestLimits(provider = '', model = '') {
  const name=speechProviderFamily(provider,model);
  if(name.includes('openai'))return {maxChars:4096};
  if(name.includes('fish'))return {maxChars:MAX_SPEECH_CHARS};
  if(name.includes('eleven'))return {maxChars:String(model).startsWith('eleven_v3')?5000:MAX_SPEECH_CHARS};
  if(['gemini','google','aistudio','vertex'].some(part=>name.includes(part)))return {maxChars:MAX_SPEECH_CHARS,maxBytes:GEMINI_SPEECH_BYTES};
  return {maxChars:2000};
}

export function splitSegment(segment, maxChars = 350, maxBytes = Infinity, {transform=text=>text,atomic=[]}={}) {
  if (!Number.isInteger(maxChars) || maxChars < 80 || maxChars > MAX_SPEECH_CHARS) throw new Error('Chunk size must be 80–10000 characters.');
  if(maxBytes!==Infinity && (!Number.isInteger(maxBytes) || maxBytes<80))throw new Error('Speech byte budget must be at least 80.');
  const bytes=text=>maxBytes===Infinity?0:new TextEncoder().encode(text).length;
  const fits=text=>{const speech=transform(text);return speech.length<=maxChars && bytes(speech)<=maxBytes;};
  const names=wholeNamePattern(atomic);
  const out = [];
  let text = segment.text;
  while (!fits(text)) {
    let limit=Math.min(text.length,maxChars);
    if(transform(text)===text){
      // Most passages need no respelling. Preserve the fast byte-budget search.
      if(bytes(text.slice(0,limit))>maxBytes){
        let low=0,high=limit;
        while(low<high){const mid=Math.ceil((low+high)/2);if(bytes(text.slice(0,mid))<=maxBytes)low=mid;else high=mid-1;}
        limit=low;
      }
    }else while(limit>0 && !fits(text.slice(0,limit)))limit--;
    if(!limit)throw new Error('A pronunciation is too long for this speech request. Shorten its Say name as spelling.');
    const head = text.slice(0, limit);
    const sentence = [...head.matchAll(/[.!?…]["'”’]?\s+/g)].at(-1);
    let end = sentence && sentence.index > limit/3 ? sentence.index + sentence[0].length : head.lastIndexOf(' ');
    if (end < limit/3) end = limit;
    // Keep a mapped name intact even when its original spelling spans words.
    if(names)for(const match of text.matchAll(names))if(match.index<end && match.index+match[0].length>end){
      end=match.index || match[0].length;
      if(!fits(text.slice(0,end)))throw new Error('A name pronunciation exceeds the speech request limit. Shorten its Say name as spelling or raise Max characters per request.');
      break;
    }
    // Do not split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(text[end-1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    out.push({...segment, text:text.slice(0,end).trim()});
    text = text.slice(end).trimStart();
  }
  if (text.trim()) out.push({...segment,text:text.trim()});
  return out;
}

export function speechBatches(segments,maxChars,defaultRoute,limitsForSegment=()=>({})) {
  const batches=[];
  for(const source of segments) {
    const limits=limitsForSegment(source,source.route || defaultRoute);
    const charLimit=Math.min(maxChars,limits.maxChars || maxChars),byteLimit=limits.maxBytes ?? Infinity;
    for(const segment of splitSegment(source,charLimit,byteLimit,{transform:limits.speechText,atomic:limits.atomicWords})) {
    const route=segment.route || defaultRoute,previous=batches.at(-1);
    const joined=previous?previous.text+'\n'+segment.text:'';
    const spokenJoined=limits.speechText?limits.speechText(joined):joined;
    const fits=previous && spokenJoined.length<=charLimit && (byteLimit===Infinity || new TextEncoder().encode(spokenJoined).length<=byteLimit);
    if(segment.unison){batches.push({...segment,route});continue;}
    if(previous && !previous.unison && !previous.kind && !segment.kind && previous.route===route && previous.voice===segment.voice && previous.speaker===segment.speaker && previous.style===segment.style && fits)previous.text+='\n'+segment.text;
    else batches.push({...segment,route});
    }
  }
  return batches;
}

// A short opening clip starts playback while later, bounded clips are prefetched.
// The caller supplies provider capabilities and delivery/mixer compatibility.
export function groupedSpeechBatches(segments,maxChars,defaultRoute,limitsForSegment,{sfx=false,startup=true}={}) {
  const batches=[],queue=segments.map(segment=>({...segment}));
  let current=null,first=startup,currentLimits,openingLimit;
  const flush=()=>{if(current){batches.push(current);if(!current.kind)first=false;current=null;}};
  const turnsFor=batch=>batch.turns || [{...batch}];
  while(queue.length){
    const source=queue.shift(),route=source.route || defaultRoute;
    if(source.kind){flush();batches.push({...source,route});continue;}
    if(source.unison){
      flush();const limits=limitsForSegment(source,route);
      batches.push(...splitSegment({...source,route},Math.min(maxChars,limits.maxChars || maxChars),limits.maxBytes ?? Infinity,{transform:limits.speechText,atomic:limits.atomicWords}));first=false;continue;
    }
    const limits=limitsForSegment(source,route),opening=sfx?900:1200;
    // Keep a moderate passage intact. A long opening turn still starts with a
    // short clip; later requests remain bounded by the provider and user limit.
    openingLimit ??= source.text.length<=opening?opening:600;
    const cap=Math.min(maxChars,limits.maxChars || maxChars,first?openingLimit:sfx?900:2400);
    const turns=current?turnsFor(current):[],names=new Map(turns.map(turn=>[turn.speaker,turn.voice]));
    const compatible=current && current.route===route && currentLimits.group===limits.group &&
      (!names.has(source.speaker) || names.get(source.speaker)===source.voice) &&
      (limits.maxSpeakers>0 ? new Set([...names.keys(),source.speaker]).size<=limits.maxSpeakers : current.speaker===source.speaker && current.voice===source.voice && current.style===source.style) &&
      turns.length<200;
    if(current && !compatible){flush();queue.unshift(source);continue;}
    const measure=items=>limits.measure?limits.measure(items):{chars:items.map(turn=>turn.text).join('\n').length,bytes:new TextEncoder().encode(items.map(turn=>turn.text+(turn.style || '')).join('\n')).length};
    const candidate=[...turns,source],size=measure(candidate);
    if(current && (size.chars>cap || size.bytes>(limits.maxBytes ?? Infinity))){flush();queue.unshift(source);continue;}
    if(size.chars>cap || size.bytes>(limits.maxBytes ?? Infinity)){
      const overhead=measure([{...source,text:''}]);
      const pieces=splitSegment(source,Math.max(80,cap-overhead.chars),limits.maxBytes?limits.maxBytes-overhead.bytes:Infinity,{transform:limits.speechText,atomic:limits.atomicWords});
      if(pieces.length<2)throw new Error('Delivery instructions leave too little room for grouped speech.');
      queue.unshift(...pieces);continue;
    }
    if(current){
      current.turns=candidate;current.text=candidate.map(turn=>turn.text).join('\n');
      current.speaker=[...new Set(candidate.map(turn=>turn.speaker))].join(' / ');
    }else{current={...source,route};currentLimits=limits;}
  }
  flush();
  // A single voice needs no dialogue payload, even when several passages joined.
  return batches.map(batch=>batch.turns && new Set(batch.turns.map(turn=>turn.speaker)).size===1
    && batch.turns.every(turn=>turn.style===batch.turns[0].style)?{...batch,dialogue:false}:batch.turns?{...batch,dialogue:true}:batch);
}

export function audioBytes(base64, mimeType) {
  const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const isWav = data.length >= 12 && String.fromCharCode(...data.slice(0,4)) === 'RIFF' && String.fromCharCode(...data.slice(8,12)) === 'WAVE';
  if (isWav || !/audio\/(?:l16|pcm)/i.test(mimeType)) return {data,mimeType:isWav ? 'audio/wav' : mimeType};
  const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1] || 24000);
  if (rate < 8000 || rate > 192000 || data.length % 2) throw new Error('Invalid PCM audio.');
  const output = new Uint8Array(44+data.length);
  const view = new DataView(output.buffer);
  for (const [offset,value] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']]) {
    [...value].forEach((char,i) => view.setUint8(offset+i,char.charCodeAt(0)));
  }
  view.setUint32(4,36+data.length,true); view.setUint32(16,16,true);
  view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,rate,true);
  view.setUint32(28,rate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  view.setUint32(40,data.length,true); output.set(data,44);
  return {data:output,mimeType:'audio/wav'};
}

// Words from the Fish Audio community library's tag vocabulary that describe how a voice sounds.
export const FISH_VOICE_TAGS='deep, low, high, soft, gentle, warm, calm, bright, clear, crisp, smooth, raspy, husky, breathy, energetic, cheerful, playful, confident, authoritative, serious, dramatic, mysterious, dark, intimate, expressive, narration, storytelling, character-voice, anime';

// cast-r1e, the winner of the castbench casting benchmark: one compact request casts the whole reply.
// Measured as is; keep the prompt text verbatim. Only the cast-without-voice and community lines are additions.
const CASTING_SYSTEM = `You are an audiobook casting director. For every quoted line (marked D<id>) in the reply, decide who says it aloud.
Rules:
- Use attribution tags, actions next to the quote, turn-taking, and point of view. In first-person narration, 'I' is the narrating character (see aliases).
- Use the exact cast name for cast members (never an alias).
- A speaker not in the cast is a new NPC: use their story name if given, otherwise a stable description (e.g. 'the black-haired twin', 'Gate guard'), never placeholders like NPC_1. Keep different unnamed people as different identities and reuse the same identity for the same person.
- Write NOT_SPOKEN for quoted text nobody says aloud in the scene: written text, signs, messages, titles, thoughts, quoted terms, remembered or hypothetical words, and lines suggested for someone to say.
- If the reply is not an in-scene story moment (analysis, summary, notes, out-of-character commentary, options, instructions), its quotes are citations: NOT_SPOKEN.
- style: a short expressive delivery instruction (emotion, tone, pacing), never words to speak.
Output format, plain text only, one line per D id in order, nothing else:
D<id>|speaker|style
Then one line per new NPC you used: NPC|name|female/male/neutral|voice id from the available voices (match gender and character).`;

// Names compare without case, punctuation or a leading article.
const castKey = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().replace(/^(?:the|a|an) /, '');
const npcRoute = config => config.npcPolicy?.route || config.defaultRoute || '';
// Speakers searched in the Fish community library get no catalogue voice.
function routeVoices(config, route, npc) {
  const policy=npc?config.npcPolicy:null,voices=config.voices.filter(voice=>(voice.route || '')===route);
  if(policy?.mode==='preferred')return voices.filter(voice=>policy.voices.includes(voice.id));
  return config.communityRoutes?.[route]==='community' && (!policy || policy.mode==='llm')?[]:voices;
}

export function castingPrompt(units, config, context) {
  const actors=[...config.fixed,...config.npcs],cast=[];
  for(const actor of actors) {
    if(normalizeName(actor.speaker)==='narrator')continue;
    const aliases=(actor.aliases || []).filter(Boolean);
    const profile=(config.characterProfiles || []).find(item=>item.speaker===actor.speaker);
    const role=profile?.role || (config.npcs.includes(actor)?'npc':'');
    const about=Array.from(String(profile?.description || '').replace(/\s+/g,' ')).slice(0,220).join('');
    cast.push(`- ${actor.speaker}${aliases.length?` (aliases: ${aliases.join(', ')})`:''}${role?` [${role}]`:''}${about?`: ${about}`:''}`);
  }
  const used=new Set(actors.map(actor=>actor.voice));
  const voices=routeVoices(config,npcRoute(config),true).slice(0,60).filter(voice=>!used.has(voice.id)).map(voice=>`${voice.id} (${voice.gender ?? ''}, ${voice.description ?? ''})`).join('; ');
  const unvoiced=actors.filter(actor=>!(config.npcs.includes(actor)?npcCastActor(actor,config):actor).voice).map(actor=>actor.speaker);
  const system=CASTING_SYSTEM+(unvoiced.length?`\nThese cast members have no voice yet; add an NPC line for each of them too: ${unvoiced.join(', ')}.`:'')
    +(config.communityRoutes && Object.keys(config.communityRoutes).length?`\nIf no voice id fits (none listed), write the NPC voice as young, middle-aged or old and 1 to 4 tone words from: ${FISH_VOICE_TAGS}. Then add one line: LANG|ISO 639-1 code of the story's language.`:'');
  const lines=units.map(unit=>unit.kind==='dialogue'?`D${unit.id}: ${unit.text}`:`   ${unit.text}`);
  return [{role:'system',content:system},
    {role:'user',content:`Cast:\n${cast.join('\n')}\n\nAvailable voices for new NPCs: ${voices}\n\nEarlier chat (context only):\n${context}\n\nReply to cast (indented lines are narration):\n${lines.join('\n')}`}];
}

// Rows: `D<id>|speaker|style`, `NPC|name|gender|voice` and `LANG|code`; anything else is ignored.
export function parseCastRows(text) {
  const speakers=new Map(),styles=new Map(),npcs=new Map();let language='';
  for(const line of String(text || '').split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)) {
    const parts=line.trim().replace(/^[-* ]+|[-* ]+$/g,'').split('|').map(part=>part.trim().replace(/^[*`]+|[*`]+$/g,''));
    if(parts.length>=2 && /^D?\d+$/.test(parts[0])){const id=Number(parts[0].replace(/^D/,''));speakers.set(id,parts[1]);styles.set(id,parts[2] ?? '');}
    else if(parts.length>=3 && parts[0].toUpperCase()==='NPC')npcs.set(castKey(parts[1]),{name:parts[1],gender:parts[2].toLowerCase(),voice:parts[3] ?? ''});
    else if(parts.length>=2 && parts[0].toUpperCase()==='LANG')language=parts[1];
  }
  return {speakers,styles,npcs,language};
}

const FISH_TAGS=new Set(FISH_VOICE_TAGS.split(', '));
const emptyCast=()=>({speakers:new Map(),styles:new Map(),npcs:new Map(),language:''});

// llm(messages) resolves to the answer text; empty text means the provider blocked or refused the request.
// Resolves to a plan with unit_ids for resolvePlanReferences, or null when no casting came back.
export async function castReply(transcript, config, context, llm) {
  const units=speechSourceUnits(transcript),dialogue=units.filter(unit=>unit.kind==='dialogue').map(unit=>unit.id);
  const actors=[...config.fixed,...config.npcs],canon=new Map();
  for(const actor of actors)for(const name of [actor.speaker,...(actor.aliases || [])])if(!canon.has(castKey(name)))canon.set(castKey(name),actor);
  const tail=(text,count)=>Array.from(text).slice(-count).join('');
  const ask=async(messages,ids)=>{
    const found=emptyCast();
    for(let attempt=0;attempt<2;attempt++) {
      const text=await llm(messages);
      if(!String(text || '').trim())return null;
      const rows=parseCastRows(text);
      for(const [id,speaker] of rows.speakers)if(ids.includes(id) && !found.speakers.has(id)){found.speakers.set(id,speaker);found.styles.set(id,rows.styles.get(id));}
      for(const [key,npc] of rows.npcs)if(!found.npcs.has(key))found.npcs.set(key,npc);
      found.language||=rows.language;
      const missing=ids.filter(id=>!found.speakers.has(id));
      if(!missing.length)break;
      messages=[...messages,{role:'assistant',content:text},{role:'user',content:`You missed these ids: ${missing.map(id=>`D${id}`).join(', ')}. Return only their lines (and NPC lines for any new speaker) in the same format.`}];
    }
    return found;
  };
  let cast=dialogue.length?await ask(castingPrompt(units,config,tail(context || '',3000)),dialogue):emptyCast();
  if(!cast) {
    // Providers that block a whole reply usually accept it in parts, sent in parallel without the earlier chat.
    const chunks=[];let current=[],size=0;
    for(const unit of units) {
      if(current.length && size+unit.text.length>1200){chunks.push(current);current=[];size=0;}
      current.push(unit);size+=unit.text.length;
    }
    chunks.push(current);
    const parts=await Promise.all(chunks.map((chunk,index)=>{
      const ids=chunk.filter(unit=>unit.kind==='dialogue').map(unit=>unit.id),before=index?tail(chunks[index-1].map(unit=>unit.text).join(' '),600):'';
      return ids.length?ask(castingPrompt(chunk,config,before?`Earlier in this reply: ${before}`:''),ids):null;
    }));
    cast=emptyCast();
    for(const part of parts.filter(Boolean)) {
      for(const [id,speaker] of part.speakers){cast.speakers.set(id,speaker);cast.styles.set(id,part.styles.get(id));}
      for(const [key,npc] of part.npcs)if(!cast.npcs.has(key))cast.npcs.set(key,npc);
      cast.language||=part.language;
    }
  }
  if(dialogue.length && !cast.speakers.size)return null;
  const narrator=config.fixed.find(actor=>normalizeName(actor.speaker)==='narrator'),newNames=new Map(),speakers=new Map();
  dialogue.forEach((id,index)=>{
    const answered=cast.speakers.get(id) ?? dialogue.slice(0,index).map(previous=>cast.speakers.get(previous)).filter(name=>name!==undefined).at(-1) ?? 'NOT_SPOKEN';
    const key=castKey(answered);
    if(['not spoken','nobody','narrator',''].includes(key.replace(/_/g,' ')))speakers.set(id,narrator);
    else if(canon.has(key))speakers.set(id,canon.get(key));
    else {if(!newNames.has(key))newNames.set(key,answered);speakers.set(id,newNames.get(key));}
  });
  // Assigned voices stay; a missing or unsuitable voice is the first unused catalogue voice of the wanted gender.
  const used=new Set(actors.map(actor=>actor.voice).filter(Boolean)),choices=new Map();
  const choose=speaker=>{
    const actor=typeof speaker==='string'?null:speaker,name=actor?actor.speaker:speaker,key=castKey(name);
    if(choices.has(key))return choices.get(key);
    const npc=!config.fixed.includes(actor),selected=actor && npc?npcCastActor(actor,config):actor,row=cast.npcs.get(key) || {};
    const gender=[selected?.gender,row.gender].find(value=>['female','male','neutral'].includes(value)) || 'auto';
    let choice={speaker:name,voice:selected?.voice || '',gender};
    if(!choice.voice) {
      const route=actor?selected.route || config.defaultRoute || '':npcRoute(config),pool=routeVoices(config,route,npc);
      const fits=voice=>gender==='auto' || !voice.gender || voice.gender===gender,free=pool.filter(voice=>!used.has(voice.id));
      choice.voice=(pool.find(voice=>voice.id===row.voice && fits(voice)) || free.find(voice=>gender==='auto' || voice.gender===gender) || free.find(fits) || pool.find(fits) || free[0] || pool[0])?.id || '';
      if(choice.voice)used.add(choice.voice);
      else if(config.communityRoutes?.[route]) {
        const words=String(row.voice || '').toLowerCase().match(/[a-z-]+/g) || [];
        choice.voiceSearch={gender,age:words.find(word=>['young','middle-aged','old'].includes(word)) || '',tags:words.filter(word=>FISH_TAGS.has(word)).slice(0,4)};
      }
    }
    choices.set(key,choice);return choice;
  };
  const segments=units.map(unit=>{
    if(unit.kind==='narration')return {...choose(narrator),style:'',unit_ids:[unit.id]};
    const members=unisonSpeakers(transcript,unit,config);
    return {...choose(speakers.get(unit.id)),style:cast.styles.get(unit.id) || 'natural, matching the scene',unit_ids:[unit.id],
      ...(members?.length>=2?{unison:members.map(member=>{const {gender,...voice}=choose(actors.find(actor=>actor.speaker===member));return voice;})}:{})};
  });
  return {segments,...(cast.language?{language:cast.language}:{})};
}

// Non-story check: the frozen skip-bench winner prompt. Measured as is; keep it verbatim.
const SKIP_CHECK_SYSTEM = `You clean AI roleplay replies for an audiobook that reads only the STORY.
Label every numbered line of the reply: K = story, S = not story (skip).
S: model reasoning/planning, checklists, word counts, writing rules, recaps/summaries, setting checks, final reviews,
trackers/status panels/HUD (date/time/location stamps, stats, attire lists, relationship meters, threads),
character profile/sheet entries, choice menus offered to the user, OOC/author notes, commentary addressed to the user,
credits, settings, banners, image placeholders/markup codes, game logs, counters, hidden spoiler sections,
and the headers/labels of such blocks. A meta block stays S even if it quotes dialogue.
K: narration, dialogue, thoughts, sound effects, and in-world text that characters see, write, send or read in the scene
(letters, texts, chat/stream comments, forms, signs, songs). Prose containing a colon is still K.
When unsure, use K: cutting story is much worse than reading a meta line.

Example 1 lines:
0: Mira pushed the door open. Rain dripped from her coat.
1: "You're late," Tom said.
2: [Status] Day 3 | 21:40 | Harbor Inn
3: Mira — Mood: tired | Trust: 40%
4: What will you do?
5: - Ask about the letter
Example 1 answer: 
0 K
1 K
2 S
3 S
4 S
5 S
Example 2 lines:
0: Okay, I need to show her fear first, then the reveal. Keep it under 400 words.
1: The note on the table read: MEET ME AT THE PIER.
2: Kai: are u coming or not
3: She typed back with shaking fingers.
Example 2 answer: 
0 S
1 K
2 K
3 K

Answer with one row per line, nothing else: the line number, a space, then K or S. Example:
0 K
1 S`;

// The lines the check labels: the transcript's non-empty lines, trimmed.
export function transcriptLines(transcript) {
  return String(transcript || '').split('\n').map(line=>line.trim()).filter(Boolean);
}

// width shortens every line; a retry with line heads gets past some providers' content blocks.
export function skipCheckPrompt(lines, width=160) {
  const numbered=lines.map((line,index)=>`${index}: ${Array.from(line).slice(0,width).join('')}`).join('\n');
  return [{role:'system',content:SKIP_CHECK_SYSTEM},
    {role:'user',content:`Reply to label (${lines.length} lines):\n${numbered}\n\nReturn exactly ${lines.length} labels.`}];
}

// Rows are `index K|S`; missing rows stay story. Null when the answer has no rows at all.
export function parseSkipRows(text, count) {
  const labels=Array(count).fill('K');let rows=0;
  for(const [,index,label] of String(text || '').matchAll(/^\D{0,3}(\d+)\s*[:=\-]?\s*\W{0,2}([KSks])\b/gm)) {
    if(Number(index)<count){labels[Number(index)]=label.toUpperCase();rows++;}
  }
  return rows?labels.join(''):null;
}

// Whole-line template or inlay markup is never story, whatever the labels say.
export function skippedLines(lines, labels) {
  return lines.flatMap((line,index)=>/^\s*(INLAY\[)?\{\{[^{}]*\}\}\]?\s*$/.test(line) || labels?.[index]==='S'?[index]:[]);
}

export function withoutLines(transcript, skip) {
  if(!skip?.length)return transcript;
  const skipped=new Set(skip);let index=0;
  return String(transcript).split('\n').filter(line=>!line.trim() || !skipped.has(index++))
    .join('\n').replace(/\n\s*\n/g,'\n\n').trim();
}

export function resolvePlannerMode(config = {}) {
  if (['llm', 'jev', 'heuristic'].includes(config.plannerMode)) return config.plannerMode;
  if (config.useJev) return 'jev';
  return config.useFastClassifier ? 'heuristic' : 'llm';
}

export function fastClassifyPlan(transcript, config, failure) {
  if(failure){delete failure.reason;delete failure.message;delete failure.unitId;}
  const units=typeof transcript==='string'?speechSourceUnits(transcript):[];
  const stop=(reason,message,unit)=>{
    if(failure){
      failure.reason=reason;
      const excerpt=unit?.text.replace(/\s+/g,' ').trim();
      const dialogue=unit?` Dialogue ${units.filter(item=>item.kind==='dialogue').findIndex(item=>item.id===unit.id)+1}: ${excerpt.length>140?excerpt.slice(0,137)+'…':excerpt}`:'';
      if(unit)failure.unitId=unit.id;
      failure.message=`${message}${dialogue} No LLM request was made.`;
    }
    return null;
  };
  if (!units.length) return stop('empty-transcript','Heuristic found no speech to plan.');

  const narrator = config.fixed?.find(a => normalizeName(a.speaker) === 'narrator') || {
    speaker: 'Narrator',
    voice: config.voices?.[0]?.id || '',
    route: config.defaultRoute || '',
    style: '',
    gender: 'auto'
  };
  if (!narrator.voice) return stop('missing-voice',`Heuristic needs a voice for ${narrator.speaker}. Choose a voice in Lead Cast or click Apply default for this chat; “Let LLM choose” requires Standard LLM.`);

  const dialogueUnits = units.filter(u => u.kind === 'dialogue');

  // Case 1: Pure narration (no quotes in transcript)
  if (dialogueUnits.length === 0) {
    const raw = {
      segments: [
        {
          speaker: narrator.speaker || 'Narrator',
          voice: narrator.voice,
          route: narrator.route || config.defaultRoute || '',
          style: '',
          gender: narrator.gender || 'auto',
          unit_ids: units.map(u => u.id)
        }
      ],
      npcs: config.npcs || []
    };
    try {
      return validatePlan(resolvePlanReferences(raw, transcript, config), transcript, config);
    } catch(error) {
      return stop('invalid-plan',`Heuristic could not validate this plan: ${error.message}`);
    }
  }

  // Find candidate characters (excluding narrator)
  const allCast = [...(config.fixed || []), ...(config.npcs || [])];
  const candidates = allCast.filter(a => normalizeName(a.speaker) !== 'narrator');
  if (!candidates.length) return stop('no-characters','Heuristic found quoted dialogue but no character in the cast. Add the speaker to Lead Cast or choose Jev or LLM.',dialogueUnits[0]);

  // Emotion/style detector
  const detectStyle = (textSnippet) => {
    if (/whisper|murmur|mutter/i.test(textSnippet)) return 'whispering';
    if (/shout|yell|scream/i.test(textSnippet)) return 'shouting';
    if (/laugh|chuckle|giggle|smil/i.test(textSnippet)) return 'cheerful';
    if (/sigh/i.test(textSnippet)) return 'sigh';
    if (/gasp/i.test(textSnippet)) return 'gasp';
    if (/cry|sob/i.test(textSnippet)) return 'crying';
    if (/growl|snap|angry/i.test(textSnippet)) return 'angry';
    return '';
  };

  const getImmediateTag = (u) => {
    const afterRaw = transcript.slice(u.end);
    const afterBoundary = afterRaw.search(/[.!?\n"“”]|$/);
    // A clause leading into the next quote belongs to that next turn.
    const afterTag = /["“]/.test(afterRaw[afterBoundary] || '') ? '' : afterRaw.slice(0, Math.min(afterBoundary + 1, 50));

    const beforeRaw = transcript.slice(0, u.start);
    const prevPunc = Math.max(...['.', '!', '?', '"', '“', '”', '\n'].map(mark=>beforeRaw.lastIndexOf(mark)));
    const beforeTag = beforeRaw.slice(prevPunc === -1 ? 0 : prevPunc + 1);

    return { beforeTag, afterTag };
  };

  const findSpeakerInTag = (tagText) => {
    const matches=candidates.filter(cand=>[cand.speaker,...(cand.aliases || [])].some(name=>{
        if(!name.trim())return false;
        const esc = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('(?<![\\p{L}\\p{N}_])' + esc + '(?![\\p{L}\\p{N}_])', 'iu').test(tagText);
    }));
    return {actor:matches.length===1?matches[0]:null,ambiguous:matches.length>1,matches};
  };

  const preferredActor = config.speaker ? (
    candidates.find(c => [c.speaker,...(c.aliases || [])].some(name=>normalizeName(name)===normalizeName(config.speaker))) ||
    (Object.values(config.casts || {}).flat()).find(c => [c.speaker,...(c.aliases || [])].some(name=>normalizeName(name)===normalizeName(config.speaker)))
  ) : null;

  // Case 2: 1-on-1 character dialogue
  const isOneOnOne = candidates.length === 1 && candidates[0].voice;
  // Lumiverse replaces the persona placeholder with its real name. Preserve its
  // role explicitly rather than requiring the speaker to remain named "User".
  const persona=config.personaSpeaker
    ? candidates.find(actor=>normalizeName(actor.speaker)===normalizeName(config.personaSpeaker))
    : candidates.find(actor=>['user','persona','you'].includes(normalizeName(actor.speaker)));
  const singleCharacter = isOneOnOne ? candidates[0] : candidates.length===2 && persona
    ? candidates.find(actor=>actor!==persona && actor.voice) : null;

  const unitAssignments = [];

  for (const u of units) {
    if (u.kind === 'narration') {
      unitAssignments.push({
        speaker: narrator.speaker || 'Narrator',
        voice: narrator.voice,
        route: narrator.route || config.defaultRoute || '',
        style: '',
        gender: narrator.gender || 'auto',
        unit_ids: [u.id]
      });
      continue;
    }

    const collective=unisonSpeakers(transcript,u,config);
    if(collective){
      if(collective.length<2)return stop('ambiguous-unison','Heuristic needs the names of the people speaking in unison.',u);
      const members=collective.map(name=>candidates.find(actor=>actor.speaker===name));
      if(members.some(actor=>!actor?.voice))return stop('missing-voice','Assign a voice to every person speaking in unison.',u);
      unitAssignments.push({speaker:members[0].speaker,voice:members[0].voice,unit_ids:[u.id],unison:members.map(actor=>({...actor,style:''}))});continue;
    }
    const { beforeTag, afterTag } = getImmediateTag(u);
    const after=findSpeakerInTag(afterTag),before=findSpeakerInTag(beforeTag);
    if(after.ambiguous || before.ambiguous){
      const names=[...new Set([...after.matches,...before.matches].map(actor=>actor.speaker))];
      return stop('multiple-speakers',`Heuristic found several cast names near this quote: ${names.join(', ')}. Add a clear speaker tag or choose Jev or LLM.`,u);
    }
    if(after.actor && before.actor && after.actor!==before.actor)return stop('conflicting-tags',`Heuristic found conflicting speaker tags: ${before.actor.speaker} before this quote and ${after.actor.speaker} after it. Clarify the speaker or choose Jev or LLM.`,u);
    let assigned = after.actor || before.actor;
    if (!assigned && preferredActor && preferredActor.voice) {
      assigned = preferredActor;
    }
    if (!assigned && singleCharacter) {
      assigned = singleCharacter;
    }

    if (!assigned) return stop('unattributed-dialogue',`Heuristic could not identify the speaker for this quote.${candidates.length===2 && !persona?' For a one-character chat, select its persona in Lumiverse.':''} Add a clear speaker tag or choose Jev or LLM.`,u);
    if (!assigned.voice) return stop('missing-voice',`Heuristic identified ${assigned.speaker}, but that speaker has no assigned voice. Choose a voice for ${assigned.speaker}; “Let LLM choose” requires Standard LLM.`,u);
    const style = detectStyle(afterTag) || detectStyle(beforeTag);

    unitAssignments.push({
      speaker: assigned.speaker,
      voice: assigned.voice,
      route: assigned.route || config.defaultRoute || '',
      style,
      gender: assigned.gender || 'auto',
      unit_ids: [u.id]
    });
  }

  const raw = {
    segments: unitAssignments,
    npcs: config.npcs || []
  };

  try {
    return validatePlan(resolvePlanReferences(raw, transcript, config), transcript, config);
  } catch(error) {
    return stop('invalid-plan',`Heuristic could not validate this plan: ${error.message}`);
  }
}

// Stories and LLM replies mix typographic and ASCII quotes; one-for-one replacement keeps offsets valid.
const plainQuotes = text => text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

export function cueOffset(text, trigger) {
  if (!trigger) return 0;
  text = plainQuotes(text); trigger = plainQuotes(trigger);
  const exact = text.indexOf(trigger);
  return exact >= 0 ? exact : text.toLowerCase().indexOf(trigger.toLowerCase());
}

// An action-word anchor must not cut its subject off from the verb. Keep an
// explicitly anchored conjunction clause, otherwise back up to punctuation.
export function sfxCueOffset(text, trigger) {
  let target=Math.max(0,cueOffset(text,trigger));
  if(!target)return 0;
  const quotations=[...text.matchAll(/"[^"]*(?:"|$)|“[^”]*(?:”|$)/g)];
  const utterance=quotations.find(quote=>target>=quote.index && target<quote.index+quote[0].length);
  if(utterance)target=utterance.index;
  if(/^(?:and|but|or|then|as|when|while|before|after|once|until|unless|because|although|though|since)\s+\S+/i.test(text.slice(target)) && !/[\p{L}\p{N}]/u.test(text[target-1]))return target;
  let boundary=0;
  for(const match of text.matchAll(/(?:[.!?…。！？,;:，；：—–]+["'”’\)\]]*\s+|\n[ \t]*\n+)/g)){
    const next=match.index+match[0].length;
    if(next>target)break;
    if(quotations.some(quote=>match.index>quote.index && next<quote.index+quote[0].length))continue;
    // A title, initial or decimal is part of its phrase, not a sentence break.
    if(match[0].startsWith('.') && /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|[a-z])\.$/i.test(text.slice(0,match.index+1)))continue;
    if(/^[.,]/.test(match[0]) && /\d/.test(text[match.index-1] || '') && /\d/.test(text[next] || ''))continue;
    boundary=next;
  }
  return boundary;
}

// Read-along compares only letters, digits and marks, so rendered markdown, quote styles and
// entities line up with the plain transcript. Case folding keeps UTF-16 offsets one-for-one.
const READABLE = /[\p{L}\p{N}\p{M}]/u;
const fold = ch => {const lower = ch.toLowerCase(); return lower.length === ch.length ? lower : ch;};

export function readableText(text) {
  let out = '';
  for (const ch of String(text || '')) if (READABLE.test(ch)) out += fold(ch);
  return out;
}

// texts are the message's DOM text nodes in order; at[i] points stream unit i back to [node, offset].
export function readAlongIndex(texts) {
  let stream = ''; const at = [];
  texts.forEach((text, node) => {
    let offset = 0;
    for (const ch of text) {
      if (READABLE.test(ch)) { stream += fold(ch); for (let k = 0; k < ch.length; k++) at.push([node, offset + k]); }
      offset += ch.length;
    }
  });
  return {stream, at};
}

// Passages are found in reading order, so a repeated phrase resolves to its next occurrence.
export function locatePassages(stream, passages) {
  let cursor = 0;
  return passages.map(text => {
    const key = readableText(text), start = key ? stream.indexOf(key, cursor) : -1;
    if (start < 0) return null;
    cursor = start + key.length;
    return [start, cursor];
  });
}

// Providers return no word timings: spread playback time over the characters, give
// punctuation the length of its pause, and round up to the end of the current word.
export function spokenLength(text, progress) {
  const pause = i => /[.!?…]/.test(text[i]) ? (/[.!?…]/.test(text[i + 1]) ? 1 : 6) : /[,;:]/.test(text[i]) ? 3 : /[—–\n]/.test(text[i]) ? 4 : 1;
  const weights = Array.from({length: text.length}, (_, i) => pause(i));
  let remaining = Math.min(1, Math.max(0, progress)) * weights.reduce((sum, weight) => sum + weight, 0), end = 0;
  while (end < text.length - 1 && remaining >= weights[end]) remaining -= weights[end++];
  while (end < text.length && !/\s/.test(text[end])) end++;
  return end;
}

// Kevin MacLeod's incompetech catalog: genre ids from genre.json and the feels used by more than a few tracks.
export const MUSIC_GENRES = {2:'African',3:'Blues',4:'Classical',5:'Contemporary',6:'Disco',7:'Electronica',8:'Funk',9:'Holiday',10:'Horror',11:'Jazz',12:'Latin',13:'Modern',14:'Musical',15:'Polka',16:'Pop',18:'Reggae',19:'Rock',20:'Silent Film Score',21:'Ska',22:'Soundtrack',23:'Stings',24:'Unclassifiable',25:'World',26:'Urban'};
export const MUSIC_FEELS = ['Action','Aggressive','Bouncy','Bright','Calming','Dark','Driving','Epic','Eerie','Grooving','Humorous','Intense','Mysterious','Mystical','Relaxed','Somber','Suspenseful','Unnerving','Uplifting'];

const musicTerms = (list, allowed, max) => {
  const words = (Array.isArray(list) ? list : []).filter(item => typeof item === 'string').map(item => item.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return [...new Set(allowed ? words.map(word => allowed.find(name => name.toLowerCase() === word.toLowerCase())).filter(Boolean) : words)].slice(0, max);
};

// Ambience and music entries may also be {stop:true}, which ends the current bed.
function segmentSoundCues(value, text, kind='sfx') {
  const cues = (Array.isArray(value) ? value : value ? [value] : []).flatMap(cue => {
    const stop = kind !== 'sfx' && cue?.stop === true;
    let sound = {stop};
    if (!stop && kind === 'music') {
      sound = {feels:musicTerms(cue?.feels, MUSIC_FEELS, 3), genres:musicTerms(cue?.genres, Object.values(MUSIC_GENRES), 2), keywords:musicTerms(cue?.keywords, null, 5)};
      if (!sound.feels.length && !sound.genres.length && !sound.keywords.length) return [];
    } else if (!stop) {
      const query = typeof cue?.query === 'string' ? cue.query.trim().replace(/\s+/g, ' ') : '';
      if (!query) return [];
      sound = {query};
    }
    const trigger = typeof cue.trigger === 'string' ? cue.trigger.trim() : '';
    return [{...sound, trigger: trigger && cueOffset(text, trigger) >= 0 ? trigger : ''}];
  });
  return cues.length ? cues : null;
}

const secondsOf = length => String(length || '').split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);

// Pieces are raw catalog entries; the best fits for the wanted feels, genres and keywords come first.
export function rankMusic(pieces, {feels=[], genres=[], keywords=[]}={}, n=10) {
  const wantFeels = feels.map(feel => feel.toLowerCase()), wantGenres = genres.map(genre => genre.toLowerCase()), words = keywords.map(word => word.toLowerCase());
  return (Array.isArray(pieces) ? pieces : []).filter(piece => piece?.filename && piece.title).map(piece => {
    const pieceFeels = String(piece.feel || '').split(',').map(feel => feel.trim().toLowerCase());
    const text = [piece.title, piece.description, piece.instruments].join(' ').toLowerCase();
    const score = 3 * wantFeels.filter(feel => pieceFeels.includes(feel)).length
      + (wantGenres.includes(String(MUSIC_GENRES[piece.genre] || '').toLowerCase()) ? 2 : 0)
      + words.filter(word => text.includes(word)).length
      + (secondsOf(piece.length) >= 90 ? 0.5 : 0);
    return {piece, score};
  }).sort((a, b) => b.score - a.score).slice(0, n).map(({piece}) => piece);
}

const AMBIENCE_LIMIT = 3, MUSIC_LIMIT = 3;

export function soundCueLimit(segments) {
  const characters = segments.reduce((total, segment) => total + String(segment.text || '').length, 0);
  return Math.min(12, Math.max(2, Math.ceil(characters / 400)));
}

export function soundCuePrompt(segments, {music=false, currentMusic=null}={}) {
  const playing = music && currentMusic ? [currentMusic.title && `"${currentMusic.title}"`, currentMusic.feels?.length && `(${currentMusic.feels.join(', ')})`].filter(Boolean).join(' ') : '';
  return [
    {role:'system',content:`You are the Foley editor for an audiobook. Choose short sound effects and looping background ambience that make the scene audible. Return ONLY JSON {"cues":[{"segment":0,"trigger":"exact words","query":"freesound search"}],"ambience":[{"segment":0,"trigger":"exact words","query":"freesound search"},{"segment":3,"trigger":"exact words","stop":true}]${music?',"music":[{"segment":0,"trigger":"exact words","feels":["Mysterious"],"genres":["Soundtrack"],"keywords":["harp","forest"]}]':''}}.
Choose only concrete physical sounds that happen in the scene as it is told: objects, movement, impacts, doors, footsteps, weather, fire, water, animals, vehicles, machines, weapons, crowds. Skip sounds that are remembered, imagined, hypothetical, negated or metaphorical. Skip voices and vocal sounds such as speech, laughter, sighs, gasps, screams and singing, because the voice actors perform those. Skip music.
segment is the index of the numbered segment where the sound happens. trigger copies 2 to 6 consecutive words exactly as written in that segment, in the original language, from the start of the sentence or clause where the sound happens; the effect plays right before those words. query is an English Freesound search of 1 to 3 words naming the sound source and action the way sound files are named, such as "door slam", "bottle clink", "egg crack" or "sword clash", whatever language the story uses. Never add places or scene details: every search word must match.
For sound effects, keep each spoken phrase intact. Anchor at a sentence start, after clause punctuation (comma, semicolon, colon or dash), or at a conjunction that begins a complete action group, such as "and slid" or "as the glass shattered". Include the subject with its action; never insert an effect between a name/pronoun and its verb, inside a noun phrase, or inside a quoted utterance. For "Once she took the bite, Kellin set the plate back on the walnut edge and slid his hand beneath the hoodie", use "Kellin set the plate" or "and slid his hand", never "set the plate" after Kellin. If the action has no nearby clean break, use the start of its sentence.
Return at most ${soundCueLimit(segments)} cues in story order, at most one per sentence. Prefer fewer, clearly audible moments.
ambience entries follow the same segment, trigger and query rules but start a quiet looping background bed for a sustained environment the scene clearly stays in, such as "rain", "tavern crowd", "forest birds", "wind" or "fire crackle". A bed starts right before its trigger words and lasts until the next ambience entry or the end of the text; an entry with "stop":true instead of a query ends it when the scene moves somewhere quiet. Return at most ${AMBIENCE_LIMIT} ambience entries in story order, none for brief sounds.${music?`
music entries follow the same segment and trigger rules but start instrumental background music that sits quietly under the narration and suits the mood and setting. feels lists 1 to 3 of: ${MUSIC_FEELS.join(', ')}. genres lists 1 or 2 of: ${Object.values(MUSIC_GENRES).join(', ')}. keywords lists 2 to 5 English words naming fitting instruments, mood or setting, such as "piano", "romantic", "lute", "tavern" or "space". Music lasts until the next music entry or the end of the text; an entry with "stop":true instead ends it. Read the entire text as a mood timeline before choosing cues. Return at most ${MUSIC_LIMIT} music entries in story order: one for the opening mood when needed, then one at each clear sustained mood change, including changes within the SAME segment or message. Do not let the opening mood decide the soundtrack for the whole message. For example, if a frightening encounter gives way to a tender romantic scene, start with Eerie/Suspenseful music, then use Calming/Relaxed music with romantic piano or strings at the exact words where tenderness begins. Use different feels and keywords for distinct moods. Keep one track through minor emotional beats and brief dialogue; use stop:true when silence fits better.${playing?` Music ${playing} is already playing from the previous text and carries on: return a music entry only when this text clearly changes the mood or setting, otherwise return no music entries. Check later parts of this text too; the opening may match the current music even when the ending needs a replacement.`:''}`:''}
Return {"cues":[],"ambience":[]${music?',"music":[]':''}} when nothing fits.`},
    {role:'user',content:JSON.stringify({segments:segments.map((segment, index) => ({index, speaker:segment.speaker, text:segment.text}))})}
  ];
}

export function parseSoundCues(content, segments) {
  const text = String(content || '').replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if(!text)throw new Error('the sound effect response returned no text');
  let parsed,hasJson=false;
  try { parsed = JSON.parse(text);hasJson=true; } catch {}
  if(!Array.isArray(parsed?.cues)){
    // Extract complete objects independently; braces in prose or JSON strings
    // must not join separate examples and the final answer into invalid JSON.
    for(let start=text.indexOf('{');start>=0;start=text.indexOf('{',start+1)){
      let depth=0,quoted=false,escaped=false;
      for(let end=start;end<text.length;end++){
        const char=text[end];
        if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;}
        else if(char==='"')quoted=true;
        else if(char==='{')depth++;
        else if(char==='}' && --depth===0){
          try{const candidate=JSON.parse(text.slice(start,end+1));if(Array.isArray(candidate?.cues))parsed=candidate;}catch{}
          break;
        }
      }
    }
  }
  if (!Array.isArray(parsed?.cues)) throw new Error(hasJson?'the sound effect response has no cues list':'the sound effect response was not valid JSON');
  const valid = (entries, kind) => (Array.isArray(entries) ? entries : []).flatMap(entry => {
    if (!Number.isInteger(entry?.segment) || !segments[entry.segment]) return [];
    const cue = segmentSoundCues(entry, segments[entry.segment].text, kind);
    return cue ? [{segment:entry.segment, ...cue[0]}] : [];
  });
  return {cues:valid(parsed.cues).slice(0, soundCueLimit(segments)), ambience:valid(parsed.ambience, 'ambience').slice(0, AMBIENCE_LIMIT), music:valid(parsed.music, 'music').slice(0, MUSIC_LIMIT)};
}

export function applySoundCues(segments, {cues=[], ambience=[], music=[]}={}) {
  const own = (entries, index) => entries.filter(entry => entry.segment === index).map(({segment, ...entry}) => entry);
  return segments.map((segment, index) => {
    const sounds = Object.entries({sfx:own(cues, index), ambience:own(ambience, index), music:own(music, index)}).filter(([, entries]) => entries.length);
    return sounds.length ? {...segment, ...Object.fromEntries(sounds)} : segment;
  });
}

