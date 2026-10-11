'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('../app/node_modules/@electron/asar');
const root = path.join(__dirname, '..');
const archive = path.join(root, 'app/release/win-unpacked/resources/app.asar');
for (const file of ['main.js', 'server.js', 'web/index.html']) {
  assert.ok(asar.extractFile(archive, file).equals(fs.readFileSync(path.join(root, 'app', file))), '打包代码滞后: ' + file);
}
for (const file of fs.readdirSync(path.join(root, 'engine')).filter(name => name.endsWith('.js'))) {
  assert.ok(asar.extractFile(archive, 'engine/' + file).equals(fs.readFileSync(path.join(root, 'engine', file))), '打包引擎滞后: ' + file);
}
assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, '0.5.5');
const entries = asar.listPackage(archive);
assert.ok(!entries.some(file => /^[/\\]engine[/\\]state[/\\]/.test(file)), '不得打包运行日志');
// 技能库只保留 catalog 引用的目录:打包后 library-* 顶层目录数必须等于 catalog 条数,且没有多余残留。
const catalog = asar.extractFile(archive, 'skill-library/catalog.json');
assert.ok(catalog.length > 0, '打包缺少技能目录 catalog.json');
const catalogCount = JSON.parse(catalog).length;
const libDirs = new Set();
for (const file of entries) {
  const m = /^[/\\]skill-library[/\\](library-[^/\\]+)[/\\]/.exec(file);
  if (m) libDirs.add(m[1]);
}
assert.equal(libDirs.size, 538, '打包技能目录数应为 538,实际 ' + libDirs.size);
assert.equal(catalogCount, libDirs.size, 'catalog 条数与实际技能目录不一致');
// 构建脚本的临时资源(engine 源码副本之外的残留)不得进包:除 catalog.json 与 library-* 外不应有其它顶层项。
const topLevel = new Set();
for (const file of entries) {
  const m = /^[/\\]skill-library[/\\]([^/\\]+)/.exec(file);
  if (m) topLevel.add(m[1]);
}
for (const name of topLevel) {
  assert.ok(name === 'catalog.json' || /^library-/.test(name), '技能库含意外残留: ' + name);
}
const resources = path.dirname(archive);
for (const file of ['node.exe', 'node_modules/npm/bin/npm-cli.js', 'LICENSE']) {
  assert.ok(fs.readFileSync(path.join(resources, 'runtime/node', file)).equals(fs.readFileSync(path.join(root, 'app/runtime/node', file))), '打包运行环境不一致: ' + file);
}
// 图标必须进包:首页 PNG、多尺寸 ICO 都在,且 ICO 真的含 7 个尺寸;exe 用品牌名。
for (const file of ['assets/yufeng.png', 'assets/yufeng.ico', 'web/yufeng.png']) {
  assert.ok(asar.extractFile(archive, file).length > 0, '打包缺少图标: ' + file);
}
assert.equal(asar.extractFile(archive, 'assets/yufeng.ico').readUInt16LE(4), 7, 'ICO 应含 7 个尺寸(16/24/32/48/64/128/256)');
const brandExe = path.join(path.dirname(resources), '与风AI助手.exe');
assert.ok(fs.existsSync(brandExe), '打包主程序名应为 与风AI助手.exe(实际目录: ' + fs.readdirSync(path.dirname(resources)).filter(f => f.endsWith('.exe')).join(',') + ')');
// 图标必须真的写进了主程序(不只是 assets 里有 ICO):ICO 里最大那张 256px 的 PNG 原样出现在 exe 里。
const icoBuf = asar.extractFile(archive, 'assets/yufeng.ico');
let iconBlob = null;
for (let i = 0, n = icoBuf.readUInt16LE(4); i < n; i++) {
  const o = 6 + i * 16, size = icoBuf.readUInt32LE(o + 8), off = icoBuf.readUInt32LE(o + 12);
  if (!iconBlob || size > iconBlob.length) iconBlob = icoBuf.subarray(off, off + size);
}
assert.ok(icoBuf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || iconBlob.includes(Buffer.from('89504e470d0a1a0a', 'hex')), 'ICO 内应含 PNG 尺寸');
assert.ok(fs.readFileSync(brandExe).includes(iconBlob), '主程序 exe 里没有内嵌品牌图标(256px PNG 未找到)');
// 版本资源必须带上品牌名与 0.5.5(rcedit 真的跑过了)。
const vinfo = require('node:child_process').execFileSync('powershell', ['-NoProfile', '-Command',
  `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $v=(Get-Item -LiteralPath '${brandExe}').VersionInfo; @($v.ProductName,$v.FileVersion) -join '|'`],
  { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(vinfo, '与风AI助手|0.5.5', '主程序版本资源应为 与风AI助手|0.5.5,实际 ' + vinfo);
const { execFileSync } = require('node:child_process');
const exe = path.join(resources, 'runtime/node/node.exe');
const env = require('../engine/runtime').childEnv(exe, { ...process.env, Path: '', PATH: '' });
assert.match(execFileSync(exe, ['--version'], { encoding: 'utf8', env, windowsHide: true }), /^v24\./);
assert.match(execFileSync(exe, [path.join(resources, 'runtime/node/node_modules/npm/bin/npm-cli.js'), '--version'], { encoding: 'utf8', env, windowsHide: true }), /^\d+\./);
console.log('PASS packaged source matches 0.5.5; 538 skill dirs in ASAR; bundled Node/npm execute; runtime state excluded');
