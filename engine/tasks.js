// tasks.js — 保存可复用的任务
//
// 用户在场景向导里配好一次(场景 + 目标 + 技能),就能存下来以后一键复用。
// 纯数据,不含密钥;状态存 agent.workDir/state/tasks.json。
'use strict';
const crypto = require('crypto');
const store = require('./store');
const skills = require('./skills');

const NAME = 'tasks';
const MAX_TASKS = 200;
const MAX_TEXT = 8000;

function cleanText(value, field, { required = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text && required) throw new Error(field + '不能为空');
  if (text.length > MAX_TEXT) throw new Error(field + '太长了(最多 ' + MAX_TEXT + ' 字)');
  return text;
}

// 技能选择要对着真目录快照校验:catalog 的真实 id(可能含中文)或安全的目录名(name)。
// 不能只用 ASCII 正则 —— 那会把真实存在的中文 id 全拒掉。
function cleanSkills(ids) {
  if (ids == null) return [];
  if (!Array.isArray(ids)) throw new Error('技能选择不正确');
  let known;
  try { known = new Set(skills.catalog().flatMap(x => [x.id, x.name])); }
  catch { throw new Error('技能库读取失败，无法校验技能选择'); }
  const out = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim() || !known.has(id)) throw new Error('技能选择不正确: ' + String(id));
    out.push(id);
  }
  return [...new Set(out)].slice(0, 50);
}

function list() { return store.read(NAME, []); }

function save(input = {}) {
  const title = cleanText(input.title, '任务名称');
  const prompt = cleanText(input.prompt, '任务内容');
  const scenario = cleanText(input.scenario, '场景', { required: false }) || 'general';
  const skillIds = cleanSkills(input.skillIds);
  const all = list();
  const existing = input.id ? all.find(t => t.id === input.id) : null;
  const now = new Date().toISOString();
  const task = {
    id: existing ? existing.id : crypto.randomBytes(6).toString('hex'),
    title, scenario, prompt, skillIds,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  const next = existing ? all.map(t => (t.id === task.id ? task : t)) : [task, ...all];
  store.write(NAME, next.slice(0, MAX_TASKS));
  return task;
}

function remove(id) {
  if (typeof id !== 'string') throw new Error('任务编号不正确');
  const all = list();
  const next = all.filter(t => t.id !== id);
  store.write(NAME, next);
  return { removed: all.length - next.length };
}

module.exports = { list, save, remove, MAX_TASKS };

if (require.main === module) {
  const assert = require('assert');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const old = process.env.AI_SETUP_WORK;
  process.env.AI_SETUP_WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-'));
  try {
    assert.deepStrictEqual(list(), []);
    const realId = require('./skills').catalog()[0].id; // 真实 catalog id(可能含中文)
    const a = save({ title: '周报', scenario: 'writing', prompt: '帮我写周报', skillIds: [realId, realId] });
    assert.deepStrictEqual(a.skillIds, [realId], '重复技能要去重,且接受真实 id');
    assert.strictEqual(list().length, 1);
    const b = save({ id: a.id, title: '周报2', scenario: 'writing', prompt: '改一下' });
    assert.strictEqual(list().length, 1, '同 id 是更新不是新增');
    assert.strictEqual(b.createdAt, a.createdAt);
    assert.strictEqual(remove(a.id).removed, 1);
    assert.strictEqual(list().length, 0);
    assert.throws(() => save({ title: '', prompt: 'x' }), /不能为空/);
    assert.throws(() => save({ title: 'x', prompt: 'y', skillIds: ['../evil'] }), /技能选择不正确/);
    assert.throws(() => save({ title: 'x', prompt: 'y', skillIds: ['不存在的技能id'] }), /技能选择不正确/);
    // 含中文的真实 id 必须被接受
    const cn = require('./skills').catalog().find(x => /[^\x00-\x7f]/.test(x.id));
    assert.ok(cn, '快照里应有中文 id');
    assert.strictEqual(save({ title: 'x', prompt: 'y', skillIds: [cn.id] }).skillIds[0], cn.id, '中文 id 不能被拒');
    console.log('tasks.js self-check OK');
  } finally {
    fs.rmSync(process.env.AI_SETUP_WORK, { recursive: true, force: true });
    if (old === undefined) delete process.env.AI_SETUP_WORK; else process.env.AI_SETUP_WORK = old;
  }
}
