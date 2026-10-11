// install.js — 主流程编排
//
// 一句话:AI 助手是个 npm 包,"装"就三步 ——
//   检查环境 → 写密钥 → 照着钉好版本的清单 npm install
//
// 之所以能这么短:DSH 内置了 deepseek-official 路由,key 默认从环境变量
// DEEPSEEK_API_KEY 读,而它启动时会加载 $DSH_HOME/.env。所以配 key 不用点
// 界面、不用写第二个配置文件。
//
// ⚠️ 顺序:密钥先写。万一 npm 那步失败(网络问题最常见),用户的 key 还在,
// 重试一次就好,不用重新粘。
//
// ⚠️ 为什么不是 `npm i -g`:会污染用户的全局 npm,而且浮动依赖会把 dsh 顶坏。
// 详见 agent.js 开头。
'use strict';

const { spawn } = require('child_process');
const log = require('./log');
const detect = require('./detect');
const config = require('./config');
const agent = require('./agent');
const runtime = require('./runtime');
const skills = require('./skills');
const extensions = require('./extension');
const fs = require('fs');
const path = require('path');

const NPM_MIRROR = 'https://registry.npmmirror.com';
const NPM_TIMEOUT_MS = 15 * 60 * 1000; // npm 卡死时的兜底

// 小白的等待主要花在这一步。npm 默认在非交互下几乎不吭声,
// 开 http 日志才有动静。但 500 多个包就是 500 多行,全丢给界面会刷屏 ——
// 所以这些行**只拿来计数**,一个字都不往上抛。
const HTTP_RE = /^npm http /i;
let installing = false;

function stopNpm(child) {
  if (process.platform !== 'win32') { child.kill(); return; }
  const taskkill = require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
  const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  killer.on('error', () => child.kill());
  killer.on('close', code => { if (code !== 0) child.kill(); });
}

function runNpm(nodeExe, npmCli, cwd, onFetch, onLine, { timeoutMs = NPM_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const env = {
      ...runtime.childEnv(nodeExe),
      npm_config_registry: NPM_MIRROR,       // 国内直连 registry.npmjs.org 又慢又容易断
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_loglevel: 'http',
    };
    // 装进我们自己的目录(cwd 就是那儿),不动用户的全局 npm
    const child = spawn(nodeExe, [npmCli, 'install', '--prefer-dedupe'], {
      cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false, timedOut = false;
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => {
      timedOut = true;
      try { stopNpm(child); } catch { child.kill(); }
      // 等退出再解锁，避免重试与旧安装同时写文件。
    }, timeoutMs);

    let count = 0;
    const tail = [];
    const feed = (buf) => {
      for (const line of buf.split(/\r?\n/)) {
        if (!line.trim()) continue;
        tail.push(line);
        if (tail.length > 15) tail.shift();
        if (HTTP_RE.test(line)) { count++; onFetch(count); }
        else onLine(line);
      }
    };
    let so = '', se = '';
    child.stdout.on('data', (d) => { so += d.toString(); const p = so.split(/\r?\n/); so = p.pop(); feed(p.join('\n')); });
    child.stderr.on('data', (d) => { se += d.toString(); const p = se.split(/\r?\n/); se = p.pop(); feed(p.join('\n')); });
    child.on('error', (e) => done({ code: -1, tail: ['启动 npm 失败:' + e.message] }));
    child.on('close', (code) => { feed(so); feed(se); done({ code: timedOut ? -1 : code, tail: timedOut ? ['安装超时(超过 15 分钟)'] : tail }); });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.key                DeepSeek API key
 * @param {(e:object)=>void} [opts.onEvent] 进度回调(NDJSON 事件)
 * @param {Function} [opts._npm]           测试用:npm 执行器替换点(默认 runNpm)
 */
async function install({ key, onEvent, repair = false, _npm } = {}) {
  if (installing) throw new Error('正在安装，请等本次安装结束后再试');
  installing = true;
  const emit = (e) => { if (onEvent) onEvent(JSON.parse(log.redact(JSON.stringify(e)))); };
  const TOTAL = 5;
  let cur = null; // 当前走到哪一步 —— 失败时得知道该把哪一步标红

  const begin = (name, title, index, note) => {
    cur = { name, index };
    emit({ type: 'stage-start', stage: name, title, index, total: TOTAL, note });
  };
  const done = (index, note) => emit({ type: 'stage-done', stage: cur.name, index, total: TOTAL, note });
  // 主体装好后的两步(铺技能/接侧栏)任一失败都**不能**再报"全部装好" ——
  // 用户点了功能却用不了,比明确失败更糟。失败先记下,末尾统一抛错让界面出「重试」。
  const incomplete = [];
  const STAGE_LABEL = { skills: '技能库', extension: '技能库侧栏' };
  const fail = (name, index, e) => {
    incomplete.push(name);
    log.error('第 ' + index + ' 步「' + name + '」失败: ' + e.message);
    emit({ type: 'stage-fail', stage: name, index, total: TOTAL, message: STAGE_LABEL[name] + '没装好：' + e.message });
  };
  let backup = null;
  const modules = path.resolve(agent.agentDir(), 'node_modules');
  function removeManagedModules(target) {
    const root = path.resolve(agent.agentDir());
    if (path.dirname(target) !== root || !path.basename(target).startsWith('node_modules')) throw new Error('修复目录不正确');
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('修复目录是链接，请联系开发者');
    fs.rmSync(target, { recursive: true, force: true });
  }

  try {
    // ── 1. 环境 ──────────────────────────────────────────
    begin('env', '检查电脑环境', 1);
    const { node, npmCli, dshBin: before, bundled } = detect.env();
    log.info('环境: node=' + node + ' | npm=' + npmCli + ' | 已装=' + !!before);
    if (!node) throw new Error('AI 运行环境缺失，请重新安装与风AI助手');
    if (!npmCli) throw new Error('AI 运行环境不完整，请重新安装与风AI助手');
    const ver = detect.nodeVersion(node);
    if (!detect.supportedNode(ver)) throw new Error('AI 运行环境无法运行，请重新安装与风AI助手');
    if (bundled && !detect.npmVersion(node, npmCli)) throw new Error('自带安装组件无法运行，请重新安装与风AI助手');
    log.info('node 版本: ' + ver);
    done(1, ver || '');
    if (before) emit({ type: 'note', message: '之前已经装过，这次会修复当前固定版本' });

    // ── 2. 密钥 ──────────────────────────────────────────
    begin('key', repair ? '检查已保存的密钥' : '保存 DeepSeek 密钥', 2);
    if (repair) key = config.readKey();
    if (!key) throw new Error('还没有填 DeepSeek 的 key');
    const envFile = repair ? config.envPath() : config.write(key);
    log.info((repair ? '保留已有密钥文件 ' : '密钥已写入 ') + envFile + '(日志出口已脱敏)');
    done(2, repair ? '已保留' : '已保存');

    // ── 3. 装 DSH ────────────────────────────────────────
    begin('install', '下载并安装与风AI助手', 3, '第一次需要下载组件，请保持网络畅通');
    // 先把清单写好(里面钉死了版本),再让 npm 照着装
    const dir = agent.agentDir();
    if (repair && fs.existsSync(modules)) {
      if (fs.lstatSync(modules).isSymbolicLink()) throw new Error('安装目录是链接，请联系开发者');
      backup = modules + '.ai-setup-backup-' + process.pid + '-' + Date.now();
      fs.renameSync(modules, backup);
      emit({ type: 'note', message: '已暂存旧程序组件；正在重新下载，密钥和聊天数据不变' });
    }
    agent.writeManifest();
    log.info('助手安装目录:' + dir);
    const { code, tail } = await (_npm || runNpm)(
      node, npmCli, dir,
      (n) => emit({ type: 'progress', phase: 'install', got: n }),
      (line) => emit({ type: 'log', message: line }),
    );

    if (code !== 0) {
      log.error('npm 安装失败(退出码 ' + code + '):' + tail.join(' | '));
      throw new Error(/超时/.test(tail.join(' ')) ? '安装超过 15 分钟，请检查网络后重试' : /ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(tail.join(' '))
        ? '网络断了,没能下载完。请检查网络后点「重试安装」'
        : '安装没成功。详细原因见下方日志;反复失败请联系开发者');
    }

    // 复查:装完了得真找得到,不能只看 npm 说成功
    if (!agent.dshBin()) throw new Error('安装跑完了但没找到与风AI助手程序,请点「重试安装」再试一次');
    if (backup) {
      try { removeManagedModules(backup); }
      catch { emit({ type: 'note', message: '修复已完成，旧组件备份暂时保留，不影响使用' }); }
      backup = null;
    }

    done(3, '装好了');

    // ── 4. 铺技能库(538 条)───────────────────────────────
    // 装进原生技能根 $DSH_HOME/skills —— 和 Harness 自己发现技能的地方是同一处,
    // 不需要任何插件就能被 /技能名 调用。同名已存在就保留用户的。
    const home = config.dshHome();
    begin('skills', '铺开技能库', 4);
    let seeded = { installed: 0, skipped: 0 };
    try {
      const results = skills.seedAll(home);
      seeded.installed = results.filter(r => r.ok).length;
      seeded.skipped = results.filter(r => !r.ok).length;
      done(4, '新增 ' + seeded.installed + ' / 已有 ' + seeded.skipped);
    } catch (e) {
      fail('skills', 4, e);
    }

    // ── 5. 技能库侧栏界面(随包客户端扩展)──────────────────
    // 落进 profile 目录并往用户 patch 层追加一行宿主插件;不 fork 随包插件,
    // 不动 node_modules。失败也只是少了界面,不影响聊天。
    begin('extension', '装上技能库侧栏', 5);
    try {
      const built = extensions.install(home);
      log.info('技能库扩展:' + built.dir + ' | 目录 ' + built.catalogCount + ' 条 | patch ' + (built.changed ? '已更新' : '已存在'));
      done(5, built.changed ? '已接入' : '已存在');
    } catch (e) {
      fail('extension', 5, e);
    }

    // 有失败的步骤:绝不发 done。抛出让上层发 error,界面显示「重试安装」;
    // 聊天主体已在第 3 步装好,不受影响,重试只补没装好的那几步。
    if (incomplete.length) {
      const names = incomplete.map(n => STAGE_LABEL[n]).join('、');
      cur = null; // 别让下面的 catch 再标一次失败步骤(已标过)
      throw new Error('与风AI助手主体已装好，聊天可用；但' + names + '没装好。请点「重试安装」补齐。');
    }

    emit({ type: 'done', stages: ['env', 'key', 'install', 'skills', 'extension'] });
    return { ok: true, dshBin: agent.dshBin() };
  } catch (e) {
    if (backup) {
      try { removeManagedModules(modules); fs.renameSync(backup, modules); emit({ type: 'note', message: '修复未完成，已恢复原有程序组件，密钥和聊天数据未改动' }); }
      catch { emit({ type: 'note', message: '恢复旧组件未完成，备份已保留；请勿删除备份，联系开发者' }); }
    }
    // ⚠️ 失败的那一步必须**当场标出来**。
    // 只发 error 的话,界面上的步骤会一直转圈 —— 用户看到的就是"卡在检查电脑
    // 环境",而真正的原因躲在页面顶上的提示条里没人看。白电脑上栽过。
    log.error('第 ' + ((cur && cur.index) || '?') + ' 步「' + ((cur && cur.name) || '?') + '」失败: ' + e.message);
    if (cur) {
      emit({ type: 'stage-fail', stage: cur.name, index: cur.index, total: TOTAL, message: e.message });
    }
    throw e;
  } finally {
    installing = false;
  }
}

module.exports = { install, runNpm, NPM_MIRROR, isInstalling: () => installing };

// 自检:不联网、不装东西,只钉住"参数别写错"
if (require.main === module) {
  const assert = require('assert');
  assert.ok(agent.AGENT_PKG.startsWith('@'), 'npm 包名要带 scope');
  assert.strictEqual(NPM_MIRROR, 'https://registry.npmmirror.com', '国内镜像别写错');
  assert.ok(HTTP_RE.test('npm http fetch GET 200 https://registry.npmmirror.com/x 12ms'));
  assert.ok(HTTP_RE.test('npm http cache @scope/pkg@https://x/y.tgz 0ms (cache hit)'));
  assert.ok(!HTTP_RE.test('npm warn deprecated foo@1.0.0'), '警告不算进度,要显示出来');
  assert.ok(!HTTP_RE.test('added 520 packages in 30s'));
  assert.strictEqual(typeof runNpm, 'function');
  console.log('install.js self-check OK (未真装)');
}
