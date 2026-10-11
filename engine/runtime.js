'use strict';
const fs = require('fs');
const path = require('path');
const agent = require('./agent');
const privateEnv = require('./private-env');

// Node 可执行文件必须放在 asar 外，随应用一起安装。
function bundledDir() {
  if (process.env.AI_SETUP_NODE_DIR) return path.resolve(process.env.AI_SETUP_NODE_DIR);
  if (process.versions.electron && process.resourcesPath) return path.join(process.resourcesPath, 'runtime', 'node');
  if (path.basename(path.dirname(__dirname)) === 'app') return path.join(__dirname, '..', 'runtime', 'node');
  return path.join(__dirname, '..', 'app', 'runtime', 'node');
}
function hasBundle() { return fs.existsSync(bundledDir()); }
function expectsBundle() { return !!process.env.AI_SETUP_NODE_DIR || !!(process.versions.electron && process.resourcesPath) || hasBundle(); }
function bundledNode() { return path.join(bundledDir(), 'node.exe'); }

// npm 的安装脚本可能通过裸 node/npm 调用子进程；只修改它们的进程环境。
// 同时把私有工具目录放到 PATH 前部 —— 用户放进来的工具只对**我们启动的 Harness
// 子进程**可见,绝不改系统 PATH。node 目录仍排最前,保证 npm 脚本用自带 node。
function childEnv(nodeExe, base = process.env) {
  const env = { ...base };
  const key = Object.keys(env).find(name => name.toLowerCase() === 'path');
  const original = key ? env[key] : '';
  for (const name of Object.keys(env)) if (name.toLowerCase() === 'path') delete env[name];
  const privateBin = process.env.AI_SETUP_PRIVATE_BIN || path.join(agent.workDir(), 'env', 'bin');
  const managed = privateEnv.paths();
  env[process.platform === 'win32' ? 'Path' : 'PATH'] = [path.dirname(nodeExe), ...managed.git, ...managed.python, privateBin, original].filter(Boolean).join(path.delimiter);
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

module.exports = { bundledDir, hasBundle, expectsBundle, bundledNode, childEnv };
