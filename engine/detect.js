// detect.js — 电脑体检:装之前看看这台机器有什么、缺什么
//
// DSH 是个 npm 包,所以真正的前置只有两样:Node 和 dsh 本身。
// 其余(DeepSeek key)由用户在界面上粘。
//
// ⚠️ Windows 上**不能**用裸名字去 spawn 系统程序 —— PATH 被裁过的机器上会
// ENOENT(真机上踩到过)。所以这里全部返回绝对路径,调用方也只拿绝对路径用。
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('./config');
const agent = require('./agent');
const runtime = require('./runtime');

const SYSTEM_ROOT = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
const WEB_PORT = 3080; // dsh web 的默认端口

function systemExe(name) {
  return path.join(SYSTEM_ROOT, 'System32', name);
}

// 跑一个绝对路径的程序,拿 stdout。失败返回 null,不抛。
function run(exe, args, opts = {}) {
  try {
    return execFileSync(exe, args, {
      encoding: 'utf8', timeout: opts.timeout || 15000,
      stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).trim();
  } catch (e) { return null; }
}

// 找 Node。本机实测 node 在 E:\node.exe 这种非常规位置,所以:
// 常见安装位置挨个试 → 不行就交给 where 去 PATH 上找。找不到返回 null。
function findNode() {
  // 自带包损坏时明确报错，不悄悄借用开发机已有环境掩盖问题。
  if (runtime.expectsBundle()) return fs.existsSync(runtime.bundledNode()) ? runtime.bundledNode() : null;
  const cands = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'node.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'node.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'nvm', 'node.exe'), // nvm-windows
  ].filter(Boolean);
  for (const p of cands) if (fs.existsSync(p)) return p;

  const found = run(systemExe('where.exe'), ['node']);
  return found ? found.split(/\r?\n/)[0].trim() : null;
}

// npm 跟 node 装在一起,不用单独找。
// ⚠️ 返回的是 npm-cli.js,不是 npm.cmd —— Node 新版本出于安全不允许直接
// spawn .cmd/.bat(不加 shell 就报 EINVAL)。用 node 去跑这个 js 最干净,
// 也顺带满足"系统程序一律绝对路径"那条铁律。
function findNpm(nodeExe) {
  if (!nodeExe) return null;
  const p = path.join(path.dirname(nodeExe), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return fs.existsSync(p) ? p : null;
}

// 一次把三样凑齐,免得每个调用方都自己拼。
// 助手本体装在我们自己的目录里(见 agent.js),不用去问 npm 全局目录 —— 猜路径
// 这件事本身出过问题,能省就省。
function env() {
  const node = findNode();
  return { node, npmCli: findNpm(node), dshBin: agent.dshBin(), bundled: runtime.expectsBundle() };
}

function nodeVersion(nodeExe) {
  const v = run(nodeExe, ['--version']);
  return v || null;
}

function supportedNode(version) {
  const match = /^v?(\d+)\./.exec(version || '');
  return !!match && Number(match[1]) >= 18;
}

function npmVersion(node, npmCli) {
  if (!node || !npmCli) return null;
  return run(node, [npmCli, '--version']);
}

// Web 界面是不是已经开着了。开着就别再起一个(端口会撞)。
function isWebRunning(port = WEB_PORT) {
  return new Promise((resolve) => {
    const req = require('http').get(
      { host: '127.0.0.1', port, path: '/', timeout: 2500 },
      (res) => { res.resume(); resolve(true); }, // 401 也算活着
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// 体检。返回界面直接能画的清单。
async function detect() {
  const items = [];
  const { node, npmCli, dshBin, bundled } = env();

  const nodeV = node && nodeVersion(node);
  const npmV = npmVersion(node, npmCli);
  items.push({
    key: 'node', name: 'AI 运行环境', installed: supportedNode(nodeV) && !!npmV,
    version: nodeV ? (bundled ? '自带 ' : '系统 ') + nodeV : '不完整',
    hint: !nodeV || !supportedNode(nodeV) || !npmV ? (bundled ? '软件自带的运行环境不完整，请重新安装与风AI助手' : '开发环境缺少完整 Node；正式安装包自带运行环境') : '已就绪，不需要另外安装 Node',
  });

  items.push({
    key: 'dsh', name: 'AI 助手程序', installed: !!(dshBin && npmCli),
    version: dshBin ? '已安装' : '还没装',
    hint: dshBin ? '重新安装会修复当前固定版本' : null,
  });

  const cfg = config.isConfigured();
  items.push({
    key: 'config', name: 'DeepSeek 密钥', installed: cfg,
    version: cfg ? '已配置' : '还没配', hint: null,
  });

  const running = await isWebRunning();
  items.push({
    key: 'web', name: 'AI 助手界面', installed: running,
    version: running ? '正在运行' : '没在运行', hint: null,
  });

  return items;
}

module.exports = {
  detect, env, run, findNode, findNpm, nodeVersion, supportedNode, npmVersion,
  isWebRunning, systemExe, WEB_PORT,
};

// 自检(纯本机,不联网)
if (require.main === module) {
  const assert = require('assert');
  // where.exe 必须找得到,不然 PATH 兜底那条路是死的
  assert.ok(fs.existsSync(systemExe('where.exe')), '找不到 where.exe: ' + systemExe('where.exe'));
  assert.strictEqual(run(systemExe('where.exe'), ['definitely-not-a-real-cmd-xyz']), null);
  const e = env();
  assert.ok(e.node && fs.existsSync(e.node), '这台机器上应该找得到 node,实际:' + e.node);
  assert.ok(e.npmCli && fs.existsSync(e.npmCli), 'npm-cli.js 应该跟 node 在一起,实际:' + e.npmCli);
  // npm 得真能跑起来 —— 这是后面安装那步的地基
  assert.ok(nodeVersion(e.node), 'node --version 应该能跑');
  assert.strictEqual(typeof isWebRunning, 'function');
  assert.strictEqual(WEB_PORT, 3080);
  console.log('detect.js self-check OK (未联网)');
}
