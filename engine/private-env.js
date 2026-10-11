// private-env.js — 一键准备**私有** Git / Python(Windows x64)
//
// 铁律(与 envmgr.js 一致,但这里真装,不再只是"打开官方页"):
//   · 只装进 workDir/runtimes/<key>,只影响我们启动的子进程(见 runtime.childEnv)。
//     绝不改系统 PATH,绝不全局安装,绝不静默提权。
//   · 只下载 official-runtime-evidence.json 里**带 sha256** 的官方包;没有校验值就不下。
//   · 解压到临时 staging → 真跑一次 --version 验证 → 才原子改名到正式目录。
//     验证失败就删 staging,已有的旧运行时原样保留。
//   · 全程绝对路径 + shell:false;子进程超时按进程树杀,避免解压/安装程序吊死。
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const agent = require('./agent');

const DOWNLOAD_TIMEOUT = 20 * 60 * 1000;
const EXTRACT_TIMEOUT = 10 * 60 * 1000;
const VERIFY_TIMEOUT = 20 * 1000;

const SPECS = {
  git: {
    key: 'git', name: 'Git',
    // 装好后的可执行文件(相对运行时根目录),Windows 上从 cmd 用 git.exe
    exe: ['cmd', 'git.exe'],
    versionArgs: ['--version'],
    versionRe: /git version\s+([0-9][0-9A-Za-z.\-]*)/i,
  },
  python: {
    key: 'python', name: 'Python',
    exe: ['python.exe'],
    versionArgs: ['--version'],
    versionRe: /Python\s+([0-9][0-9A-Za-z.\-]*)/i,
  },
};

function workRoot() { return path.resolve(agent.workDir()); }
function runtimesDir() { return path.join(workRoot(), 'runtimes'); }
function downloadsDir() { return path.join(workRoot(), 'downloads'); }
function targetDir(key) { return path.join(runtimesDir(), key); }
function targetExe(key) { return path.join(targetDir(key), ...SPECS[key].exe); }

// 官方地址 + 校验值(仓库 work/ 下,随代码一起走;不从网络取元数据)
function evidenceFile() { return path.join(__dirname, 'private-runtimes.json'); }
function loadEvidence() {
  try { return JSON.parse(fs.readFileSync(evidenceFile(), 'utf8')); } catch { return null; }
}

// ---- 路径安全:只在 workDir 内操作、拒绝符号链接输出目录 ----------------------
function inside(base, p) {
  const rel = path.relative(path.resolve(base), path.resolve(p));
  return !!rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}
function assertInside(base, p) {
  if (!inside(base, p)) throw new Error('拒绝操作工作目录之外的路径: ' + p);
  return p;
}
function ensureNotSymlink(p) {
  const absolute = path.resolve(p);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let st;
    try { st = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (st.isSymbolicLink()) throw new Error('目标目录是符号链接，已拒绝以免写到别处: ' + current);
  }
}
function removeWithin(base, p) {
  assertInside(base, p);
  fs.rmSync(p, { recursive: true, force: true });
}

// ---- 子进程:绝对路径 + shell:false + 隐藏窗口 + 超时按进程树杀 ---------------
function killTree(child) {
  if (!child || child.killed || !child.pid) return;
  try {
    const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    if (process.platform === 'win32') {
      spawn(path.join(sysRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' });
      return;
    }
  } catch { /* 退回普通 kill */ }
  try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
}

function runCapture(exe, args, { timeoutMs = VERIFY_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(exe, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { reject(e); return; }
    let out = '', err = '', settled = false;
    const finish = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => { killTree(child); finish(reject, new Error('子进程超时，已终止: ' + exe)); }, timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => finish(reject, e));
    child.on('close', code => finish(resolve, { code, stdout: out, stderr: err }));
  });
}

function matchVersion(spec, text) {
  const m = spec.versionRe.exec(text || '');
  return m ? m[1] : null;
}

// 跑一次 --version 才算数:文件在 ≠ 能启动
async function probeExe(exe, spec) {
  let st; try { st = fs.lstatSync(exe); } catch { return null; }
  if (st.isSymbolicLink() || !st.isFile()) return null;
  const r = await runCapture(exe, spec.versionArgs).catch(() => null);
  if (!r || r.code !== 0) return null;
  return matchVersion(spec, r.stdout + '\n' + r.stderr);
}

// 公开探测:只报事实,不抛
async function probe(key) {
  const spec = SPECS[key];
  if (!spec) throw new Error('不支持的环境: ' + key);
  const exe = targetExe(key);
  const version = await probeExe(exe, spec);
  return { key, name: spec.name, installed: !!version, path: version ? exe : null, version: version || null };
}

// ---- ZIP 防穿越:拒绝绝对路径 / 盘符 / .. 段 ---------------------------------
function isSafeZipEntry(name) {
  if (typeof name !== 'string' || !name) return false;
  if (/^[A-Za-z]:/.test(name)) return false;
  if (name.startsWith('/') || name.startsWith('\\')) return false;
  return !name.split(/[\\/]/).includes('..');
}

function yauzl() {
  try { return require('yauzl'); }
  catch { return require(path.join(__dirname, '..', 'app', 'node_modules', 'yauzl')); }
}

// 解压前先列一遍条目,有危险路径就整体拒绝(不解压)
function assertSafeZip(file) {
  return new Promise((resolve, reject) => {
    let yz;
    try { yz = yauzl(); } catch (e) { reject(new Error('缺少 yauzl，无法校验压缩包: ' + e.message)); return; }
    yz.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) { reject(new Error('压缩包无法打开: ' + err.message)); return; }
      zip.on('entry', entry => {
        if (!isSafeZipEntry(entry.fileName)) {
          zip.close();
          reject(new Error('压缩包包含不安全的路径，已拒绝解压: ' + entry.fileName));
          return;
        }
        zip.readEntry();
      });
      zip.on('end', resolve);
      zip.on('error', e => reject(new Error('读取压缩包失败: ' + e.message)));
      zip.readEntry();
    });
  });
}

function powershellExe() {
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

// 用 EncodedCommand 传脚本,彻底绕开引号/空格转义问题
function expandArchive(src, dst) {
  const q = s => "'" + String(s).replace(/'/g, "''") + "'";
  const script = "$ProgressPreference='SilentlyContinue';Expand-Archive -LiteralPath " + q(src)
    + " -DestinationPath " + q(dst) + " -Force";
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return runCapture(powershellExe(),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    { timeoutMs: EXTRACT_TIMEOUT });
}

// 每类运行时怎么解压(真实实现;测试可用 extract 适配器替换)
function defaultExtract(key) {
  const spec = SPECS[key];
  if (!spec) throw new Error('不支持的环境: ' + key);
  return async (artifact, staging) => {
    const src = path.resolve(artifact);
    const dst = path.resolve(staging);
    if (key === 'git') {
      // 便携式 7z 自解压包:静默 + 解到绝对 staging(-o 与路径同一参数,空格安全)
      const r = await runCapture(src, ['-y', '-o' + dst], { timeoutMs: EXTRACT_TIMEOUT });
      if (r.code !== 0) throw new Error('Git 便携包解压失败（退出码 ' + r.code + '）');
      return dst;
    }
    // python:官方 zip → 先验路径,再用系统自带 PowerShell 解压
    await assertSafeZip(src);
    const r = await expandArchive(src, dst);
    if (r.code !== 0) throw new Error('Python 包解压失败（退出码 ' + r.code + '）: ' + (r.stderr || '').slice(0, 200));
    return dst;
  };
}

// 解压后定位运行时根目录(容忍解压器多套一层目录)
function runtimeRoot(staging, spec) {
  if (fs.existsSync(path.join(staging, ...spec.exe))) return staging;
  let dirs;
  try { dirs = fs.readdirSync(staging, { withFileTypes: true }).filter(e => e.isDirectory()); }
  catch { return null; }
  if (dirs.length === 1) {
    const nested = path.join(staging, dirs[0].name);
    if (fs.existsSync(path.join(nested, ...spec.exe))) return nested;
  }
  return null;
}

// 原子替换:旧目录先移开,新目录改名就位;失败则还原旧目录
function installSwap(src, target) {
  ensureNotSymlink(target);
  let backup = null;
  if (fs.existsSync(target)) {
    backup = target + '.old-' + process.pid + '-' + Date.now().toString(36);
    fs.renameSync(target, backup);
  }
  try {
    fs.renameSync(src, target);
  } catch (e) {
    if (backup) { try { fs.renameSync(backup, target); } catch { /* 还原失败也如实抛出 */ } }
    throw e;
  }
  if (backup) removeWithin(runtimesDir(), backup);
}

// ---- prepare:用户点了才跑。全局同一时刻只允许一个 --------------------------
let active = null;

async function prepare(key, opts = {}) {
  const spec = SPECS[key];
  if (!spec) throw new Error('不支持的环境: ' + key);
  const { onEvent = () => {}, download, extract, probe: probeAdapter, evidence, force = false } = opts;
  if (active) throw new Error('已有准备任务正在进行（' + active + '），请等待其结束');
  active = key;

  const runtimes = runtimesDir();
  const staging = path.join(runtimes, '.staging-' + key + '-' + process.pid + '-' + Date.now().toString(36));
  try {
    const ev = evidence || loadEvidence();
    const meta = ev && ev[key];
    if (!meta || !meta.url || !/^[0-9a-f]{64}$/i.test(meta.sha256 || '')) {
      throw new Error('缺少 ' + spec.name + ' 的官方地址/校验值，拒绝下载');
    }

    const root = workRoot();
    for (const dir of [downloadsDir(), runtimes]) {
      fs.mkdirSync(dir, { recursive: true });
      assertInside(root, dir);
      ensureNotSymlink(dir);
    }
    ensureNotSymlink(targetDir(key));

    if (!force) {
      const cur = probeAdapter ? await probeAdapter(targetExe(key)) : await probeExe(targetExe(key), spec);
      if (cur) {
        onEvent({ type: 'ready', key, version: cur });
        return { ok: true, key, mode: 'ready', installed: true, version: cur, path: targetExe(key) };
      }
    }

    // 复用 envmgr.download(懒加载,避免将来出现 require 环)
    const dl = download || (() => require('./envmgr').download)();
    onEvent({ type: 'download-start', key, message: '正在下载 ' + spec.name + ' 官方包…' });
    const artifact = await dl(meta.url, downloadsDir(), { expectedSha: meta.sha256, onEvent });
    if (!artifact || !artifact.path) throw new Error('下载未返回文件路径，已放弃');
    onEvent({ type: 'download-done', key, size: artifact.size, sha256: artifact.sha256 });

    if (fs.existsSync(staging)) removeWithin(runtimes, staging);
    fs.mkdirSync(staging, { recursive: true });

    try {
      const extractor = extract || defaultExtract(key);
      onEvent({ type: 'extract-start', key, message: '正在解压到临时目录…' });
      await extractor(artifact.path, staging, { onEvent, key });

      const rootDir = runtimeRoot(staging, spec);
      if (!rootDir) throw new Error('解压后找不到 ' + spec.name + ' 程序，已放弃（包可能损坏）');
      const exePath = path.join(rootDir, ...spec.exe);
      const version = probeAdapter ? await probeAdapter(exePath) : await probeExe(exePath, spec);
      if (!version) throw new Error(spec.name + ' 程序无法启动，已放弃安装');
      onEvent({ type: 'verify-done', key, version });

      installSwap(rootDir, targetDir(key));
      if (rootDir !== staging && fs.existsSync(staging)) removeWithin(runtimes, staging);
      onEvent({ type: 'installed', key, version });
      return { ok: true, key, mode: 'installed', installed: true, version, path: targetExe(key) };
    } catch (e) {
      // 失败清理 staging,已装好的旧运行时不受影响
      if (fs.existsSync(staging)) { try { removeWithin(runtimes, staging); } catch { /* 尽力清理 */ } }
      throw e;
    }
  } finally {
    active = null;
  }
}

// 私有 PATH 目录:调用方把它拼进**子进程**的 PATH 最前(runtime.childEnv),不改系统
function paths() {
  const git = targetDir('git');
  const python = targetDir('python');
  return {
    git: [path.join(git, 'cmd')],
    python: [python, path.join(python, 'Scripts')],
  };
}

module.exports = {
  probe, prepare, paths,
  isPreparing: () => active !== null,
  SPECS, isSafeZipEntry, evidenceFile, runtimesDir, targetDir, targetExe,
};
