import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {speechPanel} from './fixtures/speech-panel.mjs';
import {phoneWidget} from './fixtures/phone-widget.mjs';
import {sfxCueOffset,spaceSoundEffects,SFX_MIN_SPACING} from '../src/core.js';
import {randomUuid,sha256Hex,ignoredTagNames,characterCardRoles,validateCardRoles,cardAnalysisRoles,reconcileCardCast} from '../src/core.js';
import {normalizePlaybackRate,normalizeVoiceGap,speakerPlaybackRate,effectivePlaybackRate,browserPlaybackRate,PLAYBACK_RATE_LIMITS,VOICE_GAP_LIMITS,BROWSER_PLAYBACK_RATE_LIMITS} from '../src/core.js';

test('playback speed and voice gap clamp and round stored values and fall back to the defaults for missing or invalid input',()=>{
  assert.deepEqual(PLAYBACK_RATE_LIMITS,{min:0.07,max:16,step:0.01,fallback:1});
  assert.deepEqual(VOICE_GAP_LIMITS,{min:0,max:3000,step:50,fallback:0});
  for(const value of [undefined,null,'',true,false,'fast',NaN,Infinity])assert.equal(normalizePlaybackRate(value),1);
  assert.equal(normalizePlaybackRate(0.01),0.07);assert.equal(normalizePlaybackRate(9),9);assert.equal(normalizePlaybackRate(20),16);assert.equal(normalizePlaybackRate('1.5'),1.5);
  assert.equal(normalizePlaybackRate(1.234),1.23);assert.equal(normalizePlaybackRate(1.237),1.24);assert.equal(normalizePlaybackRate(0.07),0.07);assert.equal(normalizePlaybackRate(16),16);assert.equal(normalizePlaybackRate(3.37),3.37);
  for(const value of [undefined,null,'',true,'slow',NaN,Infinity])assert.equal(normalizeVoiceGap(value),0);
  assert.equal(normalizeVoiceGap(-40),0);assert.equal(normalizeVoiceGap(9999),3000);assert.equal(normalizeVoiceGap('275'),300);assert.equal(normalizeVoiceGap(1200),1200);
});

test('a speaker speed replaces the playback speed, a missing or null speaker speed follows it and browsers get the nearest rate they accept',()=>{
  const channels={Mira:{volume:1,speed:2.5},Guard:{volume:1},Narrator:{speed:0.5},Rare:{speed:null}};
  assert.equal(speakerPlaybackRate(channels,'Mira'),2.5);assert.equal(speakerPlaybackRate(channels,'Guard'),null);assert.equal(speakerPlaybackRate(channels,'Unknown'),null);assert.equal(speakerPlaybackRate(channels,'Rare'),null);assert.equal(speakerPlaybackRate(undefined,'Mira'),null);
  assert.equal(speakerPlaybackRate({Mira:{speed:'fast'}},'Mira'),null);assert.equal(speakerPlaybackRate({constructor:{speed:3}},'constructor'),3);assert.equal(speakerPlaybackRate({},'constructor'),null);
  assert.equal(speakerPlaybackRate({Mira:{speed:9}},'Mira'),9);assert.equal(speakerPlaybackRate({Mira:{speed:40}},'Mira'),16);
  // A character's speed replaces the playback speed rather than multiplying it.
  assert.equal(effectivePlaybackRate(2,channels,'Mira'),2.5);
  assert.equal(effectivePlaybackRate(1.5,channels,'Mira'),2.5);
  assert.equal(effectivePlaybackRate(1.5,channels,'Guard'),1.5);
  assert.equal(effectivePlaybackRate(3,channels,'Narrator'),0.5);
  assert.equal(effectivePlaybackRate(0.25,channels,'Narrator'),0.5);
  assert.equal(effectivePlaybackRate(1.2,{Mira:{speed:1.1}},'Mira'),1.1);
  assert.equal(effectivePlaybackRate(undefined,channels,'Guard'),1);
  assert.equal(effectivePlaybackRate(16,{Mira:{speed:0.07}},'Mira'),0.07);
  assert.equal(effectivePlaybackRate(16,{},'Mira'),16);
});
test('speeds above 4 times pass through the speed model and browsers accept only their own playback range',()=>{
  assert.deepEqual(BROWSER_PLAYBACK_RATE_LIMITS,{min:0.0625,max:16});
  assert.equal(browserPlaybackRate(16),16);assert.equal(browserPlaybackRate(40),16);assert.equal(browserPlaybackRate(0.01),0.0625);assert.equal(browserPlaybackRate(0.07),0.07);assert.equal(browserPlaybackRate(NaN),1);assert.equal(browserPlaybackRate(undefined),1);
});
import {validatePlan, validateCastConfig, splitSegment, speechBatches, speechRequestLimits, audioBytes, transcriptFromMessage, parsePlanJson, normalizeVoiceCatalogue, speechSourceUnits, resolvePlanReferences, castingPrompt, parseCastRows, castReply, stripAudioTags, fastClassifyPlan, resolvePlannerMode, soundCuePrompt, parseSoundCues, applySoundCues, rankMusic, cueOffset, transcriptLines, skipCheckPrompt, parseSkipRows, skippedLines, withoutLines, readableText, readAlongIndex, locatePassages, spokenLength, attributionPlan, restoreAttribution, apiErrorMessage} from '../src/core.js';

test('ignored tags skip nested, attributed, mixed-case and unfinished blocks without dropping ordinary story markup',()=>{
  assert.deepEqual(ignoredTagNames('Summary, <private-note>\nsummary; invalid.*'),['summary','private-note']);
  const text='Before. <Summary title="a > b">Hidden. <summary>Nested.</summary><b>Also hidden.</b></Summary> <b>After.</b> <private-note/> End.';
  assert.equal(transcriptFromMessage(text,'summary, private-note').replace(/\s+/g,' '),'Before. After. End.');
  assert.equal(transcriptFromMessage('Safe. <summary>Never finished','summary'),'Safe.');
  assert.equal(transcriptFromMessage('<summary>Entirely ignored.</summary>','summary'),'');
  assert.equal(transcriptFromMessage('Read <story>this.</story>','other'),'Read this.');
});

test('ignored entries accept exact classes and IDs, optionally scoped to a tag',()=>{
  assert.deepEqual(ignoredTagNames('Summary, <private-note>, .UI-note, #Panel-ID, div.ui-note, aside#sidebar, .ui-note, invalid.*, div[hidden], .one.two'),['summary','private-note','.ui-note','#panel-id','div.ui-note','aside#sidebar']);
  const source=`Before. <div class="note extra" title="a > b">Hidden. <div>Nested.</div></div> <p class="note">Read this.</p> <aside id='sidebar'>Hidden too.</aside> <span class=not-note>After.</span>`;
  assert.equal(transcriptFromMessage(source,'div.note, #sidebar').replace(/\s+/g,' '),'Before. Read this. After.');
  assert.equal(transcriptFromMessage(source,'.NOTE, aside#SIDEBAR').replace(/\s+/g,' '),'Before. After.');
  assert.equal(transcriptFromMessage('Read. <div class="note">An unfinished excluded block','.note'),'Read.');
  assert.equal(transcriptFromMessage('<div id=sidebar/><p>Read.</p>','#sidebar'),'Read.');
});

test('complete radio-tabbed panels are removed automatically with their notification and status chrome',()=>{
  assert.equal(transcriptFromMessage(speechPanel),'');
  for(const wrapper of ['Before. '+speechPanel+' After.',`<div class="story"><p>Before.</p>${speechPanel}<p>After.</p></div>`]){
    assert.equal(transcriptFromMessage(wrapper).replace(/\s+/g,' '),'Before. After.');
  }
  assert.equal(transcriptFromMessage(`<div><p>Before.</p>${speechPanel}${speechPanel}<p>After.</p></div>`).replace(/\s+/g,' '),'Before. After.');
});

test('ARIA tabbed panels are filtered as complete components while surrounding HTML prose survives',()=>{
  const panel='<section class="browser-panel"><div role="tablist"><button role="tab" aria-controls="one">One</button><button role="tab" aria-controls="two">Two</button></div><div role="tabpanel" id="one">Interface article.</div><div role="tabpanel" id="two">Another article.</div></section>';
  assert.equal(transcriptFromMessage(`<article><p>He opened the page.</p>${panel}<div>"Hello," she said.</div></article>`).replace(/\s+/g,' '),'He opened the page. "Hello," she said.');
});

test('single-checkbox phone components exclude notifications and notes while preserving surrounding story',()=>{
  assert.equal(transcriptFromMessage(phoneWidget),'');
  const widgets=[phoneWidget,phoneWidget.replaceAll('kb-msg-exp','another-control').replaceAll('kb-ph-','another-')];
  for(const widget of widgets){
    assert.equal(transcriptFromMessage(`Before. ${widget} After.`).replace(/\s+/g,' '),'Before. After.');
    assert.equal(transcriptFromMessage(`<article style="background: navy"><p>Before.</p>${widget}<p>After.</p></article>`).replace(/\s+/g,' '),'Before. After.');
  }
  assert.equal(transcriptFromMessage(`<div><p>Before.</p>${widgets.join('')}<p>After.</p></div>`).replace(/\s+/g,' '),'Before. After.');
});

test('checkbox detection keeps ordinary styled prose, unrelated CSS and incomplete phone markup',()=>{
  const story='<div style="background: navy"><style>.note {color: blue} .note::after {content: "#read:checked"}</style><input type="checkbox" id="read"><label for="read">She checked the box.</label><p>Then she left.</p></div>';
  assert.equal(transcriptFromMessage(story),'She checked the box.Then she left.');
  const unmatched=phoneWidget.replace('for="kb-msg-exp"','for="unrelated"');
  assert.ok(transcriptFromMessage(unmatched).includes('Synthetic notification'));
  const mixed=phoneWidget.replace('  <style>','Phone screen description. <style>');
  assert.ok(transcriptFromMessage(mixed).includes('Phone screen description.'));
  const incomplete=phoneWidget.slice(0,phoneWidget.lastIndexOf('</div>'))+'<p>The story continues.</p>';
  assert.ok(transcriptFromMessage(incomplete).includes('The story continues.'));
});

test('interface controls, hidden text and SVG labels do not enter the speech transcript',()=>{
  const widgets=['<button>Next page</button>','<select><option>Choose a tab</option></select>','<textarea>UI draft</textarea>','<svg><title>Battery</title><text>84%</text></svg>','<div hidden>Hidden panel</div>','<div aria-hidden="true">Decorative text</div>','<div style="color: red; display: none !important;">Invisible text</div>','<div role="toolbar"><button>Save</button>Toolbar label</div>'];
  for(const widget of widgets)assert.equal(transcriptFromMessage('Before. '+widget+' After.').replace(/\s+/g,' '),'Before. After.');
  assert.equal(transcriptFromMessage('Before. <style>.x::after { content: "<div>not HTML</div>"; }</style> After.').replace(/\s+/g,' '),'Before. After.');
});

test('styled story layouts, literal UI descriptions and incomplete tab markup are retained conservatively',()=>{
  const story='<div style="background: navy; border: 1px solid blue"><p>She tapped the browser tab.</p><div class="tab-content">"Wait," he said.</div><span>Then he closed the window.</span></div>';
  assert.equal(transcriptFromMessage(story).replace(/\s+/g,' '),'She tapped the browser tab."Wait," he said.Then he closed the window.');
  const incomplete=speechPanel.slice(0,speechPanel.lastIndexOf('</div>'))+'<p>The story continues outside the incomplete widget.</p>';
  assert.ok(transcriptFromMessage(incomplete).includes('The story continues outside the incomplete widget.'));
  assert.equal(transcriptFromMessage('<div class="kb-content-wrap">Ordinary narration.</div>'),'Ordinary narration.');
  assert.equal(transcriptFromMessage('<div data-class="hud">Actual story.</div>'),'Actual story.');
  const mixed=speechPanel.replace('  <style>','Phone screen description. <style>');
  const surrounding=`<div style="background: navy"><p>Story before.</p>${mixed}<p>Story after.</p></div>`;
  assert.ok(transcriptFromMessage(surrounding).includes('Story before.'));assert.ok(transcriptFromMessage(surrounding).includes('Story after.'));
});

test('card evidence tolerates presentation differences but rejects paraphrases and invented excerpts',()=>{
  const card={name:'Eliza',description:'<p>Eliza is the <b>captain</b> &amp; leader.</p><p>She’s\n  calm, with a **warm** voice.</p>',personality:'Caf\u00e9 owner.'};
  const roles=[{name:'Eliza',evidence:'Eliza is the captain & leader.'},{name:'Captain',evidence:"She's calm, with a warm voice."},{name:'Owner',evidence:'Cafe\u0301 owner.'},{name:'NARRATIVE GUIDELINES'}];
  assert.deepEqual(cardAnalysisRoles(roles,card).map(role=>role.name),['Eliza','Captain','Owner']);
  for(const evidence of ['',null,'Eliza commands the ship.','A person not in this card.','x'.repeat(601)]){
    assert.deepEqual(cardAnalysisRoles([{name:'Eliza',evidence}],card),[]);
  }
  assert.deepEqual(cardAnalysisRoles([{name:'Eliza',evidence:'Eliza is the captain & leader.'},{name:'Invented',evidence:'Another person entirely.'}],card).map(role=>role.name),['Eliza']);
  assert.deepEqual(cardAnalysisRoles([{name:'Merged',evidence:'Eliza The captain.'}],{name:'Eliza',description:'The captain.'}),[],'evidence cannot span unrelated fields');
  assert.deepEqual(cardAnalysisRoles([{name:'Eliza',aliases:['Captain'],evidence:'Eliza is the captain & leader.'},{name:'Captain',evidence:'Not in the card.'}],card)[0].aliases,['Captain']);
});

test('card instructions stay out of character discovery even when they mention the main character',()=>{
  const guidelines='Always portray the main character consistently. Keep narration in third person.';
  for(const label of ['NARRATIVE GUIDELINES','Writing Instructions','Output Format','Personality']){
    const card={name:'Eliza',description:`# Eliza\nName: Eliza\nA warm lead.\n# ${label}\n${guidelines}`};
    assert.deepEqual(characterCardRoles(card).map(role=>role.name),['Eliza']);
  }
  assert.deepEqual(characterCardRoles({name:'Eliza',description:'<Eliza>Name: Eliza\nA warm lead.</Eliza><narrative_guidelines>Name: Authoring rules\n'+guidelines+'</narrative_guidelines>'}).map(role=>role.name),['Eliza']);
  assert.deepEqual(characterCardRoles({name:'Eliza',description:JSON.stringify({characters:[{name:'Eliza'},{name:'NARRATIVE GUIDELINES',description:guidelines}]})}).map(role=>role.name),['Eliza']);
  assert.deepEqual(validateCardRoles([{name:'Eliza'},{name:'NARRATIVE GUIDELINES',description:guidelines}]).map(role=>role.name),['Eliza']);
  assert.deepEqual(validateCardRoles([{name:'Guideline Keeper',description:'An actual named person.'}]).map(role=>role.name),['Guideline Keeper']);
});

test('card discovery keeps explicitly supporting profiles out of the lead cast',()=>{
  const card={name:'Mira',description:'# Mira\nName: Mira\nA warm lead.\n# NPCs\n## Guard\nName: Guard\nA stern guard.\n## Clerk\nName: Clerk\nHelpful.'};
  assert.deepEqual(characterCardRoles(card).map(role=>role.name),['Mira']);
  assert.deepEqual(characterCardRoles({name:'Mira',description:JSON.stringify({characters:[{name:'Mira',role:'main character'},{name:'Guard',role:'NPC'}]})}).map(role=>role.name),['Mira']);
  assert.deepEqual(characterCardRoles({name:'Mira',description:'<Mira>Name: Mira\nA warm lead.</Mira><NPCs><Guard>Name: Guard\nA stern guard.</Guard></NPCs>'}).map(role=>role.name),['Mira']);
});

test('an empty Fish catalogue can defer automatic voices to the community but never accepts invalid explicit assignments',()=>{
  const config={fixed:[{speaker:'Narrator',voice:'',style:''}],npcs:[],voices:[],defaultRoute:'native:fish',communityRoutes:{'native:fish':'community'}};
  assert.doesNotThrow(()=>validateCastConfig(config));
  assert.throws(()=>validateCastConfig({...config,communityRoutes:{}}),/voice list/);
  assert.throws(()=>validateCastConfig({...config,fixed:[{...config.fixed[0],voice:'Puck'}]}),/voice catalogue/);
  assert.throws(()=>validateCastConfig({...config,fixed:[{...config.fixed[0],route:'native:other'}]}),/voice catalogue/);
});

test('multiple card characters keep separate profiles even when the second begins beyond the description budget',()=>{
  const card={name:'Adrian and Ethan | Show and Tell',description:'<adrian>\n# Adrian\nA male captain. '+ 'Captain. '.repeat(1000)+'\n</adrian>\n<ethan>\n# Ethan\nA male teammate with a different voice.\n</ethan>'};
  const roles=characterCardRoles(card);assert.deepEqual(roles.map(role=>role.name),['Adrian','Ethan']);assert.equal(roles[0].description.length,8000);assert.match(roles[1].description,/different voice/);assert.ok(!roles[1].description.includes('Captain.'));
  assert.deepEqual(characterCardRoles({name:'War and Peace',description:'A story about many people.'}),[]);
  assert.deepEqual(characterCardRoles({name:'Mira',description:'# Appearance\nTall.\n# Personality\nCalm.'}),[]);
  assert.deepEqual(characterCardRoles({...card,name:'Swimming team'}).map(role=>role.name),['Adrian','Ethan']);
});

test('decorated card titles reconcile existing lead identities and duplicate NPCs across providers without changing lead voices',()=>{
  const title='Kellin Beckett || Toxic Fans',lead={speaker:'Kellin Beckett',voice:'lead',route:'native:b',style:'',aliases:['Kellin']};
  const duplicate={speaker:title,voice:'npc',style:''},mikey={speaker:'Mikey Ross',voice:'npc',style:''};
  const original={fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Laiyah',voice:'y',style:''},lead],casts:{'native:a':[mikey,duplicate],'native:b':[duplicate]},singleVoices:{'native:a':{[title]:'npc','Kellin Beckett':'lead','Mikey Ross':'npc'}}};
  const clean=reconcileCardCast(original,{name:title});
  assert.equal(clean.fixed[2].voice,'lead');assert.equal(clean.fixed[2].route,'native:b');assert.deepEqual(clean.fixed[2].aliases,['Kellin',title]);
  assert.deepEqual(clean.casts,{'native:a':[mikey],'native:b':[]});assert.deepEqual(clean.singleVoices['native:a'],{'Kellin Beckett':'lead','Mikey Ross':'npc'});
  assert.equal(original.casts['native:a'].length,2);assert.deepEqual(original.fixed[2].aliases,['Kellin']);
  const cast={...clean,voices:[{id:'n',route:'native:a'},{id:'y',route:'native:a'},{id:'lead',route:'native:b'},{id:'npc',route:'native:a'}],npcs:clean.casts['native:a'],defaultRoute:'native:a'};
  const plan=validatePlan({segments:[{speaker:title,voice:'npc',text:'"Hello."'}]},'"Hello."',cast);
  assert.equal(plan.segments[0].speaker,'Kellin Beckett');assert.equal(plan.segments[0].voice,'lead');assert.deepEqual(plan.npcs,[mikey]);
});

test('card title identity matching preserves scenario casts, manual names, conflicting leads and separate characters',()=>{
  const value={fixed:[{speaker:'Narrator'},{speaker:'Persona'},{speaker:'Kellin Beckett'}],casts:{'native:a':[{speaker:'Mikey Ross'}]}};
  assert.strictEqual(reconcileCardCast(value,{name:'A crowded backstage'}),value);
  const conflict={...value,fixed:[...value.fixed,{speaker:'Kellin Beckett || Toxic Fans'}]};assert.strictEqual(reconcileCardCast(conflict,{name:'Kellin Beckett || Toxic Fans'}),conflict);
  const group={...value,fixed:[...value.fixed.slice(0,2),{speaker:'Adrian'},{speaker:'Ethan'}]};
  assert.strictEqual(reconcileCardCast(group,{name:'Adrian and Ethan | Show and Tell',description:'# Adrian\nA captain.\n# Ethan\nA teammate.'}),group);
  const named={...value,fixed:[...value.fixed.slice(0,2),{speaker:'My chosen name',aliases:['Kellin Beckett']}]};
  assert.equal(reconcileCardCast(named,{name:'Kellin Beckett || Toxic Fans'}).fixed[2].speaker,'My chosen name');
  const renamed={...value,fixed:[...value.fixed.slice(0,2),{speaker:'Kellin Beckett || Toxic Fans',aliases:['Kellin Beckett || Toxic Fans']}]};
  assert.deepEqual(reconcileCardCast(renamed,{name:'Kellin Beckett || Toxic Fans'}).fixed[2].aliases,['Kellin Beckett']);
});

test('HTTP UUID fallback uses secure random bytes, preserves v4 bits and generates distinct IDs',()=>{
  const httpCrypto={getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto)};
  const ids=Array.from({length:1000},()=>randomUuid(httpCrypto));assert.equal(new Set(ids).size,1000);
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(randomUuid({getRandomValues:bytes=>bytes.fill(255)}),'ffffffff-ffff-4fff-bfff-ffffffffffff');
  const secureCrypto={randomUUID(){assert.equal(this,secureCrypto);return 'native-id';}};
  assert.equal(randomUuid(secureCrypto),'native-id');
});

test('HTTP SHA-256 fallback preserves native saved-plan keys for UTF-8 and block boundaries',async()=>{
  const values=['','abc',JSON.stringify(['chat-a','message-a']),JSON.stringify(['チャット🙂','réponse/雨']), '\ud800'];
  for(const length of [55,56,63,64,65,119,120,127,128,129,10000])values.push('a'.repeat(length));
  for(const value of values){
    const expected=createHash('sha256').update(value).digest('hex');
    assert.equal(await sha256Hex(value,{}),expected);assert.equal(await sha256Hex(value),expected);
  }
});

test('API errors preserve provider details across Lumiverse and gateway response formats',()=>{
  for(const body of [{error:'Fish quota exhausted'},{error:{message:'Fish quota exhausted'}},{detail:'Fish quota exhausted'},{message:'Fish quota exhausted'},'Fish quota exhausted']){
    assert.match(apiErrorMessage(JSON.stringify(body),502),/HTTP 502: Fish quota exhausted/);
  }
  assert.match(apiErrorMessage('<style>private styles</style><script>private script</script><h1>Bad Gateway</h1><p>Upstream&nbsp;timed out</p>',502),/HTTP 502: Bad Gateway Upstream timed out$/);
  assert.match(apiErrorMessage('',502),/returned no error details/);
  assert.ok(!apiErrorMessage('{"error":{}}',502).includes('[object Object]'));
  assert.ok(apiErrorMessage('x'.repeat(10000),502).length<600);
  const gateway=apiErrorMessage('<h1>Bad gateway</h1><p>Browser Working Cloudflare Working Host Error</p><p>Cloudflare Ray ID: a4a7b9746d6c55f3</p><p>Your IP: private-address</p>',502);
  assert.match(gateway,/HTTP 502: Cloudflare reports a Lumiverse host or gateway failure/);
  assert.match(gateway,/Ray ID: a4a7b9746d6c55f3/);assert.ok(!gateway.includes('private-address'));
});

test('larger speech chunks respect provider limits while retaining a conservative unknown-provider limit',()=>{
  assert.equal(speechRequestLimits('openai_tts').maxChars,4096);
  assert.equal(speechRequestLimits('fish_audio').maxChars,10000);
  assert.equal(speechRequestLimits('elevenlabs','eleven_v3').maxChars,5000);
  assert.equal(speechRequestLimits('custom').maxChars,2000);
  assert.equal(speechRequestLimits('google_vertex_tts').maxBytes,6000);
  assert.equal(speechRequestLimits('openrouter_tts','fish-audio/s2.1-pro-free:free').maxChars,10000);
  assert.equal(speechRequestLimits('openrouter_tts','google/gemini-3.8-flash-tts').maxBytes,6000);
  assert.equal(speechRequestLimits('openrouter_tts','openai/gpt-4o-mini-tts').maxChars,4096);
  assert.equal(speechRequestLimits('openrouter_tts','unrecognized/model').maxChars,2000);
  const text='A long neutral phrase '.repeat(400);
  const batches=speechBatches([{speaker:'Narrator',voice:'n',text}],10000,'native:a',()=>speechRequestLimits('openai_tts'));
  assert.ok(batches.length>1);assert.ok(batches.every(batch=>batch.text.length<=4096));
  assert.equal(batches.map(batch=>batch.text).join(' ').trim(),text.trim());
  assert.equal(splitSegment({text:'x'.repeat(10000)},10000).length,1);
  assert.throws(()=>splitSegment({text:'x'},10001),/80–10000/);
});

test('multilingual byte-limited chunks preserve text and never split Unicode surrogate pairs',()=>{
  const text='你好🙂世界'.repeat(1200);
  const chunks=splitSegment({text,speaker:'Narrator',style:'Warm'},10000,6000);
  assert.equal(chunks.map(chunk=>chunk.text).join(''),text);
  assert.ok(chunks.every(chunk=>new TextEncoder().encode(chunk.text).length<=6000 && !/[\uD800-\uDBFF]$/.test(chunk.text) && !/^[\uDC00-\uDFFF]/.test(chunk.text)));
});

test('consecutive Foley cues keep separate audio parts when narration is muted',()=>{
  const cues=['page turn','door creak','page turn'].map(query=>({kind:'sfx',speaker:'SFX',voice:'',route:'sfx',text:`[SFX: ${query}]`,sfx:{query}}));
  const batches=speechBatches(cues,1800,'native:a');
  assert.deepEqual(batches.map(batch=>batch.sfx.query),['page turn','door creak','page turn']);
  assert.deepEqual(batches.map(batch=>batch.text),cues.map(cue=>cue.text));
});

test('speech around an ambience marker never merges into it',()=>{
  const narration=text=>({speaker:'Narrator',voice:'n',style:'',text});
  const batches=speechBatches([narration('Night fell.'),{kind:'ambience',speaker:'Ambience',voice:'',route:'ambience',text:'[Ambience: rain]',ambience:{query:'rain'}},narration('Rain hammered the roof.')],1800,'native:a');
  assert.deepEqual(batches.map(batch=>batch.text),['Night fell.','[Ambience: rain]','Rain hammered the roof.']);
});

const config = () => ({voices:[{id:'Charon'},{id:'Kore'},{id:'Puck'},{id:'Fenrir'}],useStyle:true,
  fixed:[{speaker:'Narrator',voice:'Charon',style:'Calm'},{speaker:'Alice',voice:'Kore',style:''}],npcs:[]});

test('speech strips tracker blocks and nested panels while retaining surrounding narration',()=>{
  for(const block of ['<tracker>HP: 50</tracker>','<details><summary>Tracker</summary><div>HP: 50</div></details>', '<div class="tracker"><div>HP: 50</div>Location: room</div>', '<loom_state><tracker>HP: 50</tracker></loom_state>']) {
    assert.equal(transcriptFromMessage('Before. '+block+' After.').replace(/\s+/g,' '),'Before. After.');
  }
  assert.equal(transcriptFromMessage('Before. <tracker>HP: 50'),'Before.');
  assert.equal(transcriptFromMessage('<div>Normal narration.</div>'),'Normal narration.');
  assert.equal(transcriptFromMessage('Before. <!-- HP: 50 --> After.').replace(/\s+/g,' '),'Before. After.');
});
test('fixed voices override model choices and NPC voices stay stable',()=>{
  const c=config();
  const result=validatePlan({segments:[
    {speaker:'narrator',voice:'Fenrir',text:'Rain fell.',style:'Slow'},
    {speaker:'Alice',voice:'Puck',text:'Hello.',style:''},
    {speaker:'Guard',voice:'Fenrir',text:'Stop.',style:'Urgent'},
    {speaker:' guard ',voice:'Puck',text:'Wait.',style:'Soft'}
  ]},'Rain fell. Hello. Stop. Wait.',c);
  assert.deepEqual(result.segments.map(v=>v.voice),['Charon','Kore','Fenrir','Fenrir']);
  assert.equal(result.segments[0].style,'Calm. Slow');
  assert.equal(result.npcs.length,1);assert.equal(result.npcs[0].style,'');
  c.npcs=result.npcs;
  assert.equal(validatePlan({segments:[{speaker:'Guard',voice:'Puck',text:'Again.'}]},'Again.',c).segments[0].voice,'Fenrir');
});
test('does not synthesize LLM rewrites, omissions, invented text or unknown voices',()=>{
  for(const segments of [
    [{speaker:'Alice',text:'Changed.'}],
    [{speaker:'Alice',text:'First.'}],
    [{speaker:'Alice',text:'First.'},{speaker:'Alice',text:'Invented.'}],
    [{speaker:'NPC',voice:'missing',text:'First. Last.'}]
  ])assert.throws(()=>validatePlan({segments},'First. Last.',config()));
});
test('repeated dialogue and multilingual transcript stay in exact order',()=>{
  const text='Bonjour.\n「待って！」\nBonjour.';
  const plan=validatePlan({segments:[{speaker:'Narrator',text:'Bonjour.'},{speaker:'Alice',text:'「待って！」'},{speaker:'Narrator',text:'Bonjour.'}]},text,config());
  assert.equal(plan.segments[1].text,'「待って！」');
});
test('catalogue validation catches missing and conflicting manual assignments',()=>{
  const c=config();c.fixed[0].voice='invalid';assert.throws(()=>validateCastConfig(c));
  const d=config();d.npcs=[{speaker:'alice',voice:'Puck',style:''}];assert.throws(()=>validateCastConfig(d));
});
test('style can be disabled independently of multi-voice casting',()=>{
  const c=config();c.useStyle=false;
  const plan=validatePlan({segments:[{speaker:'Narrator',text:'Hello.',style:'Whispered'}]},'Hello.',c);
  assert.equal(plan.segments[0].style,'');
});
test('splitting preserves ordered words, style and speaker without empty chunks',()=>{
  const original=('First sentence. Second sentence! '+ 'Longer phrase repeated here. ').repeat(30);
  const chunks=splitSegment({text:original,speaker:'Alice',voice:'Kore',style:'Warm'},160);
  assert.ok(chunks.length>2);assert.ok(chunks.every(v=>v.text.length<=160 && v.speaker==='Alice' && v.style==='Warm'));
  assert.equal(chunks.map(v=>v.text).join(' ').replace(/\s+/g,' ').trim(),original.replace(/\s+/g,' ').trim());
  assert.throws(()=>splitSegment({text:original},3));
});
test('WAV is never wrapped twice; legacy raw PCM is playable',()=>{
  const pcm=new Uint8Array([0,0,1,0]);
  const result=audioBytes(Buffer.from(pcm).toString('base64'),'audio/L16;rate=24000');
  assert.equal(result.data.length,48);assert.equal(result.mimeType,'audio/wav');
  const roundTrip=audioBytes(Buffer.from(result.data).toString('base64'),'audio/wav');
  assert.deepEqual(roundTrip.data,result.data);
});
test('speech preprocessing keeps narration, strips markup and hidden thinking',()=>{
  assert.equal(transcriptFromMessage('<think>hidden</think>*The room was cold.* **Hello.** [Friend](https://example.com)'),'The room was cold. Hello. Friend');
  assert.deepEqual(parsePlanJson('```json\n{"segments":[]}\n```'),{segments:[]});
});

test('planner extracts complete JSON from prose and fences with quoted braces',()=>{
  const plan={segments:[{speaker:'Narrator',text:'I said "{hello}".'}]};
  assert.deepEqual(parsePlanJson('I prepared this plan:\n```json\n'+JSON.stringify(plan)+'\n```\nDone.'),plan);
});

test('prose refusals and truncated plans report the response without repairing dialogue',()=>{
  assert.throws(()=>parsePlanJson('I cannot process this request.'),/Response begins: I cannot/);
  assert.throws(()=>parsePlanJson('{"segments":[{"text":"Hello."}'),/no complete JSON speech plan/);
});

test('unassigned fixed speakers are cast once while explicit assignments remain fixed',()=>{
  const c=config();c.fixed[1].voice='';
  const plan=validatePlan({segments:[
    {speaker:'Narrator',voice:'Puck',text:'Alice said,'},
    {speaker:'Alice',voice:'Fenrir',text:'"Hello."'},
    {speaker:'Alice',voice:'Kore',text:'"Again."'}
  ]},'Alice said, "Hello." "Again."',c);
  assert.deepEqual(plan.segments.map(s=>s.voice),['Charon','Fenrir','Fenrir']);
  assert.equal(c.fixed[1].voice,'');
  assert.throws(()=>validatePlan({segments:[{speaker:'Alice',text:'Hello.'}]},'Hello.',c),/LLM-selected voice/);
});

test('gender preferences survive Automatic casting and do not override assigned voices',()=>{
  const c=config();c.fixed[1].gender='male';
  const plan=validatePlan({segments:[{speaker:'Alice',voice:'Fenrir',text:'Hello.'},
    {speaker:'Guard',voice:'Puck',gender:'neutral',text:'Welcome.'}]},'Hello. Welcome.',c);
  assert.equal(plan.segments[0].voice,'Kore');
  assert.equal(plan.segments[0].gender,'male');
  assert.equal(plan.npcs[0].gender,'neutral');
  assert.equal(plan.segments[1].gender,'neutral');
  c.fixed[1].gender='invalid';assert.throws(()=>validateCastConfig(c),/gender preference/);
});

test('automatic casting respects catalogue gender while manual choices stay fixed',()=>{
  const c=config();c.voices=[{id:'Kore',gender:'female'},{id:'Puck',gender:'male'},{id:'Charon',gender:'male'}];
  c.fixed[1].voice='';c.fixed[1].gender='female';
  assert.throws(()=>validatePlan({segments:[{speaker:'Alice',voice:'Puck',text:'Hello.'}]},'Hello.',c),/must select a female voice/);
  const plan=validatePlan({segments:[{speaker:'Alice',voice:'Kore',text:'Hello.'}]},'Hello.',c);
  assert.equal(plan.segments[0].voice,'Kore');
  c.fixed[1].voice='Puck';assert.equal(validatePlan({segments:[{speaker:'Alice',voice:'Kore',text:'Hello.'}]},'Hello.',c).segments[0].voice,'Puck');
});

test('Lumiverse gender aliases and named Google voices retain usable gender labels',()=>{
  const voices=normalizeVoiceCatalogue([{id:'Kore',gender:'feminine'},{id:'Puck',gender:'masculine'},
    {id:'custom',gender:['FEMALE']},{id:'neutral',ssmlGender:'NEUTRAL'},{id:'Charon'},
    {id:'en-US-Chirp3-HD-Zephyr'},{id:'custom-unknown'}]);
  assert.deepEqual(voices.map(v=>v.gender),['female','male','female','neutral','male','female',undefined]);
});

test('source references preserve exact text and force unquoted character actions to Narrator',()=>{
  const transcript='Alice stood.\n\n"Hello." She waved. “Goodbye.”';
  const units=speechSourceUnits(transcript);
  assert.deepEqual(units.map(unit=>unit.kind),['narration','dialogue','narration','dialogue']);
  const raw={segments:units.map(unit=>({speaker:'Alice',voice:'Kore',unit_ids:[unit.id],text:'Rewritten by model.'}))};
  const plan=validatePlan(resolvePlanReferences(raw,transcript,config()),transcript,config());
  assert.deepEqual(plan.segments.map(segment=>segment.speaker),['Narrator','Alice','Narrator','Alice']);
  assert.deepEqual(plan.segments.map(segment=>segment.text),units.map(unit=>unit.text));
  assert.deepEqual(plan.segments.map(segment=>segment.voice),['Charon','Kore','Charon','Kore']);
});

test('source references reject skipped, duplicated and reordered IDs and preserve merged whitespace',()=>{
  const text='First.\n\nSecond. Third.';
  for(const ids of [[0,2],[0,0,1,2],[1,0,2],[0,1]])assert.throws(()=>resolvePlanReferences({segments:[{speaker:'Narrator',unit_ids:ids}]},text,config()));
  const plan=validatePlan(resolvePlanReferences({segments:[{speaker:'Narrator',unit_ids:[0,1,2]}]},text,config()),text,config());
  assert.equal(plan.segments[0].text,text);
});

test('more than 250 speech turns can be planned without an artificial segment cap',()=>{
  const text=Array.from({length:140},()=> 'She waved. "Hello."').join('\n');
  const units=speechSourceUnits(text);
  const raw={segments:units.map(unit=>({speaker:'Alice',voice:'Kore',unit_ids:[unit.id]}))};
  assert.equal(validatePlan(resolvePlanReferences(raw,text,config()),text,config()).segments.length,280);
});

test('speaker connections remain fixed even when providers share a voice ID',()=>{
  const c={defaultRoute:'native:google',voices:[{id:'same',route:'native:google',gender:'male'},{id:'same',route:'native:other',gender:'female'}],
    fixed:[{speaker:'Narrator',voice:'same',route:'native:google',style:''},{speaker:'Alice',voice:'',route:'native:other',gender:'female',style:''}],npcs:[]};
  const plan=validatePlan({segments:[{speaker:'Narrator',voice:'same',route:'native:other',text:'Alice said,'},
    {speaker:'Alice',voice:'same',route:'native:google',text:'"Hello."'}]},'Alice said, "Hello."',c);
  assert.deepEqual(plan.segments.map(segment=>segment.route),['native:google','native:other']);
  assert.equal(plan.segments[1].voice,'same');
  c.fixed[1].voice='missing';assert.throws(()=>validateCastConfig(c),/selected TTS connection/);
});

test('new NPCs use the default connection and saved NPC overrides remain stable',()=>{
  const c={defaultRoute:'native:google',voices:[{id:'Kore',route:'native:google'},{id:'custom',route:'native:other'}],
    fixed:[{speaker:'Narrator',voice:'Kore',style:''}],npcs:[]};
  assert.throws(()=>validatePlan({segments:[{speaker:'Guard',voice:'custom',route:'native:other',text:'Hello.'}]},'Hello.',c),/selected TTS connection/);
  c.npcs=[{speaker:'Guard',voice:'custom',route:'native:other',style:''}];
  assert.equal(validatePlan({segments:[{speaker:'Guard',voice:'Kore',route:'native:google',text:'Hello.'}]},'Hello.',c).segments[0].route,'native:other');
});


test('documented Gemini vocal events survive story markup filtering without preserving HTML or attributes',()=>{
 const source='<font color="#abc">"Wait... <short pause> <sigh> Hello."</font><script>ignore()</script><div>She smiled. <throat-clearing> "Welcome."</div>';
 const transcript=transcriptFromMessage(source);
 assert.equal(transcript,'"Wait... <short pause> <sigh> Hello." She smiled. <throat-clearing> "Welcome."');
 assert.equal(transcriptFromMessage('<sigh onclick="alert(1)">Safe.</sigh> <applause>Hi.</applause>'),'Safe. Hi.');
 assert.equal(transcriptFromMessage('Before <sigh>hidden</sigh> after','sigh'),'Before   after');
 assert.equal(readableText('Hello <sigh> world!'),readableText('Hello world!'));
 const long=`${'x'.repeat(72)} <short pause> ${'more words '.repeat(12)}`;
 const chunks=splitSegment({text:long},80);
 assert.equal(chunks.map(chunk=>chunk.text).join(' '),long.trim());
 assert.equal(chunks.filter(chunk=>chunk.text.includes('<short pause>')).length,1);
 const c=config(),units=speechSourceUnits(transcript);
 const plan=validatePlan({segments:units.map(unit=>({speaker:'Narrator',voice:'Charon',text:unit.text}))},transcript,c);
 assert.equal(plan.segments.map(segment=>segment.text).join(' '),units.map(unit=>unit.text).join(' '));
});

test('stripAudioTags and validatePlan allowing inline tags like <sigh> or [whispers] in segment text without failing transcript equality',()=>{
  assert.equal(stripAudioTags('Hello <sigh> world! [whispers]').trim().replace(/\s+/g, ' '), 'Hello world!');
  assert.equal(stripAudioTags('<gasp> Oh no! <laugh> [shouting] Stop! </pause>').trim().replace(/\s+/g, ' '), 'Oh no! Stop!');
  const c=config();
  const plan=validatePlan({
    segments:[
      {speaker:'Narrator',voice:'Charon',text:'<sigh> Hello world.'},
      {speaker:'Alice',voice:'Kore',text:'Wait! [whispers] Are you sure? <gasp>'}
    ]
  },'Hello world. Wait! Are you sure?',c);
  assert.equal(plan.segments[0].text,'<sigh> Hello world.');
  assert.equal(plan.segments[1].text,'Wait! [whispers] Are you sure? <gasp>');
});

test('stripAudioTags strips Fish Audio natural language bracket and parenthetical emotion tags', () => {
  assert.equal(stripAudioTags('[whispering, nervously] Hello!'), 'Hello!');
  assert.equal(stripAudioTags('[laughs warmly] That is great.'), 'That is great.');
  assert.equal(stripAudioTags('(happy) Good morning.'), 'Good morning.');
  assert.equal(stripAudioTags('[sigh: deep] Finally.'), 'Finally.');
});

test('transcriptFromMessage filters HUD status blocks, metadata, and divider lines', () => {
  const message = `Time: Tuesday, October 14, 07:45 AM (Autumn)
Location: Living Room, Subsidized Apartment 402
Costume: White dress shirt, black trousers, black socks
Posture: Sitting on the edge of the sofa, leaning forward
Nearby Races: Cat Girl (Nekomusume)

Approved

Response
---------
Chapter 1: Cohabitation Clause

A warm weight dropped across Jay's lap before he could reach his second sock.

"Nnnh... you're late, Jay-kun," Nia purred.`;

  const clean = transcriptFromMessage(message);
  assert.ok(!clean.includes('Time:'));
  assert.ok(!clean.includes('Location:'));
  assert.ok(!clean.includes('Costume:'));
  assert.ok(!clean.includes('Approved'));
  assert.ok(!clean.includes('Chapter 1'));
  assert.ok(clean.includes("A warm weight dropped across Jay's lap"));
  assert.ok(clean.includes("Nia purred"));
});

test('fastClassifyPlan resolves pure narration immediately without calling planner', () => {
  const c = config();
  const text = 'The castle gates swung open as the dawn mist cleared from the valley.';
  const plan = fastClassifyPlan(text, c);
  assert.ok(plan);
  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].speaker, 'Narrator');
  assert.equal(plan.segments[0].text, text);
});

test('fastClassifyPlan resolves 1-on-1 character dialogue directly in 0ms', () => {
  const c = config(); // Narrator (Charon), User (Puck), Alice (Kore)
  const text = 'Alice leaned forward. "Are you ready?" She waited for an answer. "We should leave soon."';
  const plan = fastClassifyPlan(text, c);
  assert.ok(plan);
  assert.equal(plan.segments.length, 4);
  assert.equal(plan.segments[0].speaker, 'Narrator');
  assert.equal(plan.segments[1].speaker, 'Alice');
  assert.equal(plan.segments[1].voice, 'Kore');
  assert.equal(plan.segments[2].speaker, 'Narrator');
  assert.equal(plan.segments[3].speaker, 'Alice');
});

test('fastClassifyPlan uses dialogue tag attribution and detects emotion style', () => {
  const c = config();
  c.fixed.push({ speaker: 'Bob', voice: 'Puck', route: 'native:google', style: '' });
  c.voices.push({ id: 'Puck', route: 'native:google', gender: 'male' });
  const text = '"Good morning," Alice smiled. Bob whispered, "Keep your voice down."';
  const plan = fastClassifyPlan(text, c);
  assert.ok(plan);
  assert.equal(plan.segments[0].speaker, 'Alice');
  assert.equal(plan.segments[0].style, 'cheerful');
  assert.equal(plan.segments[2].speaker, 'Bob');
  assert.equal(plan.segments[2].style, 'whispering');
});

test('heuristic attribution accepts hyphenated character names and aliases with Unicode matching',()=>{
  const c=config(),actor=c.fixed.find(actor=>actor.speaker==='Alice');
  actor.speaker='Gabrielle - Debug';actor.aliases=['Gabi-X'];
  const plan=fastClassifyPlan('Gabrielle - Debug said, "Hello." Gabi-X said, "Ready."',c);
  assert.ok(plan);assert.deepEqual(plan.segments.filter(segment=>segment.text.startsWith('"')).map(segment=>segment.speaker),['Gabrielle - Debug','Gabrielle - Debug']);
});

test('local one-on-one attribution recognizes a named persona and keeps explicit persona turns',()=>{
  const c=config();c.fixed.splice(1,0,{speaker:'Jay',voice:'Puck',style:''});c.personaSpeaker='Jay';
  const text='The door opened. "Hello." Jay said, "Welcome."';
  const plan=fastClassifyPlan(text,c);
  assert.ok(plan);
  assert.deepEqual(plan.segments.filter(segment=>segment.text.startsWith('"')).map(segment=>[segment.speaker,segment.voice]),[['Alice','Kore'],['Jay','Puck']]);
  c.fixed.push({speaker:'Bob',voice:'Fenrir',style:''});
  assert.equal(fastClassifyPlan('The door opened. "Hello."',c),null);
  assert.equal(fastClassifyPlan('Jay and Alice stood together. "Hello."',c),null);
});

test('fastClassifyPlan returns null on ambiguous multi-character dialogue without tags', () => {
  const c = config();
  c.fixed.push({ speaker: 'Bob', voice: 'Puck', route: 'native:google', style: '' });
  c.voices.push({ id: 'Puck', route: 'native:google', gender: 'male' });
  const text = '"Who is there?" + "\n" + "I am not sure."';
  const plan = fastClassifyPlan(text, c);
  assert.equal(plan, null); // Falls back to LLM/Jev
});

test('heuristic failures distinguish missing voices from speaker ambiguity and identify the quote',()=>{
  const c=config(),failure={};c.fixed.push({speaker:'Bob',voice:'Puck',style:''});
  assert.equal(fastClassifyPlan('Alice said, "Hello." The door opened. "Who is there?"',c,failure),null);
  assert.equal(failure.reason,'unattributed-dialogue');assert.match(failure.message,/Dialogue 2: "Who is there\?"/);
  assert.doesNotMatch(failure.message,/unassigned|no assigned voice/);
  c.fixed[1].voice='';
  assert.equal(fastClassifyPlan('Alice said, "Hello."',c,failure),null);
  assert.equal(failure.reason,'missing-voice');assert.match(failure.message,/Alice.*no assigned voice/);
  c.fixed[0].voice='';
  assert.equal(fastClassifyPlan('The room fell quiet.',c,failure),null);
  assert.match(failure.message,/needs a voice for Narrator/);assert.equal(failure.unitId,undefined);
  c.fixed[0].voice='Charon';
  assert.ok(fastClassifyPlan('The room fell quiet.',c,failure));assert.equal(failure.message,undefined);
});

test('heuristic conflicting tags and invalid voice catalogues report their actual cause',()=>{
  const c=config(),failure={};c.fixed.push({speaker:'Bob',voice:'Puck',style:''});
  assert.equal(fastClassifyPlan('Alice said, "Hello," Bob replied.',c,failure),null);
  assert.equal(failure.reason,'conflicting-tags');assert.match(failure.message,/Alice before.*Bob after/);
  assert.equal(fastClassifyPlan('Alice and Bob said, "Hello."',c,failure),null);
  assert.equal(failure.reason,'multiple-speakers');assert.match(failure.message,/Alice, Bob/);
  c.voices=c.voices.filter(voice=>voice.id!=='Charon');
  assert.equal(fastClassifyPlan('The room fell quiet.',c,failure),null);
  assert.equal(failure.reason,'invalid-plan');assert.match(failure.message,/validate this plan/);
});

test('explicit planner selection wins over stale flags and legacy selections migrate',()=>{
  assert.equal(resolvePlannerMode({plannerMode:'llm',useFastClassifier:true,useJev:true}),'llm');
  assert.equal(resolvePlannerMode({plannerMode:'jev',useFastClassifier:true}),'jev');
  assert.equal(resolvePlannerMode({useJev:true,useFastClassifier:true}),'jev');
  assert.equal(resolvePlannerMode({useFastClassifier:true}),'heuristic');
  assert.equal(resolvePlannerMode({}),'llm');
});

test('local attribution refuses an untagged turn after a tagged multi-character turn',()=>{
  const c=config();c.fixed.push({speaker:'Bob',voice:'Puck',style:''});
  assert.equal(fastClassifyPlan('"Hello," Alice said. The door opened. "Who is there?"',c),null);
});

test('local attribution refuses tags mentioning multiple candidate speakers',()=>{
  const c=config();c.fixed.push({speaker:'Bob',voice:'Puck',style:''});
  assert.equal(fastClassifyPlan('Alice and Bob stood together. "Hello."',c),null);
});

test('local attribution refuses conflicting speaker tags around the same quote',()=>{
  const c=config();c.fixed.push({speaker:'Bob',voice:'Puck',style:''});
  assert.equal(fastClassifyPlan('Alice said, "Hello," Bob replied.',c),null);
});

test('local attribution recognizes Unicode speaker names with curly quotes',()=>{
  const c=config();c.fixed[1].speaker='Élodie';c.fixed.push({speaker:'Bob',voice:'Puck',style:''});
  const plan=fastClassifyPlan('“Hello,” Élodie whispered. Bob said, “Welcome.”',c);
  assert.ok(plan);assert.deepEqual(plan.segments.filter(s=>s.text.startsWith('“')).map(s=>s.speaker),['Élodie','Bob']);
});

test('a tag introducing the next quote never changes the previous quote speaker',()=>{
  const c=config();c.fixed.push({speaker:'Bob',voice:'Puck',style:''});
  const plan=fastClassifyPlan('Alice said, "Hello." Bob said, "Welcome."',c);
  assert.ok(plan);assert.deepEqual(plan.segments.filter(s=>s.text.startsWith('"')).map(s=>s.speaker),['Alice','Bob']);
});

test('local narration and dialogue apply the cast delivery style exactly once',()=>{
  const c=config();c.fixed[0].style='Measured';c.fixed[1].style='Warm';
  const plan=fastClassifyPlan('The room fell quiet. Alice said, "Hello."',c);
  assert.ok(plan);assert.equal(plan.segments[0].style,'Measured');assert.equal(plan.segments.at(-1).style,'Warm');
});

test('transcriptFromMessage strips markdown headers like # Approved, ## Response, and ### Chapter headers', () => {
  const message = `# Approved

## Response

### Chapter 4: Batter and Boundaries

The countertop had never seen this much purposeful flurry.`;

  const clean = transcriptFromMessage(message);
  assert.equal(clean, 'The countertop had never seen this much purposeful flurry.');
});

test('sound choices accept complete JSON surrounded by commentary and ignore reasoning examples',()=>{
  const segments=[{speaker:'Narrator',text:'She slammed the door marked "{exit}". Rain fell outside.'}];
  const chosen={cues:[{segment:0,trigger:'She slammed the door',query:'door slam'}],ambience:[{segment:0,trigger:'Rain fell outside',query:'rain'}]};
  const expected={cues:[{segment:0,trigger:'She slammed the door',query:'door slam'}],ambience:[{segment:0,trigger:'Rain fell outside',query:'rain'}],music:[]};
  for(const response of [
    `Metadata: {"status":"ready"}\n\`\`\`json\n${JSON.stringify(chosen)}\n\`\`\`\nSummary: {"count":2}`,
    `<think>{"cues":[{"segment":0,"query":"footsteps"}],"ambience":[]}</think>\n${JSON.stringify(chosen)}`,
    `Here are the choices for the door marked "{exit}":\n${JSON.stringify(chosen)}`
  ])assert.deepEqual(parseSoundCues(response,segments),expected);
  assert.throws(()=>parseSoundCues('{"cues":[{"segment":0,"query":"door slam"}',segments),/not valid JSON/);
  assert.throws(()=>parseSoundCues('<think>{"cues":[]}</think>',segments),/no text/);
});

test('LLM sound cues and ambience beds are validated against the segments, keep the story language and survive saved attribution',()=>{
  const segments=[{speaker:'Narrator',text:'La puerta se cerró de golpe. Afuera llovía.'},{speaker:'Mira',text:'"¿Quién anda ahí?"'}];
  const prompt=soundCuePrompt(segments);
  assert.match(prompt[0].content,/English Freesound search of 1 to 3 words/);assert.match(prompt[0].content,/"stop":true/);assert.equal(JSON.parse(prompt[1].content).segments[1].index,1);
  const {cues,ambience}=parseSoundCues('```json\n'+JSON.stringify({cues:[
    {segment:5,trigger:'x',query:'thunder'},
    {segment:0,trigger:'La puerta se cerró',query:'door   slam '},
    {segment:1,trigger:'not in the text',query:'footsteps'},
    {segment:0,trigger:'Afuera llovía',query:'rain'},
    {segment:0,trigger:'Afuera',query:''}
  ],ambience:[
    {segment:0,trigger:'Afuera llovía',query:' rain '},
    {segment:1,trigger:'¿Quién',stop:'yes'},
    {segment:1,trigger:'¿Quién',stop:true,query:'ignored'},
    {segment:1,trigger:'anda',query:'wind'},
    {segment:0,query:'tavern crowd'}
  ]})+'\n```',segments);
  // Short replies allow two effects and three bed entries; invalid segments, empty searches, unmatched effect words and non-boolean stops never count.
  assert.deepEqual(cues,[
    {segment:0,query:'door slam',trigger:'La puerta se cerró'},
    {segment:0,query:'rain',trigger:'Afuera llovía'}
  ]);
  assert.deepEqual(ambience,[
    {segment:0,query:'rain',trigger:'Afuera llovía'},
    {segment:1,stop:true,trigger:'¿Quién'},
    {segment:1,query:'wind',trigger:'anda'}
  ]);
  assert.deepEqual(parseSoundCues('{"cues":[]}',segments),{cues:[],ambience:[],music:[]});
  assert.throws(()=>parseSoundCues('no json here',segments),/not valid JSON/);
  assert.throws(()=>parseSoundCues('{"effects":[]}',segments),/no cues list/);
  const config={voices:[{id:'n'},{id:'m'}],fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Mira',voice:'m',style:''}],npcs:[]};
  const transcript=segments.map(segment=>segment.text).join(' ');
  const plan=validatePlan({segments:applySoundCues(segments.map(segment=>({...segment,voice:segment.speaker==='Mira'?'m':'n'})),{cues,ambience})},transcript,config);
  assert.deepEqual(plan.segments[0].sfx,[{query:'door slam',trigger:'La puerta se cerró'},{query:'rain',trigger:'Afuera llovía'}]);
  assert.deepEqual(plan.segments.map(segment=>segment.ambience),[[{query:'rain',trigger:'Afuera llovía'}],[{stop:true,trigger:'¿Quién'},{query:'wind',trigger:'anda'}]]);
  const restored=restoreAttribution(structuredClone(attributionPlan(plan,config)),transcript,config);
  assert.deepEqual(restored.segments.map(({sfx,ambience})=>({sfx,ambience})),plan.segments.map(({sfx,ambience})=>({sfx,ambience})));
});

test('music entries are asked for only when enabled, keep known feels and genres, and survive saved attribution',()=>{
  const segments=[{speaker:'Narrator',text:'The forest grew dark. Then the sun rose.'}];
  assert.doesNotMatch(soundCuePrompt(segments)[0].content,/music entries/);
  const prompt=soundCuePrompt(segments,{music:true})[0].content;
  assert.match(prompt,/music entries follow/);assert.match(prompt,/Suspenseful/);assert.match(prompt,/Silent Film Score/);assert.match(prompt,/"music":\[\]/);
  assert.doesNotMatch(prompt,/already playing/);
  assert.match(soundCuePrompt(segments,{music:true,currentMusic:{title:'Crypto',feels:['Dark']}})[0].content,/Music "Crypto" \(Dark\) is already playing from the previous text and carries on: return a music entry only when this text clearly changes the mood or setting/);
  assert.doesNotMatch(soundCuePrompt(segments,{currentMusic:{title:'Crypto',feels:['Dark']}})[0].content,/already playing/);
  const {music}=parseSoundCues(JSON.stringify({cues:[],music:[
    {segment:0,trigger:'The forest',feels:['eerie','Spooky','Dark','Mysterious','Intense'],genres:['soundtrack','Horror','Jazz'],keywords:[' harp ','forest','','x','y','z','w']},
    {segment:0,trigger:'Then the sun',stop:true},
    {segment:0,feels:['Spooky'],genres:['Trap']},
    {segment:0,feels:['Spooky'],genres:['Trap'],keywords:['drums']},
    {segment:0,trigger:'Then the sun',feels:['Uplifting']},
    {segment:0,trigger:'rose',genres:['Classical']}
  ]}),segments);
  assert.deepEqual(music,[
    {segment:0,feels:['Eerie','Dark','Mysterious'],genres:['Soundtrack','Horror'],keywords:['harp','forest','x','y','z'],trigger:'The forest'},
    {segment:0,stop:true,trigger:'Then the sun'},
    {segment:0,feels:[],genres:[],keywords:['drums'],trigger:''}
  ]);
  const config={voices:[{id:'n'}],fixed:[{speaker:'Narrator',voice:'n',style:''}],npcs:[]};
  const plan=validatePlan({segments:applySoundCues(segments.map(segment=>({...segment,voice:'n'})),{music})},segments[0].text,config);
  assert.deepEqual(plan.segments[0].music,music.map(({segment,...entry})=>entry));
  assert.deepEqual(restoreAttribution(structuredClone(attributionPlan(plan,config)),segments[0].text,config).segments[0].music,plan.segments[0].music);
});

test('cue triggers match across typographic and ASCII quotes and keep the story offset',()=>{
  const text='She whispered “Don’t go” and the door creaked.';
  assert.equal(cueOffset(text,'"Don\'t go"'),text.indexOf('“'));
  assert.equal(cueOffset('He said "it\'s late" twice.','“it’s late”'),8);
  const {cues}=parseSoundCues(JSON.stringify({cues:[{segment:0,trigger:'"Don\'t go" and the door',query:'door creak'}]}),[{speaker:'Narrator',text}]);
  assert.equal(cues[0].trigger,'"Don\'t go" and the door');
});

test('SFX action anchors keep the subject and verb together and preserve complete conjunction groups',()=>{
  const text='Once she took the bite, Kellin set the plate back on the walnut edge and slid his scarred left hand beneath the wide bottom hem of her borrowed hoodie.';
  for(const trigger of ['set the plate','Kellin set the plate','slid his scarred'])assert.equal(sfxCueOffset(text,trigger),text.indexOf('Kellin'));
  assert.equal(sfxCueOffset(text,'and slid his scarred'),text.indexOf('and slid'));
  assert.equal(sfxCueOffset('The page snapped as the glass shattered.','page snapped'),0);
  assert.equal(sfxCueOffset('The page snapped as the glass shattered.','as the glass shattered'),17);
  assert.match(soundCuePrompt([{speaker:'Narrator',text}])[0].content,/never insert an effect between a name\/pronoun and its verb/);
});

test('SFX placement uses punctuation and paragraphs without breaking titles, initials, decimals or quoted anchors',()=>{
  for(const [text,trigger,prefix] of [
    ['She paused; Kellin set the plate down.','set the plate','She paused; '],
    ['She paused — Kellin set the plate down.','set the plate','She paused — '],
    ['She paused.\nKellin set the plate down.','set the plate','She paused.\n'],
    ['She paused\n\nKellin set the plate down.','set the plate','She paused\n\n'],
    ['Kellin\nset the plate down.','set the plate',''],
    ['Dr. Kellin set the plate down.','set the plate',''],
    ['K. Beckett set the plate down.','set the plate',''],
    ['It measured 1. 5 inches before he moved it.','5 inches',''],
    ['She whispered “Don’t go” and held the door.','"Don\'t go"',''],
    ['She said “Go, and lift it” beside the table.','and lift it',''],
    ['She said “Go, now” and set the plate down.','set the plate',''],
    ['La puerta se cerró; Kellin dejó el plato.','dejó el plato','La puerta se cerró; ']
  ])assert.equal(sfxCueOffset(text,trigger),prefix.length,text);
  assert.equal(sfxCueOffset('Nothing moved.','missing words'),0);
  assert.equal(sfxCueOffset('Nothing moved.',''),0);
});

test('rankMusic scores feels, genre, keywords and full-length tracks',()=>{
  const piece=(title,feel,genre,length='00:03:00',extra={})=>({title,filename:`${title}.mp3`,feel,genre,length,instruments:'',description:'',...extra});
  const pieces=[
    piece('Sting','Dark, Mysterious','22','00:00:08'),
    piece('Jolly','Bouncy, Humorous','15'),
    piece('Shadows','Dark, Mysterious, Eerie','10'),
    piece('Woods','Mysterious','22','00:02:00',{instruments:'Harp, Strings',description:'A walk in the forest.'}),
    piece('Broken','Dark','22','00:04:00',{filename:''}),
    piece('Night','Dark','25')
  ];
  const want={feels:['Dark','Mysterious'],genres:['Soundtrack'],keywords:['harp','forest']};
  // Sting 3+3+2, Woods 3+2+2+0.5, Shadows 3+3+0.5, Night 3+0.5, Jolly 0.5; tracks without a file are skipped.
  assert.deepEqual(rankMusic(pieces,want).map(track=>track.title),['Sting','Woods','Shadows','Night','Jolly']);
  assert.deepEqual(rankMusic(pieces,want,2).map(track=>track.title),['Sting','Woods']);
  assert.equal(rankMusic(pieces,{}).at(-1).title,'Sting');
});

test('community routes hide their own catalogue from the casting prompt and ask for a voice description and the story language',()=>{
  const cast={voices:[{id:'own',route:'native:fish'},{id:'kept',route:'native:both'},{id:'Kore',route:'native:google'}],fixed:[{speaker:'Narrator',voice:'Kore',style:'',route:'native:google'}],npcs:[],defaultRoute:'native:fish'};
  const units=speechSourceUnits('"Hello."');
  const own=castingPrompt(units,cast,'');
  assert.doesNotMatch(own[0].content,/LANG/);assert.match(own[1].content,/Available voices for new NPCs: own \(, \)\n/);
  const community=castingPrompt(units,{...cast,communityRoutes:{'native:fish':'community','native:both':'both'}},'');
  assert.match(community[0].content,/young, middle-aged or old and 1 to 4 tone words from: deep, low/);assert.match(community[0].content,/LANG\|ISO 639-1/);
  assert.match(community[1].content,/Available voices for new NPCs: \n/);
  assert.match(castingPrompt(units,{...cast,defaultRoute:'native:both',communityRoutes:{'native:both':'both'}},'')[1].content,/Available voices for new NPCs: kept \(, \)\n/);
});

const castingCast=()=>({voices:[{id:'n',gender:'male',description:'Deep'},{id:'m',gender:'female',description:'Bright'},{id:'f1',gender:'female',description:'Soft'},{id:'f2',gender:'female',description:'Warm'},{id:'x1',gender:'male',description:'Gravelly'}],
  fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Jay',voice:'x1',style:'',aliases:['I']},{speaker:'Mira Vale',voice:'m',style:'',aliases:['Mira']}],npcs:[{speaker:'Guard',voice:'f2',style:''}],
  characterProfiles:[{speaker:'Jay',role:'persona',description:'A tall\n\nquiet man. '+'x'.repeat(300)},{speaker:'Mira Vale',role:'character',description:''}]});
const scripted=answers=>{const calls=[];const llm=async messages=>{calls.push(messages);const answer=answers[calls.length-1];return typeof answer==='function'?answer(messages):answer ?? '';};return {calls,llm};};

test('the casting prompt lists the cast, unused voices, recent context and the reply with marked dialogue',()=>{
  const transcript='Mira looked up. "Hi." "Bye," I said.';
  const [system,user]=castingPrompt(speechSourceUnits(transcript),castingCast(),'earlier');
  assert.match(system.content,/^You are an audiobook casting director\./);assert.match(system.content,/NPC\|name\|female\/male\/neutral\|voice id from the available voices \(match gender and character\)\./);
  assert.equal(user.content,`Cast:\n- Jay (aliases: I) [persona]: A tall quiet man. ${'x'.repeat(202)}\n- Mira Vale (aliases: Mira) [character]\n- Guard [npc]\n\nAvailable voices for new NPCs: f1 (female, Soft)\n\nEarlier chat (context only):\nearlier\n\nReply to cast (indented lines are narration):\n   Mira looked up.\nD1: "Hi."\nD2: "Bye,"\n   I said.`);
  const unvoiced=castingCast();unvoiced.fixed[2].voice='';
  assert.match(castingPrompt([],unvoiced,'')[0].content,/no voice yet; add an NPC line for each of them too: Mira Vale\.$/);
});

test('casting rows tolerate list markers and markdown and ignore other text',()=>{
  const rows=parseCastRows('Here you go:\n- **D1|Mira|soft**\n* `2` | Jay | \nD3|Narrator\r\nNPC|The Gate Guard|Male|x1\nNPC|bad\nLANG|pt\nD4');
  assert.deepEqual([...rows.speakers],[[1,'Mira'],[2,'Jay'],[3,'Narrator']]);
  assert.deepEqual([...rows.styles],[[1,'soft'],[2,''],[3,'']]);
  assert.deepEqual([...rows.npcs],[['the gate guard',{name:'The Gate Guard',gender:'male',voice:'x1'}]]);
  assert.equal(rows.language,'pt');
});

test('Fish preferred pool overrides community discovery and rejects a suggested voice outside the selected route and pool',async()=>{
 const selected='1'.repeat(32),outside='2'.repeat(32),other='3'.repeat(32),route='native:fish';
 const config={fixed:[{speaker:'Narrator',voice:'n',style:'',route}],npcs:[],defaultRoute:route,
  voices:[{id:'n',route},{id:selected,route,gender:'male'},{id:outside,route,gender:'male'},{id:other,route:'native:other',gender:'male'}],
  npcPolicy:{mode:'preferred',route,voices:[selected]},communityRoutes:{[route]:'community'},useStyle:false};
 const {calls,llm}=scripted([`D0|Guard|\nNPC|Guard|male|${outside}`]);
 const transcript='"Halt!"',raw=await castReply(transcript,config,'',llm);
 const plan=validatePlan(resolvePlanReferences(raw,transcript,config),transcript,config);
 assert.equal(plan.segments[0].voice,selected);assert.equal(plan.segments[0].route,route);assert.equal(raw.segments[0].voiceSearch,undefined);
 assert.ok(calls[0][1].content.includes(selected));assert.ok(!calls[0][1].content.includes(outside));assert.ok(!calls[0][1].content.includes(other));
});

test('castReply canonicalises aliases, reads NOT_SPOKEN as narration and casts new NPCs with a suitable unused voice',async()=>{
  const transcript='"Hi," Mira said. "Hey." The sign read "Closed". "Halt!" "Move." "Hm."';
  const {calls,llm}=scripted(['D0|mira|cheerful\nD2|I|\nD4|NOT_SPOKEN|\nD6|the gate guard|stern\nD7|Old woman|tired\nD8|Gate Guard|\nNPC|Gate guard|female|n\nNPC|Old woman|female|f1']);
  const raw=await castReply(transcript,castingCast(),'x'.repeat(5000)+'recent',llm);
  assert.equal(calls.length,1);assert.ok(calls[0][1].content.includes(`${'x'.repeat(2994)}recent\n`));
  const plan=validatePlan(resolvePlanReferences(raw,transcript,castingCast()),transcript,castingCast());
  const turn=text=>plan.segments.find(segment=>segment.text===text);
  assert.deepEqual([turn('"Hi,"').speaker,turn('"Hey."').speaker,turn('"Closed"').speaker,turn('"Halt!"').speaker,turn('"Move."').speaker,turn('"Hm."').speaker],['Mira Vale','Jay','Narrator','the gate guard','Old woman','the gate guard']);
  assert.equal(turn('"Hi,"').style,'cheerful');assert.equal(turn('"Hey."').style,'natural, matching the scene');
  // The guard's suggested voice is male, so it gets the first unused female voice; the old woman keeps her valid choice.
  assert.deepEqual(plan.npcs.map(npc=>[npc.speaker,npc.voice,npc.gender]),[['Guard','f2',undefined],['the gate guard','f1','female'],['Old woman','f1','female']]);
});

test('castReply asks once for missing lines only, then gives a still-missing line the previous speaker',async()=>{
  const transcript='"One." "Two." "Three." "Four."';
  const {calls,llm}=scripted(['D0|Jay|\nD2|Mira|','D1|Mira|calm']);
  const raw=await castReply(transcript,castingCast(),'',llm);
  assert.equal(calls.length,2);assert.equal(calls[1].at(-1).content,'You missed these ids: D1, D3. Return only their lines (and NPC lines for any new speaker) in the same format.');
  assert.equal(calls[1].at(-2).content,'D0|Jay|\nD2|Mira|');
  assert.deepEqual(raw.segments.map(segment=>segment.speaker),['Jay','Mira Vale','Mira Vale','Mira Vale']);
  assert.equal(await castReply(transcript,castingCast(),'',scripted(['I cannot help with that.','Sorry.']).llm),null);
  assert.equal((await castReply('Only narration.',castingCast(),'',async()=>{throw Error('No request expected');})).segments[0].speaker,'Narrator');
});

test('a blocked reply is cast in parallel ~1200-character parts with the previous part as context, and fails only if every part is blocked',async()=>{
  const transcript=Array.from({length:6},(_,i)=>`${'Narration goes on. '.repeat(25)}"Line ${i}."`).join(' ');
  const parts=[];let open=0,peak=0;
  const llm=async messages=>{
    const user=messages[1].content;
    if(user.includes('Earlier chat (context only):\nCHAT'))return '';
    parts.push(user);open++;peak=Math.max(peak,open);await new Promise(resolve=>setTimeout(resolve,5));open--;
    return [...user.matchAll(/^D(\d+):/gm)].map(match=>`D${match[1]}|Jay|`).join('\n');
  };
  const raw=await castReply(transcript,castingCast(),'CHAT',llm);
  assert.ok(parts.length>2);assert.ok(peak>1);
  assert.ok(parts.every(user=>!user.includes('CHAT')));assert.match(parts[0],/Earlier chat \(context only\):\n\n/);
  assert.match(parts[1],/Earlier chat \(context only\):\nEarlier in this reply: .{600}\n\nReply to cast/);
  assert.ok(raw.segments.filter(segment=>/^"/.test(speechSourceUnits(transcript)[segment.unit_ids[0]].text)).every(segment=>segment.speaker==='Jay'));
  let calls=0;assert.equal(await castReply(transcript,castingCast(),'CHAT',async()=>{calls++;return '';}),null);assert.equal(calls,parts.length+1);
});

test('castReply fills unassigned lead voices and expands explicit unison to every named member',async()=>{
  const cast={voices:[{id:'n'},{id:'low',gender:'male'},{id:'bright',gender:'male'}],fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Levi',voice:'',gender:'male',style:''},{speaker:'Cole',voice:'',gender:'male',style:''}],npcs:[],useStyle:false};
  const transcript='Levi and Cole said in unison, "Hello." Levi and Cole nodded. "Bye," they said together.';
  const raw=await castReply(transcript,cast,'',async()=>'D1|Cole|\nD3|Levi|\nNPC|Levi|male|bright');
  const plan=validatePlan(resolvePlanReferences(raw,transcript,cast),transcript,cast);
  assert.deepEqual(plan.segments.find(segment=>segment.text==='"Hello."').unison.map(member=>[member.speaker,member.voice]),[['Levi','bright'],['Cole','low']]);
  assert.equal(plan.segments.find(segment=>segment.text==='"Bye,"').speaker,'Levi & Cole');
  const vague='"Hi," they said together.';
  assert.equal(validatePlan(resolvePlanReferences(await castReply(vague,cast,'',async()=>'D0|Cole|'),vague,cast),vague,cast).segments[0].speaker,'Cole');
});

test('an alias repeating its own speaker name or alias is ignored instead of conflicting',()=>{
  const cast={...castingCast(),fixed:[...castingCast().fixed,{speaker:'Juniper',voice:'f1',style:'',aliases:['juniper ','June','june']}]};
  assert.equal(validateCastConfig(cast),cast);
  assert.equal(validatePlan({segments:[{speaker:'June',text:'"Hi."'}]},'"Hi."',cast).segments[0].speaker,'Juniper');
  assert.throws(()=>validateCastConfig({...cast,fixed:[...cast.fixed.slice(0,3),{...cast.fixed[3],aliases:['Mira']}]}),/Conflicting character alias: Mira/);
});

test('read-along maps transcript passages onto rendered text nodes across markup, quote styles, repeats and scripts',()=>{
  const nodes=['The gate',' creaked. “Hello,” said ','Mira','. “Hello,” the echo answered. ','Nested ','tags',' stay readable. ','「こんにちは」と','彼女は言った。Привет, ','МИР!'];
  const {stream,at}=readAlongIndex(nodes);
  const shown=span=>{
    if(!span)return null;
    const [startNode,startOffset]=at[span[0]],[endNode,endOffset]=at[span[1]-1];
    return nodes.slice(startNode,endNode+1).map((text,i)=>text.slice(i?0:startOffset,startNode+i===endNode?endOffset+1:undefined)).join('');
  };
  const passages=['*The gate* creaked.','"Hello,"','said **Mira**.','Missing words.','"Hello,"','the echo answered.','Nested tags stay readable.','「こんにちは」と彼女は言った。','Привет, мир!'];
  assert.deepEqual(locatePassages(stream,passages).map(shown),['The gate creaked','Hello','said Mira',null,'Hello','the echo answered','Nested tags stay readable','こんにちは」と彼女は言った','Привет, МИР']);
  const spans=locatePassages(stream,passages);
  assert.equal(at[spans[4][0]][0],3,'the second Hello resolves to its own occurrence');
  assert.equal(readableText('“Don’t,” she SAID — İ.'),'dontshesaidİ');
  assert.deepEqual(locatePassages(stream,['', '...']),[null,null]);
});

test('read-along word progress is monotonic, snaps to word ends and lingers on punctuation pauses',()=>{
  const text='The gate closed. Then, slowly — it opened again…';
  let previous=0;
  for(let step=0;step<=100;step++){
    const end=spokenLength(text,step/100);
    assert.ok(end>=previous,'progress never moves backwards');
    assert.ok(end===text.length || /\s/.test(text[end]),'the highlight ends on a word boundary');
    previous=end;
  }
  assert.equal(spokenLength(text,0),3);
  assert.equal(spokenLength(text,1),text.length);
  assert.equal(spokenLength(text,-1),3);
  assert.equal(spokenLength(text,2),text.length);
  assert.equal(spokenLength('Stop. Go now',0.5),5,'a sentence end holds the highlight during its pause');
  assert.equal(spokenLength('Stop Go now',0.5),7);
});

test('bracketed status headers are not read aloud while ordinary bracketed words stay',()=>{
  const message=`[SK| 2015년 4월 7일 (화) | 12:35 | 점심시간에 제이가 제 자리로 와서 함께 밥을 먹으며 도시락 반찬 이야기를 나누고 있어요.]

"오늘 반찬 뭐야?" 제이가 물었다.
*[Day 3 | Evening]*
【Status: tired】 〔HP 10〕
[Mira | Hungry] She opened the box.
She read the sign [closed] and left. [See the guide](https://x.test) for more.`;
  assert.equal(transcriptFromMessage(message).replace(/\s+/g,' ').trim(),'"오늘 반찬 뭐야?" 제이가 물었다. She opened the box. She read the sign [closed] and left. See the guide for more.');
});

test('non-story check rows parse by index, keep missing rows as story and drop whole skipped lines between paragraphs',()=>{
  assert.equal(parseSkipRows('Sure:\n0 K\n2: S\n- 3 s\n9 S',4),'KKSS');
  assert.equal(parseSkipRows('I cannot help with that.',3),null);
  const transcript='Mira ran.\n"Stop!" she said.\n\nActive Pressures:\n\nOpen Loop  Unanswered: the battery.\n\n{{img::door}}\nINLAY[{{a1}}]\nThe door held.';
  const lines=transcriptLines(transcript);assert.equal(lines.length,7);
  assert.deepEqual(skippedLines(lines,'KKSSKKK'),[2,3,4,5]);assert.deepEqual(skippedLines(lines,null),[4,5]);
  assert.equal(withoutLines(transcript,[2,3,4,5]),'Mira ran.\n"Stop!" she said.\n\nThe door held.');
  assert.equal(withoutLines(transcript,[1]),'Mira ran.\n\nActive Pressures:\n\nOpen Loop  Unanswered: the battery.\n\n{{img::door}}\nINLAY[{{a1}}]\nThe door held.');
  const [system,user]=skipCheckPrompt(['x'.repeat(200),'Kai: hi'],60);
  assert.match(system.content,/^You clean AI roleplay replies/);assert.match(system.content,/Example 2 answer: \n0 S\n1 K/);
  assert.equal(user.content,`Reply to label (2 lines):\n0: ${'x'.repeat(60)}\n1: Kai: hi\n\nReturn exactly 2 labels.`);
});

test('sound effects stacked at one break or too close together keep only the first, across segments too',()=>{
  const sfx=(at,query)=>({part:{kind:'sfx',sfx:{query}},at}),bed={part:{kind:'ambience',ambience:{query:'rain'}},at:0};
  const first=spaceSoundEffects([bed,sfx(0,'door'),sfx(0,'steps'),sfx(0,'knock'),sfx(0,'glass'),sfx(0,'chair'),sfx(40,'thud'),sfx(45,'tap'),sfx(150,'bell')]);
  assert.deepEqual(first.kept.map(point=>point.part.sfx?.query ?? 'bed'),['bed','door','thud','bell']);
  const next=spaceSoundEffects([sfx(5,'early'),sfx(50,'late')],{start:150,last:first.last});
  assert.deepEqual(next.kept.map(point=>point.part.sfx.query),['late']);assert.equal(SFX_MIN_SPACING,12);
});

test('review fixes: prose is not a heading, names respell only as names, quotes and effects stay in place',async()=>{
  const core=await import('../src/core.js');
  for(const line of ['Part of me wanted to stay.','Act like you mean it, she told him.','Book of the dead lay open.'])assert.equal(core.transcriptFromMessage(line),line);
  for(const heading of ['Chapter 3: The Road','Chapter Two','Scene IV','## Part 2 — Return'])assert.equal(core.transcriptFromMessage(heading),'');
  assert.equal(core.respellNames('Will said he will go. The sun rose as Rose woke. WILL!',[{speaker:'Will',sayAs:'Wil'},{speaker:'Rose',sayAs:'Rohz'}]),'Wil said he will go. The sun rose as Rohz woke. Wil!');
  const units=text=>core.speechSourceUnits(text).map(unit=>`${unit.kind[0]}:${unit.text}`);
  assert.deepEqual(units('He was 6\'2" tall. "Hi," she said.'),['n:He was 6\'2" tall.','d:"Hi,"','n:she said.']);
  assert.deepEqual(units('"First part of a speech.\n\n"Second part," he finished.'),['d:"First part of a speech.','d:"Second part,"','n:he finished.']);
  const cues=core.parseSoundCues(JSON.stringify({cues:[{segment:0,trigger:'The door slammed',query:'door slam'},{segment:0,trigger:'words not in the text',query:'thud'}],ambience:[{segment:0,trigger:'missing words',query:'rain'}]}),[{text:'The door slammed behind her.'}]);
  assert.deepEqual(cues.cues.map(cue=>cue.query),['door slam']);assert.deepEqual(cues.ambience.map(cue=>[cue.query,cue.trigger]),[['rain','']]);
  const passage=(text,passageIndex)=>({speaker:'Narrator',voice:'n',text,route:'r',passageIndex});const long='A sentence with a little room to breathe. '.repeat(24).trim();
  assert.ok(core.speechBatches([passage(long,0)],1800,'r')[0].text.length<=300);assert.equal(core.speechBatches([passage(long,2)],1800,'r').length,1);
});

test('lookahead also requests every clip needed within the time horizon, so a long clip after short ones starts early',async()=>{
  const {speechLookaheadEnd}=await import('../src/core.js');const clip=chars=>({text:'x'.repeat(chars)});
  const replies=[clip(80),clip(60),clip(90),clip(50),clip(1700),clip(300)];
  assert.equal(speechLookaheadEnd(replies,0,1),1);
  assert.equal(speechLookaheadEnd(replies,0,1,{horizonSeconds:45}),4);
  assert.equal(speechLookaheadEnd([clip(1500),clip(1500),clip(1500)],0,1,{horizonSeconds:45}),1);
  assert.equal(speechLookaheadEnd(replies,0,0,{horizonSeconds:45}),0);
});

test('a casting block written with the reply is read, hidden from speech, mapped to quotes and sounds',async()=>{
  const core=await import('../src/core.js');
  const reply='Hannah crossed the room. "Wes," she said. "Meet someone." The door opened.\n<!--choir\nQ1|Hannah|warm, delighted\nQ2|Hannah|bright\nNPC|Guard|male|old, gruff\nSFX|door open|"The door opened"\nAMB|crowd murmur|Hannah crossed\n-->';
  const plan=core.readInjectedPlan(reply),text=core.stripInjectedPlan(reply);
  assert.equal(text,'Hannah crossed the room. "Wes," she said. "Meet someone." The door opened.');
  assert.equal(core.transcriptFromMessage(reply),text);
  assert.deepEqual(core.injectedCastRows(text,plan),{rows:'D1|Hannah|warm, delighted\nD3|Hannah|bright\nNPC|Guard|male|old, gruff',covered:true});
  assert.deepEqual(core.injectedSoundCues([{text}],plan),{cues:[{segment:0,trigger:'The door opened',query:'door open'}],ambience:[{segment:0,trigger:'Hannah crossed',query:'crowd murmur'}]});
  assert.equal(core.readInjectedPlan('No block here.'),null);assert.equal(core.stripInjectedPlan('Text\n<!--choir\nQ1|Han'),'Text');
  assert.equal(core.injectedCastRows('"One." "Two."',core.readInjectedPlan('<!--choir\nQ1|A|x\n-->')).covered,false);
  const prompt=core.injectionPrompt({cast:['Hannah','Weston'],sfx:false});assert.match(prompt,/Cast: Hannah, Weston/);assert.ok(!/SFX\|/.test(prompt));
});

test('a new speaker folded into its quote row is read as that speaker, and blank-character spacing reads as spaces',async()=>{
  const core=await import('../src/core.js');
  const plan=core.readInjectedPlan('<!--choir\nQ1|NPC|Radio announcer|male|middle-aged|flat, official\n-->');
  assert.deepEqual(plan.quotes.get(1),{speaker:'Radio announcer',style:'flat, official'});assert.deepEqual(plan.npcs,[['Radio announcer','male','middle-aged, flat, official']]);
  const spoken=core.transcriptFromMessage('The⠀radio⠀hisses⠀between⠀two⠀wall⠀pipes.');
  assert.equal(spoken,'The radio hisses between two wall pipes.');
  assert.deepEqual(core.injectedSoundCues([{text:spoken}],{sfx:[{query:'static hiss',trigger:'radio hisses between two wall pipes'}],ambience:[]}).cues.map(cue=>cue.segment),[0]);
});

test('casting rows align to quotes by their first words, so a model counting a split quote once cannot shift later speakers',async()=>{
  const core=await import('../src/core.js');
  const text='Weston looked up. "Small motors, mostly," he said. "Rewinding copper coils." Hannah snorted. "He fixes things." "Smart," Weston said.';
  const anchored=core.readInjectedPlan('<!--choir\nQ1|Weston|low|Small motors mostly\nQ2|Hannah Voss|sharp|He fixes things\nQ3|Weston|dry|Smart\n-->');
  assert.deepEqual(core.injectedCastRows(text,anchored),{rows:'D1|Weston|low\nD3|Weston|low\nD5|Hannah Voss|sharp\nD6|Weston|dry',covered:true});
  const unanchored=core.readInjectedPlan('<!--choir\nQ1|Weston|low\nQ2|Hannah Voss|sharp\nQ3|Weston|dry\n-->');
  assert.deepEqual(core.injectedCastRows(text,unanchored),{rows:'',covered:false});
  const far=core.readInjectedPlan('<!--choir\nQ1|Weston|low|Small motors mostly\n-->');
  assert.equal(core.injectedCastRows('"Small motors," he said.\n\n"Rewinding coils."',far).covered,false);
  assert.match(core.injectionPrompt({cast:['Weston']}),/Q1\|Speaker\|delivery\|first words/);
});

test('SKIP rows in the casting block mark non-story lines by their first words',async()=>{
  const core=await import('../src/core.js');
  const plan=core.readInjectedPlan('<!--choir\nSKIP|Escalation: E1 Simmer\nSKIP|"Active Pressures"\n-->');
  assert.deepEqual(plan.skip,['Escalation: E1 Simmer','Active Pressures']);
  assert.deepEqual(core.injectedSkipLines(core.transcriptLines('Escalation: E1 Simmer\nThe room was quiet.\nActive Pressures:\n"Hi," he said.'),plan),[0,2]);
  assert.match(core.injectionPrompt({cast:[]}),/SKIP\|its first 4 words/);
});
