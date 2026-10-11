// files.js — 文件操作:先预览(拿到令牌),再由令牌应用,可撤销
//
// 安全边界(都是真机踩过的坑,别省):
//   · 只能写进用户通过系统对话框选定的"批准目录",绝不接受网页传来的任意路径。
//   · 批准目录**每一级**祖先都不能是符号链接/联接,否则会被引到目录外。
//   · 相对路径逐段校验:拒绝 ../、盘符、绝对路径、Windows ADS 冒号、设备名
//     (CON/PRN/NUL/COM1 等)、结尾的点或空格、非法字符。
//   · 同一批目标不允许重复(区分大小写不敏感),避免把原始备份互相覆盖。
//   · 预览产出一次性令牌;应用只接受令牌,不接受新内容;若文件在预览后变了 → 拒绝。
//   · 应用前先把 pending 事务落盘,再写文件;中途失败按 pending 回滚,失败不删唯一备份。
//   · 撤销前若发现文件被用户改过(哈希对不上)或已被删除 → 保留用户数据,如实报冲突。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const agent = require('./agent');

const LEDGER = 'file-ledger';
const MAX_OPS = 200;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TXN = 100;
const MAX_PREVIEWS = 60;
const PREVIEW_TTL_MS = 30 * 60 * 1000;

// 预览令牌缓存:令牌 → 计划(含内容与原始哈希)。只活在内存里,重启即失效。
const previewCache = new Map();

// Windows 保留设备名(含带扩展名的形式),这些名字在任何一级目录里都是别名陷阱。
const DEVICE_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// Windows 非法字符:冒号(ADS/数据流)、尖括号、竖线、问号、星号;控制字符另行判定。
const BAD_CHARS = /[<>:"|?*]/;

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

// 逐级检查一条绝对路径(不含前导盘符段)上每一段是否为符号链接/联接。
// 从盘符根开始往下走,任何一段是链接就拒绝 —— 只查最后一级挡不住祖先 junction。
function assertNoLinks(absolute, what) {
  const resolved = path.resolve(absolute);
  const rootPath = path.parse(resolved).root;
  const parts = resolved.slice(rootPath.length).split(path.sep).filter(Boolean);
  let current = rootPath;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch { continue; } // 还没创建的那一段,后面写入时按普通目录建
    if (stat.isSymbolicLink()) throw new Error((what || '路径') + '包含链接或不安全的重解析点，已拒绝');
  }
  return resolved;
}

// 验证批准目录本身:存在、是目录、且**整条祖先链**无链接。
function assertRoot(root) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('还没有选择文件夹');
  const absolute = path.resolve(root);
  if (!fs.existsSync(absolute)) throw new Error('文件夹不存在，请重新选择');
  assertNoLinks(absolute, '所选文件夹');
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error('所选文件夹是链接，请选择普通文件夹');
  if (!stat.isDirectory()) throw new Error('所选路径不是文件夹');
  return absolute;
}

function hasControlChar(text) { for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32) return true; return false; }

// 单个路径段的安全校验:拒绝别名与非法字符,避免解析后被系统改写成别的东西。
function safeSegment(seg) {
  if (!seg) throw new Error('文件路径不能为空');
  if (BAD_CHARS.test(seg) || hasControlChar(seg)) throw new Error('文件路径含有不支持的字符: ' + seg);
  if (/[ .]$/.test(seg)) throw new Error('文件名不能以空格或点结尾: ' + seg);
  const base = seg.split('.')[0];
  if (DEVICE_RE.test(seg) || DEVICE_RE.test(base)) throw new Error('文件名是系统保留名，已拒绝: ' + seg);
  return seg;
}

// 把相对路径解析成绝对路径,并保证落在批准目录内、沿途没有符号链接。
function resolveWithin(root, rel) {
  if (typeof rel !== 'string' || !rel.trim()) throw new Error('文件路径不能为空');
  const cleaned = rel.replace(/\\/g, '/').trim();
  if (/^([a-zA-Z]:|\/)/.test(cleaned)) throw new Error('只能用相对路径，不能用盘符或绝对路径');
  const segments = cleaned.split('/').filter(s => s && s !== '.');
  if (!segments.length) throw new Error('文件路径不能为空');
  if (segments.some(s => s === '..')) throw new Error('文件路径不能包含 ..');
  for (const seg of segments) safeSegment(seg);
  const absolute = path.resolve(root, ...segments);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error('文件路径超出所选文件夹');
  assertNoLinks(absolute, '目标路径');
  return { absolute, rel: segments.join('/') };
}

function normalizeOps(ops) {
  if (!Array.isArray(ops) || !ops.length) throw new Error('请提供要写入的文件');
  if (ops.length > MAX_OPS) throw new Error('一次最多处理 ' + MAX_OPS + ' 个文件');
  return ops.map(op => {
    if (!op || typeof op !== 'object') throw new Error('文件条目格式不正确');
    if (typeof op.content !== 'string') throw new Error('文件内容必须是文本');
    if (Buffer.byteLength(op.content, 'utf8') > MAX_BYTES) throw new Error('单个文件超过 2MB，已拒绝');
    return { path: op.path, content: op.content };
  });
}

function prunePreviews() {
  const now = Date.now();
  for (const [token, plan] of previewCache) if (now - plan.createdAt > PREVIEW_TTL_MS) previewCache.delete(token);
  while (previewCache.size > MAX_PREVIEWS) previewCache.delete(previewCache.keys().next().value);
}
function stashPlan(plan) {
  const token = crypto.randomBytes(16).toString('hex');
  previewCache.set(token, { token, createdAt: Date.now(), ...plan });
  prunePreviews();
  return token;
}

// 预览写入:只算不写,返回一次性令牌 + 每项原始内容哈希(应用时用来发现改动)。
function preview(root, ops) {
  const base = assertRoot(root);
  const normalized = normalizeOps(ops);
  const seen = new Map();
  const items = normalized.map(op => {
    const { absolute, rel } = resolveWithin(base, op.path);
    const key = rel.toLowerCase();
    if (seen.has(key)) throw new Error('同一批里有重复的目标文件: ' + rel);
    seen.set(key, true);
    const exists = fs.existsSync(absolute);
    if (exists && !fs.lstatSync(absolute).isFile()) throw new Error('目标不是普通文件: ' + rel);
    const buffer = Buffer.from(op.content, 'utf8');
    return {
      rel, action: exists ? 'overwrite' : 'create', exists,
      size: buffer.length, sha256: sha256(buffer),
      originalSha256: exists ? sha256(fs.readFileSync(absolute)) : null,
      backup: exists,
    };
  });
  const token = stashPlan({ root: base, kind: 'write', items: items.map((it, i) => ({ ...it, content: normalized[i].content })) });
  return {
    token, root: base, items: items.map(({ content, ...rest }) => rest),
    summary: { total: items.length, create: items.filter(i => i.action === 'create').length, overwrite: items.filter(i => i.action === 'overwrite').length },
  };
}

// 预览移动/重命名:源必须存在且为普通文件,目标必须不存在(默认不覆盖)。
function previewMoves(root, moves) {
  const base = assertRoot(root);
  if (!Array.isArray(moves) || !moves.length) throw new Error('请提供要整理的文件');
  if (moves.length > MAX_OPS) throw new Error('一次最多处理 ' + MAX_OPS + ' 个文件');
  const seenTo = new Map(), seenFrom = new Map();
  const items = moves.map(m => {
    if (!m || typeof m !== 'object') throw new Error('整理条目格式不正确');
    const from = resolveWithin(base, m.from);
    const to = resolveWithin(base, m.to);
    if (from.rel === to.rel) throw new Error('源和目标相同: ' + from.rel);
    const fromKey = from.rel.toLowerCase(), toKey = to.rel.toLowerCase();
    if (seenFrom.has(fromKey)) throw new Error('同一批里有重复的源文件: ' + from.rel);
    seenFrom.set(fromKey, true);
    if (seenTo.has(toKey)) throw new Error('同一批里有重复的目标: ' + to.rel);
    seenTo.set(toKey, true);
    if (!fs.existsSync(from.absolute)) throw new Error('文件不存在: ' + from.rel);
    const st = fs.lstatSync(from.absolute);
    if (st.isSymbolicLink()) throw new Error('文件是链接，已拒绝: ' + from.rel);
    if (!st.isFile()) throw new Error('只能整理普通文件: ' + from.rel);
    if (fs.existsSync(to.absolute)) throw new Error('目标已存在，默认不覆盖: ' + to.rel);
    return { rel: from.rel, toRel: to.rel, action: 'move', exists: true, size: st.size, sha256: sha256(fs.readFileSync(from.absolute)) };
  });
  const token = stashPlan({ root: base, kind: 'move', items });
  return { token, root: base, items: items.map(({ sha256: _s, ...rest }) => rest), summary: { total: items.length, move: items.length } };
}

// 应用:只接受预览令牌(不接受新内容)。先复核文件未变,再落 pending 事务,再写。
function apply(token, { root, label = '' } = {}) {
  if (typeof token !== 'string' || !token) throw new Error('缺少预览令牌，请先预览');
  const plan = previewCache.get(token);
  if (!plan) throw new Error('预览已过期或不存在，请重新预览');
  if (root !== undefined && assertRoot(root) !== plan.root) throw new Error('文件夹和预览不一致，请重新预览');
  const base = plan.root;
  // 复核:预览到应用之间文件没被动过,目标也没被占。
  for (const item of plan.items) {
    if (item.action === 'move') {
      const from = resolveWithin(base, item.rel).absolute;
      const to = resolveWithin(base, item.toRel).absolute;
      if (!fs.existsSync(from) || sha256(fs.readFileSync(from)) !== item.sha256) throw new Error('文件在预览后改变了，已拒绝，请重新预览: ' + item.rel);
      if (fs.existsSync(to)) throw new Error('预览后出现了同名目标，已拒绝，请重新预览: ' + item.toRel);
      continue;
    }
    const { absolute } = resolveWithin(base, item.rel);
    const exists = fs.existsSync(absolute);
    if (item.action === 'overwrite') {
      if (!exists || sha256(fs.readFileSync(absolute)) !== item.originalSha256) throw new Error('文件在预览后改变了，已拒绝写入，请重新预览: ' + item.rel);
    } else if (exists) {
      throw new Error('预览后出现了同名文件，已拒绝写入，请重新预览: ' + item.rel);
    }
  }
  previewCache.delete(token);
  return applyPlan(base, plan.items, label);
}

// 台账读写。pending 先落盘,是崩溃恢复的依据。
function readLedger() { return store.read(LEDGER, []); }
function writeTxn(txn) { store.write(LEDGER, [txn, ...readLedger().filter(t => t.id !== txn.id)].slice(0, MAX_TXN)); }
function markTxn(id, patch) {
  const ledger = readLedger();
  const i = ledger.findIndex(t => t.id === id);
  if (i < 0) return;
  ledger[i] = { ...ledger[i], ...patch };
  store.write(LEDGER, ledger);
}

function backupDir(txnId) { return path.join(agent.workDir(), 'backups', txnId); }

// 实际写入。items 里每项 action ∈ create|overwrite|move。
function applyPlan(base, items, label) {
  const txnId = crypto.randomBytes(6).toString('hex');
  const dir = backupDir(txnId);
  const txnItems = items.map(it => ({
    rel: it.rel, action: it.action, toRel: it.toRel || null,
    backupRel: it.action === 'overwrite' ? it.rel : null,
    sha256: it.sha256, originalSha256: it.originalSha256 || null, size: it.size,
    restored: false, removedDone: false,
  }));
  // 写文件之前，先把 pending 事务落盘 —— ledger 写失败就不动文件。
  writeTxn({ id: txnId, createdAt: new Date().toISOString(), label: String(label || '').slice(0, 120), root: base, items: txnItems, madeDirectories: [], status: 'pending', undone: false });

  const madeDirectories = [];
  const doneItems = [];
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < items.length; i++) {
      const it = items[i], ti = txnItems[i];
      const parentOf = (abs) => { const p = path.dirname(abs); if (!fs.existsSync(p)) { fs.mkdirSync(p, { recursive: true }); madeDirectories.push(p); } };

      if (it.action === 'move') {
        const from = resolveWithin(base, it.rel).absolute;
        const to = resolveWithin(base, it.toRel).absolute;
        parentOf(to);
        fs.renameSync(from, to);
        ti.restored = false; // move 的撤销用 movedBack 语义,这里统一先用 restored 标记"已做"
        ti.done = true; doneItems.push(ti);
        continue;
      }
      const { absolute, rel } = resolveWithin(base, it.rel);
      if (it.action === 'overwrite') {
        const dest = path.join(dir, ...rel.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(absolute, dest); // 原文件落盘备份
      }
      parentOf(absolute);
      // writeFileSync 可能截断或只写入部分内容后抛错，必须提前登记恢复项。
      ti.done = true; doneItems.push(ti);
      fs.writeFileSync(absolute, Buffer.from(it.content, 'utf8'));
    }
    // 台账提交也是事务的一部分；提交失败同样恢复文件。
    markTxn(txnId, { status: 'applied', madeDirectories });
  } catch (e) {
    const recovered = recoverInPlace(base, dir, doneItems);
    if (!recovered) {
      // 恢复没成功:唯一备份绝不能删,标成待人工处理。
      try { markTxn(txnId, { status: 'recovery-failed' }); } catch { /* ledger 也写不了就只剩目录里的备份 */ }
      throw new Error('写入失败，且未能完全恢复原文件；备份已保留，请勿删除 ' + dir + '（' + e.message + '）');
    }
    for (const d of madeDirectories.reverse()) { try { fs.rmdirSync(d); } catch { /* 非空就算了 */ } }
    try { markTxn(txnId, { status: 'rolled-back', undone: true }); } catch { /* 尽力而为 */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 保留也无妨 */ }
    throw e;
  }

  return { txnId, createdAt: new Date().toISOString(), root: base, items: txnItems, count: items.length };
}

// 即时回滚:把本批已做的动作倒着还原。返回是否全部还原成功。
function recoverInPlace(base, dir, items) {
  let ok = true;
  for (const item of [...items].reverse()) {
    try {
      if (item.action === 'move') {
        const from = resolveWithin(base, item.rel).absolute;
        const to = resolveWithin(base, item.toRel).absolute;
        if (fs.existsSync(to) && !fs.existsSync(from)) fs.renameSync(to, from);
        else if (fs.existsSync(to)) ok = false;
      } else if (item.action === 'overwrite' && item.backupRel) {
        const source = path.join(dir, ...item.backupRel.split('/'));
        const { absolute } = resolveWithin(base, item.rel);
        if (!fs.existsSync(source)) { ok = false; continue; }
        fs.copyFileSync(source, absolute);
      } else if (item.action === 'create') {
        fs.rmSync(resolveWithin(base, item.rel).absolute, { force: true });
      }
    } catch { ok = false; }
  }
  return ok;
}

function findTxn(id) {
  const txn = readLedger().find(t => t.id === id);
  if (!txn) throw new Error('找不到这次操作记录，可能已清理');
  return txn;
}

// 崩溃恢复:把上次遗留的 pending 事务按备份还原(只还原内容仍是我们写的那份)。
// 供启动时调用,返回恢复报告。
function recover() {
  const ledger = readLedger();
  const report = [];
  for (const txn of ledger) {
    if (txn.status !== 'pending') continue;
    const base = (() => { try { return assertRoot(txn.root); } catch { return null; } })();
    if (!base) { report.push({ id: txn.id, status: 'root-missing' }); continue; }
    const dir = backupDir(txn.id);
    const items = [];
    for (const item of [...txn.items].reverse()) {
      try {
        const { absolute } = resolveWithin(base, item.rel);
        if (item.action === 'move') {
          const to = resolveWithin(base, item.toRel).absolute;
          if (fs.existsSync(to) && !fs.existsSync(absolute)) fs.renameSync(to, absolute);
          // 还原成功的判据:源文件确实回到了原位(否则可能被用户在崩溃后移走)。
          items.push({ rel: item.rel, ok: fs.existsSync(absolute) });
        } else if (item.action === 'overwrite' && item.backupRel) {
          const source = path.join(dir, ...item.backupRel.split('/'));
          // 只有目标仍是我们写的那份、且备份还在,才敢覆盖回去;备份是原始内容的唯一副本。
          const canRestore = fs.existsSync(absolute) && sha256(fs.readFileSync(absolute)) === item.sha256 && fs.existsSync(source);
          if (canRestore) fs.copyFileSync(source, absolute);
          items.push({ rel: item.rel, ok: canRestore });
        } else if (item.action === 'create') {
          // create 没有备份:内容仍是我们的就删掉,已被用户改过则保留(无备份可丢)。
          if (fs.existsSync(absolute) && sha256(fs.readFileSync(absolute)) === item.sha256) fs.rmSync(absolute, { force: true });
          items.push({ rel: item.rel, ok: true });
        }
      } catch (e) { items.push({ rel: item.rel, ok: false, error: e.message }); }
    }
    const allOk = items.every(i => i.ok);
    try { markTxn(txn.id, { status: allOk ? 'recovered' : 'recovery-failed', undone: allOk }); } catch { /* 尽力 */ }
    if (allOk) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 保留也无妨 */ } }
    report.push({ id: txn.id, status: allOk ? 'recovered' : 'recovery-failed' });
  }
  return report;
}

// 撤销:恢复被覆盖的、把新建的删掉、把移动的移回来。
// 部分成功也把成功项落盘标记,避免再点一次把已恢复的当冲突;被用户改动/删除的报冲突,不擅自重建。
function undo(id) {
  const txn = findTxn(id);
  if (txn.undone || txn.status === 'undone') return { txnId: id, alreadyUndone: true, restored: [], removed: [], conflicts: [] };
  if (txn.status && txn.status !== 'applied' && txn.status !== 'partial') throw new Error('这次操作没有可撤销的完成状态');
  const base = assertRoot(txn.root);
  const dir = backupDir(id);
  const restored = [], removed = [], conflicts = [];
  for (const item of [...txn.items].reverse()) {
    if (item.restored || item.removedDone) continue; // 上次部分撤销已处理的,跳过
    const { absolute } = resolveWithin(base, item.rel);
    if (item.action === 'move') {
      const to = resolveWithin(base, item.toRel).absolute;
      if (!fs.existsSync(to)) { conflicts.push(item.rel); continue; }            // 用户已把文件移走/删掉 → 冲突,不重建
      if (sha256(fs.readFileSync(to)) !== item.sha256) { conflicts.push(item.rel); continue; }
      if (fs.existsSync(absolute)) { conflicts.push(item.rel); continue; }        // 原位被占用
      fs.renameSync(to, absolute);
      item.restored = true; restored.push(item.rel);
      continue;
    }
    if (item.action === 'overwrite' && item.backupRel) {
      if (!fs.existsSync(absolute)) { conflicts.push(item.rel); continue; }       // 用户删了目标 → 冲突,不擅自重建
      if (sha256(fs.readFileSync(absolute)) !== item.sha256) { conflicts.push(item.rel); continue; }
      const source = path.join(dir, ...item.backupRel.split('/'));
      if (!fs.existsSync(source)) { conflicts.push(item.rel); continue; }
      fs.copyFileSync(source, absolute);
      item.restored = true; restored.push(item.rel);
    } else {
      if (fs.existsSync(absolute)) {
        if (sha256(fs.readFileSync(absolute)) !== item.sha256) { conflicts.push(item.rel); continue; }
        fs.rmSync(absolute, { force: true });
      }
      item.removedDone = true; removed.push(item.rel);
    }
  }
  const complete = !conflicts.length;
  markTxn(id, { items: txn.items, status: complete ? 'undone' : 'partial', undone: complete, undoneAt: new Date().toISOString() });
  if (complete) for (const d of (txn.madeDirectories || []).slice().reverse()) { try { fs.rmdirSync(d); } catch { /* 非空或已删就算了 */ } }
  if (complete) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 保留也无妨 */ } }
  return { txnId: id, alreadyUndone: false, restored, removed, conflicts };
}

// 列出批准目录**顶层**内容(不递归,不跟随链接),供文件整理场景使用。
function listFolder(root) {
  const base = assertRoot(root);
  const entries = [];
  for (const name of fs.readdirSync(base)) {
    const abs = path.join(base, name);
    let st;
    try { st = fs.lstatSync(abs); } catch { continue; }
    if (st.isSymbolicLink()) { entries.push({ name, link: true }); continue; }
    if (st.isDirectory()) { entries.push({ name, dir: true }); continue; }
    if (st.isFile()) entries.push({ name, file: true, size: st.size, ext: path.extname(name).slice(1).toLowerCase() });
  }
  return { root: base, entries };
}

// 扩展名 → 归档文件夹名。认不出就按大写扩展名建一个。
const EXT_GROUPS = {
  '图片': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tiff'],
  '文档': ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx'],
  '视频': ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv'],
  '音频': ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'],
  '压缩包': ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
  '安装包': ['exe', 'msi', 'dmg', 'pkg'],
  '代码': ['js', 'ts', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'html', 'css', 'json', 'sh'],
};
function folderForExt(ext) {
  for (const [folder, list] of Object.entries(EXT_GROUPS)) if (list.includes(ext)) return folder;
  return ext.toUpperCase();
}

// 自动按扩展名分组:给出移动方案(不写盘)。只处理顶层普通文件,跳过子目录/链接/无扩展名。
function groupByExtension(root) {
  const base = assertRoot(root);
  const { entries } = listFolder(base);
  const ops = [], skipped = [];
  for (const e of entries) {
    if (e.dir || e.link || !e.file) continue;
    if (!e.ext) { skipped.push({ name: e.name, reason: '没有扩展名，无法归类' }); continue; }
    ops.push({ from: e.name, to: folderForExt(e.ext) + '/' + e.name });
  }
  const folders = [...new Set(ops.map(o => o.to.split('/')[0]))];
  return { root: base, ops, skipped, folders, note: '默认不覆盖：目标重名会在预览时被拒绝。' };
}

function ledger(limit = 50) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_TXN);
  return readLedger().slice(0, n).map(t => ({
    id: t.id, createdAt: t.createdAt, label: t.label, root: t.root, undone: !!t.undone,
    status: t.status || 'applied', count: t.items.length,
    files: t.items.map(i => (i.action === 'move' ? i.rel + ' → ' + i.toRel : i.rel)),
  }));
}

module.exports = {
  preview, previewMoves, apply, undo, recover, ledger, listFolder, groupByExtension,
  resolveWithin, assertRoot, MAX_OPS, MAX_BYTES,
};

if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  const oldWork = process.env.AI_SETUP_WORK;
  process.env.AI_SETUP_WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'files-work-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-root-'));
  try {
    fs.writeFileSync(path.join(root, 'keep.txt'), 'ORIGINAL');
    // 预览不写盘,返回令牌
    const p = preview(root, [{ path: 'keep.txt', content: 'NEW' }, { path: 'sub/new.txt', content: 'hi' }]);
    assert.strictEqual(p.items[0].action, 'overwrite');
    assert.strictEqual(p.items[1].action, 'create');
    assert.ok(p.token);
    assert.strictEqual(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'ORIGINAL', '预览不能改文件');
    // 应用需要令牌
    assert.throws(() => apply(undefined, { root }), /令牌/);
    // 应用 + 撤销:恢复被覆盖的、删除新建的
    const r = apply(p.token, { root, label: '测试' });
    assert.strictEqual(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'NEW');
    const u = undo(r.txnId);
    assert.deepStrictEqual(u.restored, ['keep.txt']);
    assert.deepStrictEqual(u.removed, ['sub/new.txt']);
    assert.strictEqual(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'ORIGINAL', '撤销要恢复原文');
    assert.ok(!fs.existsSync(path.join(root, 'sub', 'new.txt')));

    // 预览后文件被改 → 应用必须拒绝
    const p2 = preview(root, [{ path: 'keep.txt', content: 'V2' }]);
    fs.writeFileSync(path.join(root, 'keep.txt'), 'USER EDIT');
    assert.throws(() => apply(p2.token, { root }), /改变了/);
    assert.strictEqual(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'USER EDIT');

    // 撤销:改过之后报冲突,保留用户改动;被删除的目标报冲突不重建
    const p3 = preview(root, [{ path: 'keep.txt', content: 'V3' }]);
    const r3 = apply(p3.token, { root });
    fs.writeFileSync(path.join(root, 'keep.txt'), 'USER EDIT2');
    const u3 = undo(r3.txnId);
    assert.deepStrictEqual(u3.conflicts, ['keep.txt']);
    assert.strictEqual(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'USER EDIT2', '不能覆盖用户改动');

    // 部分撤销:成功项落盘,再点不把已恢复的当冲突
    fs.writeFileSync(path.join(root, 'a.txt'), 'A');
    fs.writeFileSync(path.join(root, 'b.txt'), 'B');
    const p4 = preview(root, [{ path: 'a.txt', content: 'A2' }, { path: 'b.txt', content: 'B2' }]);
    const r4 = apply(p4.token, { root });
    fs.writeFileSync(path.join(root, 'b.txt'), 'B USER'); // b 被改
    const u4 = undo(r4.txnId);
    assert.deepStrictEqual(u4.restored, ['a.txt']);
    assert.deepStrictEqual(u4.conflicts, ['b.txt']);
    const u4b = undo(r4.txnId); // 再点一次:已恢复的 a 不能再报冲突
    assert.deepStrictEqual(u4b.restored, []);
    assert.deepStrictEqual(u4b.conflicts, ['b.txt']);
    assert.strictEqual(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'A');

    // 移动(整理)+ 撤销
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'files-org-'));
    try {
      fs.writeFileSync(path.join(dir2, 'x.png'), 'IMG');
      fs.writeFileSync(path.join(dir2, 'n.txt'), 'TXT');
      const listing = listFolder(dir2);
      assert.strictEqual(listing.entries.length, 2);
      const plan = groupByExtension(dir2);
      assert.ok(plan.ops.some(o => o.to === '图片/x.png'));
      assert.ok(plan.ops.some(o => o.to === '文档/n.txt'));
      const mp = previewMoves(dir2, plan.ops);
      const mr = apply(mp.token, { root: dir2, label: '整理' });
      assert.ok(fs.existsSync(path.join(dir2, '图片', 'x.png')));
      const mu = undo(mr.txnId);
      assert.deepStrictEqual(mu.restored.sort(), ['n.txt', 'x.png']);
      assert.ok(fs.existsSync(path.join(dir2, 'x.png')));
      assert.ok(!fs.existsSync(path.join(dir2, '图片')));
    } finally { fs.rmSync(dir2, { recursive: true, force: true }); }

    // 逃逸、别名与符号链接一律拒绝
    assert.throws(() => preview(root, [{ path: '../escape.txt', content: 'x' }]), /\.\.|超出/);
    assert.throws(() => preview(root, [{ path: 'C:/windows/x.txt', content: 'x' }]), /盘符|绝对路径/);
    assert.throws(() => preview(root, [{ path: '/etc/x', content: 'x' }]), /盘符|绝对路径/);
    assert.throws(() => preview(root, [{ path: 'file.txt:stream', content: 'x' }]), /字符/);
    assert.throws(() => preview(root, [{ path: 'CON.txt', content: 'x' }]), /保留名/);
    assert.throws(() => preview(root, [{ path: 'name.', content: 'x' }]), /点结尾|空格/);
    // 同批重复目标(大小写不敏感)→ 拒绝
    assert.throws(() => preview(root, [{ path: 'dup.txt', content: '1' }, { path: 'DUP.txt', content: '2' }]), /重复/);
    let link;
    try { link = fs.symlinkSync(path.join(root, 'keep.txt'), path.join(root, 'link.txt'), 'file'); } catch { link = null; }
    if (link !== null) assert.throws(() => preview(root, [{ path: 'link.txt', content: 'x' }]), /链接/);
    console.log('files.js self-check OK（令牌/别名/重复/链接/部分撤销/移动整理）');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(process.env.AI_SETUP_WORK, { recursive: true, force: true });
    if (oldWork === undefined) delete process.env.AI_SETUP_WORK; else process.env.AI_SETUP_WORK = oldWork;
  }
}
