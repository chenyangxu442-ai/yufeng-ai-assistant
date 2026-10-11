// envmgr.js — 环境管理:检测 Git / Python,并在用户**明确点击**时准备
//
// 铁律:
//   · 只检测,绝不悄悄改系统 PATH,也绝不改全局配置。
//   · 下载必校验 sha256;没有内置校验值就**不下载**,转为"打开官方页面 + 人工完成
//     + 完成后复查"的移交模式 —— 宁可慢,也不装来路不明的可执行文件。
//   · 需要管理员权限的安装程序交给人来点"下一步";我们不代点、不静默提权。
//
// 这样比"一键装好"保守,但对小白电脑是安全的:出错也只是"没装上",不会装坏。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const detect = require('./detect');
const agent = require('./agent');
const privateEnv = require('./private-env');

const MAX_DOWNLOAD = 400 * 1024 * 1024; // 400MB 上限,防止下到离谱的大文件

// 官方来源 + 校验值注册表。校验值留空 = 未验证 → 不走自动下载,改移交人工。
// 需要启用自动下载时,在 runtimes.json 里填入官方安装包的 url + sha256。
function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'runtimes.json'), 'utf8')); }
  catch { return {}; }
}

const SPECS = {
  git: {
    key: 'git', name: 'Git', probe: 'git',
    candidates: () => [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'cmd', 'git.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git', 'cmd', 'git.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe'),
    ].filter(Boolean),
    versionArgs: ['--version'],
    officialPage: 'https://git-scm.com/download/win',
    why: '网站类任务需要用 Git 保存和同步代码',
  },
  python: {
    key: 'python', name: 'Python', probe: 'python',
    candidates: () => {
      const out = [];
      const roots = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Python'),
        process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
      for (const root of roots) {
        try {
          for (const entry of fs.readdirSync(root)) {
            if (/^Python\d/i.test(entry)) out.push(path.join(root, entry, 'python.exe'));
          }
        } catch { /* 目录不存在就跳过 */ }
      }
      return out;
    },
    versionArgs: ['--version'],
    officialPage: 'https://www.python.org/downloads/windows/',
    why: '表格类任务需要 Python 处理 Excel/CSV',
  },
};

// WindowsApps 里的 python.exe 是应用商店占位入口:点了会跳商店,不是真装。
function isStoreStub(p) { return /[\\/]WindowsApps[\\/]/i.test(p); }

// 路径存在 ≠ 可用:必须能成功跑出版本号才算装好。
function usableVersion(exe, spec) {
  if (!exe || !fs.existsSync(exe) || isStoreStub(exe)) return null;
  let stat; try { stat = fs.lstatSync(exe); } catch { return null; }
  if (stat.isSymbolicLink() || !stat.isFile()) return null;
  return detect.run(exe, spec.versionArgs) || null;
}

// 找工具:先试常见安装位置(绝对路径),再 where.exe。都要求版本命令跑通,不抛。
function detectTool(key) {
  const spec = SPECS[key];
  if (!spec) throw new Error('不支持的环境: ' + key);
  const privateExe = privateEnv.targetExe(key);
  const privateVersion = usableVersion(privateExe, spec);
  if (privateVersion) return { key, name: spec.name, installed: true, path: privateExe, version: privateVersion, source: '助手私有环境' };
  for (const exe of spec.candidates()) {
    const version = usableVersion(exe, spec);
    if (version) return { key, name: spec.name, installed: true, path: exe, version, source: '常见位置' };
  }
  const found = detect.run(detect.systemExe('where.exe'), [spec.probe]);
  for (const line of (found || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (isStoreStub(line)) continue; // 商店占位入口不算已安装
    const version = usableVersion(line, spec);
    if (version) return { key, name: spec.name, installed: true, path: line, version, source: 'PATH' };
  }
  return { key, name: spec.name, installed: false, path: null, version: null, source: null };
}

function list() {
  return Object.keys(SPECS).map(key => {
    const tool = detectTool(key);
    const entry = loadRegistry()[key] || {};
    return {
      ...tool,
      why: SPECS[key].why,
      officialPage: SPECS[key].officialPage,
      downloadReady: !!(entry.url && entry.sha256), // 有官方 url 且带校验值才允许自动下载
    };
  });
}

// 算出这次点击"将要发生什么",让界面能如实告诉用户(而不是含糊的"一键完成")。
function plan(key, registry = loadRegistry()) {
  const spec = SPECS[key];
  if (!spec) throw new Error('不支持的环境: ' + key);
  const tool = detectTool(key);
  const entry = registry[key] || {};
  if (tool.installed) return { key, mode: 'ready', tool, message: spec.name + ' 已就绪，不需要再装' };
  if (entry.url && entry.sha256) {
    return { key, mode: 'download', tool, url: entry.url, sha256: entry.sha256,
      message: '将从官方地址下载 ' + spec.name + ' 安装包并校验 sha256，然后打开安装程序由你完成；不会修改系统 PATH。' };
  }
  return { key, mode: 'handoff', tool, page: spec.officialPage,
    message: '未内置可校验的官方安装包，改为打开官方下载页由你手动安装；装好后点"复查"。不修改系统 PATH。' };
}

function safeName(url) {
  const name = path.basename(new URL(url).pathname);
  return /^[A-Za-z0-9._-]{1,120}$/.test(name) ? name : null;
}

async function download(url, destDir, { fetchImpl = globalThis.fetch, onEvent = () => {}, expectedSha } = {}) {
  const name = safeName(url);
  if (!name) throw new Error('下载地址不正确');
  const target = path.join(destDir, name);
  fs.mkdirSync(destDir, { recursive: true });
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10 * 60 * 1000), redirect: 'follow' });
  if (!response.ok) throw new Error('下载失败（HTTP ' + response.status + '）');
  const total = Number(response.headers.get('content-length')) || 0;
  if (total > MAX_DOWNLOAD) throw new Error('安装包太大，已停止下载');
  const hash = crypto.createHash('sha256');
  let got = 0;
  const handle = fs.createWriteStream(target);
  try {
    for await (const chunk of response.body) {
      got += chunk.length;
      if (got > MAX_DOWNLOAD) throw new Error('安装包超过大小上限，已停止下载');
      hash.update(chunk);
      if (!handle.write(chunk)) await new Promise(r => handle.once('drain', r));
      if (total) onEvent({ type: 'progress', got, total });
    }
    await new Promise((resolve, reject) => handle.end(err => (err ? reject(err) : resolve())));
  } catch (e) {
    handle.destroy();
    fs.rmSync(target, { force: true });
    throw e;
  }
  const actual = hash.digest('hex');
  if (actual !== expectedSha) {
    fs.rmSync(target, { force: true });
    throw new Error('安装包校验失败，已删除文件（可能被篡改或下载损坏）');
  }
  return { path: target, size: got, sha256: actual };
}

// prepare:只在用户点了按钮时调用。
// 有可校验的官方包 → 下载+校验+打开安装程序;否则 → 打开官方页移交人工。
// 无论哪条路,完成后都复查。全程不动系统 PATH。
async function prepare(key, { onEvent = () => {}, native = {}, fetchImpl, registry = loadRegistry(), downloadDir, privateMode = false } = {}) {
  if (privateMode) {
    const existing = detectTool(key);
    if (existing.installed) return { ok: true, mode: 'ready', tool: existing, message: existing.name + ' 已就绪：' + existing.version };
    const result = await privateEnv.prepare(key, { onEvent });
    return { ...result, message: SPECS[key].name + ' 私有环境已就绪：' + result.version + '。已经运行的助手需要重启电脑后使用新环境。' };
  }
  const step = plan(key, registry);
  onEvent({ type: 'plan', ...step });
  if (step.mode === 'ready') return { ok: true, mode: 'ready', tool: step.tool };

  if (step.mode === 'handoff') {
    if (!native.openExternal) throw new Error('请在安装版中使用（需要系统浏览器）');
    await native.openExternal(step.page);
    onEvent({ type: 'handoff', message: step.message });
    return { ok: true, mode: 'handoff', page: step.page, message: step.message };
  }

  const dir = downloadDir || path.join(agent.workDir(), 'downloads');
  onEvent({ type: 'download-start', message: '正在下载 ' + SPECS[key].name + ' 官方安装包…' });
  const file = await download(step.url, dir, { fetchImpl, onEvent, expectedSha: step.sha256 });
  onEvent({ type: 'download-done', message: '校验通过', size: file.size });
  if (!native.launchInstaller) throw new Error('请在安装版中打开安装程序（缺少系统接口）');
  await native.launchInstaller(file.path);
  onEvent({ type: 'handoff', message: '安装程序已打开，请按提示完成安装，完成后点"复查"' });
  return { ok: true, mode: 'download', installer: file.path, sha256: file.sha256, message: '安装程序已打开，请人工完成安装后点"复查"' };
}

// 复查:重新检测,如实回报。人工没装完就说没装完,不假装成功。
function postcheck(key) { return detectTool(key); }

// 私有工具目录:只影响我们启动的 Harness 子进程(runtime.childEnv 会把它加到 PATH 最前),
// 绝不改系统 PATH。用户把工具放这里,Harness 就能用到。
function privateBinDir() { return path.join(agent.workDir(), 'env', 'bin'); }

module.exports = { list, detectTool, plan, prepare, postcheck, download, privateBinDir, SPECS, loadRegistry };

if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  (async () => {
    const items = list();
    assert.strictEqual(items.length, 2);
    assert.ok(items.some(x => x.key === 'git') && items.some(x => x.key === 'python'));
    // 未内置校验值时必须 handoff(除非本机已装好)—— 绝不自动下载未验证的包
    const gitInstalled = detectTool('git').installed;
    if (!gitInstalled) assert.strictEqual(plan('git', {}).mode, 'handoff');
    // 有 url+sha256 时:没装才是 download,已装则是 ready
    assert.strictEqual(plan('git', { git: { url: 'https://x/git.exe', sha256: 'a'.repeat(64) } }).mode, gitInstalled ? 'ready' : 'download');

    // 用假 fetch 验证:校验值不符必须删文件并报错;相符才通过
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envmgr-'));
    const body = Buffer.from('fake-installer-bytes');
    const good = crypto.createHash('sha256').update(body).digest('hex');
    const fakeFetch = async () => ({ ok: true, headers: { get: () => String(body.length) }, body: (async function* () { yield body; })() });
    const bad = await download('https://x/git.exe', dir, { fetchImpl: fakeFetch, expectedSha: 'b'.repeat(64) }).then(() => null, e => e);
    assert.ok(bad && /校验失败/.test(bad.message), '校验失败必须报错');
    assert.strictEqual(fs.readdirSync(dir).length, 0, '校验失败必须删除文件');
    const ok = await download('https://x/git.exe', dir, { fetchImpl: fakeFetch, expectedSha: good });
    assert.strictEqual(ok.sha256, good);
    assert.ok(fs.existsSync(ok.path));
    // handoff 路径要能打开官方页(本机已装则走 ready,两种都算通过)
    let opened = null;
    const r = await prepare('python', { registry: {}, native: { openExternal: async (u) => { opened = u; } } });
    if (detectTool('python').installed) { assert.strictEqual(r.mode, 'ready'); }
    else { assert.strictEqual(r.mode, 'handoff'); assert.match(opened, /python\.org/); }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('envmgr.js self-check OK');
  })().catch(e => { console.error(e); process.exit(1); });
}
