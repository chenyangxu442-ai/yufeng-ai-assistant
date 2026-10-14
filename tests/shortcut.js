'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAssistantShortcut: create, wantsAssistant, APP_ID } = require('../app/assistant-shortcut');

const base = { desktop: 'F:/Test Desktop', executable: 'F:/AI App/与风AI助手.exe', packaged: true, platform: 'win32', fileSystem: { existsSync: () => false } };
let written;
const shell = { writeShortcutLink: (...args) => { written = args; return true; } };
assert.equal(create({ ...base, shell }).ok, true);
assert.equal(written[0], path.join(base.desktop, '与风AI助手.lnk'));
assert.equal(written[2].target, base.executable);
assert.equal(written[2].args, '--open-ai');
assert.equal(written[2].cwd, path.dirname(base.executable));
assert(!JSON.stringify(written).includes('http'));
assert.equal(create({ ...base, shell, packaged: false }).skipped, true);
assert.equal(create({ ...base, shell: { writeShortcutLink: () => false } }).ok, false);
assert.equal(create({ ...base, shell: { writeShortcutLink: () => { throw Error('denied'); } } }).ok, false);
let count = 0;
assert.equal(create({ ...base, fileSystem: { existsSync: () => true }, shell: {
  readShortcutLink: () => ({ appUserModelId: 'another.app' }), writeShortcutLink: () => { count++; },
} }).ok, false);
assert.equal(count, 0, '不能覆盖其他应用的同名快捷方式');
assert.equal(create({ ...base, fileSystem: { existsSync: () => true }, shell: { ...shell, readShortcutLink: () => ({ appUserModelId: APP_ID }) } }).ok, true);
// 升级:旧的托管入口名(AI助手.lnk)应按 AUMID 认出来并删掉,桌面不留旧名字。
let removed = [];
const legacyFs = { existsSync: () => true, unlinkSync: (p) => removed.push(p) };
assert.equal(create({ ...base, fileSystem: legacyFs, shell: { ...shell, readShortcutLink: () => ({ appUserModelId: APP_ID }) } }).ok, true);
assert(removed.some(p => p.endsWith('AI助手.lnk')), '升级后应清掉旧入口名');
assert(wantsAssistant(['app.exe', '--open-ai']));
assert(!wantsAssistant(['app.exe', '--open-ai-other']));
console.log('PASS 快捷方式带空格路径、升级清旧名、开发模式、失败恢复与同名文件保护');

async function launchScenario(initialArgs, earlyArgs, lateArgs, fail = false) {
  const events = new Map();
  let release, calls = 0, errors = 0;
  const ready = new Promise(resolve => { release = resolve; });
  const app = { requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(),
    on: (name, handler) => events.set(name, handler), getPath: () => 'F:/unused', quit() {}, isPackaged: false };
  class Window {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    isMinimized() { return false; } restore() {} show() {} focus() {} setMenuBarVisibility() {} on() {}
    async loadURL() {}
  }
  const electron = { app, BrowserWindow: Window, shell, dialog: { showErrorBox() { errors++; }, async showMessageBox() { errors++; } } };
  const server = { enginePath: () => '/engine', createServer: async () => { await ready; return { port: 4000 }; },
    startAssistant: async () => { calls++; await new Promise(resolve => setImmediate(resolve)); return fail ? { ok: false, error: 'test failure' } : { ok: true }; } };
  const fakeProcess = { argv: initialArgs, execPath: 'F:/AI App/app.exe', platform: 'win32', env: {}, on() {} };
  const context = { process: fakeProcess, console, URL, __dirname: path.join(__dirname, '../app'), require(name) {
    if (name === 'electron') return electron;
    if (name === 'path') return path;
    if (name === 'fs') return { mkdirSync() {}, appendFileSync() {} };
    if (name === './assistant-shortcut') return { createAssistantShortcut: () => ({ ok: true }), wantsAssistant };
    if (name === './server') return server;
    if (name.endsWith('install')) return { isInstalling: () => false };
    if (name.endsWith('private-env')) return { isPreparing: () => false };
    if (name.endsWith('log')) return { setFile() {} };
    if (name.endsWith('detect')) return { env: () => ({ dshBin: null }) };
    if (name.endsWith('config')) return { isConfigured: () => false };
    throw Error('Unexpected require: ' + name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/main.js'), 'utf8'), context);
  if (earlyArgs) events.get('second-instance')({}, earlyArgs);
  release();
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  if (lateArgs) {
    events.get('second-instance')({}, lateArgs);
    events.get('second-instance')({}, lateArgs);
    for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  }
  return { calls, errors };
}
(async () => {
  assert.deepEqual(await launchScenario(['app.exe']), { calls: 0, errors: 0 });
  assert.deepEqual(await launchScenario(['app.exe', '--open-ai']), { calls: 1, errors: 0 });
  assert.deepEqual(await launchScenario(['app.exe'], ['app.exe', '--open-ai']), { calls: 1, errors: 0 });
  assert.deepEqual(await launchScenario(['app.exe'], null, ['app.exe', '--open-ai']), { calls: 1, errors: 0 });
  assert.deepEqual(await launchScenario(['app.exe', '--open-ai'], null, null, true), { calls: 1, errors: 1 });
  console.log('PASS 首次快捷启动、就绪前请求、重复点击、普通启动和失败提示');
  const module = { exports: {} };
  let installedCalls = 0, requestedRepair = false, downloadOk = true, running = false;
  const serverContext = { module, __dirname: path.join(__dirname, '../app'), process, console, URL, setTimeout, setInterval, clearInterval, Buffer,
    require(name) {
      const leaf = path.basename(name);
      if (leaf === 'detect') return { env: () => ({ dshBin: 'fake-installed', node: process.execPath }), detect: async () => [] };
      if (leaf === 'config') return { isConfigured: () => true, readKey: () => '', dshHome: () => 'F:/unused-test-home' };
      if (leaf === 'install') return { isInstalling: () => false, install: async ({ onEvent, repair }) => { installedCalls++; requestedRepair = repair; onEvent({ type: 'done' }); } };
      if (leaf === 'log') return { redact: value => value, info() {}, error() {} };
      if (leaf === 'runtime') return {};
      if (leaf === 'test') return { testDeepSeek: async () => ({ ok: true }) };
      if (leaf === 'web-ready') return { webReady: async () => running };
      if (name === 'fs') return { ...fs, readFileSync(file, ...args) {
        if (running && String(file).endsWith('.ai-setup-session.json')) return JSON.stringify({ pid: process.pid, url: 'http://127.0.0.1:3080/' });
        return fs.readFileSync(file, ...args);
      } };
      if (leaf === 'network') return { checkNetwork: async () => ({ items: [], downloadOk: true, serviceOk: true }) };
      if (name === 'express') return require('../app/node_modules/express');
      return require(name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/server.js'), 'utf8'), serverContext);
  let shortcutCalls = 0, shortcutFails = true;
  const { port, server } = await module.exports.createServer({ onInstalled: () => { shortcutCalls++; if (shortcutFails) throw Error('desktop denied'); return { ok: true, message: '桌面入口已创建' }; }, networkCheck: async () => ({ items: [], downloadOk, serviceOk: false }) });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(shortcutCalls, 1);
    assert(events.some(event => event.type === 'done'));
    assert(events.some(event => event.type === 'shortcut' && event.ok === false));
    assert(!events.some(event => event.type === 'error'), '快捷方式失败不能把AI安装标为失败');
    const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
    assert(status.installed && status.configured && status.shortcut.ok === false);
    await fetch(`http://127.0.0.1:${port}/api/shortcut`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(shortcutCalls, 2, '可单独重试桌面入口');
    console.log('PASS 真实 HTTP 安装完成自动建入口、建入口失败不影响安装、状态反馈和单独重试');
    downloadOk = false;
    const blocked = await fetch(`http://127.0.0.1:${port}/api/repair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const blockedEvents = (await blocked.text()).trim().split('\n').map(JSON.parse);
    assert(blockedEvents.some(event => event.type === 'error'));
    assert.equal(installedCalls, 1, '下载源失败必须在改动组件前终止');
    downloadOk = true;
    const repair = await fetch(`http://127.0.0.1:${port}/api/repair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const repairEvents = (await repair.text()).trim().split('\n').map(JSON.parse);
    assert(requestedRepair);
    assert(repairEvents.some(event => event.type === 'done'));
    assert(repairEvents.some(event => event.type === 'note' && /AI 服务/.test(event.message)));
    console.log('PASS 修复接口、下载失败先终止、AI服务故障允许安装并提示');
    running = true;
    const activeRepair = await fetch(`http://127.0.0.1:${port}/api/repair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const activeEvents = (await activeRepair.text()).trim().split('\n').map(JSON.parse);
    assert(activeEvents.some(event => event.type === 'error'), '运行中只修桌面入口，入口失败必须明确报错');
    assert(!activeEvents.some(event => event.type === 'done'), '唯一的修复动作失败时不能报告修复成功');
    assert.equal(installedCalls, 2, '运行中的助手不能重装组件');
    console.log('PASS 运行中修复桌面入口失败，不误报全部完成');
    shortcutFails = false;
    const successfulRepair = await fetch(`http://127.0.0.1:${port}/api/repair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const successEvents = (await successfulRepair.text()).trim().split('\n').map(JSON.parse);
    assert(successEvents.some(event => event.type === 'done' && event.scope === 'shortcut'));
    assert(!successEvents.some(event => event.type === 'error'));
    assert.equal(installedCalls, 2);
    console.log('PASS 运行中入口修复成功，明确标识仅修复入口且不重装');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
