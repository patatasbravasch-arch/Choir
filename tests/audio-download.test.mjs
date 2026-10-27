import {test} from 'node:test';
import assert from 'node:assert/strict';
import {speechDownloadWav} from '../src/core.js';

test('speech download is one PCM WAV with ordered clips, stereo expansion, gain and silence only between clips',()=>{
 const wav=speechDownloadWav([{channels:[Float32Array.of(0.25,0.5)],gain:2},{channels:[Float32Array.of(-0.5),Float32Array.of(0.75)]}],8000,1);
 const view=new DataView(wav.buffer);
 assert.equal(new TextDecoder().decode(wav.slice(0,4)),'RIFF');assert.equal(new TextDecoder().decode(wav.slice(8,12)),'WAVE');
 assert.equal(view.getUint32(4,true),wav.length-8);assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint32(24,true),8000);
 assert.equal(view.getUint32(40,true),(2+8+1)*4);assert.equal(wav.length,44+11*4);
 assert.equal(view.getInt16(44,true),Math.round(0.5*32767));assert.equal(view.getInt16(46,true),Math.round(0.5*32767));
 for(let offset=52;offset<84;offset+=2)assert.equal(view.getInt16(offset,true),0);
 assert.equal(view.getInt16(84,true),Math.round(-0.5*32767));assert.equal(view.getInt16(86,true),Math.round(0.75*32767));
});

test('speech download bounds amplified samples and rejects invalid or oversized output before allocating it',()=>{
 const wav=speechDownloadWav([{channels:[Float32Array.of(-2,2,NaN)]}],24000),view=new DataView(wav.buffer);
 assert.equal(view.getInt16(44,true),-32767);assert.equal(view.getInt16(46,true),32767);assert.equal(view.getInt16(48,true),0);
 assert.throws(()=>speechDownloadWav([],24000));assert.throws(()=>speechDownloadWav([{channels:[new Float32Array(0)]}],24000));
 assert.throws(()=>speechDownloadWav([{channels:[Float32Array.of(1),Float32Array.of(1,2)]}],24000));
 assert.throws(()=>speechDownloadWav(Array(100).fill({channels:[Float32Array.of(0),Float32Array.of(0)]}),192000,10000),/too long/);
});
