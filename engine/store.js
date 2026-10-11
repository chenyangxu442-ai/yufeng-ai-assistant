// store.js — 与风AI助手的本地状态存储(原子 JSON)
//
// 只放**非机密**状态:任务、成本记录、文件事务台账、技能版本台账。
// 密钥永远只走 config.js(~/.dsh/.env),绝不进这里。
//
// 状态放在 agent.workDir()/state 下 —— 卸载助手目录即清空,不污染用户其他位置。
'use strict';
const fs = require('fs');
const path = require('path');
const agent = require('./agent');

function stateDir() { return path.join(agent.workDir(), 'state'); }
function statePath(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('状态名不正确');
  return path.join(stateDir(), name + '.json');
}

// 读。文件不存在或内容损坏 → 返回 fallback(不抛,避免一个坏文件让整个界面崩)。
function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(statePath(name), 'utf8')); }
  catch { return fallback; }
}

// 写。先写同目录临时文件再 rename,进程中断不会留下半个 JSON。
function write(name, value) {
  const file = statePath(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return file;
}

module.exports = { read, write, stateDir, statePath };

if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  const old = process.env.AI_SETUP_WORK;
  process.env.AI_SETUP_WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  try {
    assert.deepStrictEqual(read('missing', []), []);
    write('demo', { a: 1 });
    assert.deepStrictEqual(read('demo', null), { a: 1 });
    fs.writeFileSync(statePath('demo'), 'not json');
    assert.deepStrictEqual(read('demo', { fallback: true }), { fallback: true }, '坏文件要回落到 fallback');
    assert.throws(() => statePath('../escape'), /不正确/);
    console.log('store.js self-check OK');
  } finally {
    fs.rmSync(process.env.AI_SETUP_WORK, { recursive: true, force: true });
    if (old === undefined) delete process.env.AI_SETUP_WORK; else process.env.AI_SETUP_WORK = old;
  }
}
