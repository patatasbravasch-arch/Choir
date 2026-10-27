import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeSettingsChanges} from '../src/core.js';

test('a stale unrelated preference edit preserves a remotely added cast member',()=>{
 const baseline={fixed:[{speaker:'Narrator',voice:'n'}],follow:false};
 const latest={...baseline,fixed:[...baseline.fixed,{speaker:'Mira',voice:'m'}]};
 assert.deepEqual(mergeSettingsChanges(latest,baseline,{...baseline,follow:true}),{...latest,follow:true});
});
test('independent actor edits merge while deliberate removals and renames persist',()=>{
 const baseline=[{speaker:'Narrator',voice:'n',style:'calm'},{speaker:'Mira',voice:'m'},{speaker:'Gone',voice:'g'}];
 const latest=[{...baseline[0],style:'warm'},baseline[1],baseline[2],{speaker:'New',voice:'x'}];
 const local=[baseline[0],{...baseline[1],speaker:'Mirabelle',voice:'new'}];
 assert.deepEqual(mergeSettingsChanges(latest,baseline,local),[{...baseline[0],style:'warm'},local[1],{speaker:'New',voice:'x'}]);
});
test('nested mixer changes preserve other tabs and support explicitly returning to a prior value',()=>{
 const baseline={layout:{music:true,sfx:true},channels:{Mira:{volume:1,mute:false}}};
 const latest={layout:{music:false,sfx:true},channels:{Mira:{volume:2,mute:false}}};
 const local={layout:{music:true,sfx:false},channels:{Mira:{volume:1,mute:true}}};
 assert.deepEqual(mergeSettingsChanges(latest,baseline,local),{layout:{music:false,sfx:false},channels:{Mira:{volume:2,mute:true}}});
 assert.deepEqual(mergeSettingsChanges({layout:{music:false}}, {layout:{music:false}}, {layout:{music:true}}),{layout:{music:true}});
 assert.deepEqual(baseline.channels.Mira,{volume:1,mute:false});
});
test('remote deletions survive stale saves and new settings retain safe own properties',()=>{
 assert.deepEqual(mergeSettingsChanges({fixed:[]},{fixed:[{speaker:'Gone',voice:'g'}],auto:false},{fixed:[{speaker:'Gone',voice:'g'}],auto:true}),{fixed:[],auto:true});
 assert.deepEqual(mergeSettingsChanges([], [{speaker:'Mira',voice:'m',style:'calm'}], [{speaker:'Mira',voice:'m',style:'warm'}]),[{speaker:'Mira',voice:'m',style:'warm'}]);
 const local=JSON.parse('{"channels":{"__proto__":{"volume":2}}}');
 const merged=mergeSettingsChanges({}, {},local);
 assert.equal(Object.hasOwn(merged.channels,'__proto__'),true);assert.equal({}.volume,undefined);
});
