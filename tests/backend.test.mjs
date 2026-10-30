import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const bundle=readFileSync(new URL('../dist/backend.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../spindle.json',import.meta.url),'utf8'));

test('Jev distinguishes two male leads from one card and reuses independent automatically selected voices',async()=>{
  const cast={voices:[{id:'n'},{id:'y'},{id:'low',gender:'male'},{id:'bright',gender:'male'}],fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Persona',voice:'y',style:''},{speaker:'Adrian',voice:'',gender:'male',style:''},{speaker:'Ethan',voice:'',gender:'male',style:''}],npcs:[],useStyle:false,npcPolicy:{mode:'skip'},characterProfiles:[{speaker:'Adrian',name:'Adrian',role:'character',description:'A male captain with a low voice.'},{speaker:'Ethan',name:'Ethan',role:'character',description:'A male teammate with a brighter voice.'}]};
  let request;const decisions={evaluate:async input=>{request=input;return {answers:{speaker_0:{choice:'Adrian'},speaker_1:{choice:'Ethan'},speaker_2:{choice:'Ethan'}}};}};
  const h=await harness(null,null,null,null,null,decisions);h.send('planJev',{transcript:'Adrian said, "Hello." Ethan replied, "Wait." Ethan added, "Stay."',config:cast});
  const result=(await h.result()).message;assert.equal(result.error,undefined);assert.deepEqual([...result.result.segments.filter(segment=>segment.speaker!=='Narrator').map(segment=>[segment.speaker,segment.voice])],[['Adrian','low'],['Ethan','bright'],['Ethan','bright']]);
  assert.match(request.questions.speaker_0.criteria.Adrian,/lead character/);assert.match(request.state.characters.find(character=>character.name==='Ethan').about,/brighter/);assert.equal(result.result.npcs.length,0);
});

const config={voices:[{id:'Charon'},{id:'Kore'}],fixed:[{speaker:'Narrator',voice:'Charon',style:''}],npcs:[],useStyle:true};
test('Jev expands explicit unison to both independently cast voices even if its speaker answer chooses one',async()=>{
  const cast={voices:[{id:'n'},{id:'low',gender:'male'},{id:'bright',gender:'male'}],fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Levi',voice:'',gender:'male',style:''},{speaker:'Cole',voice:'',gender:'male',style:''}],npcs:[],useStyle:false};
  const decisions={evaluate:async()=>({answers:{speaker_0:{choice:'Cole'}}})};
  const h=await harness(null,null,null,null,null,decisions);
  h.send('planJev',{transcript:'Levi and Cole said in unison, "Hello."',config:cast});
  const message=(await h.result()).message;assert.equal(message.error,undefined);
  const line=message.result.segments.find(segment=>segment.unison);
  assert.deepEqual([...line.unison.map(member=>[member.speaker,member.voice])],[['Levi','low'],['Cole','bright']]);assert.equal(line.text,'"Hello."');assert.equal(message.result.npcs.length,0);
});
const castConfig={...config,fixed:[...config.fixed,{speaker:'Mira',voice:'Kore',style:''}]};
test('Jev unison with yelled excludes the named recipient',async()=>{
 const cast={voices:[{id:'n'},{id:'a'},{id:'b'},{id:'j'}],fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Alice',voice:'a',style:''},{speaker:'Bob',voice:'b',style:''},{speaker:'Judy',voice:'j',style:''}],npcs:[],useStyle:false};
 const h=await harness(null,null,null,null,null,{evaluate:async()=>({answers:{speaker_0:{choice:'Alice'}}})});
 h.send('planJev',{transcript:'"Hello," Alice and Bob yelled to Judy in unison.',config:cast});
 const message=(await h.result()).message;assert.equal(message.error,undefined);assert.deepEqual([...message.result.segments.find(segment=>segment.unison).unison.map(member=>member.speaker)],['Alice','Bob']);
});

test('Jev proxy options are clone-safe and cancellation discards a late response',async()=>{
  let release,options;
  const h=await harness(()=>{throw Error('No LLM fallback');},async(url,input)=>{
    options=input;assert.ok(!('signal' in input));structuredClone(input);
    return new Promise(resolve=>release=resolve);
  });
  h.send('planJev',{transcript:'"Hello."',apiKey:'jev-secret',config:{...castConfig,useStyle:false}});
  await new Promise(resolve=>setTimeout(resolve,0));assert.ok(options);
  h.send('cancel',{});release({status:200,body:JSON.stringify({answers:{q0:{choice:'Narrator'}}})});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(h.sent.filter(item=>item.message.result || item.message.error).length,0);
});

test('Freesound keeps AbortSignal local and ignores a proxy result after cancellation',async()=>{
 let release,options;
 const h=await harness(null,async(url,input)=>{
  assert.match(url,/freesound.org/);assert.ok(!('signal' in input));structuredClone(input);options=input;
  return new Promise(resolve=>release=resolve);
 });
 h.send('freesound',{apiKey:'test-freesound-key',query:'door'});
 await new Promise(resolve=>setTimeout(resolve,0));assert.ok(options);
 h.send('cancel',{});release({status:200,body:JSON.stringify({results:[{id:1,previews:{'preview-hq-mp3':'https://freesound.test/door.mp3'}}]})});
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(h.sent.filter(item=>item.message.result || item.message.error).length,0);
});

test('Freesound uses the current search endpoint, authenticates in a header and reports service errors',async()=>{
 const h=await harness(null,async(url,options)=>{
  const search=new URL(url);assert.equal(search.pathname,'/apiv2/search/');assert.equal(search.searchParams.get('query'),'page turn');assert.equal(search.searchParams.get('filter'),'duration:[0.1 TO 2.5]');assert.equal(search.searchParams.has('token'),false);
  assert.equal(options.headers.Authorization,'Token test-freesound-key');assert.ok(!('signal' in options));structuredClone(options);
  return {status:200,body:JSON.stringify({results:[{id:123,name:'Page turn',duration:0.8,previews:{'preview-hq-mp3':'https://freesound.test/high.mp3','preview-lq-mp3':'https://freesound.test/low.mp3'}}]})};
 });
 h.send('freesound',{apiKey:'test-freesound-key',query:'page turn'});assert.equal((await h.result()).message.result.results[0].previewUrl,'https://freesound.test/high.mp3');
 const denied=await harness(null,async()=>({status:401,body:'Unauthorized'}));denied.send('freesound',{apiKey:'invalid-key',query:'page turn'});assert.match((await denied.result()).message.error,/Freesound HTTP 401/);
});
test('music audio is proxied as checked audio only from the incompetech track directory',async()=>{
 const calls=[],proxy=async(url,options)=>{calls.push({url,options});return {status:200,headers:{'content-type':'audio/mpeg'},body:'QUJD'};};
 const h=await harness(null,proxy);h.send('musicAudio',{url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Track.mp3'});
 assert.deepEqual({...(await h.result()).message.result},{base64:'QUJD',mimeType:'audio/mpeg'});
 assert.deepEqual({...calls[0].options},{responseType:'arraybuffer',mediaType:'audio'});
 for(const url of ['http://incompetech.com/music/royalty-free/mp3-royaltyfree/Track.mp3','https://example.com/Track.mp3','https://incompetech.com/secret.mp3','https://incompetech.com/music/royalty-free/mp3-royaltyfree/Track.mp3?redirect=evil','https://name:password@incompetech.com/music/royalty-free/mp3-royaltyfree/Track.mp3']){
  const denied=await harness(null,proxy);denied.send('musicAudio',{url});assert.match((await denied.result()).message.error,/not an incompetech track/);
 }
 assert.equal(calls.length,1);
 const failed=await harness(null,async()=>({status:404}));failed.send('musicAudio',{url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Missing.mp3'});assert.match((await failed.result()).message.error,/Music audio HTTP 404/);
});

function stagedMusic(bytes=new Uint8Array([0xff,0xfb,0x90,0,1,2,3])){
 const calls={reads:[],deleted:[],fetches:[]};
 const files={
  async fetch(url,options){calls.fetches.push({url,options});return {fileId:'music-file',size:bytes.length,mimeType:'application/octet-stream'};},
  async readChunk(source,offset,userId){calls.reads.push({source,offset,userId});const data=bytes.slice(offset,offset+1024*1024);return {data,offset,size:bytes.length,eof:offset+data.length===bytes.length};},
  async delete(fileId,userId){calls.deleted.push({fileId,userId});return true;}
 };
 return {files,calls};
}
const musicUrl='https://incompetech.com/music/royalty-free/mp3-royaltyfree/Jazz%20Brunch.mp3';
const withMusicFiles=files=>harness(null,()=>{throw new Error('The transparent media proxy must not handle staged music files');},null,null,null,null,{}, {files});

test('music file downloads accept octet-stream MP3s and preserve every byte across host chunk and base64 boundaries',async()=>{
 for(const tail of [0,1,2]){
  const bytes=Uint8Array.from({length:1024*1024+tail},(_,index)=>index%251);bytes.set([0xff,0xfb,0x90,0]);
  const {files,calls}=stagedMusic(bytes),h=await withMusicFiles(files);h.send('musicAudio',{url:musicUrl});
  const message=(await h.result()).message;assert.equal(message.error,undefined);assert.equal(message.result.mimeType,'audio/mpeg');
  assert.deepEqual(Buffer.from(message.result.base64,'base64'),Buffer.from(bytes));
  const {url,options}=calls.fetches[0];assert.equal(url,musicUrl);assert.equal(options.userId,'user-a');assert.equal(options.maxBytes,25*1024*1024);assert.equal(options.timeoutMs,60000);assert.equal(options.signal.aborted,false);
  assert.deepEqual(calls.reads.map(read=>read.offset),tail?[0,1024*1024]:[0]);assert.ok(calls.reads.every(read=>read.source.fileId==='music-file' && read.userId==='user-a'));
  assert.deepEqual(calls.deleted,[{fileId:'music-file',userId:'user-a'}]);
 }
 const tagged=stagedMusic(new Uint8Array([0x49,0x44,0x33,4,0,0,0,0,0,0,0xff,0xfb,0x90,0])),h=await withMusicFiles(tagged.files);h.send('musicAudio',{url:musicUrl});assert.equal((await h.result()).message.error,undefined);
});

test('music file downloads reject non-audio, invalid MP3 tags, oversized and truncated files and always delete staging',async()=>{
 const cases=[
  {bytes:new TextEncoder().encode('<html>Download error</html>'),error:/not a valid MP3/},
  {bytes:new TextEncoder().encode('export default 1'),error:/not a valid MP3/},
  {bytes:new Uint8Array([0xff,0xf1,0x50,0x80]),error:/not a valid MP3/},
  {bytes:new Uint8Array([0x49,0x44,0x33,4,0,0,0xff,0,0,0]),error:/not a valid MP3/},
  {size:25*1024*1024+1,error:/oversized/},
  {size:0,error:/oversized/},
  {badChunk:{data:new Uint8Array(),offset:0,size:7,eof:false},error:/incomplete/},
  {badChunk:{data:new Uint8Array([0xff,0xfb,0x90,0]),offset:1,size:7,eof:false},error:/incomplete/},
  {badChunk:{data:new Uint8Array([0xff,0xfb,0x90,0]),offset:0,size:7,eof:true},error:/incomplete/}
 ];
 for(const item of cases){
  const {files,calls}=stagedMusic(item.bytes);if(item.size!==undefined)files.fetch=async()=>({fileId:'music-file',size:item.size});if(item.badChunk)files.readChunk=async()=>item.badChunk;
  const h=await withMusicFiles(files);h.send('musicAudio',{url:musicUrl});assert.match((await h.result()).message.error,item.error);assert.equal(calls.deleted.length,1);
 }
});

test('Stop cancels a staged music fetch or chunk read and late completions are deleted without sending audio',async()=>{
 for(const phase of ['fetch','read']){
  const {files,calls}=stagedMusic();let release,started;
  const waiting=new Promise(resolve=>started=resolve),original=phase==='fetch'?files.fetch:files.readChunk;
  files[phase==='fetch'?'fetch':'readChunk']=async(...args)=>{const result=await original(...args);started();return new Promise(resolve=>release=()=>resolve(result));};
  const h=await withMusicFiles(files);h.send('musicAudio',{url:musicUrl});await waiting;h.send('cancel',{});release();await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(calls.fetches[0].options.signal.aborted,true);assert.equal(calls.deleted.length,1);assert.equal(h.sent.filter(row=>row.message.result || row.message.error).length,0);
 }
});

test('older hosts explain unsupported octet-stream music without bypassing or retrying the transparent proxy',async()=>{
 let calls=0;const h=await harness(null,async(url,options)=>{calls++;assert.deepEqual({...options},{responseType:'arraybuffer',mediaType:'audio'});throw new Error('CORS proxy transparent proxy only serves audio data (received Content-Type: application/octet-stream)');});
 h.send('musicAudio',{url:musicUrl});assert.match((await h.result()).message.error,/Update Lumiverse.*file-download support/);assert.equal(calls,1);
});

test('staged music failures never fall back to another download path and cleanup errors do not hide completed audio',async()=>{
 for(const reason of ['Download failed: HTTP 404','CORS proxy permission not granted','Insufficient staging space']){
  const h=await withMusicFiles({fetch:async()=>{throw new Error(reason);},readChunk(){},delete(){}});h.send('musicAudio',{url:musicUrl});assert.equal((await h.result()).message.error,reason);
 }
 const staged=stagedMusic();staged.files.delete=async()=>{throw new Error('File expired');};const h=await withMusicFiles(staged.files);h.send('musicAudio',{url:musicUrl});assert.equal((await h.result()).message.result.mimeType,'audio/mpeg');
});

test('Freesound previews download through the CORS proxy as checked audio, only from freesound.org',async()=>{
 const requests=[];
 const h=await harness(null,async(url,options)=>{requests.push({url,options});return url.includes('missing')?{status:404,body:''}:{status:200,headers:{'content-type':'audio/mpeg; charset=binary'},body:'QUJD',encoding:'base64'};});
 h.send('freesoundPreview',{url:'https://cdn.freesound.org/previews/1/1-hq.mp3'});
 assert.deepEqual({...(await h.result()).message.result},{base64:'QUJD',mimeType:'audio/mpeg'});
 assert.deepEqual({...requests[0].options},{responseType:'arraybuffer',mediaType:'audio'});
 for(const [url,error] of [['https://example.com/x.mp3',/not from freesound\.org/],['https://cdn.freesound.org/missing.mp3',/Freesound preview HTTP 404/]]){
  const other=await harness(null,async(...args)=>{requests.push(args);return {status:404,body:''};});
  other.send('freesoundPreview',{url});assert.match((await other.result()).message.error,error);
 }
 assert.equal(requests.length,2);
});

const sounds=[
  {id:1,name:'Glass Smash, Bottle',duration:1.24,tags:['glass','smash','bottle','break','shatter','impact','debris','crash','extra'],previews:{'preview-hq-mp3':'https://freesound.test/smash.mp3'}},
  {id:2,name:'Bottle pick up',duration:0.8,tags:['bottle','glass','pickup'],previews:{'preview-hq-mp3':'https://freesound.test/pickup.mp3'}},
  {id:3,name:'Bottle clink',duration:0.5,tags:['bottle'],previews:{'preview-hq-mp3':'https://freesound.test/clink.mp3'}}];
const moment='She reached for the glass bottle on the shelf and lifted it.';
const search=async url=>{assert.equal(new URL(url).searchParams.get('page_size'),'8');return {status:200,body:JSON.stringify({results:sounds})};};
const soundOrder=async h=>JSON.parse(JSON.stringify((await h.result()).message.result.results)).map(sound=>sound.id);

test('a Lumiverse Decision connection picks the Freesound clip heard in the story moment',async()=>{
  let evaluated;
  const h=await harness(null,search,null,null,null,{evaluate:async input=>{evaluated=JSON.parse(JSON.stringify(input));return {answers:{q0:{type:'choice',choice:'s1',confidence:0.95}}};}});
  h.send('freesound',{apiKey:'test-freesound-key',query:'glass bottle',moment,kind:'sfx',decisionConnection:'decision-a',jevApiKey:'unused-jev-key'});
  assert.deepEqual(await soundOrder(h),[2,1,3]);
  assert.equal(evaluated.userId,'user-a');assert.equal(evaluated.connection_id,'decision-a');assert.deepEqual(evaluated.state,{sound:'glass bottle',moment});
  assert.equal(evaluated.questions.q0.type,'choice');
  assert.equal(evaluated.questions.q0.instructions,`The story needs a short sound effect for this moment. Wanted sound: "glass bottle". Story moment: "${moment}". Which sound file best matches what is actually heard in the story moment? Reject files whose name or tags describe a different action, setting, or sound source.`);
  assert.deepEqual(evaluated.questions.q0.criteria,{s0:'Glass Smash, Bottle — tags: glass, smash, bottle, break, shatter, impact, debris, crash (1.2s)',s1:'Bottle pick up — tags: bottle, glass, pickup (0.8s)',s2:'Bottle clink — tags: bottle (0.5s)'});
});

test('without Lumiverse decisions a Jev key picks the Freesound clip through the TypeSafe Decision API',async()=>{
  const calls=[];
  const h=await harness(null,async(url,options)=>{calls.push({url,options});return url.includes('freesound.org')?search(url):{status:200,body:JSON.stringify({model:'jev-1.13.0',answers:{q0:{type:'choice',choice:'s2'}}})};});
  h.send('freesound',{apiKey:'test-freesound-key',query:'night wind',moment,kind:'ambience',jevApiKey:'jev-key',jevEndpoint:'https://api.typesafe.ai/v1/classify'});
  assert.deepEqual(await soundOrder(h),[3,1,2]);
  assert.equal(calls[1].url,'https://api.typesafe.ai/v1/systemone');assert.equal(calls[1].options.headers.Authorization,'Bearer jev-key');structuredClone(calls[1].options);
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.model,'jev-latest');assert.deepEqual(body.state,{sound:'night wind',moment});assert.deepEqual(Object.keys(body.questions.q0.criteria),['s0','s1','s2']);
  assert.match(body.questions.q0.instructions,/^The story needs a looping background ambience for this moment\. Wanted sound: "night wind"\./);
});

test('Freesound keeps its top result without a story moment or Decision model and when the choice fails or is slow',async()=>{
  const topFirst=async(input,decisions,cors=search,deadline)=>{
    const h=await harness(null,cors,null,deadline,null,decisions);
    h.send('freesound',{apiKey:'test-freesound-key',query:'glass bottle',moment,...input});assert.deepEqual(await soundOrder(h),[1,2,3]);
  };
  const urls=[];await topFirst({},undefined,url=>{urls.push(url);return search(url);});assert.equal(urls.length,1);
  let evaluations=0;await topFirst({moment:' '},{evaluate:async()=>{evaluations++;return {answers:{q0:{choice:'s1'}}};}});assert.equal(evaluations,0);
  await topFirst({},{evaluate:async()=>{throw Error('No Decision connection');}});
  await topFirst({},{evaluate:async()=>({answers:{q0:{choice:'unknown'}}})});
  let slow;await topFirst({},{evaluate:(input,options)=>{slow=options.signal;return new Promise(()=>{});}},search,(fn,ms)=>{if(ms===5000)setTimeout(fn,0);});assert.equal(slow.aborted,true);
  await topFirst({jevApiKey:'jev-key'},undefined,url=>url.includes('freesound.org')?search(url):{status:500,body:'Upstream error'});
});

test('Jev errors stop by default and never bill the LLM',async()=>{
  let calls=0;
  const h=await harness(async()=>{calls++;throw Error('Unexpected LLM');},async()=>{throw Error('The object cannot be cloned');});
  h.send('plan',{transcript:'"Hello."',config:{...castConfig,useJev:true,jevApiKey:'secret'}});
  assert.match((await h.result()).message.error,/Jev classification failed: The object cannot be cloned/);
  assert.equal(calls,0);
  const missing=await harness(async()=>{calls++;});
  missing.send('plan',{transcript:'"Hello."',config:{...config,useJev:true}});
  assert.match((await missing.result()).message.error,/Jev API key/);assert.equal(calls,0);
});

test('heuristic planning and testing never call the LLM, even with stale Jev flags',async()=>{
  let calls=0;const h=await harness(async()=>{calls++;throw Error('Unexpected LLM');});
  h.send('plan',{transcript:'The room fell quiet.',config:{...config,plannerMode:'heuristic',useJev:true}});
  assert.equal((await h.result()).message.result.segments[0].speaker,'Narrator');
  const probe=await harness(async()=>{calls++;throw Error('Unexpected LLM');});
  probe.send('testPlanner',{plannerMode:'heuristic',useJev:true});
  assert.equal((await probe.result()).message.result.model,'Heuristic');assert.equal(calls,0);
});

test('ambiguous heuristic planning stops without falling back to a paid connection',async()=>{
  let calls=0;const h=await harness(async()=>{calls++;throw Error('Unexpected LLM');});
  h.send('plan',{transcript:'"Hello."',config:{...config,plannerMode:'heuristic',allowLlmFallback:true}});
  assert.match((await h.result()).message.error,/No LLM request was made/);assert.equal(calls,0);
});

test('explicit LLM mode ignores stale Jev and heuristic flags',async()=>{
  let calls=0;const h=await harness(async()=>{calls++;return {content:'D0|Mira|warm'};});
  h.send('plan',{transcript:'"Hello," Mira said.',config:{...castConfig,plannerMode:'llm',useJev:true,useFastClassifier:true}});
  assert.equal((await h.result()).message.result.segments[0].speaker,'Mira');assert.equal(calls,1);
});

test('LLM casting receives character profiles and unused catalogue voices and casts an unassigned lead',async()=>{
  const profiles=[{speaker:'Mira',role:'character',description:'A young singer with a bright voice.'}];
  const voices=[{id:'Charon',gender:'male',description:'Deep'},{id:'Kore',gender:'female',description:'Firm'},{id:'Leda',gender:'female',description:'Youthful'}];
  let request;const h=await harness(async input=>{request=input;return {content:'D0|Mira|bright\nNPC|Mira|female|Leda'};});
  h.send('plan',{transcript:'"Hello."',config:{...config,voices,fixed:[...config.fixed,{speaker:'Mira',voice:'',style:''}],characterProfiles:profiles}});
  const result=(await h.result()).message.result;
  assert.match(request.messages[1].content,/- Mira \[character\]: A young singer with a bright voice\.\n\nAvailable voices for new NPCs: Kore \(female, Firm\); Leda \(female, Youthful\)\n/);
  assert.match(request.messages[0].content,/no voice yet; add an NPC line for each of them too: Mira\./);
  assert.equal(result.segments[0].voice,'Leda');assert.equal(result.segments[0].style,'bright');
});

test('an opted-in failed LLM fallback retains both provider errors',async()=>{
  const h=await harness(async()=>{throw Error('LLM quota exceeded');},async()=>({status:429,body:'Jev quota exhausted'}));
  h.send('plan',{transcript:'"Hello."',config:{...castConfig,useJev:true,jevApiKey:'secret',allowLlmFallback:true}});
  const error=(await h.result()).message.error;
  assert.match(error,/Jev classification HTTP 429: Jev quota exhausted/);assert.match(error,/LLM quota exceeded/);
});

test('unknown or missing Jev classifications fail rather than attributing to the first character',async()=>{
  for(const choices of [[],['Unknown']]){
    const h=await harness(null,async()=>({status:200,body:JSON.stringify({choices})}));
    h.send('planJev',{transcript:'"Hello."',apiKey:'secret',config:castConfig});
    assert.match((await h.result()).message.error,/incomplete or unknown/);
  }
});

test('casting asks every provider for plain-text rows at temperature 0 with the last 3000 characters of context',async()=>{
  for(const provider of ['google','openai','custom']) {
    let request;const h=await harness(async input=>{request=input;return {content:'D0|Mira|'};},null,provider);
    h.send('plan',{transcript:'"Hello."',config:castConfig,context:'x'.repeat(16000)});
    assert.ok((await h.result()).message.result);
    assert.deepEqual({...request.parameters},{max_tokens:8192,temperature:0});
    assert.ok(request.messages[1].content.includes(`(context only):\n${'x'.repeat(3000)}\n\n`));assert.ok(!request.messages[1].content.includes('x'.repeat(3001)));
    assert.ok(h.sent.some(item=>item.message.progress?.stage==='Waiting for planner response'));
  }
});
async function harness(generate, cors, provider, deadline, stream, decisions,connectionOverrides={},extraSpindle={}) {
  let handler;const sent=[];let wake;
  const connection={id:'llm-a',is_default:true,model:'gemini-flash-text',provider,...connectionOverrides};
  vm.runInNewContext(bundle,{spindle:{onFrontendMessage:h=>handler=h,sendToFrontend:(message,user,options)=>{sent.push({message,user,options});if(message.result || message.error)wake?.();},generate:{raw:generate,rawStream:stream},connections:{get:async()=>connection,list:async()=>[connection]},cors,decisions,...extraSpindle},
    console,Map,Set,AbortController,TextEncoder,setTimeout:deadline?(fn,ms)=>{deadline(fn,ms);return 0;}:setTimeout,clearTimeout,URL,crypto:globalThis.crypto,atob,btoa,Uint8Array,DataView});
  return {sent,send:(action,input,id='request')=>handler({namespace:'choir',action,input,id},'user-a','session-a'),
    result:()=>sent.some(item=>item.message.result || item.message.error)?Promise.resolve(sent.findLast(item=>item.message.result || item.message.error)):new Promise(resolve=>{wake=()=>resolve(sent.at(-1));})};
}
test('planner uses user identity and routes replies only to the originating browser session',async()=>{
  let request;
  const h=await harness(async input=>{request=input;return {content:'D0|Narrator|'};});
  h.send('plan',{transcript:'"Hello."',config,context:'data'});
  const result=await h.result();
  assert.equal(request.userId,'user-a');assert.equal(result.user,'user-a');assert.equal(result.options.frontendSessionId,'session-a');
  assert.equal(request.type,'raw');assert.equal(request.parameters.max_tokens,8192);assert.equal(request.reasoning.source,'off');assert.equal(request.connection_id,'llm-a');
  assert.equal(result.message.result.segments[0].voice,'Charon');
});

test('generic card analysis reads freeform profiles and requires source evidence without TTS calls',async()=>{
 let request,calls=0;
 const card={name:'Closing Time',description:'Adrian is the captain, with a low voice. Ethan is his teammate, with a brighter voice.',scenario:'They run the station together.'};
 const h=await harness(async input=>{calls++;request=input;return {content:JSON.stringify({roles:[{name:'Adrian',description:'A low-voiced captain.',evidence:'Adrian is the captain'},{name:'Ethan',description:'A brighter-voiced teammate.',evidence:'Ethan is his teammate'}]})};});
 h.send('cardCast',{card,connectionId:'llm-a'});const result=(await h.result()).message;assert.equal(result.error,undefined);assert.deepEqual([...result.result.roles.map(role=>role.name)],['Adrian','Ethan']);assert.equal(calls,1);assert.match(request.messages[0].content,/regardless of formatting or title/);assert.match(request.messages[0].content,/untrusted data/);assert.equal(JSON.parse(request.messages[1].content).description,card.description);assert.equal(request.userId,'user-a');
 const bad=await harness(async()=>({content:JSON.stringify({roles:[{name:'Invented',description:'A stranger.',evidence:'Not present in the card.'}]})}));bad.send('cardCast',{card});const rejected=(await bad.result()).message;assert.equal(rejected.error,undefined);assert.deepEqual([...rejected.result.roles],[]);
});
test('card analysis discards narrative guideline headings returned as lead names',async()=>{
 const card={name:'Eliza',description:'Eliza is the main character.\n# NARRATIVE GUIDELINES\nKeep the main character consistent.'};
 const h=await harness(async()=>({content:JSON.stringify({roles:[{name:'Eliza',evidence:'Eliza is the main character.'},{name:'NARRATIVE GUIDELINES'}]})}));
 h.send('cardCast',{card});const message=(await h.result()).message;assert.equal(message.error,undefined);assert.deepEqual([...message.result.roles.map(role=>role.name)],['Eliza']);
});

test('missing lines get one follow-up request, and a reply without casting rows fails with guidance',async()=>{
  const requests=[];const h=await harness(async input=>{requests.push(input);return {content:requests.length===1?'D0|Mira|':'D2|Narrator|'};});
  h.send('plan',{transcript:'"Hi." "Hey." "Bye."',config:castConfig});
  const result=(await h.result()).message.result;
  assert.equal(requests.length,2);assert.match(requests[1].messages.at(-1).content,/^You missed these ids: D1, D2\./);
  assert.deepEqual([...result.segments.map(segment=>segment.speaker)],['Mira','Narrator']);
  let calls=0;const prose=await harness(async()=>{calls++;return {content:'I cannot process this request.'};});
  prose.send('plan',{transcript:'"Hello."',config:castConfig});
  assert.match((await prose.result()).message.error,/no speakers for this reply/);assert.equal(calls,2);
});
test('cancellation aborts planner and suppresses stale replies',async()=>{
  let resolve;let signal;
  const h=await harness(input=>{signal=input.signal;return new Promise(r=>resolve=r);});
  h.send('plan',{transcript:'"Hello."',config});await new Promise(r=>setTimeout(r,0));h.send('cancel',{});
  assert.ok(signal.aborted);resolve({content:'D0|Narrator|'});
  await new Promise(r=>setTimeout(r,10));assert.equal(h.sent.filter(item=>item.message.result || item.message.error).length,0);
});


test('credential, rate-limit, unknown-model and reasoning-only planner failures stop after one request',async()=>{
  const transcript=`${'The hall was quiet. '.repeat(70)}"Hello." ${'The road was dark. '.repeat(70)}"Bye."`;
  for(const [fail,expected] of [
    [()=>{throw Error('Custom (OpenAI-compatible) generate failed (401): Incorrect API key provided');},/Planner failed: .*401.*Incorrect API key/],
    [()=>{throw Error('Custom (OpenAI-compatible) generate failed (429): Rate limit reached for requests');},/Planner failed: .*429.*Rate limit/],
    [()=>{throw Error("Custom (OpenAI-compatible) generate failed (404): The model 'x' does not exist.");},/Planner failed: .*does not exist/],
    [()=>({content:'',reasoning:'Thinking about speakers…',finish_reason:'length'}),/Planner failed: .*spent its output on reasoning.*Turn off thinking/]
  ]){
    let requests=0;const h=await harness(async()=>{requests++;return fail();});
    h.send('plan',{transcript,config:castConfig});
    assert.match((await h.result()).message.error,expected);assert.equal(requests,1);
  }
});

test('a model that accepts only its default temperature is retried without one, and later requests omit it',async()=>{
  const sent=[];
  const h=await harness(async input=>{sent.push(input.parameters);if(input.parameters.temperature!==undefined)throw Error("Custom (OpenAI-compatible) generate failed (400): Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.");return {content:'D1|Mira|'};});
  h.send('plan',{transcript:'Mira smiled. "Hello."',config:castConfig});
  assert.equal((await h.result()).message.error,undefined);
  assert.deepEqual(sent.map(parameters=>'temperature' in parameters),[true,false]);
  h.send('testPlanner',{},'second');
  for(let i=0;i<100 && !h.sent.some(item=>item.message.id==='second' && item.message.result);i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(h.sent.some(item=>item.message.id==='second' && item.message.result));assert.equal('temperature' in sent.at(-1),false);
});

test('a blocked reply is cast in parts, and a reply blocked in every part names the provider error',async()=>{
  const transcript=`${'The hall was quiet. '.repeat(70)}"Hello." ${'The road was dark. '.repeat(70)}"Bye."`;
  const requests=[];
  const h=await harness(async input=>{requests.push(input);if(requests.length===1)throw Error('PROHIBITED_CONTENT');return {content:[...input.messages[1].content.matchAll(/^D(\d+):/gm)].map(match=>`D${match[1]}|Mira|`).join('\n')};});
  h.send('plan',{transcript,config:castConfig,context:'earlier chat'});
  const result=(await h.result()).message.result;
  assert.ok(requests.length>2);assert.ok(requests.slice(1).every(request=>!request.messages[1].content.includes('earlier chat')));
  assert.deepEqual([...result.segments.filter(segment=>segment.speaker!=='Narrator').map(segment=>segment.text)],['"Hello."','"Bye."']);
  const blocked=await harness(async()=>{throw Error('PROHIBITED_CONTENT');});
  blocked.send('plan',{transcript,config:castConfig});
  assert.match((await blocked.result()).message.error,/Planner failed: PROHIBITED_CONTENT/);
  const empty=await harness(async()=>({content:'',finish_reason:'stop'}));
  empty.send('plan',{transcript,config:castConfig});
  assert.match((await empty.result()).message.error,/no speakers for this reply/);
});

test('backend readiness check replies without making an LLM or TTS request',async()=>{
  const h=await harness(()=>{throw new Error('Should not call planner');},()=>{throw new Error('Should not call TTS');});
  h.send('ping',{});
  const result=await h.result();assert.equal(result.message.result.ready,true);assert.equal(result.message.result.version,manifest.version);
});



test('planner test sends a small independent request and reports the exact model',async()=>{
  let request;
  const h=await harness(async input=>{request=input;return {content:'READY'};},null,'openai');
  h.send('testPlanner',{connectionId:'llm-a'});
  const result=await h.result();
  assert.equal(result.message.result.model,'gemini-flash-text');assert.equal(result.message.result.provider,'openai');
  assert.equal(request.parameters.max_tokens,64);assert.equal(request.connection_id,'llm-a');
  assert.ok(h.sent.some(item=>item.message.progress?.model==='gemini-flash-text'));
  assert.ok(!request.messages[0].content.includes('transcript'));
});

test('a stalled planner test reports its model and cancels generation at the deadline',async()=>{
  let expire,limit,signal;
  const h=await harness(input=>{signal=input.signal;return new Promise(()=>{});},null,'openai',(fn,ms)=>{expire=fn;limit=ms;});
  h.send('testPlanner',{connectionId:'llm-a'});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(limit,60000);expire();
  const result=await h.result();assert.match(result.message.error,/Waiting for a short LLM test response/);
  assert.match(result.message.error,/gemini-flash-text/);assert.ok(signal.aborted);
});

test('backend no longer accepts the unused direct Fish and Jev classification actions', async () => {
  for (const action of ['fishaudio', 'classifyJev', 'classifyWithJev']) {
    let called = false;
    const h = await harness(null, async () => { called = true; return { status: 200, body: '' }; });
    h.send(action, { apiKey: 'key', segment: { text: 'Hello.' }, items: [{ text: 'Hi' }], candidates: ['A'] });
    assert.match((await h.result()).message.error, /Unknown Choir action/);
    assert.equal(called, false);
  }
});

test('searchVoices searches community voice models and parses items', async () => {
  let request;
  const h = await harness(null, async (url, options) => {
    request = { url, options };
    return {
      status: 200,
      body: JSON.stringify({
        items: [
          { _id: '0f1de066bb6c4d03933aad3d0169cd0f', title: 'Natsuki', description: 'Cute tsundere voice' },
          { _id: 'a6e0107fbef440cdb955646fb58cfe5a', title: 'Natsuki Subaru', description: 'Confident isekai guy' }
        ]
      })
    };
  });
  h.send('searchVoices', { query: 'natsuki', limit: 5 });
  const result = await h.result();
  assert.equal(result.message.result.query, 'natsuki');
  assert.equal(result.message.result.results.length, 2);
  assert.equal(result.message.result.results[0].name, 'Natsuki');
  assert.equal(result.message.result.results[0].id, '0f1de066bb6c4d03933aad3d0169cd0f');
  assert.match(request.url, /api\.fish\.audio\/model\?title=natsuki/);
});

test('searchVoices handles empty query or network failure', async () => {
  const h = await harness();
  h.send('searchVoices', { query: '' });
  assert.match((await h.result()).message.error, /Enter a character or voice name/);

  const h2 = await harness(null, async () => ({ status: 500, body: 'Internal error' }));
  h2.send('searchVoices', { query: 'glados' });
  assert.match((await h2.result()).message.error, /Voice search HTTP 500/);
});


import { classifyWithJev, planWithJev, speakerNameCandidates } from '../src/backend.js';

// The backend reaches the network only through spindle.cors, so these src imports get a stand-in for it.
async function withCors(respond, run) {
  const original = globalThis.spindle;
  globalThis.spindle = { cors: async (url, options) => { const { status = 200, body } = await respond(url, options); return { status, body: JSON.stringify(body) }; } };
  try { await run(); } finally { globalThis.spindle = original; }
}

test('classifyWithJev asks the TypeSafe Decision API one choice question per item and returns candidate strings', async () => {
  let request;
  await withCors(async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { body: { model: 'jev-1.13.0', answers: { q0: { type: 'choice', choice: 'Alice', confidence: 0.9 }, q1: { type: 'choice', choice: 'Bob' } } } };
  }, async () => {
    const items = [
      { text: '"Hello"', context: 'Alice said' },
      { text: '"Hi there"', context: 'Bob replied' }
    ];
    const candidates = ['Alice', 'Bob', 'Charlie'];
    const result = await classifyWithJev({
      items,
      candidates,
      apiKey: 'test-jev-key',
      question: 'Which character speaks this dialogue'
    });
    assert.deepEqual(result, ['Alice', 'Bob']);
    assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(request.options.headers.Authorization, 'Bearer test-jev-key');
    const criteria = { Alice: 'Alice', Bob: 'Bob', Charlie: 'Charlie' };
    assert.deepEqual(request.body, {
      model: 'jev-latest',
      state: items,
      questions: {
        q0: { type: 'choice', instructions: 'Which character speaks this dialogue: ""Hello""?', criteria },
        q1: { type: 'choice', instructions: 'Which character speaks this dialogue: ""Hi there""?', criteria }
      }
    });
  });
});

test('classifyWithJev resolves a saved /classify endpoint to its base and rejects unknown answers', async () => {
  const urls = [];
  let answer = 'Guard';
  await withCors(async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer existing-token');
    return { body: { answers: { q0: { choice: answer } } } };
  }, async () => {
    for (const endpoint of ['https://custom.api.endpoint/v1/classify', 'https://custom.api.endpoint/v1']) {
      assert.deepEqual(await classifyWithJev({ items: [{ text: '"Halt!"' }], candidates: ['Guard'], apiKey: 'Bearer existing-token', endpoint }), ['Guard']);
    }
    assert.deepEqual(urls, ['https://custom.api.endpoint/v1/systemone', 'https://custom.api.endpoint/v1/systemone']);
    answer = 'Nobody';
    await assert.rejects(
      () => classifyWithJev({ items: [{ text: '"Halt!"' }], candidates: ['Guard'], apiKey: 'Bearer existing-token' }),
      /incomplete or unknown classification choices/
    );
  });
});

test('classifyWithJev validates required apiKey, choices, and handles network failure', async () => {
  await assert.rejects(
    () => classifyWithJev({ items: [{ text: '"test"' }], candidates: ['Alice'], apiKey: '' }),
    /Enter a Jev API key/
  );
  await assert.rejects(
    () => classifyWithJev({ items: [{ text: '"test"' }], candidates: [], apiKey: 'key' }),
    /Provide at least one candidate choice/
  );
  const emptyRes = await classifyWithJev({ items: [], candidates: ['Alice'], apiKey: 'key' });
  assert.deepEqual(emptyRes, []);

  await withCors(async () => ({ status: 401, body: { error: { message: 'Invalid API key' } } }), () => assert.rejects(
    () => classifyWithJev({ items: [{ text: '"test"' }], candidates: ['Alice'], apiKey: 'bad-key' }),
    /Jev classification failed: Jev classification HTTP 401: Invalid API key/
  ));
});

test('planWithJev classifies dialogue speakers and emotion tags into valid speech plan segments', async () => {
  const calls = [];
  await withCors(async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    const [first, second] = calls.length === 1 ? ['Alice', 'Bob'] : ['cheerful', 'whispering'];
    return { body: { answers: { q0: { choice: first }, q1: { choice: second } } } };
  }, async () => {

    const jevConfig = {
      voices: [{ id: 'Charon' }, { id: 'Kore' }],
      fixed: [
        { speaker: 'Narrator', voice: 'Charon', style: '' },
        { speaker: 'Persona', voice: 'Charon', style: '' },
        { speaker: 'Alice', voice: 'Kore', style: '' }
      ],
      npcs: [{ speaker: 'Bob', voice: 'Charon', style: '' }],
      useStyle: true
    };
    const transcript = 'The room fell quiet. "Good morning!" said Alice. "Keep your voice down," Bob whispered.';
    const plan = await planWithJev({
      transcript,
      config: jevConfig,
      apiKey: 'jev-secret-test'
    });

    assert.ok(plan.segments);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.url === 'https://api.typesafe.ai/v1/systemone' && call.body.model === 'jev-latest'));
    // The persona speaks in replies too, and a speaker outside the cast has its own choice.
    assert.deepEqual(Object.keys(calls[0].body.questions.q0.criteria), ['Persona', 'Alice', 'Bob', 'Someone not listed', 'Nobody (not spoken aloud)']);
    assert.equal(calls[0].body.questions.q0.instructions, 'Which character speaks this dialogue: ""Good morning!""?');
    const deliveryChoices=calls[1].body.questions.q1.criteria;
    assert.match(deliveryChoices.cheerful,/Low intensity/);
    assert.match(deliveryChoices.delighted,/Moderate intensity/);
    assert.match(deliveryChoices.ecstatic,/High intensity/);

    // Check segments attribution and emotion styles
    const aliceSeg = plan.segments.find(s => s.text === '"Good morning!"');
    assert.ok(aliceSeg, 'Alice dialogue segment found');
    assert.equal(aliceSeg.speaker, 'Alice');
    assert.equal(aliceSeg.voice, 'Kore');
    assert.equal(aliceSeg.style, 'Lightly cheerful, conversational');

    const bobSeg = plan.segments.find(s => s.text === '"Keep your voice down,"');
    assert.ok(bobSeg, 'Bob dialogue segment found');
    assert.equal(bobSeg.speaker, 'Bob');
    assert.equal(bobSeg.voice, 'Charon');
    assert.equal(bobSeg.style, 'Quiet whisper, restrained');

    // Narration segments
    const narrSeg = plan.segments.find(s => s.text === 'The room fell quiet.');
    assert.ok(narrSeg, 'Narrator segment found');
    assert.equal(narrSeg.speaker, 'Narrator');
    assert.equal(narrSeg.voice, 'Charon');
  });
});

test('planWithJev handles pure narration without making classification calls', async () => {
  let fetchCalled = false;
  await withCors(async () => {
    fetchCalled = true;
    throw new Error('Should not be called');
  }, async () => {
    const transcript = 'The sun set over the distant mountains. All was calm and peaceful.';
    const plan = await planWithJev({
      transcript,
      config,
      apiKey: 'jev-key'
    });
    assert.equal(fetchCalled, false);
    assert.equal(plan.segments.length, 1);
    assert.equal(plan.segments[0].speaker, 'Narrator');
    assert.equal(plan.segments[0].text, transcript);
  });
});

test('backend RPC handler supports action planJev and planWithJev', async () => {
  const calls = [];
  const corsHandler = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return {
      status: 200,
      body: JSON.stringify({ answers: { q0: { choice: calls.length % 2 === 1 ? 'Hero' : 'sigh' } } })
    };
  };

  const jevConfig = {
    voices: [{ id: 'Charon' }, { id: 'Kore' }],
    fixed: [
      { speaker: 'Narrator', voice: 'Charon', style: '' },
      { speaker: 'Hero', voice: 'Kore', style: '' }
    ],
    npcs: [],
    useStyle: true
  };

  const h = await harness(null, corsHandler);
  h.send('planJev', {
    transcript: 'He looked back. "Farewell," sighed Hero.',
    config: jevConfig,
    apiKey: 'rpc-jev-key'
  });
  const res = await h.result();
  assert.ok(res.message.result);
  const heroSeg = res.message.result.segments.find(s => s.text === '"Farewell,"');
  assert.equal(heroSeg.speaker, 'Hero');
  assert.equal(heroSeg.style, 'Soft sigh');

  // Test action alias planWithJev
  const h2 = await harness(null, corsHandler);
  h2.send('planWithJev', {
    transcript: 'He looked back. "Farewell," sighed Hero.',
    config: jevConfig,
    apiKey: 'rpc-jev-key'
  });
  const res2 = await h2.result();
  assert.ok(res2.message.result);
});

for (const [emotion, expected] of [['sigh', 'Soft sigh'], ['relieved', 'Softly relieved, warm']]) {
  test(`Jev ${emotion} preserves a relieved sigh without inventing weariness`, async () => {
    let emotionCalls = 0;
    const decisions = {evaluate: async input => {
      if (input.questions.speaker_0) return {answers: {speaker_0: {choice: 'Mira'}}};
      emotionCalls++;
      const criteria = input.questions.emotion_0.criteria;
      assert.match(criteria.relieved, /Tension easing/);
      assert.match(criteria.sigh, /choose relieved when the scene describes relief/);
      assert.equal(criteria.sigh.split('.')[0], 'Soft sigh');
      return {answers: {emotion_0: {choice: emotion}}};
    }};
    const h = await harness(null, null, null, null, null, decisions);
    h.send('planJev', {transcript: 'Mira smiled with relief. "<sigh> I am glad you came back."', config: castConfig});
    const message = (await h.result()).message;
    assert.equal(message.error, undefined);
    const line = message.result.segments.find(segment => segment.speaker === 'Mira');
    assert.equal(line.voice, 'Kore');
    assert.equal(line.text, '"<sigh> I am glad you came back."');
    assert.equal(line.style, expected);
    assert.doesNotMatch(line.style, /weary|sad|tired/i);
    assert.equal(emotionCalls, 1);
  });
}

test('action plan attempts Jev when useJev and jevApiKey are configured, succeeding without LLM', async () => {
  let llmCalled = false;
  const generate = async () => {
    llmCalled = true;
    return { content: '{"segments":[]}' };
  };
  const corsHandler = async (url, options) => {
    return {
      status: 200,
      body: JSON.stringify({ answers: { q0: { choice: 'Hero' } } })
    };
  };
  const jevConfig = {
    voices: [{ id: 'Charon' }, { id: 'Kore' }],
    fixed: [
      { speaker: 'Narrator', voice: 'Charon', style: '' },
      { speaker: 'Hero', voice: 'Kore', style: '' }
    ],
    npcs: [],
    useStyle: true,
    useJev: true,
    jevApiKey: 'auto-jev-key'
  };

  const h = await harness(generate, corsHandler);
  h.send('plan', {
    transcript: '"I am ready," said Hero.',
    config: jevConfig
  });
  const res = await h.result();
  assert.ok(res.message.result);
  assert.equal(llmCalled, false, 'LLM should not be called when Jev succeeds');
  const heroSeg = res.message.result.segments.find(s => s.text === '"I am ready,"');
  assert.equal(heroSeg.speaker, 'Hero');
});

test('action plan uses explicitly enabled LLM fallback and retains the Jev diagnostic', async () => {
  let llmCalled = false;
  const generate = async () => {
    llmCalled = true;
    return { content: 'D0|a voice|whispering\nNPC|a voice|neutral|Charon' };
  };
  const corsHandler = async () => {
    return { status: 500, body: JSON.stringify({ error: { message: 'Jev service unavailable' } }) };
  };
  const jevConfig = {
    voices: [{ id: 'Charon' }],
    fixed: [{ speaker: 'Narrator', voice: 'Charon', style: '' }, { speaker: 'Hero', voice: 'Charon', style: '' }],
    npcs: [],
    useStyle: true,
    useJev: true,
    jevApiKey: 'failing-jev-key',
    allowLlmFallback:true
  };

  const h = await harness(generate, corsHandler);
  h.send('plan', {
    transcript: '"Hello," whispered a voice.',
    config: jevConfig
  });
  const res = await h.result();
  assert.ok(res.message.result);
  assert.match(res.message.result.warning,/Jev service unavailable/);
  assert.equal(llmCalled, true, 'LLM planner should be invoked as fallback');
});

test('testPlanner tests Jev when plannerMode is jev', async () => {
  let request;
  const h = await harness(null, async (url, options) => {
    request = { url, options };
    return { status: 200, body: JSON.stringify({ answers: { q0: { choice: 'Alice' } } }) };
  });
  h.send('testPlanner', { plannerMode: 'jev', jevApiKey: 'test-jev-key', jevEndpoint: 'https://api.typesafe.ai/v1/classify' });
  const result = await h.result();
  assert.equal(result.message.result.provider, 'TypeSafe AI');
  assert.equal(result.message.result.model, 'Jev System 1');
  assert.match(result.message.result.response, /READY/);
  assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(request.options.headers.Authorization, 'Bearer test-jev-key');
  assert.match(result.message.result.response, /choice: Alice/);
});


test('Jev with spindle.decisions passes userId to evaluate for operator-scoped host calls',async()=>{
  let evalInput;
  const decisions={
    evaluate:async(input)=>{
      evalInput=input;
      return {provider:'TypeSafe AI',model:'Jev System 1',answers:{speaker_0:{choice:'Alice'}}};
    }
  };
  const h=await harness(null,null,null,null,null,decisions);
  h.send('planJev',{transcript:'"Hello."',config:{...config,voices:[{id:'Charon'},{id:'Kore'}],fixed:[{speaker:'Narrator',voice:'Charon',style:''},{speaker:'Alice',voice:'Kore',style:''},{speaker:'Bob',voice:'Charon',style:''}],useStyle:false}});
  const result=await h.result();
  assert.equal(evalInput.userId,'user-a');
  assert.equal(result.message.result.segments[0].speaker,'Alice');
});

test('Jev with spindle.decisions asks about each line in place and sends the whole transcript',async()=>{
  let evalInput;
  const decisions={evaluate:async input=>{evalInput=input;return {answers:{speaker_0:{choice:'Alice'},speaker_1:{choice:'Bob'}}};}};
  const h=await harness(null,null,null,null,null,decisions);
  const transcript=`${'The room was quiet. '.repeat(250)}Alice looked up. "Robots?" Bob shrugged. "Robots."`;
  h.send('planJev',{transcript,config:{...config,voices:[{id:'Charon'},{id:'Kore'}],fixed:[{speaker:'Narrator',voice:'Charon',style:''},{speaker:'Alice',voice:'Kore',style:''},{speaker:'Bob',voice:'Charon',style:''}],useStyle:false}});
  const result=await h.result();
  assert.equal(evalInput.state.transcript,transcript);
  assert.match(evalInput.questions.speaker_0.instructions,/Alice looked up\. \[\["Robots\?"\]\] Bob shrugged/);
  assert.match(evalInput.questions.speaker_1.instructions,/Bob shrugged\. \[\["Robots\."\]\]/);
  assert.deepEqual([...result.message.result.segments.filter(s=>s.speaker!=='Narrator').map(s=>s.speaker)],['Alice','Bob']);
});

// The user's chat: a scenario card whose title fills the character slot, an unresolved "Persona" placeholder and a class of NPCs.
const scenarioCast = {
  voices: [{ id: 'narrator' }, { id: 'jay' }, { id: 'saki' }, { id: 'student-1' }, { id: 'student-2' }],
  fixed: [
    { speaker: 'Narrator', voice: 'narrator', style: '' },
    { speaker: 'Persona', voice: 'jay', style: '' },
    { speaker: 'Metamorphosis: Just the Way You Are!', voice: 'saki', style: '' }
  ],
  npcs: [{ speaker: 'Student 1', voice: 'student-1', style: '' }, { speaker: 'Student 2', voice: 'student-2', style: '', aliases: ['Kenta'] }],
  characterProfiles: [
    { speaker: 'Metamorphosis: Just the Way You Are!', name: 'Metamorphosis: Just the Way You Are!', role: 'character', description: '', personality: '', scenario: '', firstMessage: 'April 6, 2015. Among the kids celebrating, Saki stood far off to the outside.' },
    { speaker: 'Persona', name: 'Jay', role: 'persona', description: 'A Japanese young man with straight black hair.', personality: '' }
  ],
  useStyle: false
};
const scenarioTranscript = 'Jay unhooked the receiver. "Hello?" Saki flinched. "We should pack up."';

test('Jev offers the persona and a scenario card by who they are, with profiles in the state, on both Jev paths', async () => {
  const expected = {
    Persona: "Persona (also called Jay): the user's own character (persona).",
    'Metamorphosis: Just the Way You Are!': "Metamorphosis: Just the Way You Are!: a lead character defined by the character card; use this person's own profile, and distinguish other people in the same card.",
    'Student 1': 'Student 1: a supporting character.',
    'Student 2': 'Student 2 (also called Kenta): a supporting character.',
    'Someone not listed': 'A speaker who matches none of the other choices, their names or descriptions.',
    'Nobody (not spoken aloud)': "Not dialogue: these quoted words are not said aloud by anyone at this moment. Examples: a quoted word, name, nickname or term being talked about; written, typed or displayed text; words someone said earlier that the narration is only quoting; out-of-character notes; or a noise. A character's own quoted thoughts are not Nobody: they belong to that character."
  };
  const checkState = characters => {
    assert.deepEqual([...characters.map(c => c.name)], ['Persona', 'Metamorphosis: Just the Way You Are!', 'Student 1', 'Student 2']);
    assert.match(characters[0].about, /straight black hair/);
    assert.match(characters[1].about, /Saki stood far off/);
  };
  let evalInput;
  const decisions = { evaluate: async input => { evalInput = input; return { answers: { speaker_0: { choice: 'Persona' }, speaker_1: { choice: 'Metamorphosis: Just the Way You Are!' } } }; } };
  const h = await harness(null, null, null, null, null, decisions);
  h.send('planJev', { transcript: scenarioTranscript, context: 'Saki: "Thanks for today."', config: scenarioCast });
  const decided = (await h.result()).message.result;
  assert.deepEqual({ ...evalInput.questions.speaker_0.criteria }, expected);
  assert.equal(evalInput.state.context, 'Saki: "Thanks for today."');
  checkState(evalInput.state.characters);
  assert.deepEqual([...decided.segments.filter(s => s.speaker !== 'Narrator').map(s => `${s.speaker}:${s.voice}`)], ['Persona:jay', 'Metamorphosis: Just the Way You Are!:saki']);

  let body;
  const direct = await harness(null, async (url, options) => {
    body = JSON.parse(options.body);
    return { status: 200, body: JSON.stringify({ answers: { q0: { choice: 'Persona' }, q1: { choice: 'Metamorphosis: Just the Way You Are!' } } }) };
  });
  direct.send('planJev', { transcript: scenarioTranscript, context: 'Saki: "Thanks for today."', apiKey: 'jev-key', config: scenarioCast });
  const classified = (await direct.result()).message.result;
  assert.deepEqual(body.questions.q0.criteria, expected);
  checkState(body.state.characters);
  assert.match(body.state.lines[1].context, /Thanks for today[\s\S]*pack up/);
  assert.deepEqual([...classified.segments.map(s => s.speaker)], [...decided.segments.map(s => s.speaker)]);
});

test('LLM and Jev card-title aliases resolve to the assigned lead voice instead of NPC policy',async()=>{
  const title='Kellin Beckett || Toxic Fans',cast={...config,useStyle:false,fixed:[{speaker:'Narrator',voice:'Charon',style:''},{speaker:'Laiyah',voice:'Kore',style:''},{speaker:'Kellin Beckett',voice:'Charon',style:'',aliases:[title]}],npcPolicy:{mode:'single',voice:'Kore',route:''},characterProfiles:[{speaker:'Kellin Beckett',name:title,role:'character',description:'Kellin is the singer.'}]};
  const llm=await harness(async input=>{
    assert.ok(input.messages[1].content.includes(`- Kellin Beckett (aliases: ${title}) [character]: Kellin is the singer.`));
    return {content:`D0|${title}|calm`};
  });
  llm.send('plan',{transcript:'"Hello."',config:cast});const reply=(await llm.result()).message;assert.equal(reply.error,undefined);const standard=reply.result;assert.equal(standard.segments[0].speaker,'Kellin Beckett');assert.equal(standard.segments[0].voice,'Charon');assert.equal(standard.npcs.length,0);
  let choices;const decisions={evaluate:async input=>{choices=input.questions.speaker_0.criteria;return {answers:{speaker_0:{choice:title}}};}};
  const jev=await harness(null,null,null,null,null,decisions);jev.send('planJev',{transcript:'"Hello."',config:cast});const fast=(await jev.result()).message.result;
  assert.match(choices['Kellin Beckett'],/also called Kellin Beckett \|\| Toxic Fans/);assert.ok(!Object.hasOwn(choices,title));assert.equal(fast.segments[0].speaker,'Kellin Beckett');assert.equal(fast.segments[0].voice,'Charon');assert.equal(fast.npcs.length,0);
});

test('a card voicing several characters keeps its lead and its named NPCs apart', async () => {
  const cast = { voices: [{ id: 'n' }, { id: 'saki' }, { id: 'kanade' }], useStyle: false,
    fixed: [{ speaker: 'Narrator', voice: 'n', style: '' }, { speaker: 'Saki & Kanade', voice: 'saki', style: '', aliases: ['Saki'] }],
    npcs: [{ speaker: 'Kanade', voice: 'kanade', style: '', aliases: ['Kana'] }],
    characterProfiles: [{ speaker: 'Saki & Kanade', name: 'Saki & Kanade', role: 'character', description: 'Saki is shy. Her sister Kanade is loud.', personality: '' }] };
  let evalInput;
  const decisions = { evaluate: async input => { evalInput = input; return { answers: { speaker_0: { choice: 'Saki & Kanade' }, speaker_1: { choice: 'Kanade' } } }; } };
  const h = await harness(null, null, null, null, null, decisions);
  h.send('planJev', { transcript: '"Um, hi," Saki said. "Speak up!" Kanade laughed.', config: cast });
  const plan = (await h.result()).message.result;
  assert.deepEqual(Object.keys(evalInput.questions.speaker_0.criteria), ['Saki & Kanade', 'Kanade', 'Someone not listed', 'Nobody (not spoken aloud)']);
  assert.match(evalInput.questions.speaker_0.criteria['Saki & Kanade'], /also called Saki/);
  assert.match(evalInput.questions.speaker_0.criteria.Kanade, /also called Kana/);
  assert.deepEqual([...plan.segments.filter(s => s.speaker !== 'Narrator').map(s => s.voice)], ['saki', 'kanade']);
});

test('Jev reads unspoken quotes as narration and names new speakers from the story', async () => {
  const cast = { voices: [{ id: 'n' }, { id: 'jay' }, { id: 'alice' }, { id: 'npc' }], useStyle: false, npcs: [],
    fixed: [{ speaker: 'Narrator', voice: 'n', style: '' }, { speaker: 'Jay', voice: 'jay', style: '' }, { speaker: 'Alice', voice: 'alice', style: '' }] };
  const inputs = [];
  const decisions = { evaluate: async input => {
    inputs.push(input);
    return { answers: inputs.length === 1
      ? { speaker_0: { choice: 'Someone not listed' }, speaker_1: { choice: 'Someone not listed' }, speaker_2: { choice: 'Nobody (not spoken aloud)' } }
      : { name_0: { choice: 'Miller' }, name_1: { choice: 'Unnamed (the story never gives this speaker a name)' } } };
  } };
  const h = await harness(null, null, null, null, null, decisions);
  h.send('planJev', { transcript: 'Alice waved at Miller. "Move," he said. "Hey," the clerk said. The sign read "Closed".', config: cast });
  const plan = (await h.result()).message.result;
  assert.match(inputs[0].questions.speaker_0.instructions, /out loud, or thinks them/);
  assert.deepEqual(Object.keys(inputs[1].questions), ['name_0', 'name_1']);
  assert.ok(Object.hasOwn(inputs[1].questions.name_0.criteria, 'Miller'));
  assert.ok(!Object.hasOwn(inputs[1].questions.name_0.criteria, 'Alice'));
  const speakerOf = text => plan.segments.find(s => s.text.includes(text)).speaker;
  assert.equal(speakerOf('"Move,"'), 'Miller');
  assert.equal(speakerOf('"Hey,"'), 'Unknown speaker');
  assert.equal(speakerOf('"Closed"'), 'Narrator');
});

test('speaker name candidates come from names the story uses, not from cast names or sentence starts', () => {
  const text = 'Evelyn walked in. "Hi," said Dr. Choi to Miller. The farmer waved. Miller nodded at Jay\'s cat.';
  assert.deepEqual(speakerNameCandidates(text, 'Evelyn walked in. Miller nodded.', ['Jay']), ['Miller', 'Evelyn', 'Dr. Choi']);
  assert.deepEqual(speakerNameCandidates('「こんにちは」と農夫が言った。', '農夫が言った。', []), []);
});

test('dialogue from someone not in the cast goes to the enabled LLM fallback, otherwise to a separate NPC', async () => {
  const answer = async () => ({ status: 200, body: JSON.stringify({ answers: { q0: { choice: 'Someone not listed' } } }) });
  let llmCalls = 0;
  const fallback = await harness(async () => { llmCalls++; return { content: 'D1|Clerk|bored\nNPC|Clerk|male|Charon' }; }, answer);
  fallback.send('plan', { transcript: 'The clerk droned. "Seven hundred change."', config: { ...castConfig, useStyle: false, useJev: true, jevApiKey: 'jev-key', allowLlmFallback: true } });
  const planned = (await fallback.result()).message.result;
  assert.equal(llmCalls, 1);
  assert.match(planned.warning, /not in the cast/);
  assert.equal(planned.segments[1].speaker, 'Clerk');

  const separate = await harness(() => { throw Error('No LLM fallback'); }, answer);
  separate.send('planJev', { transcript: 'The clerk droned. "Seven hundred change."', apiKey: 'jev-key', config: { ...castConfig, useStyle: false } });
  const plan = (await separate.result()).message.result;
  assert.equal(plan.segments[1].speaker, 'Unknown speaker');
  assert.deepEqual([...plan.npcs.map(npc => npc.speaker)], ['Unknown speaker']);

  let requests = 0;
  const narratorOnly = await harness(null, async () => { requests++; throw Error('Unexpected Jev request'); });
  narratorOnly.send('planJev', { transcript: '"Hello."', apiKey: 'jev-key', config: { ...config, useStyle: false } });
  assert.equal((await narratorOnly.result()).message.result.segments[0].speaker, 'Unknown speaker');
  assert.equal(requests, 0);
});

test('testPlanner with Jev and spindle.decisions passes userId to evaluate',async()=>{
  let evalInput;
  const decisions={
    evaluate:async(input)=>{
      evalInput=input;
      return {provider:'TypeSafe AI',model:'Jev System 1',answers:{speaker:{choice:'Alice'}}};
    }
  };
  const h=await harness(null,null,null,null,null,decisions);
  h.send('testPlanner',{plannerMode:'jev'});
  const result=await h.result();
  assert.equal(evalInput.userId,'user-a');
  assert.match(result.message.result.response,/READY/);
});

test('a missing default Decision connection explains where to choose one, while a selected connection keeps the host error',async()=>{
  const decisions={evaluate:async()=>{throw new Error('No default Decision connection configured');}};
  const h=await harness(null,null,null,null,null,decisions);
  h.send('testPlanner',{plannerMode:'jev'});
  assert.match((await h.result()).message.error,/Settings → Planner → Decision connection/);
  const selected=await harness(null,null,null,null,null,decisions);
  selected.send('testPlanner',{plannerMode:'jev',decisionConnection:'decision-a'});
  assert.equal((await selected.result()).message.error,'No default Decision connection configured');
});

test('DeepSeek sound choices request JSON mode and recover a truncated response once',async()=>{
 for(const provider of ['deepseek','custom']){
  const requests=[];
  const h=await harness(async input=>{requests.push(input);return requests.length===1?{content:'{"cues":[',finish_reason:'length'}:{content:'{"cues":[{"segment":0,"trigger":"The door slammed","query":"door slam"}],"ambience":[]}',finish_reason:'stop'};},null,provider,null,null,null,{name:'DSmol',model:'deepseek-v4-pro'});
  h.send('sfx',{segments:[{speaker:'Narrator',text:'The door slammed shut.'}],connectionId:'llm-a'});
  const result=await h.result();assert.ok(result.message.result);assert.equal(result.message.result.cues[0].query,'door slam');
  assert.equal(requests.length,2);assert.deepEqual(requests.map(request=>request.parameters.max_tokens),[2048,4096]);
  for(const request of requests){
    assert.equal(request.parameters.response_format.type,'json_object');
    if(provider==='custom'){
      assert.deepEqual(JSON.parse(JSON.stringify(request.parameters.thinking)),{type:'disabled'});
      assert.deepEqual(JSON.parse(JSON.stringify(request.reasoning)),{source:'custom',apiReasoning:true,effort:'auto'});
    }else assert.equal(request.reasoning.source,'off');
  }
  assert.match(requests[1].messages.at(-1).content,/complete JSON object with cues and ambience arrays/);
 }
 const requests=[];const h=await harness(async input=>{requests.push(input);return {content:requests.length===1?'{"cues":[':'{"cues":[]}'};});
 h.send('sfx',{segments:[{speaker:'Narrator',text:'Night fell.'}],connectionId:'llm-a',music:true});await h.result();
 assert.match(requests[1].messages.at(-1).content,/cues, ambience and music arrays.*"music":\[\]/);
});

test('invalid sound choices stop after one correction and report the selected connection',async()=>{
  let calls=0;const h=await harness(async()=>{calls++;return {content:'',finish_reason:'length'};},null,'deepseek');
  h.send('sfx',{segments:[{speaker:'Narrator',text:'The door slammed shut.'}],connectionId:'llm-a'});
  assert.match((await h.result()).message.error,/deepseek.*gemini-flash-text.*no text.*length/i);assert.equal(calls,2);
});

test('custom DeepSeek planner tests disable thinking while keeping the READY response in plain text',async()=>{
  let request;const h=await harness(async input=>{request=input;return {content:'READY'};},null,'custom',null,null,null,{model:'deepseek-v4-pro'});
  h.send('testPlanner',{connectionId:'llm-a'});assert.match((await h.result()).message.result.response,/READY/);
  assert.equal(request.parameters.thinking.type,'disabled');assert.equal(request.reasoning.source,'custom');assert.equal(request.reasoning.effort,'auto');assert.equal(request.parameters.response_format,undefined);
});

test('sound-choice provider failures and cancellation never trigger a correction request',async()=>{
  let calls=0;const failed=await harness(async()=>{calls++;throw Error('Provider quota exhausted');});
  failed.send('sfx',{segments:[{text:'The door slammed.'}]});assert.match((await failed.result()).message.error,/quota exhausted/);assert.equal(calls,1);
  calls=0;let release;const canceled=await harness(async()=>{calls++;return new Promise(resolve=>release=resolve);});
  canceled.send('sfx',{segments:[{text:'The door slammed.'}]});await new Promise(resolve=>setTimeout(resolve,0));canceled.send('cancel',{});release({content:'invalid json'});await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(calls,1);assert.equal(canceled.sent.filter(item=>item.message.result || item.message.error).length,0);
});

test('sound effect choices use the planner connection and return only cues and ambience that match the segments',async()=>{
  let request;
  const h=await harness(async input=>{request=input;return {content:JSON.stringify({cues:[
    {segment:0,trigger:'Die Tür',query:'door slam'},{segment:3,trigger:'x',query:'thunder'}
  ],ambience:[{segment:0,trigger:'fiel ins',query:'wind'},{segment:2,trigger:'x',query:'rain'}]})};},null,'openai');
  h.send('sfx',{segments:[{speaker:'Narrator',text:'Die Tür fiel ins Schloss.'}],connectionId:'llm-a'});
  const result=await h.result();
  assert.deepEqual(JSON.parse(JSON.stringify(result.message.result)),{cues:[{segment:0,query:'door slam',trigger:'Die Tür'}],ambience:[{segment:0,query:'wind',trigger:'fiel ins'}],music:[]});
  assert.equal(request.userId,'user-a');assert.equal(request.connection_id,'llm-a');assert.equal(request.reasoning.source,'off');
  assert.equal(request.parameters.response_format.type,'json_object');
  assert.match(request.messages[0].content,/English Freesound search/);assert.doesNotMatch(request.messages[0].content,/music entries/);
  const empty=await harness(()=>{throw Error('Should not call the LLM');});
  empty.send('sfx',{segments:[]});assert.deepEqual(JSON.parse(JSON.stringify((await empty.result()).message.result)),{cues:[],ambience:[],music:[]});
});

test('enabled music adds incompetech feels and genres to the sound request',async()=>{
  let request;
  const h=await harness(async input=>{request=input;return {content:JSON.stringify({cues:[],music:[{segment:0,trigger:'Night fell',feels:['Dark'],genres:['Horror'],keywords:['organ']}]})};},null,'openai');
  h.send('sfx',{segments:[{speaker:'Narrator',text:'Night fell.'}],connectionId:'llm-a',music:true});
  assert.deepEqual([...(await h.result()).message.result.music].map(entry=>({...entry,feels:[...entry.feels],genres:[...entry.genres],keywords:[...entry.keywords]})),[{segment:0,feels:['Dark'],genres:['Horror'],keywords:['organ'],trigger:'Night fell'}]);
  assert.match(request.messages[0].content,/music entries follow/);
  const carried=await harness(async input=>{request=input;return {content:'{"cues":[]}'};},null,'openai');
  carried.send('sfx',{segments:[{speaker:'Narrator',text:'Night fell.'}],connectionId:'llm-a',music:true,currentMusic:{title:'Crypto',feels:['Dark']}});await carried.result();
  assert.match(request.messages[0].content,/Music "Crypto" \(Dark\) is already playing/);
});

const pieces=[
  {title:'Carefree',filename:'Carefree.mp3',length:'00:03:22',feel:'Bouncy, Humorous',genre:'15',instruments:'Piano',description:'Is nice? Is nice.'},
  {title:'Ossuary 6 - Air',filename:'Ossuary 6 - Air.mp3',length:'00:04:00',feel:'Dark, Eerie',genre:'10',instruments:'Synths',description:'Dark drones.'},
  {title:'Crypto',filename:'Crypto.mp3',length:'00:02:30',feel:'Dark, Mysterious',genre:'22',instruments:'Organ, Strings',description:'A haunted crypt.'}];
const catalog=calls=>async url=>{calls?.push(url);assert.equal(url,'https://incompetech.com/music/royalty-free/pieces.json');return {status:200,body:JSON.stringify(pieces)};};
const dark={feels:['Dark','Mysterious'],genres:['Soundtrack'],keywords:['organ','crypt'],moment:'They crept into the crypt.'};

test('music ranks the cached incompetech catalog and a Decision connection picks the track',async()=>{
  let evaluated;const calls=[];
  const h=await harness(null,catalog(calls),null,null,null,{evaluate:async input=>{evaluated=JSON.parse(JSON.stringify(input));return {answers:{q0:{choice:'s1'}}};}});
  h.send('music',{...dark,decisionConnection:'decision-a'});
  assert.deepEqual({...(await h.result()).message.result},{title:'Ossuary 6 - Air',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ossuary%206%20-%20Air.mp3'});
  assert.equal(evaluated.connection_id,'decision-a');assert.deepEqual(evaluated.state,{music:'Dark, Mysterious; Soundtrack; organ, crypt',moment:dark.moment});
  assert.match(evaluated.questions.q0.instructions,/quietly under the narration/);
  assert.deepEqual(Object.values(evaluated.questions.q0.criteria),['Crypto — Dark, Mysterious; Soundtrack; Organ, Strings; A haunted crypt. (00:02:30)','Ossuary 6 - Air — Dark, Eerie; Horror; Synths; Dark drones. (00:04:00)','Carefree — Bouncy, Humorous; Polka; Piano; Is nice? Is nice. (00:03:22)']);
  h.send('music',{feels:['Bouncy']},'second');await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(h.sent.at(-1).message.result.title,'Carefree');assert.equal(calls.length,1);
});

test('music keeps the top-ranked track when the choice fails or is slow, and a failed catalog is not refetched per cue',async()=>{
  const top=async(decisions,deadline,input={})=>{const h=await harness(null,catalog(),null,deadline,null,decisions);h.send('music',{...dark,...input});return (await h.result()).message.result.title;};
  assert.equal(await top({evaluate:async()=>{throw Error('No Decision connection');}}),'Crypto');
  assert.equal(await top({evaluate:()=>new Promise(()=>{})},(fn,ms)=>{if(ms===5000)fn();}),'Crypto');
  let evaluations=0;assert.equal(await top({evaluate:async()=>{evaluations++;return {answers:{q0:{choice:'s2'}}};}},undefined,{moment:''}),'Crypto');assert.equal(evaluations,0);
  let requests=0;const h=await harness(null,async()=>{requests++;return {status:503,body:'Down'};});
  h.send('music',dark);assert.match((await h.result()).message.error,/Incompetech catalog HTTP 503/);
  h.send('music',dark,'second');await new Promise(resolve=>setTimeout(resolve,10));
  assert.match(h.sent.at(-1).message.error,/HTTP 503/);assert.equal(requests,1);
});

const fishItem=(id,title,tags=['female','young'])=>({_id:id,title,tags,description:`${title} voice`,languages:['en'],samples:[]});
const communityCast={voices:[{id:'own-1',route:'native:fish'},{id:'used-1',route:'native:fish'}],defaultRoute:'native:fish',useStyle:false,communityRoutes:{'native:fish':'community'},
  fixed:[{speaker:'Narrator',voice:'own-1',style:'',route:'native:fish'},{speaker:'Mira',voice:'',style:'',route:'native:fish'}],npcs:[{speaker:'Guard',voice:'used-1',style:'',route:'native:fish'}]};
const describedPlan='D1|Mira|soft\nNPC|Mira|female|young; soft, bright\nLANG|pt-BR';
const fishSearch=(urls,pages)=>async url=>{urls.push(new URL(url));const items=pages[urls.length-1];return items?{status:200,body:JSON.stringify({total:items.length,items})}:{status:500,body:'Down'};};

test('Both Fish sources prefer compatible owned voices in either planner and search community only when needed',async()=>{
 for(const engine of ['plan','planJev'])for(const [source,owned,expected] of [
  ['both',[{id:'owned',gender:'female'}],'owned'],['both',[],'community'],
  ['both',[{id:'wrong-gender',gender:'male'}],'community'],['community',[{id:'owned',gender:'female'}],'community']
 ]){
  let searches=0;
  const cast={...communityCast,voices:[{id:'n',route:'native:narrator'},...owned.map(voice=>({...voice,route:'native:fish'}))],communityRoutes:{'native:fish':source},
   fixed:[{speaker:'Narrator',voice:'n',route:'native:narrator',style:''},{speaker:'Mira',voice:'',gender:'female',route:'native:fish',style:''}],npcs:[]};
  const h=await harness(async()=>({content:'D0|Mira|\nNPC|Mira|female|young; soft'}),async()=>{
   searches++;assert.equal(expected,'community','a usable owned voice must not depend on community availability');return {status:200,body:JSON.stringify({items:[fishItem('community','Soft voice')]})};
  },null,null,null,{evaluate:async input=>({answers:Object.hasOwn(input.questions,'speaker_0')?{speaker_0:{choice:'Mira'}}:Object.hasOwn(input.questions,'gender')?{gender:{choice:'female'},language:{choice:'en'}}:{q0:{choice:'s0'}}})});
  h.send(engine,{transcript:'"Hello."',config:cast});const result=(await h.result()).message;
  assert.equal(result.error,undefined,`${engine}/${source}/${expected}`);assert.equal(result.result.segments[0].voice,expected);assert.equal(searches,expected==='community'?1:0);
 }
});

test('Jev Both casts automatic narration and infers dialogue gender before choosing an owned voice',async()=>{
 let searches=0,inferred=0;
 const h=await harness(null,async()=>{searches++;throw Error('Community offline');},null,null,null,{evaluate:async input=>{
  if(Object.hasOwn(input.questions,'speaker_0'))return {answers:{speaker_0:{choice:'Mira'}}};
  inferred++;return {answers:{voice_gender_0:{choice:'female'}}};
 }});
 h.send('planJev',{transcript:'The room fell silent. "Hello."',config:{...communityCast,voices:[{id:'owned-man',gender:'male',route:'native:fish'},{id:'owned-woman',gender:'female',route:'native:fish'}],communityRoutes:{'native:fish':'both'},fixed:[{speaker:'Narrator',voice:'',route:'native:fish',style:''},{speaker:'Mira',voice:'',route:'native:fish',style:''}],npcs:[]}});
 const result=(await h.result()).message;assert.equal(result.error,undefined);assert.deepEqual([...result.result.segments.map(segment=>[segment.speaker,segment.voice])],[['Narrator','owned-man'],['Mira','owned-woman']]);assert.equal(inferred,1);assert.equal(searches,0);
});

test('Fish briefs ignore negated and other-person traits and use scenario or greeting evidence when needed',async()=>{
 const cases=[
  [{description:'Mira is calm.',personality:'Mira is not sassy and never confident.'},'calm'],
  [{description:'Mira is not sassy but calm.'},'calm'],
  [{description:"Mira isn't a man. Mira is a quiet woman."},'female, soft'],
  [{description:'Mira is a shy man. His friend Mara is a loud confident woman. She is sassy.'},'male, soft'],
  [{scenario:'Mira is a gentle, soft-spoken woman.'},'female, soft'],
  [{firstMessage:'Mira is a man with a low voice.'},'male, deep'],
  [{personality:'Mira is not only confident but also playful.'},'playful, confident'],
  [{description:'Mira es una mujer tranquila y segura.'},'female, calm','NPC|Mira|female|young; calm']
 ];
 for(const [profile,expected,hints=''] of cases){
  let brief;const urls=[],h=await harness(async()=>({content:`D0|Mira|\n${hints}`}),fishSearch(urls,[[fishItem('voice','Speaking voice',['clear'])]]),null,null,null,{evaluate:async input=>{brief=input.state;return {answers:{q0:{choice:'s0'}}};}});
  h.send('plan',{transcript:'"Hello."',config:{...communityCast,characterProfiles:[{speaker:'Mira',name:'Mira',...profile}]}});
  const result=(await h.result()).message;assert.equal(result.error,undefined,JSON.stringify(profile));assert.equal(brief.voice,expected,JSON.stringify(profile));assert.equal(result.result.segments[0].voice,'voice');
 }
});

test('Fish skips malformed metadata rows, sanitizes optional fields and reports malformed pages clearly',async()=>{
 let choice;const h=await harness(async()=>({content:'D0|Mira|'}),async()=>({status:200,body:JSON.stringify({items:[null,7,'broken',[],{}, {_id:3,title:'Broken'}, {_id:' ',title:'Blank'}, {_id:'valid',title:{bad:true},tags:[null,{},'soft'],description:{bad:true},languages:[4,'en']} ]})}),null,null,null,{evaluate:async input=>{choice=input;return {answers:{q0:{choice:'s0'}}};}});
 h.send('plan',{transcript:'"Hello."',config:communityCast});const result=(await h.result()).message;
 assert.equal(result.error,undefined);assert.equal(result.result.segments[0].voice,'valid');assert.equal(choice.questions.q0.criteria.s0,'valid — soft;  (en)');
 for(const body of ['not json','null','{"items":{}}']){
  let calls=0;const invalid=await harness(async()=>({content:'D0|Mira|'}),async()=>{calls++;return {status:200,body};});invalid.send('plan',{transcript:'"Hello."',config:communityCast});
  assert.match((await invalid.result()).message.error,/Fish community voice search returned (?:invalid JSON|an invalid voice list)/);assert.equal(calls,1);
 }
});

test('a negated announcer request or another person being an announcer cannot enable soundboard casting',async()=>{
 for(const description of ['Mira is calm, not an announcer.','Mira is quiet. Her friend Mara is an announcer.']){
  let candidates;const h=await harness(async()=>({content:'D0|Mira|'}),async()=>({status:200,body:JSON.stringify({items:[fishItem('bad','Smash Bros announcer',['female']),fishItem('good','Ordinary speech',['female'])]})}),null,null,null,{evaluate:async input=>{candidates=input.questions.q0.criteria;return {answers:{q0:{choice:'s0'}}};}});
  h.send('plan',{transcript:'"Hello."',config:{...communityCast,characterProfiles:[{speaker:'Mira',description}]}});
  const result=(await h.result()).message;assert.equal(result.error,undefined);assert.equal(result.result.segments[0].voice,'good');assert.equal(Object.keys(candidates).length,1);
 }
});

test('a first Fish narration resolves an automatic voice from an empty relay catalogue',async()=>{
  const urls=[],cast={...communityCast,voices:[],fixed:[{speaker:'Narrator',voice:'',style:'',route:'native:fish'}],npcs:[]};
  const h=await harness(async()=>({content:'{"choice":"s0"}'}),fishSearch(urls,[[fishItem('narrator-first','Narrator',['neutral','middle-aged','calm'])]]));
  h.send('plan',{transcript:'The room grew quiet.',config:cast});const message=(await h.result()).message;
  assert.equal(message.error,undefined);assert.equal(message.result.segments[0].voice,'narrator-first');assert.equal(urls.length,1);
  assert.equal(message.result.communityVoices[0].route,'native:fish');
});

test('a described voice is searched in the Fish community library with relaxed tags, without duplicates or voices already cast, and picked by the Decision model',async()=>{
  const urls=[];let prompt,evaluated;
  const h=await harness(async input=>{prompt=input.messages;return {content:describedPlan};},
    fishSearch(urls,[[],[fishItem('used-1','Guard voice'),fishItem('ana-1','Ana'),fishItem('ana-2','ana '),fishItem('bea-1','Bea',['female','young','soft'])]]),
    null,null,null,{evaluate:async input=>{evaluated=JSON.parse(JSON.stringify(input));return {answers:{q0:{choice:'s1'}}};}});
  h.send('plan',{transcript:'Mira smiled. "Hello."',config:communityCast,decisionConnection:'decision-a'});
  const result=JSON.parse(JSON.stringify((await h.result()).message.result));
  assert.equal(result.segments.find(segment=>segment.speaker==='Mira').voice,'bea-1');
  assert.deepEqual(result.communityVoices,[{id:'bea-1',description:'Bea — female, young, soft',route:'native:fish'}]);
  assert.deepEqual(urls.map(url=>[...url.searchParams.getAll('tag')]),[['female','soft','bright'],['female','soft']]);
  assert.deepEqual(['page_size','sort_by','language'].map(name=>urls[0].searchParams.get(name)),['30','score','pt']);
  assert.equal(urls[0].origin+urls[0].pathname,'https://api.fish.audio/model');
  assert.equal(evaluated.connection_id,'decision-a');assert.deepEqual(evaluated.state,{character:'Mira',role:'character',voice:'female, soft, bright',language:'pt'});
  assert.deepEqual(evaluated.questions.q0.criteria,{s0:'Ana — female, young; Ana voice (en)',s1:'Bea — female, young, soft; Bea voice (en)'});
  assert.match(prompt[1].content,/Available voices for new NPCs: \n/);assert.match(prompt[0].content,/LANG\|ISO 639-1/);
});

test('a failed or slow Fish choice ranks speech by simple traits instead of the top result, and search errors remain visible',async()=>{
  const english='D1|Mira|\nNPC|Mira|robot|soft, Not a tag!';
  for(const [decisions,deadline] of [[{evaluate:async()=>{throw Error('No Decision connection');}}],[{evaluate:()=>new Promise(()=>{})},(fn,ms)=>{if(ms===30000)fn();}],[undefined]]){
    const urls=[];
    const h=await harness(async()=>({content:english}),fishSearch(urls,[[fishItem('ana-1','Bright voice'),fishItem('bea-1','Soft voice',['female','soft'])]]),null,deadline,null,decisions);
    h.send('plan',{transcript:'Mira smiled. "Hello."',config:communityCast});
    const result=(await h.result()).message;
    assert.equal(result.error,undefined);assert.equal(result.result.segments.find(segment=>segment.speaker==='Mira').voice,'bea-1');
    assert.equal(urls[0].searchParams.get('language'),'en');assert.deepEqual([...urls[0].searchParams.getAll('tag')],['soft']);
  }
  let calls=0;const failed=await harness(async()=>{calls++;return {content:describedPlan};},fishSearch([],[]));
  failed.send('plan',{transcript:'Mira smiled. "Hello."',config:communityCast});
  assert.match((await failed.result()).message.error,/Fish community voice search HTTP 500/);assert.equal(calls,1);
});

test('Jev describes a speaker with the Decision model before the community search',async()=>{
  const urls=[],asked=[];
  const h=await harness(null,fishSearch(urls,[[fishItem('old-1','Elder',['female','old'])]]),null,null,null,{evaluate:async input=>{
    const questions=Object.keys(input.questions);asked.push(questions);
    return {answers:questions.includes('gender')?{gender:{choice:'female'},age:{choice:'old'},language:{choice:'pt'}}:questions.includes('q0')?{q0:{choice:'s0'}}:{speaker_0:{choice:'Mira'}}};
  }});
  h.send('planJev',{transcript:'Mira smiled. "Olá."',config:communityCast});
  const result=JSON.parse(JSON.stringify((await h.result()).message.result));
  assert.deepEqual(asked,[['speaker_0'],['gender','age','language'],['q0']]);
  assert.deepEqual(urls.map(url=>[url.searchParams.get('language'),...url.searchParams.getAll('tag')]),[['pt','female','clear']]);
  assert.equal(result.segments.find(segment=>segment.speaker==='Mira').voice,'old-1');
  assert.deepEqual(result.communityVoices,[{id:'old-1',description:'Elder — female, old',route:'native:fish'}]);
});

test('Fish community searches for several speakers run together and earlier choices are not reused',async()=>{
  let inFlight=0,peak=0;const searched=[];
  const cors=async url=>{searched.push(new URL(url));inFlight++;peak=Math.max(peak,inFlight);await new Promise(resolve=>setTimeout(resolve,20));inFlight--;
    return {status:200,body:JSON.stringify({items:[fishItem('voice-a','Alpha'),fishItem('voice-b','Beta')]})};};
  const cast={...communityCast,fixed:[...communityCast.fixed,{speaker:'Lena',voice:'',style:'',route:'native:fish'}]};
  const h=await harness(async()=>({content:'D1|Mira|\nD3|Lena|\nNPC|Mira|female|soft\nNPC|Lena|female|soft'}),cors,null,null,null,{evaluate:async()=>({answers:{q0:{choice:'s0'}}})});
  h.send('plan',{transcript:'Mira smiled. "Hello." Lena nodded. "Hi."',config:cast});
  const result=(await h.result()).message;
  assert.equal(result.error,undefined);assert.equal(peak,2);assert.equal(searched.length,2);
  const voices=['Mira','Lena'].map(name=>result.result.segments.find(segment=>segment.speaker===name).voice);
  assert.deepEqual(voices,['voice-a','voice-b']);
});

test('community search drops tag-stuffed voices that also carry the opposite gender, except for neutral requests',async()=>{
  const stuffed=[fishItem('stuffed-1','Dramatic Character Male',['male','old','female','young']),fishItem('girl-1','Aiko'),fishItem('boy-1','Kenji',['male','young'])];
  for(const [gender,expected] of [['female','girl-1'],['male','boy-1'],['neutral','stuffed-1']]){
    const plan=`D1|Mira|\nNPC|Mira|${gender}|`;
    const h=await harness(async()=>({content:plan}),fishSearch([],[stuffed]),null,null,null,{evaluate:async()=>({answers:{q0:{choice:'s0'}}})});
    h.send('plan',{transcript:'Mira smiled. "Hello."',config:communityCast});
    assert.equal((await h.result()).message.result.segments.find(segment=>segment.speaker==='Mira').voice,expected);
  }
});

test('Fish uses character profiles and Planner fallback to choose distinct suitable voices instead of an announcer compilation',async()=>{
 const choices=[],urls=[];
 const cast={...communityCast,fixed:[communityCast.fixed[0],{speaker:'Rowan',voice:'',style:'',route:'native:fish'},{speaker:'Kian',voice:'',style:'',route:'native:fish'}],npcs:[],characterProfiles:[{speaker:'Kian',name:'Kian Frost',description:'An older Irish man with a warm measured voice.'},{speaker:'Rowan',name:'Rowan',description:'A young man with a bright energetic speaking voice.'}]};
 const pages=Array.from({length:2},()=>[fishItem('announcer','Smash Bros announcer compilation',['male','old','young']),fishItem('irish','Irish storyteller',['male','old','calm']),fishItem('young','Young adventurer',['male','young','bright'])]);
 const h=await harness(async request=>{
  if(!request.messages[0].content.startsWith('Choose one consistent speaking voice'))return {content:'D0|Kian|calm\nD1|Rowan|cheerful\nNPC|Kian|male|old; calm\nNPC|Rowan|male|young; bright\nLANG|en'};
  const state=JSON.parse(request.messages[1].content);choices.push(state);
  assert.match(request.messages[0].content,/Pick the closest available match, not a perfect match/);
  return {content:JSON.stringify({choice:Object.keys(state.candidates).find(id=>state.candidates[id].includes(state.character.character==='Kian'?'Irish storyteller':'Young adventurer'))})};
 },fishSearch(urls,pages),null,null,null,{evaluate:async()=>{throw Error('Decision unavailable');}});
 h.send('plan',{transcript:'"Hello." "Hi."',config:cast,connectionId:'llm-a'});
 const result=(await h.result()).message;assert.equal(result.error,undefined);
 assert.deepEqual([...result.result.segments.map(segment=>[segment.speaker,segment.voice])],[['Kian','irish'],['Rowan','young']]);
 assert.match(choices[0].character.voice,/warm/);assert.match(choices[1].character.voice,/bright/);
 assert.equal(choices[0].character.profile,undefined);assert.ok(!Object.values(choices[0].candidates).some(candidate=>candidate.includes('Smash Bros')));
 assert.ok(!Object.values(choices[1].candidates).some(candidate=>candidate.includes('Irish storyteller')),'already assigned voice is excluded from the next choice');
});

test('Fish accepts a Decision answer after five seconds, and a refused imperfect match still casts a usable voice',async()=>{
 let cancelled=false;
 const h=await harness(async()=>({content:describedPlan}),fishSearch([],[[fishItem('announcer','Smash Bros'),fishItem('fitting','Fitting voice')]]),null,(fn,ms)=>{if(ms===5000){cancelled=true;fn();}},null,{evaluate:async()=>({answers:{q0:{choice:'s0'}}})});
 h.send('plan',{transcript:'Mira smiled. "Hello."',config:communityCast});
 assert.equal((await h.result()).message.result.segments.find(segment=>segment.speaker==='Mira').voice,'fitting');assert.equal(cancelled,false);
 const none=await harness(async()=>({content:describedPlan}),fishSearch([],[[fishItem('speaking','Ordinary speaking voice',['female'])]]),null,null,null,{evaluate:async()=>({answers:{q0:{choice:'none'}}})});
 none.send('plan',{transcript:'Mira smiled. "Hello."',config:communityCast});const result=(await none.result()).message;
 assert.equal(result.error,undefined);assert.equal(result.result.segments.find(segment=>segment.speaker==='Mira').voice,'speaking');
});

test('Narrator and a sassy male Julian use simple briefs and closest voices in both LLM and Jev modes',async()=>{
 for(const engine of ['plan','planJev']){
  const asked=[],urls=[],choices=[];
  const cast={...communityCast,fixed:[{speaker:'Narrator',voice:'',style:''},{speaker:'Persona',voice:'own-1',style:''},{speaker:'Julian',voice:'',style:''}],npcs:[],characterProfiles:[{speaker:'Julian',role:'character',description:'Appearance details. '.repeat(1000),personality:'Julian is a sassy male.'}]};
  const catalogue=[fishItem('announcer','Smash Bros announcer'),fishItem('plain','Clear storytelling',['neutral','clear']),fishItem('julian','Playful confident man',['male','playful','confident'])];
  const h=await harness(async request=>{
   if(!request.messages[0].content.startsWith('Choose one consistent speaking voice'))return {content:'D1|Julian|\nNPC|Julian|male|old; serious, deep\nLANG|en'};
   const state=JSON.parse(request.messages[1].content);choices.push(state);
   return {content:JSON.stringify({choice:Object.keys(state.candidates).find(id=>state.candidates[id].includes(state.character.role==='narrator'?'Clear storytelling':'Playful confident man'))})};
  },async url=>{urls.push(new URL(url));return {status:200,body:JSON.stringify({items:catalogue})};},null,null,null,{evaluate:async input=>{
   const ids=Object.keys(input.questions);asked.push(input);
   if(ids.includes('speaker_0'))return {answers:{speaker_0:{choice:'Julian'}}};
   if(ids.includes('gender'))return {answers:{gender:{choice:input.questions.gender.instructions.includes('Narrator')?'neutral':'male'},age:{choice:'old'},language:{choice:'en'}}};
   assert.equal(Object.hasOwn(input.questions.q0.criteria,'none'),false);return {answers:{q0:{choice:'none'}}};
  }});
  h.send(engine,{transcript:'The room fell quiet. "Really?" Julian asked.',config:cast,connectionId:'llm-a'});
  const result=(await h.result()).message;assert.equal(result.error,undefined);
  assert.equal(result.result.segments.find(segment=>segment.speaker==='Narrator').voice,'plain');
  assert.equal(result.result.segments.find(segment=>segment.speaker==='Julian').voice,'julian');
  assert.equal(choices.length,2);assert.match(choices[0].character.voice,/narration, clear, calm/);
  assert.match(choices[1].character.voice,/male, playful, confident/);
  assert.ok(JSON.stringify(choices).length<1600,'voice selection gets simple traits, not the full character sheet');
  assert.ok(urls.every(url=>!url.searchParams.getAll('tag').includes('old')),'age never blocks catalogue search');
 }
});

test('Fish broadens a search containing only announcers or compilations before choosing a speech voice',async()=>{
 const urls=[],h=await harness(async()=>({content:'{"choice":"s0"}'}),fishSearch(urls,[
  [fishItem('bad','Smash Bros announcer'),fishItem('effects','Soundboard compilation')],
  [fishItem('ordinary','Ordinary clear voice',['neutral','clear'])]
 ]));
 h.send('plan',{transcript:'The room fell quiet.',config:{...communityCast,voices:[],fixed:[{speaker:'Narrator',voice:'',style:''}],npcs:[]}});
 const result=(await h.result()).message;assert.equal(result.error,undefined);
 assert.equal(result.result.segments[0].voice,'ordinary');
 assert.deepEqual(urls.map(url=>url.searchParams.getAll('tag')),[['narration','clear'],['narration']]);
});

test('trait fallback picks a playful male voice for Julian over a popular serious voice and never reuses an assigned ID',async()=>{
 let choiceRequest;
 const h=await harness(async request=>{if(request.messages[0].content.startsWith('Choose one consistent speaking voice'))throw Error('Planner unavailable');return {content:'D0|Julian|\nNPC|Julian|male|old; serious'};},async()=>({status:200,body:JSON.stringify({items:[
  fishItem('popular','Serious deep man',['male','serious','deep']),fishItem('used-1','Sassy man',['male','playful','confident']),fishItem('right','Cheeky confident man',['male','playful','confident'])
 ]})}),null,null,null,{evaluate:async input=>{choiceRequest=input;return {answers:{q0:{choice:'none'}}};}});
 h.send('plan',{transcript:'"Oh, really?"',config:{...communityCast,fixed:[communityCast.fixed[0],{speaker:'Julian',voice:'',style:''}],characterProfiles:[{speaker:'Julian',personality:'A sassy male.'}]}});
 const result=(await h.result()).message;assert.equal(result.error,undefined);assert.equal(result.result.segments[0].voice,'right');
 assert.match(choiceRequest.state.voice,/male, playful, confident/);assert.ok(!JSON.stringify(choiceRequest.questions.q0.criteria).includes('Sassy man'));
});

test('Jev keeps Decision speakers when emotion answers are rejected and splits large replies into 256-question evaluations',async()=>{
  const calls=[];
  const decisions={evaluate:async input=>{
    const ids=Object.keys(input.questions);calls.push(ids);
    if(ids[0].startsWith('emotion_'))throw Error('Provider probabilities do not sum to 1 for emotion_83');
    return {answers:Object.fromEntries(ids.map(id=>[id,{choice:'Alice'}]))};
  }};
  const h=await harness(null,null,null,null,null,decisions);
  const transcript=Array.from({length:300},(_,i)=>`"Line ${i}."`).join(' ');
  h.send('planJev',{transcript,config:{...config,fixed:[...config.fixed,{speaker:'Alice',voice:'Kore',style:''}]}});
  const result=(await h.result()).message;
  assert.equal(result.error,undefined);
  assert.ok(result.result.segments.every(segment=>segment.speaker==='Alice' && !segment.style));
  assert.deepEqual(calls.map(ids=>[ids[0],ids.length]),[['speaker_0',256],['speaker_256',44],['emotion_0',256]]);
});

test('non-story check labels lines through the Planner connection, retries a refusal with 60-character lines and then skips only markup',async()=>{
  const lines=['Mira ran. '+'a'.repeat(100),'Active Pressures:','{{img::door}}'],requests=[];
  let h=await harness(async input=>{requests.push(input);return {content:'0 K\n1 S\n2 K'};});
  h.send('skipCheck',{lines,connectionId:'llm-a'});
  assert.deepEqual([...(await h.result()).message.result.skip],[1,2]);
  assert.equal(requests.length,1);assert.equal(requests[0].connection_id,'llm-a');assert.equal(requests[0].parameters.temperature,0);assert.equal(requests[0].reasoning.source,'off');
  assert.ok(requests[0].messages[1].content.includes('a'.repeat(100)));
  requests.length=0;h=await harness(async input=>{requests.push(input);if(requests.length===1)throw Error('PROHIBITED_CONTENT');return {content:''};});
  h.send('skipCheck',{lines});
  assert.deepEqual([...(await h.result()).message.result.skip],[2]);
  assert.equal(requests.length,2);assert.ok(requests[1].messages[1].content.includes(`0: Mira ran. ${'a'.repeat(50)}\n`));
  h=await harness(async()=>{throw Error('Connection refused');});h.send('skipCheck',{lines});
  assert.match((await h.result()).message.error,/Connection refused/);
});
