import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCastDuplicates,mergeSettingsChanges} from '../src/core.js';

test('exact duplicate cast names retain the first voice, route and preferences, including across NPC lists',()=>{
  const lead={speaker:'Kieran',voice:'chosen',route:'native:fish',style:'quiet',accent:'Irish',aliases:['Kier'],sayAs:'KEER-an'};
  const value={fixed:[{speaker:'Narrator',voice:'n'}, {speaker:'Persona',voice:'p'},lead,{speaker:'  KIERAN ',voice:'wrong',route:'native:gemini',aliases:['Kieran Smith']}],casts:{'native:fish':[{speaker:'Kieran',voice:'wrong'}, {speaker:'Guard',voice:'g'}, {speaker:'Guard',voice:'wrong'}],'native:gemini':[{speaker:'Kieran',voice:'wrong'}, {speaker:'Guard',voice:'other-provider'}]}};
  const before=structuredClone(value),clean=reconcileCastDuplicates(value);
  assert.deepEqual(clean.fixed,[value.fixed[0],value.fixed[1],{...lead,aliases:['Kier','Kieran Smith']}]);
  assert.deepEqual(clean.casts,{'native:fish':[{speaker:'Guard',voice:'g'}],'native:gemini':[{speaker:'Guard',voice:'other-provider'}]});
  assert.deepEqual(value,before,'repair must not mutate the saved input');
  assert.strictEqual(reconcileCastDuplicates(clean),clean,'repair is idempotent');
});

test('distinct canonical names and shared aliases do not cause automatic cast merging',()=>{
  const value={fixed:[{speaker:'Kieran',voice:'first',aliases:['Captain']},{speaker:'Kieran Smith',voice:'second',aliases:['Captain']}],casts:{'native:fish':[{speaker:'Kier',voice:'third'}]}};
  assert.strictEqual(reconcileCastDuplicates(value),value);
});

test('reconciling a concurrent settings merge prevents the same name appearing as both a new lead and NPC',()=>{
  const baseline={fixed:[{speaker:'Narrator',voice:'n'},{speaker:'Persona',voice:'p'}],casts:{'native:fish':[]}};
  const latest={...baseline,fixed:[...baseline.fixed,{speaker:'Kieran',voice:'manual',route:'native:gemini'}]};
  const local={...baseline,casts:{'native:fish':[{speaker:'Kieran',voice:'automatic'}]}};
  const clean=reconcileCastDuplicates(mergeSettingsChanges(latest,baseline,local));
  assert.equal(clean.fixed.at(-1).voice,'manual');
  assert.deepEqual(clean.casts['native:fish'],[]);
});
