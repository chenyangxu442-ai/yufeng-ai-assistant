// log.js — 结构化日志 + 出口全脱敏(铁律 #1)
'use strict';

const fs = require('fs');
const path = require('path');

// 铁律:任何出口永不包含 key。通用脱敏,够用即可。
function redact(s) {
  return String(s)
    .replace(/([?&]token=)[^\s&#"']+/gi, '$1***')
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1***')
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***')
    .replace(/ghp_[A-Za-z0-9_-]{6,}/g, 'ghp_***')
    .replace(/(sk-[A-Za-z0-9_-]{3})[A-Za-z0-9_-]+/g, '$1***');
}

// 文件日志(JSON lines,已脱敏),供 T10 打包诊断用。空则不写文件。
let fileHandle = null;
function setFile(p) {
  if (!p) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fileHandle = fs.createWriteStream(p, { flags: 'a' });
  const stream = fileHandle;
  stream.on('error', () => {
    if (fileHandle === stream) fileHandle = null;
    console.error('日志文件暂时无法写入；程序继续运行');
  });
}

function emit(level, msg, data) {
  const line = `[${new Date().toISOString()}] [${level}] ${redact(msg)}`;
  console.log(line);
  if (data !== undefined) console.log('  ' + redact(JSON.stringify(data)));
  if (fileHandle) fileHandle.write(JSON.stringify({ t: Date.now(), level, msg: redact(msg), data: data === undefined ? null : redact(JSON.stringify(data)) }) + '\n');
}

module.exports = { redact, setFile, info: (m, d) => emit('INFO', m, d), warn: (m, d) => emit('WARN', m, d), error: (m, d) => emit('ERROR', m, d) };

// 自检
if (require.main === module) {
  const { redact: r } = module.exports;
  // 用假 key 做样例。原先这里放的是真 key —— 自检代码也是代码,一样会进仓库。
  const FAKE_SK = 'sk-0000fake0000fake0000';
  const FAKE_GHP = 'ghp_0000fake0000fake0000';
  const out = r('key=' + FAKE_SK + ' token=' + FAKE_GHP + ' ok');
  console.assert(!out.includes(FAKE_SK) && !out.includes(FAKE_GHP), 'redact failed: ' + out);
  console.assert(out.includes('sk-***') && out.includes('ghp_***'), 'redact markers missing');
  console.log('log.js self-check OK');
}
