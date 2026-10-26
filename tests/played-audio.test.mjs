import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayedAudioCapture,playedAudioFilename} from '../src/played-audio.js';

function fixture(){
 const connections=new Set();let stopped=0,instance;
 const context={sampleRate:48000,currentTime:0,createMediaStreamDestination:()=>({stream:{getTracks:()=>[{stop(){stopped++;}}]}})};
 const output={connect:node=>connections.add(node),disconnect:node=>connections.delete(node)};
 class Recorder{
  static isTypeSupported=type=>type==='audio/webm;codecs=opus';
  constructor(stream,options){this.stream=stream;this.options=options;this.mimeType=options.mimeType;this.state='inactive';instance=this;}
  start(){this.state='recording';}
  pause(){this.state='paused';}
  resume(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['final'],{type:this.mimeType})});this.onstop?.();});}
 }
 return {context,output,Recorder,connections,get recorder(){return instance;},get stopped(){return stopped;}};
}

test('played mix records the supplied output only, keeps final recorder data and disconnects without changing speaker output',async()=>{
 const h=fixture(),capture=createPlayedAudioCapture(h.context,h.output,{Recorder:h.Recorder});
 capture.start();capture.start();assert.equal(h.connections.size,1);assert.equal(h.recorder.options.audioBitsPerSecond,256000);
 h.recorder.ondataavailable({data:new Blob(['first'])});h.context.currentTime=3;
 const result=await capture.finish();assert.equal(await result.blob.text(),'firstfinal');assert.equal(result.duration,3);
 assert.equal(result.blob.type,'audio/webm;codecs=opus');assert.equal(h.connections.size,0);assert.equal(h.stopped,1);
 assert.equal(await capture.finish(),result);
});

test('Stop discards a played mix and delayed recorder events cannot turn it into a saved download',async()=>{
 const h=fixture(),capture=createPlayedAudioCapture(h.context,h.output,{Recorder:h.Recorder});capture.start();capture.discard();
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(h.connections.size,0);assert.equal(await capture.finish(),null);
});

test('pausing a played mix excludes inactive time, resumes the same recording and can finish while paused',async()=>{
 const h=fixture(),capture=createPlayedAudioCapture(h.context,h.output,{Recorder:h.Recorder});
 capture.pause();capture.start();const recorder=h.recorder;h.context.currentTime=6;capture.pause();capture.pause();
 assert.equal(recorder.state,'paused');h.context.currentTime=179;capture.start();capture.start();assert.equal(h.recorder,recorder);assert.equal(recorder.state,'recording');
 h.context.currentTime=182;capture.pause();h.context.currentTime=200;
 const result=await capture.finish();assert.equal(result.duration,9);assert.equal(await result.blob.text(),'final');assert.equal(h.connections.size,0);
 capture.start();assert.equal(recorder.state,'inactive');
});

test('unsupported recording and recording errors are reported without throwing into playback',async()=>{
 const h=fixture(),unsupported=createPlayedAudioCapture(h.context,h.output,{Recorder:null});
 unsupported.start();assert.match((await unsupported.finish()).error,/cannot save/);
 const capture=createPlayedAudioCapture(h.context,h.output,{Recorder:h.Recorder});capture.start();
 h.recorder.onerror({error:new Error('Device encoder failed')});await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal((await capture.finish()).error,'Device encoder failed');assert.equal(h.connections.size,0);
});

test('a failed background route never publishes a speech-only file as a full played mix',async()=>{
 const h=fixture(),capture=createPlayedAudioCapture(h.context,h.output,{Recorder:h.Recorder});capture.start();
 capture.fail('Background audio could not be included.');const result=await capture.finish();
 assert.equal(result.error,'Background audio could not be included.');assert.equal(result.blob,undefined);
});

test('download names use character initials, chat identity and the real one-based padded message number',()=>{
 assert.equal(playedAudioFilename('Ada Beckett','chat-123',0),'Choir - AB - chat-123 - 001.wav');
 assert.equal(playedAudioFilename('Élodie Moreau','chat-123',41),'Choir - ÉM - chat-123 - 042.wav');
 assert.equal(playedAudioFilename('Mira','chat-123',999),'Choir - M - chat-123 - 1000.wav');
 assert.equal(playedAudioFilename('A/B','chat:123',2),'Choir - AB - chat_123 - 003.wav');
 assert.throws(()=>playedAudioFilename('Mira','chat-123',undefined),/message number/);
});
