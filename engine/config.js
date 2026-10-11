// config.js — 把 DeepSeek 的 key 写进 DSH 的配置
//
// 为什么只要写一个文件:DSH 的凭据是"按名字取"的 —— deepseek-official 这个
// 内置路由默认读环境变量 DEEPSEEK_API_KEY,而 DSH 启动时会加载 $DSH_HOME/.env。
// 所以配 key = 往那个文件写一行。不用点界面、不用重启。
// (实测:塞个假 key 进去,它报 "Authentication Fails, Your api key: ****0000"
//  —— 说明读到了,而且它自己会脱敏。)
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const KEY_NAME = 'DEEPSEEK_API_KEY';
const BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat'; // 测 key 用最通用最便宜的那个

// 解析顺序照抄 DSH 自己的规则:显式路径 > $DSH_HOME > ~/.dsh。
// 空白值的 DSH_HOME 当没设 —— 否则会解析成当前目录,那就离谱了。
function dshHome() {
  const env = (process.env.DSH_HOME || '').trim();
  return env || path.join(os.homedir(), '.dsh');
}

function envPath(home) {
  return path.join(home || dshHome(), '.env');
}

// 写 key。幂等:重复调用只留一行,不追加。
// DSH_HOME 下的 .env 可能还有用户自己加的东西,只动我们那一行。
function write(key, home) {
  key = validateKey(key);
  const file = envPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let lines = [];
  if (fs.existsSync(file)) lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const kept = lines.filter((l) => !new RegExp('^\\s*(?:export\\s+)?' + KEY_NAME + '\\s*=').test(l));
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  kept.push(`${KEY_NAME}=${key}`);

  // 先写同目录临时文件再替换，写入失败时保留原配置。
  const temporary = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temporary, kept.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return file;
}

function validateKey(key) {
  if (typeof key !== 'string' || !/^sk-[A-Za-z0-9_-]+$/.test(key.trim())) {
    throw new Error('密钥格式不对，请粘贴 sk- 开头的完整密钥，不要包含空格或换行');
  }
  return key.trim();
}

// 读回已存的 key(界面上不留存 key,测连接时从这里取)
function readKey(home) {
  try {
    const m = fs.readFileSync(envPath(home), 'utf8')
      .match(new RegExp('^[ \\t]*(?:export[ \\t]+)?' + KEY_NAME + '[ \\t]*=[ \\t]*([^\\r\\n]*)', 'm'));
    if (!m) return null;
    let value = m[1].trim();
    if (/^["']/.test(value)) {
      const end = value.indexOf(value[0], 1);
      value = end < 0 ? '' : value.slice(1, end);
    } else value = value.split('#')[0].trim();
    try { return validateKey(value); } catch { return null; }
  } catch (e) { return null; }
}

function isConfigured(home) {
  return !!readKey(home);
}

module.exports = { write, readKey, validateKey, isConfigured, dshHome, envPath, KEY_NAME, BASE_URL, DEFAULT_MODEL };

// 自检:写→读→重写 必须幂等,且不能把用户自己写的东西冲掉
if (require.main === module) {
  const assert = require('assert');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  try {
    write('sk-test123', tmp);
    assert.strictEqual(readKey(tmp), 'sk-test123');
    assert.ok(isConfigured(tmp));

    // 重复写:key 不能变成两行
    write('sk-test456', tmp);
    const text = fs.readFileSync(envPath(tmp), 'utf8');
    assert.strictEqual(text.split('\n').filter((l) => l.includes(KEY_NAME)).length, 1);
    assert.strictEqual(readKey(tmp), 'sk-test456');

    // 用户自己在 .env 里加的东西不能被冲掉
    fs.appendFileSync(envPath(tmp), 'HTTPS_PROXY=http://127.0.0.1:7890\n');
    write('sk-test789', tmp);
    assert.ok(fs.readFileSync(envPath(tmp), 'utf8').includes('HTTPS_PROXY'), '不能冲掉用户其他配置');

    // 空白的 DSH_HOME 要当没设(否则会解析成当前目录)
    const old = process.env.DSH_HOME;
    process.env.DSH_HOME = '   ';
    assert.ok(dshHome().endsWith('.dsh'), '空白 DSH_HOME 要回落到默认值');
    if (old === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = old;

    console.log('config.js self-check OK');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
