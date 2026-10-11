// tests/private-env.js — 私有运行时一键准备的自检
//
//   · 默认全用桩(download/extract/probe 适配器),不联网、不动系统。
//   · 若 work/runtime-verification/{git.7z.exe,python.zip} 在,再跑一遍**真包**:
//     真解压 + 真启动 --version,只写临时 workDir,不碰系统 PATH / 全局安装。
//     设 AI_SETUP_PRIVATE_ENV_SKIP_REAL=1 可跳过真包那部分。
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('../engine/private-env.js');

const REPO = path.join(__dirname, '..');
const EVIDENCE = { git: { url: 'https://x/git.exe', sha256: 'a'.repeat(64) },
  python: { url: 'https://x/python.zip', sha256: 'b'.repeat(64) } };

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('ok - ' + name); }
  catch (e) { console.error('FAIL - ' + name); console.error('  ' + (e && e.stack || e)); process.exitCode = 1; }
}

function fresh() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'private-env-'));
  process.env.AI_SETUP_WORK = d;
  return d;
}
function cleanup(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 已删 */ } }
function deferred() { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
function stagingLeftovers(wd) {
  const dir = path.join(wd, 'runtimes');
  try { return fs.readdirSync(dir).filter(n => n.startsWith('.staging-')); } catch { return []; }
}

// 桩:把假 git 树写进 staging,并给一个假的下载文件
function stubArtifact(wd, name) {
  const dir = path.join(wd, 'downloads');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, 'fake-bytes');
  return p;
}

(async () => {
  await t('paths() 只给私有目录(git cmd / python Scripts+根)', async () => {
    const wd = fresh();
    try {
      const p = env.paths();
      const rt = path.join(wd, 'runtimes');
      assert.ok(path.isAbsolute(p.git[0]) && path.isAbsolute(p.python[0]));
      assert.strictEqual(p.git[0], path.join(rt, 'git', 'cmd'));
      assert.ok(p.python.includes(path.join(rt, 'python', 'Scripts')));
      assert.ok(p.python.includes(path.join(rt, 'python')));
    } finally { cleanup(wd); }
  });

  await t('isSafeZipEntry 拒绝穿越/绝对/盘符', async () => {
    for (const bad of ['../x', 'a/../b', '..\\x', 'C:\\x', 'C:/x', '/abs', '\\\\srv\\share', '..']) {
      assert.strictEqual(env.isSafeZipEntry(bad), false, '应拒绝: ' + bad);
    }
    for (const ok of ['cmd/git.exe', 'Lib/site-packages/pip/__init__.py', 'python.exe']) {
      assert.strictEqual(env.isSafeZipEntry(ok), true, '应放行: ' + ok);
    }
  });

  await t('未安装时 probe 如实报 false', async () => {
    const wd = fresh();
    try {
      const r = await env.probe('git');
      assert.strictEqual(r.installed, false);
      assert.strictEqual(r.path, null);
      assert.strictEqual(r.version, null);
    } finally { cleanup(wd); }
  });

  await t('prepare 下载→解压→验证→落盘(全桩)', async () => {
    const wd = fresh();
    try {
      let sawSha = null; const events = [];
      const download = async (url, dir, o) => {
        sawSha = o.expectedSha;
        const p = stubArtifact(wd, 'PortableGit-2.56.0.2-64-bit.7z.exe');
        return { path: p, size: 10, sha256: o.expectedSha };
      };
      const extract = async (art, staging) => {
        fs.mkdirSync(path.join(staging, 'cmd'), { recursive: true });
        fs.writeFileSync(path.join(staging, 'cmd', 'git.exe'), 'x');
        return staging;
      };
      const probe = async (exe) => (fs.existsSync(exe) ? '2.56.0.windows.2' : null);
      const r = await env.prepare('git', { download, extract, probe, evidence: EVIDENCE, onEvent: e => events.push(e.type) });
      assert.strictEqual(r.mode, 'installed');
      assert.strictEqual(r.installed, true);
      assert.strictEqual(r.version, '2.56.0.windows.2');
      assert.strictEqual(sawSha, EVIDENCE.git.sha256, '必须把 sha256 传给下载器');
      assert.ok(fs.existsSync(path.join(wd, 'runtimes', 'git', 'cmd', 'git.exe')));
      assert.strictEqual(r.path, path.join(wd, 'runtimes', 'git', 'cmd', 'git.exe'));
      for (const e of ['download-start', 'download-done', 'extract-start', 'verify-done', 'installed']) {
        assert.ok(events.includes(e), '缺事件: ' + e);
      }
      assert.deepStrictEqual(stagingLeftovers(wd), []);
    } finally { cleanup(wd); }
  });

  await t('已就绪则短路,不再下载', async () => {
    const wd = fresh();
    try {
      fs.mkdirSync(path.join(wd, 'runtimes', 'git', 'cmd'), { recursive: true });
      fs.writeFileSync(path.join(wd, 'runtimes', 'git', 'cmd', 'git.exe'), 'x');
      let dlCalled = false;
      const probe = async () => '9.9.9';
      const r = await env.prepare('git', { download: async () => { dlCalled = true; }, probe, evidence: EVIDENCE });
      assert.strictEqual(r.mode, 'ready');
      assert.strictEqual(r.version, '9.9.9');
      assert.strictEqual(dlCalled, false, '已就绪不该下载');
    } finally { cleanup(wd); }
  });

  await t('缺少官方校验值就拒绝下载', async () => {
    const wd = fresh();
    try {
      await assert.rejects(
        env.prepare('git', { evidence: { git: { url: 'https://x/g.exe' } } }),
        /校验值/);
    } finally { cleanup(wd); }
  });

  await t('并发 prepare 被全局拒绝', async () => {
    const wd = fresh();
    try {
      const d = deferred();
      let first = null;
      const p1 = env.prepare('git', { download: () => d.promise, force: true, evidence: EVIDENCE })
        .catch(e => { first = e; });
      await assert.rejects(
        env.prepare('git', { force: true, evidence: EVIDENCE }),
        /正在进行/);
      d.reject(new Error('stop'));
      await p1;
      assert.ok(first && /stop/.test(first.message), '首个任务应收到下载错误');
      // 释放后可再次 prepare
      const probe = async () => '1.0.0';
      const r = await env.prepare('git', { probe, evidence: EVIDENCE });
      assert.strictEqual(r.mode, 'ready');
    } finally { cleanup(wd); }
  });

  await t('解压失败:清 staging,保留已有运行时', async () => {
    const wd = fresh();
    try {
      const marker = path.join(wd, 'runtimes', 'git', 'cmd', 'git.exe');
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, 'OLD');
      const download = async () => ({ path: stubArtifact(wd, 'git.7z.exe'), size: 4, sha256: EVIDENCE.git.sha256 });
      const extract = async (art, staging) => {
        fs.mkdirSync(path.join(staging, 'junk'), { recursive: true });
        fs.writeFileSync(path.join(staging, 'junk', 'x'), 'y');
        throw new Error('boom');
      };
      const probe = async () => '9.9.9';
      await assert.rejects(
        env.prepare('git', { download, extract, probe, force: true, evidence: EVIDENCE }),
        /boom/);
      assert.strictEqual(fs.readFileSync(marker, 'utf8'), 'OLD', '旧运行时必须保留');
      assert.deepStrictEqual(stagingLeftovers(wd), [], 'staging 必须清掉');
    } finally { cleanup(wd); }
  });

  await t('输出目录是符号链接时拒绝(避免写到别处)', async () => {
    const wd = fresh(); const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'private-env-out-'));
    try {
      const rt = path.join(wd, 'runtimes');
      fs.mkdirSync(rt, { recursive: true });
      const link = path.join(rt, 'git');
      try { fs.symlinkSync(elsewhere, link, 'junction'); }
      catch (e) { console.log('  (跳过: 当前环境不允许建链接 ' + e.code + ')'); return; }
      await assert.rejects(
        env.prepare('git', { force: true, evidence: EVIDENCE, download: async () => ({ path: 'x' }) }),
        /符号链接/);
      fs.rmSync(link, { recursive: true, force: true });
    } finally { cleanup(wd); cleanup(elsewhere); }
  });

  // ---- 真包验证:只写临时 workDir,不改系统 ------------------------------------
  const gitPkg = path.join(REPO, 'work', 'runtime-verification', 'git.7z.exe');
  const pyPkg = path.join(REPO, 'work', 'runtime-verification', 'python.zip');
  const skipReal = process.env.AI_SETUP_PRIVATE_ENV_SKIP_REAL === '1';

  if (skipReal || !fs.existsSync(gitPkg) || !fs.existsSync(pyPkg)) {
    console.log('skip - 真包验证（缺包或 AI_SETUP_PRIVATE_ENV_SKIP_REAL=1）');
  } else {
    await t('真包: git 便携包解压启动(2.56)', async () => {
      const wd = fresh();
      try {
        const download = async (url, dir, o) => ({ path: gitPkg, size: fs.statSync(gitPkg).size, sha256: o.expectedSha });
        const r = await env.prepare('git', { download, force: true, onEvent: () => {} });
        assert.strictEqual(r.mode, 'installed');
        assert.ok(/^2\.56\./.test(r.version), '实测版本: ' + r.version);
        const p = await env.probe('git');
        assert.strictEqual(p.installed, true);
        assert.strictEqual(p.version, r.version);
        assert.deepStrictEqual(stagingLeftovers(wd), []);
      } finally { cleanup(wd); }
    });

    await t('真包: python 官方 zip 解压启动(3.13.12)', async () => {
      const wd = fresh();
      try {
        const download = async (url, dir, o) => ({ path: pyPkg, size: fs.statSync(pyPkg).size, sha256: o.expectedSha });
        const r = await env.prepare('python', { download, force: true, onEvent: () => {} });
        assert.strictEqual(r.mode, 'installed');
        assert.strictEqual(r.version, '3.13.12');
        const p = await env.probe('python');
        assert.strictEqual(p.installed, true);
        assert.strictEqual(p.version, '3.13.12');
        assert.deepStrictEqual(stagingLeftovers(wd), []);
      } finally { cleanup(wd); }
    });
  }

  console.log('\n' + passed + ' passed');
})();
