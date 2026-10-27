import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWavArchive} from '../src/played-audio.js';
import {normalizeMixerVolumeLimits} from '../src/delivery.js';

test('WAV archive stores unchanged bytes, UTF-8 names, valid CRCs and directory offsets',async()=>{
 const entries=[{filename:'Choir - É - chat - 001.wav',bytes:new TextEncoder().encode('123456789')},{filename:'Choir - É - chat - 002.wav',bytes:new Uint8Array([0,1,255,2])}];
 const blob=createWavArchive(entries),data=Buffer.from(await blob.arrayBuffer());assert.equal(blob.type,'application/zip');let offset=0;
 for(const [index,entry] of entries.entries()){
  assert.equal(data.readUInt32LE(offset),0x04034b50);assert.equal(data.readUInt16LE(offset+6),0x800);assert.equal(data.readUInt16LE(offset+8),0);
  if(index===0)assert.equal(data.readUInt32LE(offset+14),0xcbf43926,'standard CRC32 check vector');
  const length=data.readUInt16LE(offset+26),size=data.readUInt32LE(offset+18);assert.equal(data.toString('utf8',offset+30,offset+30+length),entry.filename);assert.deepEqual(data.subarray(offset+30+length,offset+30+length+size),Buffer.from(entry.bytes));offset+=30+length+size;
 }
 const directory=offset;let localOffset=0;
 for(const entry of entries){assert.equal(data.readUInt32LE(offset),0x02014b50);assert.equal(data.readUInt32LE(offset+42),localOffset);const length=data.readUInt16LE(offset+28);assert.equal(data.toString('utf8',offset+46,offset+46+length),entry.filename);offset+=46+length;localOffset+=30+length+entry.bytes.length;}
 assert.equal(data.readUInt32LE(offset),0x06054b50);assert.equal(data.readUInt16LE(offset+10),2);assert.equal(data.readUInt32LE(offset+16),directory);assert.equal(data.readUInt32LE(offset+12),offset-directory);assert.equal(data.length,offset+22);
});
test('archive rejects duplicate names, traversal and exports over the size cap',()=>{
 const entry={filename:'recording.wav',bytes:new Uint8Array(100)};
 assert.throws(()=>createWavArchive([]),/completed recordings/);assert.throws(()=>createWavArchive([entry,entry]),/unique/);assert.throws(()=>createWavArchive([{...entry,filename:'../recording.wav'}]),/filenames/);assert.throws(()=>createWavArchive([entry],{maxBytes:100}),/ZIP limit/);
});
test('volume ceilings keep existing defaults and normalize malformed preferences',()=>{
 assert.deepEqual(normalizeMixerVolumeLimits(),{master:1,voices:3,music:3,ambience:3,sfx:3});assert.deepEqual(normalizeMixerVolumeLimits({master:2,voices:.456,music:NaN,ambience:-2,sfx:10}),{master:1,voices:.46,music:3,ambience:3,sfx:3});
});
