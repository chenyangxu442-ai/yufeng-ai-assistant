// features.js — 0.5.0 新功能的证据测试(纯本机,不联网)
//
// 覆盖:文件预览令牌/应用/撤销(含被改动、被删除、部分撤销)、移动整理、台账故障与崩溃恢复、
//       任务持久化(含中文 catalog id)、技能更新冲突/回滚哈希保护/本地包 YAML 校验、
//       成本无内置价/未知模型不回落、场景与能力套餐、环境下载校验,以及这些能力在本地接口上的接线。
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-work-'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-home-'));
const savedEnv = { AI_SETUP_WORK: process.env.AI_SETUP_WORK, DSH_HOME: process.env.DSH_HOME };
process.env.AI_SETUP_WORK = work;
process.env.DSH_HOME = home;

let failed = 0;
async function check(name, run) {
  try { await run(); console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.stack || e && e.message)); }
}
function freshRequire(p) { delete require.cache[require.resolve(p)]; return require(p); }
function dir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'feat-dir-')); }

(async () => {
  const files = require('../engine/files');
  const tasks = require('../engine/tasks');
  const cost = require('../engine/cost');
  const presets = require('../engine/presets');
  const envmgr = require('../engine/envmgr');
  const harness = require('../engine/harness');
  const skills = require('../engine/skills');
  const store = require('../engine/store');

  // ── 文件:预览不改盘,必须拿令牌才能应用 ─────────────────
  await check('文件预览只读,应用必须带令牌', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'ORIGIN');
      const p = files.preview(d, [{ path: 'a.txt', content: 'NEW' }, { path: 'sub/b.txt', content: 'x' }]);
      assert.equal(p.items[0].action, 'overwrite');
      assert.equal(p.items[1].action, 'create');
      assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'ORIGIN', '预览不能改文件');
      assert.ok(!fs.existsSync(path.join(d, 'sub')), '预览不能建目录');
      assert.ok(p.token, '预览要给令牌');
      assert.throws(() => files.apply(undefined, { root: d }), /令牌/);
      const r = files.apply(p.token, { root: d });
      assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'NEW');
      // 同一令牌只能用一次
      assert.throws(() => files.apply(p.token, { root: d }), /过期|不存在/);
      const u = files.undo(r.txnId);
      assert.deepEqual(u.restored, ['a.txt']);
      assert.deepEqual(u.removed, ['sub/b.txt']);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  await check('预览后文件被改 → 应用拒绝', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'ORIGIN');
      const p = files.preview(d, [{ path: 'a.txt', content: 'NEW' }]);
      fs.writeFileSync(path.join(d, 'a.txt'), 'USER EDIT');
      assert.throws(() => files.apply(p.token, { root: d }), /改变了/);
      assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'USER EDIT');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  await check('撤销保护用户改动;被删除的目标报冲突不重建', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'ORIGIN');
      const p1 = files.preview(d, [{ path: 'a.txt', content: 'V2' }]);
      const r1 = files.apply(p1.token, { root: d });
      fs.writeFileSync(path.join(d, 'a.txt'), 'USER EDIT');
      const u1 = files.undo(r1.txnId);
      assert.deepEqual(u1.conflicts, ['a.txt'], '改过要报冲突');
      assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'USER EDIT', '不能覆盖用户改动');
      // 目标被用户删除 → 冲突,且不重建
      fs.writeFileSync(path.join(d, 'b.txt'), 'B');
      const p2 = files.preview(d, [{ path: 'b.txt', content: 'B2' }]);
      const r2 = files.apply(p2.token, { root: d });
      fs.rmSync(path.join(d, 'b.txt'));
      const u2 = files.undo(r2.txnId);
      assert.deepEqual(u2.conflicts, ['b.txt'], '被删除的目标要报冲突');
      assert.ok(!fs.existsSync(path.join(d, 'b.txt')), '不能擅自重建被删除的文件');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  await check('部分撤销:成功项落盘,再点不把已恢复的当冲突', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'A');
      fs.writeFileSync(path.join(d, 'b.txt'), 'B');
      const p = files.preview(d, [{ path: 'a.txt', content: 'A2' }, { path: 'b.txt', content: 'B2' }]);
      const r = files.apply(p.token, { root: d });
      fs.writeFileSync(path.join(d, 'b.txt'), 'B USER'); // b 被改
      const u = files.undo(r.txnId);
      assert.deepEqual(u.restored, ['a.txt']);
      assert.deepEqual(u.conflicts, ['b.txt']);
      assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'A');
      const u2 = files.undo(r.txnId); // 再点一次
      assert.deepEqual(u2.restored, [], '已恢复的 a 不能再被当冲突');
      assert.deepEqual(u2.conflicts, ['b.txt']);
      assert.equal(files.ledger().find(t => t.id === r.txnId).status, 'partial');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  await check('拒绝越界/别名/重复目标/符号链接', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'x');
      assert.throws(() => files.preview(d, [{ path: '../esc.txt', content: 'x' }]), /\.\.|超出/);
      assert.throws(() => files.preview(d, [{ path: 'C:/x.txt', content: 'x' }]), /盘符|绝对路径/);
      assert.throws(() => files.preview(d, [{ path: '/etc/passwd', content: 'x' }]), /盘符|绝对路径/);
      assert.throws(() => files.preview(d, [{ path: 'f.txt:ads', content: 'x' }]), /字符/);
      assert.throws(() => files.preview(d, [{ path: 'NUL', content: 'x' }]), /保留名/);
      assert.throws(() => files.preview(d, [{ path: 'tail.', content: 'x' }]), /点|空格/);
      assert.throws(() => files.preview(d, [{ path: 'dup.txt', content: '1' }, { path: 'DUP.txt', content: '2' }]), /重复/);
      let linked = false;
      try { fs.symlinkSync(path.join(d, 'a.txt'), path.join(d, 'link.txt'), 'file'); linked = true; } catch { /* 权限不足则跳过 */ }
      if (linked) assert.throws(() => files.preview(d, [{ path: 'link.txt', content: 'x' }]), /链接/);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  // ── 文件整理:按扩展名分组移动 + 撤销 ────────────────────
  await check('文件整理:按扩展名分组、默认不覆盖、可撤销', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'photo.PNG'), 'i');
      fs.writeFileSync(path.join(d, 'note.txt'), 't');
      fs.writeFileSync(path.join(d, 'noext'), 'n');
      fs.mkdirSync(path.join(d, 'sub'));
      const listing = files.listFolder(d);
      assert.ok(listing.entries.some(e => e.name === 'sub' && e.dir));
      const plan = files.groupByExtension(d);
      assert.equal(plan.ops.length, 2, '两个有扩展名的文件');
      assert.ok(plan.ops.some(o => o.to === '图片/photo.PNG'));
      assert.ok(plan.ops.some(o => o.to === '文档/note.txt'));
      assert.ok(plan.skipped.some(s => s.name === 'noext'));
      const mp = files.previewMoves(d, plan.ops);
      const r = files.apply(mp.token, { root: d, label: '整理' });
      assert.ok(fs.existsSync(path.join(d, '图片', 'photo.PNG')));
      const u = files.undo(r.txnId);
      assert.deepEqual(u.restored.sort(), ['note.txt', 'photo.PNG']);
      assert.ok(fs.existsSync(path.join(d, 'photo.PNG')));
      assert.ok(!fs.existsSync(path.join(d, '图片')), '撤销后应清掉空文件夹');
      // 目标已存在 → 默认不覆盖,预览即拒
      fs.writeFileSync(path.join(d, 'x.txt'), '1');
      fs.mkdirSync(path.join(d, '文档'), { recursive: true });
      fs.writeFileSync(path.join(d, '文档', 'x.txt'), '2');
      assert.throws(() => files.previewMoves(d, [{ from: 'x.txt', to: '文档/x.txt' }]), /不覆盖/);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  // ── 台账故障与崩溃恢复 ──────────────────────────────────
  await check('台账写失败 → 应用拒绝且不动文件(写入前先落盘)', () => {
    const d = dir();
    const origWrite = store.write;
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'ORIGIN');
      const p = files.preview(d, [{ path: 'a.txt', content: 'NEW' }]);
      store.write = () => { throw new Error('磁盘写失败'); };
      assert.throws(() => files.apply(p.token, { root: d }), /磁盘写失败/);
      assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'ORIGIN', 'ledger 写不了就绝不能动文件');
    } finally { store.write = origWrite; fs.rmSync(d, { recursive: true, force: true }); }
  });

  await check('崩溃恢复:按 pending 事务把文件还原,并清掉备份', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'ORIGINAL');
      const txnId = 'crash01';
      const backup = path.join(work, 'backups', txnId);
      fs.mkdirSync(backup, { recursive: true });
      fs.writeFileSync(path.join(backup, 'a.txt'), 'ORIGINAL'); // 备份=原始内容
      fs.writeFileSync(path.join(d, 'a.txt'), 'HALF-WRITTEN');   // 模拟崩溃时已写入的新内容
      const sha = crypto.createHash('sha256').update('HALF-WRITTEN').digest('hex');
      store.write('file-ledger', [{ id: txnId, createdAt: new Date().toISOString(), label: '崩溃', root: d, status: 'pending', undone: false,
        items: [{ rel: 'a.txt', action: 'overwrite', backupRel: 'a.txt', sha256: sha, originalSha256: null, restored: false, removedDone: false }] }]);
      const report = files.recover();
      assert.ok(report.some(r => r.id === txnId && r.status === 'recovered'), '应报告已恢复');
      assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'ORIGINAL', '应还原原始内容');
      assert.ok(!fs.existsSync(backup), '恢复成功后备份应清理');
    } finally { store.write('file-ledger', []); fs.rmSync(d, { recursive: true, force: true }); }
  });

  await check('恢复不成功 → 不删唯一备份并标记 recovery-failed', () => {
    const d = dir();
    try {
      fs.writeFileSync(path.join(d, 'a.txt'), 'HALF');
      const txnId = 'crash02';
      const backup = path.join(work, 'backups', txnId);
      fs.mkdirSync(backup, { recursive: true }); // 故意不放备份文件 → 无法还原
      const sha = crypto.createHash('sha256').update('HALF').digest('hex');
      store.write('file-ledger', [{ id: txnId, createdAt: new Date().toISOString(), label: '崩溃', root: d, status: 'pending', undone: false,
        items: [{ rel: 'a.txt', action: 'overwrite', backupRel: 'a.txt', sha256: sha, originalSha256: null, restored: false, removedDone: false }] }]);
      const report = files.recover();
      assert.ok(report.some(r => r.id === txnId), '应报告该事务');
      assert.ok(fs.existsSync(backup), '恢复失败绝不能删备份');
      assert.equal(files.ledger().find(t => t.id === txnId).status, 'recovery-failed');
    } finally { store.write('file-ledger', []); fs.rmSync(d, { recursive: true, force: true }); }
  });

  // ── 任务持久化(含中文 catalog id) ──────────────────────
  await check('任务保存/更新/删除持久化,接受真实中文 id', () => {
    const cn = skills.catalog().find(x => /[^\x00-\x7f]/.test(x.id));
    assert.ok(cn, '快照里应有中文 id');
    const t = tasks.save({ title: '周报', scenario: 'writing', prompt: '帮我写周报', skillIds: [cn.id, cn.id] });
    assert.deepEqual(t.skillIds, [cn.id], '中文 id 去重且被接受');
    const reloaded = freshRequire('../engine/tasks');
    assert.equal(reloaded.list().length, 1, '重新加载后仍在');
    reloaded.save({ id: t.id, title: '周报2', scenario: 'writing', prompt: '改一下' });
    assert.equal(reloaded.list().length, 1, '同 id 是更新');
    assert.equal(reloaded.remove(t.id).removed, 1);
    assert.equal(reloaded.list().length, 0);
    assert.throws(() => reloaded.save({ title: 'x', prompt: 'y', skillIds: ['../evil'] }), /技能选择不正确/);
    assert.throws(() => reloaded.save({ title: 'x', prompt: 'y', skillIds: ['不存在的id'] }), /技能选择不正确/);
  });

  // ── 技能:更新冲突 + 回滚哈希保护 + 本地包 YAML 校验 ──────
  await check('技能更新冲突保留;更新后改动则拒绝回滚', () => {
    const items = skills.catalog();
    const pkgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-skill-'));
    try {
      skills.install([items[0].id, items[1].id], pkgHome);
      const f0 = path.join(pkgHome, 'skills', items[0].name, 'SKILL.md');
      fs.writeFileSync(f0, 'USER EDIT');
      assert.ok(skills.update([items[0].id], pkgHome)[0].conflict, '改过的要冲突');
      assert.equal(fs.readFileSync(f0, 'utf8'), 'USER EDIT');
      const f1 = path.join(pkgHome, 'skills', items[1].name, 'SKILL.md');
      assert.ok(skills.update([items[1].id], pkgHome)[0].ok, '未改的可更新');
      fs.writeFileSync(f1, 'EDIT AFTER UPDATE');
      assert.throws(() => skills.rollback(items[1].name, pkgHome), /又被你修改/);
      assert.equal(fs.readFileSync(f1, 'utf8'), 'EDIT AFTER UPDATE', '不能回滚覆盖用户改动');
    } finally { fs.rmSync(pkgHome, { recursive: true, force: true }); }
  });

  await check('本地技能包:sha256 + YAML name 校验,篡改/不匹配被拒', () => {
    const pkgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-skhome-'));
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-pkg-'));
    try {
      const name = 'library-' + crypto.randomBytes(4).toString('hex') + '0'.repeat(14);
      const content = Buffer.from('---\nname: ' + name + '\ndescription: 测试\n---\nBODY\n');
      const sha = crypto.createHash('sha256').update(content).digest('hex');
      fs.mkdirSync(path.join(pkg, name), { recursive: true });
      fs.writeFileSync(path.join(pkg, name, 'SKILL.md'), content);
      fs.writeFileSync(path.join(pkg, 'catalog.json'), JSON.stringify([{ name, sha256: sha }]));
      assert.equal(skills.importPackage(pkg, pkgHome, { label: 't' }).applied.length, 1);
      // YAML name 与目录名不符 → 跳过
      const badName = 'library-' + crypto.randomBytes(4).toString('hex') + '1'.repeat(14);
      const badContent = Buffer.from('---\nname: ' + name + '\ndescription: x\n---\nBODY\n');
      fs.mkdirSync(path.join(pkg, badName), { recursive: true });
      fs.writeFileSync(path.join(pkg, badName, 'SKILL.md'), badContent);
      fs.writeFileSync(path.join(pkg, 'catalog.json'), JSON.stringify([{ name: badName, sha256: crypto.createHash('sha256').update(badContent).digest('hex') }]));
      assert.ok(skills.importPackage(pkg, pkgHome, {}).skipped.some(s => /name 与目录名/.test(s.message)));
      // 篡改内容 → 校验失败
      fs.writeFileSync(path.join(pkg, name, 'SKILL.md'), Buffer.from('---\nname: ' + name + '\ndescription: x\n---\nTAMPERED'));
      fs.writeFileSync(path.join(pkg, 'catalog.json'), JSON.stringify([{ name, sha256: sha }]));
      assert.ok(skills.importPackage(pkg, pkgHome, {}).skipped.some(s => /校验值/.test(s.message)));
    } finally { fs.rmSync(pkgHome, { recursive: true, force: true }); fs.rmSync(pkg, { recursive: true, force: true }); }
  });

  // ── 成本:无内置价,未知模型不回落 ───────────────────────
  await check('成本:无单价即未定价;未知模型不回落;手动用量估算', () => {
    const b = freshRequire('../engine/cost');
    assert.equal(b.getConfig().priceConfigured, false, '默认没有单价');
    assert.equal(b.estimate({ scenario: 'website' }).cost, null, '没单价预估必须为空');
    assert.equal(b.estimate({ model: 'unknown-x' }).cost, null, '未知模型不能按其它价算');
    b.setConfig({ rates: { 'deepseek-chat': { inPerM: 2, outPerM: 8 } } });
    assert.equal(b.getConfig().priceConfigured, true);
    const u = b.record({ tokensIn: 1e6, tokensOut: 0, model: 'deepseek-chat' });
    assert.equal(u.cost, 2);
    assert.equal(u.kind, 'manual');
    assert.equal(b.record({ tokensIn: 1e6, tokensOut: 0, model: 'unknown-x' }).cost, null, '未知模型记录也应为空');
    b.estimate({ scenario: 'writing' }); // 有了单价后的预估才应计入
    const s = b.summary();
    assert.ok(s.estimateTotal > 0 && s.manualTotal >= 2, '预估与手动用量分开');
    assert.equal(s.usageSource, 'unavailable', '没有真实用量来源要如实标注');
    assert.ok(s.unpricedCount >= 1, '未定价条目要计数');
    b.setConfig({ monthlyBudget: 2 });
    assert.equal(b.summary().alert, 'over');
    b.setConfig({ monthlyBudget: 2.4 });
    assert.equal(b.summary().alert, 'warn');
    // 清空单价 → 回到未定价
    b.setConfig({ rates: {} });
    assert.equal(b.getConfig().priceConfigured, false);
    assert.equal(b.summary().manualTotal, null, '没有单价时手动总量标为不可用,不折算金额');
  });

  // ── 场景与能力套餐 ──────────────────────────────────────
  await check('场景向导:4 场景;套餐:办公/求职/网页候选且未做效果实测', () => {
    const all = presets.list();
    assert.deepEqual(all.map(p => p.id), ['writing', 'spreadsheet', 'website', 'files']);
    for (const p of all) assert.ok(p.skills.length > 0 && p.examples.length > 0);
    assert.ok(all.find(p => p.id === 'website').prereq.some(x => x.key === 'git'));
    const packs = presets.listPacks();
    assert.deepEqual(packs.map(p => p.id), ['office', 'job', 'website']);
    for (const pack of packs) {
      assert.equal(pack.missingCount, 0, pack.id + ' 的精选技能都要在快照里');
      assert.equal(pack.effectTested, false, '不得声称效果实测');
      assert.ok(pack.skills.length >= 5 && pack.examples.length > 0);
    }
    assert.ok(packs.find(p => p.id === 'website').dependencies.some(d => d.key === 'git'));
  });

  // ── 环境:校验下载 / 移交 ────────────────────────────────
  await check('环境准备:sha256 校验,失败删除,相符通过;商店占位不算已装', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-dl-'));
    try {
      const body = Buffer.from('installer-bytes');
      const good = crypto.createHash('sha256').update(body).digest('hex');
      const fakeFetch = async () => ({ ok: true, headers: { get: () => String(body.length) }, body: (async function* () { yield body; })() });
      await assert.rejects(envmgr.download('https://x/git.exe', d, { fetchImpl: fakeFetch, expectedSha: 'b'.repeat(64) }), /校验失败/);
      assert.equal(fs.readdirSync(d).length, 0, '校验失败要删文件');
      assert.equal((await envmgr.download('https://x/git.exe', d, { fetchImpl: fakeFetch, expectedSha: good })).sha256, good);
      assert.throws(() => envmgr.plan('nope'), /不支持/);
      // WindowsApps 占位入口不能当已安装
      assert.ok(envmgr.SPECS.python, 'python 规格应存在');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  // ── 交接:如实说明不代执行 ───────────────────────────────
  await check('交接:生成提示词并复制,明确不代执行', async () => {
    let clip = null;
    const r = await harness.copy({ title: '周报', scenario: 'writing', prompt: '帮我写周报', skillNames: ['标题生成器'] }, { clipboard: { writeText: t => { clip = t; } } });
    assert.match(r.prompt, /场景：写作/);
    assert.match(r.prompt, /标题生成器/);
    assert.match(r.honesty, /不会代你执行任务/);
    assert.equal(clip, r.prompt);
    await assert.rejects(harness.copy({ prompt: 'x' }, {}), /安装版/);
  });

  // ── 本地接口接线(注入系统对话框替身) ────────────────────
  await check('本地接口:令牌应用、整理、任务、成本、交接、环境', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-http-'));
    let clip = null;
    const native = {
      pickFolder: async () => d,
      clipboard: { writeText: t => { clip = t; } },
      openExternal: async () => {}, launchInstaller: async () => true,
    };
    const { server, port } = await require('../app/server').createServer({ native });
    const base = 'http://127.0.0.1:' + port;
    const call = async (p, body) => {
      const r = await fetch(base + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    };
    try {
      assert.equal((await call('/api/files/apply', { token: 'x' })).status, 400, '未选目录不能写');
      assert.equal((await call('/api/files/pick', {})).data.ok, true);
      // 无令牌不能应用
      assert.equal((await call('/api/files/apply', { ops: [{ path: 'x.txt', content: '1' }] })).status, 400);
      const prev = await call('/api/files/preview', { ops: [{ path: 'x.txt', content: 'hello' }] });
      assert.equal(prev.status, 200);
      assert.equal(prev.data.items[0].action, 'create');
      const applied = await call('/api/files/apply', { token: prev.data.token, label: 'T' });
      assert.equal(applied.status, 200);
      assert.equal(fs.readFileSync(path.join(d, 'x.txt'), 'utf8'), 'hello');
      assert.equal((await call('/api/files/undo', { txnId: applied.data.txnId })).data.removed.length, 1);
      assert.ok(!fs.existsSync(path.join(d, 'x.txt')));
      // 整理:列出 + 移动预览 + 应用
      fs.writeFileSync(path.join(d, 'p.png'), 'i');
      const org = await call('/api/files/organize', {});
      assert.equal(org.status, 200);
      assert.ok(org.data.ops.some(o => o.to === '图片/p.png'));
      const mp = await call('/api/files/move-preview', { ops: org.data.ops });
      assert.ok(mp.data.token);
      const mr = await call('/api/files/apply', { token: mp.data.token, label: '整理' });
      assert.ok(fs.existsSync(path.join(d, '图片', 'p.png')));
      await call('/api/files/undo', { txnId: mr.data.txnId });
      // 任务往返
      const savedTask = await call('/api/tasks/save', { title: 'T', scenario: 'files', prompt: '整理文件' });
      assert.equal(savedTask.status, 200);
      assert.ok((await call('/api/tasks')).data.items.some(t => t.id === savedTask.data.task.id));
      // 交接复制
      assert.equal((await call('/api/harness/copy', { title: 'T', prompt: '整理文件' })).data.copied, true);
      assert.ok(clip);
      // 成本:先配价,未定价模型仍为空
      await call('/api/cost/config', { rates: { 'deepseek-chat': { inPerM: 1, outPerM: 1 } }, monthlyBudget: 0 });
      assert.equal((await call('/api/cost/record', { tokensIn: 1e6, tokensOut: 0, model: 'deepseek-chat' })).data.entry.cost, 1);
      assert.equal((await call('/api/cost/record', { tokensIn: 1e6, tokensOut: 0, model: 'nope-x' })).data.entry.cost, null);
      assert.ok((await call('/api/cost')).data.summary.manualTotal >= 1);
      assert.equal((await call('/api/presets')).data.items.length, 4);
      assert.equal((await call('/api/presets')).data.packs.length, 3);
      assert.ok((await call('/api/env')).data.items.length === 2);
      // 无系统对话框的开发模式下,导入应给出明确提示而非崩溃
      const devMod = await require('../app/server').createServer();
      const r2 = await fetch('http://127.0.0.1:' + devMod.port + '/api/files/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(r2.status, 503, '缺少系统对话框要明确回报');
      await new Promise(res => devMod.server.close(res));
    } finally {
      await new Promise(res => server.close(res));
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  // ── 密钥不落状态库 ──────────────────────────────────────
  await check('状态目录不含密钥字样', () => {
    const stateDir = path.join(work, 'state');
    if (!fs.existsSync(stateDir)) return;
    for (const file of fs.readdirSync(stateDir)) {
      const text = fs.readFileSync(path.join(stateDir, file), 'utf8');
      assert.ok(!/sk-[A-Za-z0-9_-]{6,}/.test(text), file + ' 不应包含密钥');
      assert.ok(!/DEEPSEEK_API_KEY/.test(text), file + ' 不应包含密钥名');
    }
  });

  console.log('Feature failures: ' + failed);
  if (savedEnv.AI_SETUP_WORK === undefined) delete process.env.AI_SETUP_WORK; else process.env.AI_SETUP_WORK = savedEnv.AI_SETUP_WORK;
  if (savedEnv.DSH_HOME === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = savedEnv.DSH_HOME;
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
