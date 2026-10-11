'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const skills = require('../engine/skills');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-skills-'));
try {
  const items = skills.list(home);
  assert.strictEqual(items.length, 538);
  assert.strictEqual(new Set(items.map(x=>x.name)).size, items.length);
  fs.writeFileSync(path.join(home,'.env'),'KEEP');
  assert.throws(()=>skills.install(['../../escape'],home));
  assert.throws(()=>skills.install(new Array(51).fill(items[0].id),home));
  assert.strictEqual(skills.install([items[0].id],home)[0].ok,true);
  const file=path.join(home,'skills',items[0].name,'SKILL.md');
  assert.match(fs.readFileSync(file,'utf8'),/^---\nname: library-/);
  fs.writeFileSync(file,'USER OWN CONTENT');
  assert.strictEqual(skills.install([items[0].id],home)[0].skipped,true);
  assert.strictEqual(fs.readFileSync(file,'utf8'),'USER OWN CONTENT');
  assert.strictEqual(fs.readFileSync(path.join(home,'.env'),'utf8'),'KEEP');
  assert.strictEqual(skills.list(home)[0].installed,true);
  console.log('Skill catalog, copy, invalid selection, collision and credential preservation OK');
} finally { fs.rmSync(home,{recursive:true,force:true}); }
