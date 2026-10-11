'use strict';
// 有网络的独立验收，不加入常规回归测试；只用假 key，不测试付费对话。
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const reuse = process.argv.find(arg => arg.startsWith('--reuse='))?.slice(8);
const work = reuse ? path.resolve(reuse) : fs.mkdtempSync(path.join(root, 'work', 'agent-bundle-e2e-'));
assert.ok(work.startsWith(path.join(root, 'work', 'agent-bundle-e2e-')), '验收只能使用项目内隔离目录');
process.env.DSH_HOME = path.join(work, 'home');
process.env.AI_SETUP_AGENT = path.join(work, 'agent');
process.env.npm_config_cache = process.env.AI_SETUP_E2E_CACHE || path.join(work, 'npm-cache');
process.env.DEEPSEEK_API_KEY = 'sk-fake-e2e-no-billing';
for (const [name, file] of [['npm_config_userconfig', 'user.npmrc'], ['npm_config_globalconfig', 'global.npmrc']]) {
  process.env[name] = path.join(work, file); fs.writeFileSync(process.env[name], '');
}
for (const name of Object.keys(process.env)) if (name.toLowerCase() === 'path') delete process.env[name];
process.env.Path = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const detect = require('../engine/detect');
const runtime = require('../engine/runtime');
const log = require('../engine/log');
const keepAlive = setInterval(() => {}, 1000);
let child;
const { webReady: request } = require('../engine/web-ready');
(async () => {
  assert.equal(detect.env().bundled, true);
  await require('../engine/install').install({ key: 'sk-fake-e2e-no-billing', onEvent: event => {
    if (event.type === 'stage-start' || event.type === 'stage-done') console.log(event.type + ': ' + event.stage);
    if (event.type === 'progress' && event.got % 100 === 0) console.log('Downloaded packages: ' + event.got);
    if (event.type === 'log' && /error|ERR!/i.test(event.message)) console.log(log.redact(event.message));
  } });
  const { node, dshBin } = detect.env();
  child = spawn(node, [dshBin, 'web', '--no-open'], { cwd: process.env.DSH_HOME, env: runtime.childEnv(node), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let url = null, output = '', errors = '', ended = false;
  child.stdout.on('data', data => {
    output = (output + data.toString()).slice(-8192);
    fs.writeFileSync(path.join(work, 'startup.stdout.log'), log.redact(output));
    const found = output.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s\x1b]*[ \r\n]/);
    if (found) url = found[0].trim();
  });
  child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-8192); fs.writeFileSync(path.join(work, 'startup.stderr.log'), log.redact(errors)); });
  child.on('error', () => { ended = true; }); child.on('close', () => { ended = true; });
  const deadline = Date.now() + 60000;
  while (!ended && Date.now() < deadline && !(url && await request(url))) await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(!ended && url && await request(url), 'DSH startup failed: ' + log.redact(errors || output));
  await new Promise(resolve => setTimeout(resolve, 3000));
  assert.ok(!ended && await request(url), 'DSH crashed after initial startup: ' + log.redact(errors));
  console.log('PASS real DSH installed and web ready using bundled Node; no system Node/Git/Python PATH');
  console.log('Isolated evidence directory: ' + work);
})().catch(error => { console.error(log.redact(error.message)); process.exitCode = 1; }).finally(() => {
  if (child?.pid) {
    try { execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { child.kill(); }
  }
  clearInterval(keepAlive);
});
