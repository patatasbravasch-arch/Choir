import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCastDuplicates,characterCardRoles,mergeSettingsChanges,castReply,validatePlan,resolvePlanReferences} from '../src/core.js';

test('Kian and Kian Frost become one lead with aliases, the original voice, and provider choices retained',()=>{
 const lead={speaker:'Kian',voice:'chosen',route:'native:fish',style:'theatrical',accent:'Irish'};
 const value={fixed:[{speaker:'Narrator',voice:'n'},{speaker:'Persona',voice:'p'},lead,{speaker:'Kian Frost',voice:'wrong',aliases:['Frost']}],casts:{'native:fish':[{speaker:'Kian Frost',voice:'wrong'}]},singleVoices:{'native:fish':{'Kian Frost':'alternate'},'native:gemini':{Kian:'saved','Kian Frost':'duplicate'}}};
 const before=structuredClone(value),clean=reconcileCastDuplicates(value);
 assert.equal(clean.fixed.length,3);assert.equal(clean.fixed[2].voice,'chosen');assert.equal(clean.fixed[2].accent,'Irish');
 assert.deepEqual(clean.fixed[2].aliases,['Kian Frost','Frost']);assert.deepEqual(clean.casts['native:fish'],[]);
 assert.deepEqual(clean.singleVoices,{'native:fish':{Kian:'alternate'},'native:gemini':{Kian:'saved'}});
 assert.deepEqual(value,before);assert.strictEqual(reconcileCastDuplicates(clean),clean);
});

test('different full names sharing Kian and the protected persona are not merged',()=>{
 const fixed=[{speaker:'Narrator'},{speaker:'Kian'},{speaker:'Kian Frost'},{speaker:'Kian Stone'}];
 const value={fixed,casts:{a:[{speaker:'Kian',voice:'npc'}]}};
 assert.equal(reconcileCastDuplicates(value).fixed.length,4);
 const persona={fixed:fixed.slice(0,3),casts:{}};assert.strictEqual(reconcileCastDuplicates(persona),persona);
 const people={fixed:[{speaker:'Narrator'},{speaker:'Persona'},{speaker:'Kian'},{speaker:'Kian Frost'},{speaker:'Kian Stone'}],casts:{}};
 assert.strictEqual(reconcileCastDuplicates(people),people);
});

test('casting reuses a unique short/full identity without creating another NPC or changing its voice',async()=>{
 for(const [saved,answer] of [['Kian','Kian Frost'],['Kian Frost','Kian']]){
  const config={fixed:[{speaker:'Narrator',voice:'n',style:''},{speaker:'Persona',voice:'p',style:''},{speaker:saved,voice:'k',style:''}],npcs:[],voices:['n','p','k','other'].map(id=>({id}))};
  const text='"Hello."',raw=await castReply(text,config,'',async()=>`D0|${answer}|calm`),plan=validatePlan(resolvePlanReferences(raw,text,config),text,config);
  assert.deepEqual(plan.segments.map(segment=>[segment.speaker,segment.voice]),[[saved,'k']]);assert.deepEqual(plan.npcs,[]);
 }
});

test('exact canonical names win over lossy punctuation and article matching',async()=>{
 for(const names of [['Rose','The Rose'],['J. D.','J D']]){
  const config={fixed:[{speaker:'Narrator',voice:'n',style:''},...names.map((speaker,i)=>({speaker,voice:`v${i}`,style:''}))],npcs:[],voices:['n','v0','v1'].map(id=>({id}))};
  const text='"First." "Second."',raw=await castReply(text,config,'',async()=>`D0|${names[0]}|\nD1|${names[1]}|`),plan=validatePlan(resolvePlanReferences(raw,text,config),text,config);
  assert.deepEqual(plan.segments.map(segment=>[segment.speaker,segment.voice]),[[names[0],'v0'],[names[1],'v1']]);
  const blank={...config,fixed:config.fixed.map((actor,index)=>index?{...actor,voice:''}:actor)};
  const selected=await castReply(text,blank,'',async()=>`D0|${names[0]}|\nD1|${names[1]}|\nNPC|${names[0]}|neutral|v0\nNPC|${names[1]}|neutral|v1`);
  assert.deepEqual(selected.segments.map(segment=>[segment.speaker,segment.voice]),[[names[0],'v0'],[names[1],'v1']]);
 }
});

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

test('a lead saved twice, once from a card name ending in a full stop, merges into one row that keeps the voice',()=>{
  const fixed=[{speaker:'Narrator',voice:'n'},{speaker:'Persona',voice:''},{speaker:'Weston',voice:'',aliases:['Weston "Wes" Vance.']},
    {speaker:'Weston "Wes" Vance',voice:'w',route:'g',aliases:['Wes','Wes Carter']},{speaker:'Hannah Voss',voice:'h',aliases:['Hannah']}];
  const result=reconcileCastDuplicates({fixed,npcs:[],casts:{},singleVoices:{g:{Weston:'','Weston "Wes" Vance':'w'}}});
  assert.deepEqual(result.fixed.map(actor=>actor.speaker),['Narrator','Persona','Weston','Hannah Voss']);
  assert.equal(result.fixed[2].voice,'w');assert.deepEqual(result.fixed[2].aliases,['Weston "Wes" Vance','Wes','Wes Carter']);
  assert.deepEqual(result.singleVoices,{g:{Weston:'w'}});
  assert.deepEqual(characterCardRoles({name:'Weston',description:'<wes>\n- Name: Weston "Wes" Vance.\n</wes>'})[0].aliases,['Weston "Wes" Vance']);
});
