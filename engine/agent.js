// agent.js — AI 助手本体装在哪、装什么版本、怎么找到它
//
// 为什么不用 `npm i -g`:三个原因,每个都实际踩过
//   1. 全局装污染用户的 npm 全局环境 —— 我们没权利动那儿
//   2. npm 的浮动依赖会把 dsh 依赖的 cordis 顶到 4.0.3,而 dsh 0.1.5-rc.2
//      配 4.0.3 **一启动就崩**("user patch-layer watching requires the Cordis
//      HMR service")。2026-09-22 实测:装到 4.0.2 就正常,装到 4.0.3 必崩,
//      而 dsh 自己钉死了、cordis 没钉 —— 所以今天新装的人全都中招。
//   3. 全局目录得靠 `npm prefix -g` 去猜;自己指定目录就不用猜
//
// 自建目录 + 带 overrides 的 package.json + npm install,三个问题一起解决。
// 附带好处:卸载 = 删目录,干净。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// 助手本体的版本。升级时改这里。
const AGENT_PKG = '@deepseek-ai/dsh';
const AGENT_VERSION = '0.1.5-rc.2';

// ⚠️ 这两个必须跟着一起钉。它们是 dsh 的浮动依赖,上游一发新版就可能不兼容。
// 升级 dsh 时这两个也要重新验证一遍(装完点开一次,能出界面才算过)。
const PINNED = {
  '@deepseek-ai/cordis': '4.0.2',
  '@deepseek-ai/cordis-plugin-hmr': '1.0.17',
  '@deepseek-ai/dsh-win32-process': '0.1.5-rc.3',
};

// 工作目录。用户机器上放 LOCALAPPDATA(不能假设小白有 D 盘);
// 开发和测试时用 AI_SETUP_WORK 指到别的盘。
function workDir() {
  return process.env.AI_SETUP_WORK
    || path.join(process.env.LOCALAPPDATA || os.homedir(), 'ai-setup');
}

function agentDir() {
  return process.env.AI_SETUP_AGENT || path.join(workDir(), 'agent');
}

// 助手本体入口。dsh 的 bin。
function dshBin() {
  const p = path.join(agentDir(), 'node_modules', ...AGENT_PKG.split('/'), 'lib', 'bin.js');
  return fs.existsSync(p) ? p : null;
}

// 我们给 npm 的清单。overrides 就是钉版本的地方。
function manifest() {
  return {
    name: 'ai-setup-agent',
    private: true,
    description: '与风AI助手托管目录 —— 在这里装 AI 助手本体,不污染全局 npm',
    // Windows FFI 注册使用全局类型名；四份嵌套副本会导致启动崩溃。
    // 固定并提升为直接依赖，让各插件加载同一份模块。
    dependencies: { [AGENT_PKG]: AGENT_VERSION, '@deepseek-ai/dsh-win32-process': PINNED['@deepseek-ai/dsh-win32-process'] },
    overrides: { ...PINNED },
  };
}

function writeManifest() {
  const dir = agentDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'package.json');
  fs.writeFileSync(file, JSON.stringify(manifest(), null, 2) + '\n', 'utf8');
  return file;
}

module.exports = { agentDir, dshBin, writeManifest, manifest, workDir, AGENT_PKG, AGENT_VERSION, PINNED };

// 自检:路径和版本常量写死的地方最容易手滑
if (require.main === module) {
  const assert = require('assert');
  assert.ok(AGENT_PKG.startsWith('@'), '包名要带 scope');
  // 版本必须是钉死的具体版本,不能是 ^ 或 latest —— 浮动就是这次的坑
  assert.ok(/^\d+\.\d+\.\d+/.test(AGENT_VERSION), 'dsh 版本要写具体的:' + AGENT_VERSION);
  for (const [k, v] of Object.entries(PINNED)) {
    assert.ok(/^\d+\.\d+\.\d+/.test(v), k + ' 的版本要写具体的:' + v);
  }
  assert.ok(agentDir().includes('agent'));
  const m = manifest();
  assert.strictEqual(m.dependencies[AGENT_PKG], AGENT_VERSION);
  assert.strictEqual(m.overrides['@deepseek-ai/cordis'], PINNED['@deepseek-ai/cordis']);
  console.log('agent.js self-check OK');
}
