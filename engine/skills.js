// skills.js — 技能库:配装、版本、更新与回滚
//
// 安全边界:
//   · 技能名必须匹配白名单正则,来源文件不得是符号链接。
//   · 只从随包快照(或用户通过系统对话框选定的**本地**技能包)读取,
//     绝不从网络下载未知技能。
//   · 更新前记录旧版本到 workDir/backups/skills/,被用户改过的文件一律保留。
//   · 记录文件与密钥分开(密钥只在 ~/.dsh/.env),这里只存版本台账。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const agent = require('./agent');
// 随包技能目录:catalog.json 的开发期位置是 ../app/skill-library;打包进 app.asar 后
// skill-library 落在 asar 根(相对 engine 是 ../skill-library)。以前只写了开发期那一条,
// 装机版里解析成 app.asar/app/skill-library(不存在)→ 技能库和任务场景两步全失败。
// 逐个探测,取真正有 catalog.json 的那个。
const library = [
  path.join(__dirname, 'skill-library'),
  path.join(__dirname, '..', 'app', 'skill-library'),
  path.join(__dirname, '..', 'skill-library'),
].find((dir) => fs.existsSync(path.join(dir, 'catalog.json')))
  || path.join(__dirname, '..', 'app', 'skill-library');

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_BYTES = 512 * 1024;        // 单个 SKILL.md 上限
const MAX_PACKAGE_ENTRIES = 500;           // 一个本地技能包的条目上限
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024; // 一个本地技能包内容总量上限

function safeDirectory(dir) {
  const absolute = path.resolve(dir);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('技能目录使用了链接，请选择普通目录');
  }
  return absolute;
}

// 逐级检查一条路径的**每一段**(含祖先)是否为符号链接/联接。
// 只查最后一级挡不住祖先 junction,所以这里从盘符根往下走。
function assertNoLinks(absolute, what) {
  const resolved = path.resolve(absolute);
  const rootPath = path.parse(resolved).root;
  let current = rootPath;
  for (const part of resolved.slice(rootPath.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch { continue; }
    if (stat.isSymbolicLink()) throw new Error((what || '技能目录') + '包含链接，已拒绝');
  }
  return resolved;
}

// 校验 SKILL.md 的 YAML 头:必须有 name(安全目录名)与 description,
// 且 name 必须等于实际目录名 —— 否则会出现"装上了但 Harness 不认"的怪状态。
function parseSkillFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const line = (key) => {
    const mm = new RegExp('^' + key + ':[ \\t]*(.*)$', 'm').exec(m[1]);
    if (!mm) return '';
    return mm[1].trim().replace(/^["']|["']$/g, '');
  };
  return { name: line('name'), description: line('description') };
}
function validateSkillContent(content, dirName) {
  if (content.length > MAX_SKILL_BYTES) throw new Error('技能文件超过大小上限');
  const fm = parseSkillFrontMatter(content.toString('utf8'));
  if (!fm || !fm.name) throw new Error('技能缺少 YAML name');
  if (!NAME_RE.test(fm.name)) throw new Error('技能 YAML name 不是安全的目录名');
  if (fm.name !== dirName) throw new Error('技能 YAML name 与目录名不一致，Harness 可能不识别');
  if (!fm.description) throw new Error('技能缺少 YAML description');
}

function catalog(root = library) {
  return JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
}

function fileHash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

// 版本台账:每个已装技能的来源哈希,用来判断"更新了没/用户改过没"。
function recordsPath(home) { return path.join(home, '.ai-setup-skills.json'); }
function readRecords(home) {
  try { const r = JSON.parse(fs.readFileSync(recordsPath(home), 'utf8')); return r && typeof r === 'object' ? r : {}; }
  catch { return {}; }
}
function writeRecords(home, records) {
  const file = recordsPath(home);
  const temporary = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(records, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

function list(home = config.dshHome(), root = library) {
  return catalog(root).map(item => ({ ...item, installed: fs.existsSync(path.join(home, 'skills', item.name, 'SKILL.md')) }));
}

function install(ids, home = config.dshHome(), root = library) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string')) throw new Error('每次请选择 1 到 50 个技能');
  return applyEntries(resolveEntries(ids, root), home, root);
}

// 一次性把整本目录装进原生技能根。装机专用:不做 50 条上限(用户没在"选",
// 是装机器在铺满 538 个),其余校验与 install 完全一致 —— 同名已存在就保留。
function seedAll(home = config.dshHome(), root = library) {
  const entries = catalog(root);
  const ids = entries.map(entry => entry.id);
  return applyEntries(resolveEntries(ids, root), home, root);
}

function resolveEntries(ids, root) {
  const entries = catalog(root);
  return [...new Set(ids)].map(id => {
    const item = entries.find(entry => entry.id === id);
    if (!item || !NAME_RE.test(item.name)) throw new Error('所选技能不存在，请刷新列表');
    return item;
  });
}

function applyEntries(selected, home, root) {
  const targetRoot = safeDirectory(path.join(home, 'skills'));
  fs.mkdirSync(targetRoot, { recursive: true });
  const records = readRecords(home);
  let changed = false;
  const results = selected.map(item => {
    const target = path.join(targetRoot, item.name);
    if (fs.existsSync(target)) return { id: item.id, ok: false, skipped: true, message: '已有同名技能，保留原文件' };
    const sourceDir = assertNoLinks(path.join(root, item.name), '技能来源');
    const source = path.join(sourceDir, 'SKILL.md');
    if (fs.lstatSync(source).isSymbolicLink()) throw new Error('技能来源文件不正确');
    const content = fs.readFileSync(source);
    if (crypto.createHash('sha256').update(content).digest('hex') !== item.sha256) throw new Error('技能文件校验失败，请重新安装与风AI助手');
    validateSkillContent(content, item.name);
    const staging = fs.mkdtempSync(path.join(targetRoot, '.ai-skill-'));
    try {
      fs.writeFileSync(path.join(staging, 'SKILL.md'), content);
      if (fs.existsSync(target)) return { id: item.id, ok: false, skipped: true, message: '已有同名技能，保留原文件' };
      fs.renameSync(staging, target);
      records[item.name] = { name: item.name, id: item.id, sha256: item.sha256, source: 'catalog', installedAt: new Date().toISOString() };
      changed = true;
      return { id: item.id, ok: true, message: '安装成功' };
    } finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); }
  });
  if (changed) writeRecords(home, records);
  return results;
}

// 状态:每个技能装了没、更新了没、是否被用户改过。
function status(home = config.dshHome(), root = library) {
  const records = readRecords(home);
  return catalog(root).map(item => {
    const file = path.join(home, 'skills', item.name, 'SKILL.md');
    const installed = fs.existsSync(file);
    if (!installed) return { id: item.id, name: item.name, title: item.title, installed: false, updateAvailable: false, modified: false };
    const current = fileHash(file);
    const rec = records[item.name];
    const modified = rec ? current !== rec.sha256 : current !== item.sha256;
    const updateAvailable = rec ? rec.sha256 !== item.sha256 : false;
    return {
      id: item.id, name: item.name, title: item.title, installed: true,
      modified, unrecorded: !rec, updateAvailable,
      installedAt: rec ? rec.installedAt : null, canRollback: !!(rec && rec.previous),
    };
  });
}

function backupOldSkill(home, name) {
  const dir = path.join(agent.workDir(), 'backups', 'skills', name + '-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(home, 'skills', name, 'SKILL.md'), path.join(dir, 'SKILL.md'));
  return dir;
}

// 更新:只更新"未被用户改动"的技能。被改过的保留原文件,如实报冲突。
// 不提供 force —— 覆盖用户改动没有正当理由,真需要就自己改回去。
function update(ids, home = config.dshHome(), root = library) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw new Error('每次请选择 1 到 50 个技能');
  const entries = catalog(root);
  const records = readRecords(home);
  let changed = false;
  const results = [...new Set(ids)].map(id => {
    const item = entries.find(e => e.id === id);
    if (!item) return { id, ok: false, message: '技能不存在，请刷新' };
    const targetDir = assertNoLinks(path.join(home, 'skills', item.name), '技能目录');
    const file = path.join(targetDir, 'SKILL.md');
    if (!fs.existsSync(file)) return { id, ok: false, message: '还没安装这个技能' };
    const rec = records[item.name];
    const current = fileHash(file);
    const modified = rec ? current !== rec.sha256 : current !== item.sha256;
    if (modified) return { id, ok: false, conflict: true, message: '技能已被你修改，已保留原文件，未更新' };
    if (!rec) return { id, ok: false, conflict: true, message: '缺少版本记录，为避免覆盖你的改动，未更新' };
    const sourceDir = assertNoLinks(path.join(root, item.name), '技能来源');
    const source = path.join(sourceDir, 'SKILL.md');
    if (fs.lstatSync(source).isSymbolicLink()) return { id, ok: false, message: '技能来源不正确' };
    const content = fs.readFileSync(source);
    if (crypto.createHash('sha256').update(content).digest('hex') !== item.sha256) return { id, ok: false, message: '技能文件校验失败' };
    validateSkillContent(content, item.name);
    const backup = backupOldSkill(home, item.name);
    fs.writeFileSync(file, content);
    records[item.name] = { ...(rec || { name: item.name, id: item.id }), sha256: item.sha256, source: 'catalog', updatedAt: new Date().toISOString(), previous: backup };
    changed = true;
    return { id, ok: true, message: '已更新到最新版本（旧版本已备份，可回滚）' };
  });
  if (changed) writeRecords(home, records);
  return results;
}

// 回滚:恢复到更新前的版本。当前文件必须仍是我们更新时写的那份(哈希相等),
// 否则说明用户后来又改过 —— 保留用户改动,拒绝回滚。
function rollback(name, home = config.dshHome()) {
  if (!NAME_RE.test(name || '')) throw new Error('技能名不正确');
  const records = readRecords(home);
  const rec = records[name];
  if (!rec || !rec.previous) throw new Error('这个技能没有可回滚的版本');
  const targetDir = assertNoLinks(path.join(home, 'skills', name), '技能目录');
  const target = path.join(targetDir, 'SKILL.md');
  if (!fs.existsSync(target)) throw new Error('技能文件已不在，无法回滚');
  if (rec.sha256 && fileHash(target) !== rec.sha256) throw new Error('技能在更新后又被你修改过，已保留当前文件，未回滚');
  const backupDir = assertNoLinks(rec.previous, '旧版本备份');
  const backupFile = path.join(backupDir, 'SKILL.md');
  if (!fs.existsSync(backupFile)) throw new Error('旧版本备份已不在，无法回滚');
  const content = fs.readFileSync(backupFile);
  validateSkillContent(content, name);
  fs.writeFileSync(target, content);
  records[name] = { ...rec, sha256: fileHash(target), rolledBackAt: new Date().toISOString(), previous: null };
  writeRecords(home, records);
  return { ok: true, name, message: '已回滚到上一版本' };
}

// 导入本地技能包:用户通过系统对话框选定的文件夹,内含 catalog.json + 各技能目录。
// 严格校验:名字白名单、路径落在包内、无符号链接、逐文件 sha256 必须匹配。
function importPackage(pkgDir, home = config.dshHome(), { label = '' } = {}) {
  const base = safeDirectory(pkgDir);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw new Error('技能包路径不正确');
  const catalogFile = path.join(base, 'catalog.json');
  if (!fs.existsSync(catalogFile) || fs.lstatSync(catalogFile).isSymbolicLink()) throw new Error('技能包缺少有效的 catalog.json');
  let entries;
  try { entries = JSON.parse(fs.readFileSync(catalogFile, 'utf8')); } catch { throw new Error('技能包的 catalog.json 无法解析'); }
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_PACKAGE_ENTRIES) throw new Error('技能包清单不正确');

  const targetRoot = safeDirectory(path.join(home, 'skills'));
  fs.mkdirSync(targetRoot, { recursive: true });
  const records = readRecords(home);
  const applied = [], conflicts = [], skipped = [];
  let changed = false;
  let totalBytes = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !NAME_RE.test(entry.name) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      skipped.push({ name: entry && entry.name || '(未知)', message: '条目格式不正确' });
      continue;
    }
    const source = path.join(base, entry.name, 'SKILL.md');
    // 路径必须落在包内,且源目录每一级都不能是链接
    if (!path.resolve(source).startsWith(base + path.sep)) { skipped.push({ name: entry.name, message: '路径超出技能包' }); continue; }
    let sourceDir;
    try { sourceDir = assertNoLinks(path.join(base, entry.name), '技能包来源'); }
    catch (e) { skipped.push({ name: entry.name, message: e.message }); continue; }
    if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) { skipped.push({ name: entry.name, message: '文件缺失' }); continue; }
    const content = fs.readFileSync(path.join(sourceDir, 'SKILL.md'));
    if (content.length > MAX_SKILL_BYTES) { skipped.push({ name: entry.name, message: '技能文件超过大小上限' }); continue; }
    totalBytes += content.length;
    if (totalBytes > MAX_PACKAGE_BYTES) { skipped.push({ name: entry.name, message: '技能包内容超过总量上限' }); break; }
    if (crypto.createHash('sha256').update(content).digest('hex') !== entry.sha256) { skipped.push({ name: entry.name, message: '校验值不匹配，已跳过' }); continue; }
    try { validateSkillContent(content, entry.name); }
    catch (e) { skipped.push({ name: entry.name, message: '技能内容不合规：' + e.message }); continue; }
    let target;
    try { target = assertNoLinks(path.join(targetRoot, entry.name), '技能目录'); }
    catch (e) { skipped.push({ name: entry.name, message: e.message }); continue; }
    if (fs.existsSync(target)) {
      const currentFile = path.join(target, 'SKILL.md');
      const rec = records[entry.name];
      const current = fileHash(currentFile);
      const modified = rec ? current !== rec.sha256 : current !== entry.sha256;
      if (modified && !rec) { conflicts.push({ name: entry.name, message: '缺少版本记录且内容不同，已保留原文件' }); continue; }
      if (modified) { conflicts.push({ name: entry.name, message: '技能已被你修改，已保留原文件' }); continue; }
      fs.mkdirSync(target, { recursive: true });
      const backup = backupOldSkill(home, entry.name);
      fs.writeFileSync(currentFile, content);
      records[entry.name] = { ...(rec || { id: entry.id || entry.name }), name: entry.name, sha256: entry.sha256, source: 'package:' + (label || 'local'), updatedAt: new Date().toISOString(), previous: backup };
      applied.push({ name: entry.name, action: 'updated' });
    } else {
      const staging = fs.mkdtempSync(path.join(targetRoot, '.ai-skill-'));
      try {
        fs.writeFileSync(path.join(staging, 'SKILL.md'), content);
        fs.renameSync(staging, target);
      } finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); }
      records[entry.name] = { name: entry.name, id: entry.id || entry.name, sha256: entry.sha256, source: 'package:' + (label || 'local'), installedAt: new Date().toISOString() };
      applied.push({ name: entry.name, action: 'installed' });
    }
    changed = true;
  }
  if (changed) writeRecords(home, records);
  return { label: label || 'local', total: entries.length, applied, conflicts, skipped, records: recordsPath(home) };
}

module.exports = { list, install, seedAll, catalog, status, update, rollback, importPackage, recordsPath, readRecords };

// 自检(纯本机)
if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  const oldWork = process.env.AI_SETUP_WORK;
  process.env.AI_SETUP_WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-work-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-home-'));
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-pkg-'));
  try {
    const items = catalog();
    assert.strictEqual(items.length, 538);
    const first = items[0];
    // 配装 → 有版本记录
    assert.strictEqual(install([first.id], home)[0].ok, true);
    assert.ok(readRecords(home)[first.name], '安装后要有版本记录');
    // 用户改动 → 更新报冲突且不改文件
    const file = path.join(home, 'skills', first.name, 'SKILL.md');
    fs.writeFileSync(file, 'USER EDIT');
    const blocked = update([first.id], home)[0];
    assert.ok(blocked.conflict, '被改过要报冲突');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'USER EDIT');
    // 未改动 → 更新成功且能回滚
    const second = items[1];
    install([second.id], home);
    const target = path.join(home, 'skills', second.name, 'SKILL.md');
    const original = fs.readFileSync(target, 'utf8');
    const res = update([second.id], home)[0];
    assert.ok(res.ok, '未改动的技能应可更新');
    // 更新后又改 → 回滚必须拒绝,保护用户改动
    fs.writeFileSync(target, 'EDIT AFTER UPDATE');
    assert.throws(() => rollback(second.name, home), /又被你修改/);
    fs.writeFileSync(target, original); // 放回未改动的版本,回滚才应放行
    assert.strictEqual(rollback(second.name, home).ok, true);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), original, '回滚要还原内容');
    // 本地技能包:名字白名单 + sha256 严格校验 + YAML name 必须匹配目录名
    const name = 'library-' + crypto.randomBytes(4).toString('hex') + '0'.repeat(14);
    const content = Buffer.from('---\nname: ' + name + '\ndescription: 测试技能\n---\nBODY\n');
    const sha = crypto.createHash('sha256').update(content).digest('hex');
    fs.mkdirSync(path.join(pkg, name), { recursive: true });
    fs.writeFileSync(path.join(pkg, name, 'SKILL.md'), content);
    fs.writeFileSync(path.join(pkg, 'catalog.json'), JSON.stringify([{ name, sha256: sha }]));
    const imported = importPackage(pkg, home, { label: 'test' });
    assert.strictEqual(imported.applied.length, 1);
    assert.ok(fs.existsSync(path.join(home, 'skills', name, 'SKILL.md')));
    // YAML name 与目录名不符 → 跳过
    const badName = 'library-' + crypto.randomBytes(4).toString('hex') + '1'.repeat(14);
    const badContent = Buffer.from('---\nname: ' + name + '\ndescription: x\n---\nBODY\n');
    const badSha = crypto.createHash('sha256').update(badContent).digest('hex');
    fs.mkdirSync(path.join(pkg, badName), { recursive: true });
    fs.writeFileSync(path.join(pkg, badName, 'SKILL.md'), badContent);
    fs.writeFileSync(path.join(pkg, 'catalog.json'), JSON.stringify([{ name: badName, sha256: badSha }]));
    const mismatched = importPackage(pkg, home, {});
    assert.ok(mismatched.skipped.some(s => /name 与目录名/.test(s.message)), 'YAML name 不匹配必须被拒');
    // 篡改包 → 校验失败跳过
    const tamperName = name;
    fs.mkdirSync(path.join(pkg, tamperName), { recursive: true });
    fs.writeFileSync(path.join(pkg, tamperName, 'SKILL.md'), Buffer.from('---\nname: ' + tamperName + '\ndescription: x\n---\nTAMPERED'));
    fs.writeFileSync(path.join(pkg, 'catalog.json'), JSON.stringify([{ name: tamperName, sha256: sha }]));
    const bad = importPackage(pkg, home, {}).skipped;
    assert.ok(bad.some(s => /校验值/.test(s.message)), '篡改内容必须被拒');
    console.log('skills.js self-check OK（更新/回滚哈希保护/YAML校验/本地包严格校验）');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(pkg, { recursive: true, force: true });
    fs.rmSync(process.env.AI_SETUP_WORK, { recursive: true, force: true });
    if (oldWork === undefined) delete process.env.AI_SETUP_WORK; else process.env.AI_SETUP_WORK = oldWork;
  }
}
