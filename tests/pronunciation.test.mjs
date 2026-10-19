import {test} from 'node:test';
import assert from 'node:assert/strict';
import {namePronunciation,respellNames,splitSegment,speechBatches,groupedSpeechBatches,castImport,castExport} from '../src/core.js';

test('name respelling uses whole names, preserves possessives and Unicode, and does not rewrite replacement text',()=>{
  const actors=[{speaker:'Eliza',sayAs:'Eh-Lee-Zah'},{speaker:'Eliza Jane',sayAs:'Jane'},{speaker:'Jane',sayAs:'Jayne'},{speaker:'Zoë',sayAs:'Zo-ee'},{speaker:'C++',sayAs:'See plus plus'}];
  const text="Eliza met ELIZA and Eliza's sister. Elizabet and Eliza-Mae stayed home. Eliza Jane saw Zoë and C++.";
  assert.equal(respellNames(text,actors),"Eh-Lee-Zah met Eh-Lee-Zah and Eh-Lee-Zah's sister. Elizabet and Eliza-Mae stayed home. Jane saw Zo-ee and See plus plus.");
  assert.equal(text,"Eliza met ELIZA and Eliza's sister. Elizabet and Eliza-Mae stayed home. Eliza Jane saw Zoë and C++.");
  assert.equal(respellNames('Captain arrived.',[{speaker:'Eliza',aliases:['Captain'],sayAs:'Eh-Lee-Zah'}]),'Captain arrived.');
});

test('clear legacy pronunciation mappings migrate while general instructions remain instructions',()=>{
  for(const pronunciation of ['Eh-Lee-Zah','Eliza: Eh-Lee-Zah','Eliza is pronounced “Eh-Lee-Zah”','Eliza is pronounced as Eh-Lee-Zah','Pronounce Eliza as Eh-Lee-Zah'])assert.equal(namePronunciation({speaker:'Eliza',pronunciation}),'Eh-Lee-Zah');
  assert.equal(namePronunciation({speaker:'Eliza',pronunciation:'Speak gently and pronounce names carefully.'}),'');
  assert.equal(namePronunciation({speaker:'Eliza',sayAs:'',pronunciation:'Eh-Lee-Zah'}),'');
  assert.equal(respellNames('Eliza arrived.',[{speaker:'Eliza',pronunciation:'Eliza: Eh-Lee-Zah'}]),'Eh-Lee-Zah arrived.');
});

test('speech splitting measures expanded pronunciation and keeps multiword names intact',()=>{
  const actors=[{speaker:'Eliza Jane',sayAs:'Eh-Lee-Zah Jayne'}],speechText=text=>respellNames(text,actors),atomicWords=['Eliza Jane'];
  const source={speaker:'Narrator',voice:'n',text:('A visitor called Eliza Jane arrived. ').repeat(12).trim()};
  for(const parts of [splitSegment(source,80,100,{transform:speechText,atomic:atomicWords}),speechBatches([source],80,'native:tts',()=>({maxBytes:100,speechText,atomicWords})),groupedSpeechBatches([source],80,'native:tts',()=>({maxChars:80,maxBytes:100,maxSpeakers:0,group:'tts',speechText,atomicWords,measure:turns=>{const text=turns.map(turn=>speechText(turn.text)).join('\n');return {chars:text.length,bytes:new TextEncoder().encode(text).length};}}))]){
    assert.equal(parts.map(part=>part.text).join(' ').replace(/\s+/g,' '),source.text);
    assert.ok(parts.every(part=>speechText(part.text).length<=80 && new TextEncoder().encode(speechText(part.text)).length<=100));
    assert.equal(parts.flatMap(part=>part.text.match(/Eliza Jane/g) || []).length,12);
  }
});

test('cast transfer preserves pronunciation spelling and rejects invalid values',()=>{
  const config={fixed:[{speaker:'Eliza',voice:'e',style:'',sayAs:'Eh-Lee-Zah'}],casts:{'native:tts':[]}};
  const exported=castExport(config);assert.equal(castImport(exported).fixed[0].sayAs,'Eh-Lee-Zah');
  for(const sayAs of ['[whisper]','a\nb',42,'a'.repeat(121)])assert.throws(()=>castImport({...exported,fixed:[{...exported.fixed[0],sayAs}]}),/pronunciation/);
});
