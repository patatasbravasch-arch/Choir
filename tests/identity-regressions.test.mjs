import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterCardRoleDiscovery,characterCardRoles,castingPrompt,speechSourceUnits} from '../src/core.js';

const card={name:'Choir QA - Mira and Adrian',description:'# Mira\nMira is a female captain. Her voice is feminine. Alias: Captain Mira.\n# Adrian\nAdrian is a male navigator. His voice is masculine. Alias: Adi.',first_mes:'Captain Mira said, "Ready." Adi replied, "Yes." Mira added, "Go."'};

test('a decorated group-card title does not drop the first named profile or treat its prefix as a person',()=>{
  const roles=characterCardRoles(card);
  assert.deepEqual(roles.map(role=>role.name),['Mira','Adrian']);
  assert.deepEqual(roles.map(role=>role.aliases),[['Captain Mira'],['Adi']]);
  assert.match(roles[0].description,/female captain/);assert.ok(!roles[0].description.includes('male navigator'));
  assert.match(roles[1].description,/male navigator/);assert.ok(!roles[1].description.includes('female captain'));
});

test('decorated title identity matching works in either order and keeps unrelated structural headings out',()=>{
  for(const name of ['Mira and Choir QA - Adrian','Choir QA — Mira and Adrian','Mira - QA and Adrian','Choir QA:Mira and Adrian','Choir QA—Mira and Adrian']){
    assert.deepEqual(characterCardRoles({...card,name}).map(role=>role.name),['Mira','Adrian']);
  }
  const roles=characterCardRoles({...card,description:card.description+'\n# QA\nCheck the logs.\n# Narrative guidelines\nKeep the main character consistent.'});
  assert.deepEqual(roles.map(role=>role.name),['Mira','Adrian']);
  assert.deepEqual(characterCardRoles({name:'Mira - QA and Adrian',description:'# QA\nCheck the logs.\n# Adrian\nA male navigator.'}).map(role=>role.name),['Adrian']);
});

test('explicit aliases stay inside their profile and shared aliases cannot merge different people',()=>{
  const description='# Mira\nMira is a captain.\nAliases: Captain Mira; Captain\n# Adrian\nAdrian is a navigator.\nAlias: Captain\nNickname: Adi';
  const roles=characterCardRoles({...card,description});
  assert.deepEqual(roles.map(role=>role.name),['Mira','Adrian']);
  assert.deepEqual(roles[0].aliases,['Captain Mira']);assert.deepEqual(roles[1].aliases,['Adi']);
});

test('complete local identities and aliases reach the casting prompt while unstructured card content still requests analysis',()=>{
  const discovery=characterCardRoleDiscovery(card);
  const config={fixed:[{speaker:'Narrator',voice:'n'},...discovery.roles.map(role=>({speaker:role.name,aliases:role.aliases,voice:''}))],npcs:[],voices:[{id:'n'}],characterProfiles:discovery.roles.map(role=>({speaker:role.name,description:role.description,role:'character'}))};
  const prompt=castingPrompt(speechSourceUnits(card.first_mes),config,'')[1].content;
  assert.match(prompt,/- Mira \(aliases: Captain Mira\)/);assert.match(prompt,/- Adrian \(aliases: Adi\)/);
  assert.equal(discovery.needsAnalysis,true,'unstructured greeting still needs the existing analysis path');
});
