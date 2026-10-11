'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const detect = process.argv.includes('--baseline') ? require('../work/audit-2026-10-10/source/engine/detect') : require('../engine/detect');
const runtime = require('../engine/runtime');
const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(root, 'work', 'bundled-test-'));
const before = { ...process.env };
try {
  // 清空系统 PATH，并避开系统 Node 常见位置；不改用户机器配置。
  for (const key of Object.keys(process.env)) if (key.toLowerCase() === 'path') delete process.env[key];
  process.env.Path = '';
  process.env.ProgramFiles = dir;
  process.env['ProgramFiles(x86)'] = dir;
  process.env.LOCALAPPDATA = dir;
  process.env.APPDATA = dir;
  const environment = detect.env();
  assert.equal(environment.node, runtime.bundledNode());
  assert.equal(environment.bundled, true);
  assert.ok(detect.supportedNode(detect.nodeVersion(environment.node)));
  assert.ok(detect.npmVersion(environment.node, environment.npmCli));
  console.log('PASS empty system PATH: bundled Node and npm execute');

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'runtime-offline-test', version: '1.0.0', scripts: { install: 'node verify.js' } }));
  fs.writeFileSync(path.join(dir, 'verify.js'), `require('fs').writeFileSync('used-node.txt',process.execPath);`);
  fs.writeFileSync(path.join(dir, 'empty.npmrc'), '');
  fs.writeFileSync(path.join(dir, 'global.npmrc'), '');
  const env = runtime.childEnv(environment.node);
  env.npm_config_cache = path.join(dir, 'cache');
  env.npm_config_userconfig = path.join(dir, 'empty.npmrc');
  env.npm_config_globalconfig = path.join(dir, 'global.npmrc');
  execFileSync(environment.node, [environment.npmCli, 'install', '--offline', '--no-audit', '--no-fund'], { cwd: dir, env, windowsHide: true, stdio: 'pipe', timeout: 30000 });
  assert.equal(fs.readFileSync(path.join(dir, 'used-node.txt'), 'utf8').toLowerCase(), environment.node.toLowerCase());
  console.log('PASS real npm install script uses bundled Node with empty system PATH');

  const damaged = path.join(dir, 'damaged'); fs.mkdirSync(damaged);
  process.env.AI_SETUP_NODE_DIR = damaged;
  assert.equal(detect.env().node, null);
  process.env.AI_SETUP_NODE_DIR = path.join(dir, 'missing');
  assert.equal(detect.env().node, null);
  assert.equal(detect.env().bundled, true);
  console.log('PASS damaged bundle does not silently borrow system Node');
} finally {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, before);
  fs.rmSync(dir, { recursive: true, force: true });
}
