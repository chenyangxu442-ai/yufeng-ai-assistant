// server.js — 本地 HTTP 层(Express)
//
// 引擎与 UI 解耦:这里只是薄代理,业务全在 ../engine
//
// ⚠️ 安装改成**流式返回**(NDJSON,一行一个事件)。装一遍要下 500 多个包,
// 几十秒到几分钟。同步调用的话用户点完只看到"请耐心等待",不知道卡在哪、
// 是不是死了。流式之后每一步都能实时显示。
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 系统程序一律用绝对路径。裸名字 spawn 在 PATH 被裁过的机器上会 ENOENT。
const CMD = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');

// 打包时 engine 同步进 app/engine,dev 时在上一级 → 兼容两者
// ⚠️ 必须用它把**所有** engine 模块引进来。曾经这里有一句
// `require('../engine/log')`,开发时能找到,打包进 app.asar 后就找不到 ——
// 启动即抛错、窗口根本不创建,用户看到的只是"点了没反应"。
function enginePath() {
  const local = path.join(__dirname, 'engine');
  return fs.existsSync(local) ? local : path.join(__dirname, '..', 'engine');
}
const engine = enginePath();
const log = require(path.join(engine, 'log'));
const detect = require(path.join(engine, 'detect'));
const { install, isInstalling } = require(path.join(engine, 'install'));
const config = require(path.join(engine, 'config'));
const runtime = require(path.join(engine, 'runtime'));
const { webReady: reachable } = require(path.join(engine, 'web-ready'));
const { testDeepSeek } = require(path.join(engine, 'test'));
const { checkNetwork } = require(path.join(engine, 'network'));
const skills = require(path.join(engine, 'skills'));
const presets = require(path.join(engine, 'presets'));
const tasks = require(path.join(engine, 'tasks'));
const cost = require(path.join(engine, 'cost'));
const files = require(path.join(engine, 'files'));
const envmgr = require(path.join(engine, 'envmgr'));
const harness = require(path.join(engine, 'harness'));

// 用系统默认浏览器打开一个网址。
// ⚠️ `start` 后面第一个词必须带引号(标题位),不然 cmd 会把它当成要运行的程序
// 名去找,找不到就什么都不发生 —— 本机复刻实测过。空标题就写 ""。
// 参数单独拿出来是为了能被自检盯住 —— 这两条都对应真出现过的"点了没反应"
function browserArgs(url) {
  return ['/c', 'start', '""', url];
}

function openBrowser(url) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') {
    return Promise.reject(new Error('助手返回的地址不正确'));
  }
  if (process.versions.electron) return require('electron').shell.openExternal(target.href);
  if (/[&|<>^%"\r\n]/.test(url)) return Promise.reject(new Error('助手地址包含不支持的字符'));
  return new Promise((resolve, reject) => {
    const child = spawn(CMD, browserArgs(url), {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

let assistant = null;
let starting = null;

function sessionFile() { return path.join(config.dshHome(), '.ai-setup-session.json'); }
function savedSession() {
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
    const url = new URL(session.url);
    if (!Number.isInteger(session.pid) || session.pid <= 0 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return null;
    process.kill(session.pid, 0); // 只检查进程是否存在，不发送终止信号。
    return session;
  } catch { return null; }
}
function activeAssistant() {
  if (assistant?.pid) {
    try { process.kill(assistant.pid, 0); } catch { assistant = null; }
  }
  return assistant || savedSession();
}

// 起 AI 助手的网页界面,等它把地址打出来再开浏览器。
//
// 为什么不让它自己开(dsh web 默认会开):那样出错我们什么都不知道,
// 用户看到的就是"点了没反应"。自己抓地址就能报错、也顺手了 --no-open 的重启。
async function startAssistant() {
  if (isInstalling()) return { ok: false, error: '正在安装，请等安装结束后再打开助手' };
  if (starting) return starting;
  starting = (async () => {
    assistant = activeAssistant();
    if (assistant) {
      if (!await reachable(assistant.url)) return { ok: false, error: '助手暂时没有响应，请关闭助手后重试' };
      try { await openBrowser(assistant.url); return { ok: true }; }
      catch (e) { return { ok: false, error: friendly(e) }; }
    }
    return launchAssistant();
  })();
  try { return await starting; }
  finally { starting = null; }
}

function launchAssistant() {
  return new Promise((resolve) => {
    const { node, dshBin } = detect.env();
    if (!node || !dshBin) {
      return resolve({ ok: false, error: '没找到与风AI助手程序,请先完成「一键安装」' });
    }

    let child;
    try {
      child = spawn(node, [dshBin, 'web', '--no-open'], {
        detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        cwd: config.dshHome(),
        // 使用刚保存的 key，避免 shell 中旧环境变量覆盖 .env。
        env: { ...runtime.childEnv(node), DSH_HOME: config.dshHome(), DEEPSEEK_API_KEY: config.readKey() || '' },
      });
    } catch (e) {
      return resolve({ ok: false, error: friendly(e) });
    }

    let settled = false, closed = false, probing = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (!r.ok) { try { child.kill(); } catch { /* 已退出 */ } }
      try { child.unref(); } catch (e) { /* ignore */ }
      if (r.ok) {
        child.stdout.unref?.(); child.stderr.unref?.();
      }
      resolve(r);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: '与风AI助手启动超时(1 分钟没起来)。请重试一次,或重启电脑后再试' });
    }, 60 * 1000);

    let out = '', err = '', url = null, seenAt = 0;
    const poll = setInterval(async () => {
      if (settled || closed || probing || !url || Date.now() - seenAt < 500) return;
      probing = true;
      const ready = await reachable(url);
      probing = false;
      if (!ready || settled || closed) return;
      try {
        await openBrowser(url);
        if (closed || settled) return;
        // token 只放本机配置文件，不通过状态接口或日志返回。
        fs.writeFileSync(sessionFile(), JSON.stringify({ pid: child.pid, url }), { mode: 0o600 });
        assistant = { child, pid: child.pid, url };
        log.info('与风AI助手已启动');
        finish({ ok: true });
      } catch (e) { finish({ ok: false, error: friendly(e) }); }
    }, 200);
    const scan = () => {
      // 它启动后会打印: dsh web: http://127.0.0.1:3080/?token=...
      // 等整行，否则分块输出可能只拿到半个 token。
      const m = out.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s\x1b]*[ \r\n]/);
      if (m && !url) { url = m[0].trim(); seenAt = Date.now(); }
    };
    child.stdout.on('data', (d) => { if (settled) return; out = (out + d.toString()).slice(-8192); scan(); });
    child.stderr.on('data', (d) => {
      if (settled) return;
      err = (err + d.toString()).slice(-8192);
      // 端口被占 = 多半已经开着一个了
      if (/EADDRINUSE|address already in use/i.test(err)) {
        finish({ ok: false, error: '与风AI助手已经在运行了,去浏览器里找那个已经打开的页面就行' });
      }
    });
    child.on('error', (e) => finish({ ok: false, error: friendly(e) }));
    child.on('close', (code) => {
      closed = true;
      if (assistant?.child === child) assistant = null;
      try {
        const saved = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
        if (saved.pid === child.pid) fs.unlinkSync(sessionFile());
      } catch { /* 未写会话或已清理 */ }
      if (!settled) {
        log.error('dsh web 退出,码 ' + code + ':' + err.slice(0, 300));
        finish({ ok: false, error: '与风AI助手没能启动,请点「重试安装」后再试。反复失败请联系开发者' });
      }
    });
  });
}

function createServer({ onInstalled, initialShortcut = null, networkCheck = checkNetwork, native = {} } = {}) {
  let shortcut = initialShortcut;
  // 文件操作的批准目录**只能**来自系统对话框,绝不从 HTTP 请求体里取路径。
  let approvedRoot = null;
  const needNative = (r) => {
    if (!native.pickFolder) { r.status(503).json({ error: '此功能需要在安装版中使用（需要系统对话框）' }); return true; }
    return false;
  };
  async function ensureShortcut() {
    if (!detect.env().dshBin || !config.isConfigured()) return { ok: false, message: '请先完成 AI 安装并保存密钥' };
    if (!onInstalled) return { ok: false, skipped: true, message: '请在正式安装版中创建桌面入口' };
    try { shortcut = await onInstalled(); }
    catch { shortcut = { ok: false, message: '桌面入口创建失败，AI 安装不受影响；请重试创建桌面入口' }; }
    return shortcut;
  }
  const app = express();
  // 上次若在写文件中途崩溃,这里按落盘的 pending 事务把文件还原,避免留下半成品。
  try { const r = files.recover(); if (r.length) log.info('文件事务崩溃恢复: ' + JSON.stringify(r)); }
  catch (e) { log.error('文件事务恢复失败: ' + e.message); }
  app.use((q, r, next) => {
    const host = q.headers.host;
    const port = q.socket.localPort;
    if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) {
      return r.status(403).json({ ok: false, error: '请求地址不正确' });
    }
    if (q.method === 'POST' && ((q.headers.origin && q.headers.origin !== 'http://' + host) ||
        q.headers['sec-fetch-site'] === 'cross-site' || !q.is('application/json'))) {
      return r.status(403).json({ ok: false, error: '请从与风AI助手窗口操作' });
    }
    next();
  });
  // 文件写入要把内容带上来,所以放宽到 512kb(单个文件另有 2MB 上限的模块校验)。
  app.use(express.json({ limit: '512kb' }));

  app.use(express.static(path.join(__dirname, 'web')));

  app.get('/api/health', (_q, r) => r.json({ ok: true }));
  app.get('/api/skills', (_q, r) => {
    try { r.json({ items: skills.list() }); }
    catch { r.status(500).json({ error: '技能库读取失败，请重新安装与风AI助手' }); }
  });
  app.post('/api/skills/install', (q, r) => {
    if (starting || isInstalling()) return r.status(409).json({ error: '正在安装或启动，请稍后再配装技能' });
    if (!detect.env().dshBin || !config.isConfigured()) return r.status(400).json({ error: '请先完成 AI 安装并保存密钥' });
    try { r.json({ results: skills.install(q.body?.ids) }); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });

  app.post('/api/network', async (_q, r) => {
    try { r.json(await networkCheck()); }
    catch { r.status(500).json({ error: '网络检查暂未完成，请重试' }); }
  });

  // 体检:Node 在不在 / 装没装过 / 配没配 key / 界面是不是开着。不返回 key 值
  app.get('/api/detect', async (_q, r) => {
    try { r.json({ items: await detect.detect() }); }
    catch (e) { r.status(500).json({ ok: false, error: friendly(e) }); }
  });

  // 状态:装过没、配过没
  app.get('/api/status', async (_q, r) => {
    const { dshBin } = detect.env();
    const active = activeAssistant();
    r.json({
      installed: !!dshBin,
      configured: config.isConfigured(),
      running: !!active && await reachable(active.url),
      shortcut,
    });
  });

  // 试 key —— 用户粘完就能立刻知道对不对,不用等装完
  app.post('/api/test', async (q, r) => {
    if (q.body?.key != null && typeof q.body.key !== 'string') return r.status(400).json({ ok: false, err: '密钥格式不对' });
    const key = (q.body?.key || '').trim() || config.readKey();
    if (!key) return r.status(400).json({ ok: false, err: '还没有 key,请先粘贴' });
    try { r.json(await testDeepSeek(key, q.body?.model)); }
    catch (e) { r.status(500).json({ ok: false, err: friendly(e) }); }
  });

  // 安装:流式(NDJSON,一行一个事件)
  app.post(['/api/install', '/api/repair'], async (q, r) => {
    const repair = q.path === '/api/repair';
    if (q.body?.key != null && typeof q.body.key !== 'string') return r.status(400).json({ ok: false, error: '密钥格式不对' });
    if (starting || isInstalling()) return r.status(409).json({ ok: false, error: '正在安装或启动，请稍后重试' });
    const active = activeAssistant();
    if (active && !repair) return r.status(409).json({ ok: false, error: '助手正在运行，请重启电脑后再重新安装；桌面入口问题可点“一键修复”' });
    const key = (q.body?.key || '').trim() || config.readKey();
    r.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    r.setHeader('Cache-Control', 'no-cache');
    r.setHeader('X-Accel-Buffering', 'no'); // 别让中间层缓冲

    const send = (obj) => { if (!r.destroyed) r.write(log.redact(JSON.stringify(obj)) + '\n'); };

    try {
      if (repair && active) {
        if (!await reachable(active.url)) throw new Error('助手进程仍在运行但未响应，请重启电脑后再点“一键修复”');
        send({ type: 'note', message: '助手运行正常，本次只修复桌面入口，无需重新下载' });
        send({ type: 'shortcut', ...(await ensureShortcut()) });
        send({ type: 'done' });
        return;
      }
      if (repair && !config.isConfigured()) throw new Error('未找到已保存的密钥，请先填入密钥并点“开始安装”');
      send({ type: 'phase', message: '检查下载源和 AI 服务的网络连接…' });
      const network = await networkCheck();
      send({ type: 'network', ...network });
      if (!network.downloadOk) throw new Error('下载源暂时连不上，未改动程序组件；请检查网络后重试');
      if (!network.serviceOk) send({ type: 'note', message: 'AI 服务暂时连不上，仍可安装程序；使用前请重新检查网络' });
      await install({ key, onEvent: send, repair });
      send({ type: 'shortcut', ...(await ensureShortcut()) });
    } catch (e) {
      const msg = friendly(e);
      log.error('安装失败: ' + msg);
      send({ type: 'error', message: msg });
    } finally {
      r.end();
    }
  });

  // 装完之后:打开 AI 助手
  // ── 场景任务向导 ───────────────────────────────────────
  app.get('/api/presets', (_q, r) => {
    try { r.json({ items: presets.list(), packs: presets.listPacks() }); }
    catch (e) { r.status(500).json({ error: friendly(e) }); }
  });

  // ── 已保存任务 ─────────────────────────────────────────
  app.get('/api/tasks', (_q, r) => { try { r.json({ items: tasks.list() }); } catch (e) { r.status(500).json({ error: friendly(e) }); } });
  app.post('/api/tasks/save', (q, r) => {
    try { r.json({ task: tasks.save(q.body || {}) }); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.post('/api/tasks/delete', (q, r) => {
    try { r.json(tasks.remove(q.body?.id)); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });

  // 交接:整理提示词并复制到剪贴板。真实动作,失败如实报错;不代用户执行任务。
  app.post('/api/harness/copy', async (q, r) => {
    try { r.json(await harness.copy(q.body || {}, { clipboard: native.clipboard || null })); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });

  // ── 文件操作(批准目录只能来自系统对话框) ─────────────────
  app.post('/api/files/pick', async (_q, r) => {
    if (needNative(r)) return;
    try {
      const picked = await native.pickFolder({ title: '选择要操作的安全文件夹' });
      if (!picked) return r.json({ ok: false, canceled: true });
      approvedRoot = files.assertRoot(picked);
      r.json({ ok: true, root: approvedRoot });
    } catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.post('/api/files/preview', (q, r) => {
    if (!approvedRoot) return r.status(400).json({ error: '请先选择文件夹' });
    try { r.json(files.preview(approvedRoot, q.body?.ops)); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  // 整理:列出批准目录顶层内容 + 按扩展名给出移动方案(不写盘)。
  app.post('/api/files/organize', (q, r) => {
    if (!approvedRoot) return r.status(400).json({ error: '请先选择文件夹' });
    try {
      const listing = files.listFolder(approvedRoot);
      const plan = files.groupByExtension(approvedRoot);
      r.json({ root: listing.root, entries: listing.entries, ops: plan.ops, skipped: plan.skipped, folders: plan.folders, note: plan.note });
    } catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.post('/api/files/move-preview', (q, r) => {
    if (!approvedRoot) return r.status(400).json({ error: '请先选择文件夹' });
    try { r.json(files.previewMoves(approvedRoot, q.body?.ops)); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  // 应用**只接受预览令牌**,不接受新的文件内容 —— 内容在预览时已定,中途被换会被拒。
  app.post('/api/files/apply', (q, r) => {
    if (!approvedRoot) return r.status(400).json({ error: '请先选择文件夹' });
    if (typeof q.body?.token !== 'string' || !q.body.token) return r.status(400).json({ error: '请先预览，拿到预览令牌后再应用' });
    try { r.json(files.apply(q.body.token, { root: approvedRoot, label: q.body?.label })); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.post('/api/files/undo', (q, r) => {
    try { r.json(files.undo(q.body?.txnId)); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.get('/api/files/ledger', (_q, r) => { try { r.json({ items: files.ledger() }); } catch (e) { r.status(500).json({ error: friendly(e) }); } });

  // ── 环境管理:检测 Git / Python;准备时走校验下载或人工移交 ──
  app.get('/api/env', (_q, r) => { try { r.json({ items: envmgr.list() }); } catch (e) { r.status(500).json({ error: friendly(e) }); } });
  app.post('/api/env/prepare', async (q, r) => {
    const key = q.body?.key;
    if (key !== 'git' && key !== 'python') return r.status(400).json({ error: '不支持的环境' });
    try {
      const events = [];
      const result = await envmgr.prepare(key, {
        privateMode: true,
        onEvent: (e) => events.push(e),
        native: { openExternal: native.openExternal, launchInstaller: native.launchInstaller },
      });
      r.json({ ...result, events });
    } catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.post('/api/env/postcheck', (q, r) => {
    try { r.json(envmgr.postcheck(q.body?.key)); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });

  // ── 成本管理:预估与实际分开记录 ─────────────────────────
  app.get('/api/cost', (_q, r) => {
    try { r.json({ config: cost.getConfig(), summary: cost.summary(), history: cost.history(20) }); }
    catch (e) { r.status(500).json({ error: friendly(e) }); }
  });
  app.post('/api/cost/config', (q, r) => { try { r.json({ config: cost.setConfig(q.body || {}) }); } catch (e) { r.status(400).json({ error: friendly(e) }); } });
  app.post('/api/cost/estimate', (q, r) => { try { r.json({ entry: cost.estimate(q.body || {}) }); } catch (e) { r.status(400).json({ error: friendly(e) }); } });
  app.post('/api/cost/record', (q, r) => { try { r.json({ entry: cost.record(q.body || {}) }); } catch (e) { r.status(400).json({ error: friendly(e) }); } });

  // ── 技能版本:状态 / 更新 / 回滚 / 导入本地技能包 ─────────
  const skillsReady = () => detect.env().dshBin && config.isConfigured();
  app.get('/api/skills/status', (_q, r) => { try { r.json({ items: skills.status() }); } catch (e) { r.status(500).json({ error: friendly(e) }); } });
  app.post('/api/skills/update', (q, r) => {
    if (!skillsReady()) return r.status(400).json({ error: '请先完成 AI 安装并保存密钥' });
    try { r.json({ results: skills.update(q.body?.ids) }); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.post('/api/skills/rollback', (q, r) => {
    if (!skillsReady()) return r.status(400).json({ error: '请先完成 AI 安装并保存密钥' });
    try { r.json(skills.rollback(q.body?.name)); }
    catch (e) { r.status(400).json({ error: friendly(e) }); }
  });
  app.post('/api/skills/import', async (q, r) => {
    if (needNative(r)) return;
    if (!skillsReady()) return r.status(400).json({ error: '请先完成 AI 安装并保存密钥' });
    try {
      const picked = await native.pickFolder({ title: '选择本地技能包文件夹' });
      if (!picked) return r.json({ ok: false, canceled: true });
      const result = skills.importPackage(picked, undefined, { label: picked });
      log.info('导入本地技能包:' + picked + ' 应用 ' + result.applied.length + ' 冲突 ' + result.conflicts.length + ' 跳过 ' + result.skipped.length);
      r.json(result);
    } catch (e) { r.status(400).json({ error: friendly(e) }); }
  });

  app.post('/api/shortcut', async (_q, r) => { r.json(await ensureShortcut()); });
  app.post('/api/open', async (_q, r) => {
    try { r.json(await startAssistant()); }
    catch (e) { r.status(500).json({ ok: false, error: friendly(e) }); }
  });

  app.use((err, _q, r, _n) => {
    log.error('本地请求失败: ' + err.message);
    r.status(err.status === 400 || err.status === 413 ? err.status : 500).json({ ok: false, error: '请求失败，请重试' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      log.info('本地服务启动 → http://127.0.0.1:' + port);
      resolve({ app, server, port });
    });
    server.on('error', reject);
  });
}

// 英文异常 → 中文人话(铁律:小白永不看技术报错)
function friendly(e) {
  const s = log.redact(String((e && e.message) || e));
  const map = [
    [/ENOENT|找不到|not found/i, '缺少必要文件,请重新下载安装包再试一次'],
    [/EACCES|EPERM|权限|denied/i, '没有权限。请右键安装包 →「以管理员身份运行」'],
    [/ENOSPC|no space/i, '磁盘空间不够了,请清理一些空间后重试'],
    [/timeout|超时|ETIMEDOUT/i, '网络超时。请检查网络连接后重试'],
    [/HTTP 4\d\d|HTTP 5\d\d/i, '下载通道返回错误,请稍后重试;多次失败请联系开发者'],
    [/ECONNREFUSED|ECONNRESET|socket hang up|网络|连不上/i, '网络连接中断。请检查网络后重试'],
  ];
  for (const [re, cn] of map) if (re.test(s)) return cn;
  return s;
}

module.exports = { createServer, friendly, enginePath, browserArgs, openBrowser, startAssistant };

// CLI 调试:node server.js
if (require.main === module) {
  // 自检:钉住开浏览器那行命令的形状(node server.js --check)。
  // `start` 后面第一个词必须带引号(标题位);不加的话 cmd 会把它当成要运行的
  // 程序名去找,找不到就什么都不发生 —— 白电脑上"点了没反应"就是这个。
  if (process.argv[2] === '--check') {
    const assert = require('assert');
    const a = browserArgs('https://example.com');
    assert.strictEqual(a[2], '""', 'start 后面第一个词必须带引号,否则 cmd 会当成程序名');
    assert.strictEqual(a[3], 'https://example.com', '网址要原样传,别自己加引号(cmd 认不出)');
    assert.ok(/cmd\.exe$/i.test(CMD), '系统程序要用绝对路径:' + CMD);
    console.log('server.js self-check OK');
  } else {
    createServer().then(({ port }) => console.log('http://127.0.0.1:' + port));
  }
}
