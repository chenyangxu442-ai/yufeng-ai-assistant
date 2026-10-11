// tokens.fragment.js — 共享片段(不是模块):技能选择只由**草稿文本**承载
//
// 为什么不是普通模块:同一段逻辑要在两个地方跑 ——
//   1. 浏览器里的扩展 client bundle(装机时把这段文本内联进去);
//   2. Node 集成测试(用 new Function 包一层直接跑)。
// 写成"纯函数声明片段",两边都不用打包器。改这里,两边同时变。
//
// 语义完全对齐 Harness 原生:通道就是 `/name ` 这类**空白包围**的 token,
// 和 dsh-tool-skill 的 SKILL_GESTURE 同一形状。所以:
//   · 只影响下一条消息   —— token 在草稿里,发出即随草稿走;
//   · 发送成功即清空     —— 原生 commit-draft(retainSuffixOf:null)清草稿,chip 跟着没了;
//   · 发送失败即保留     —— 原生会还原草稿,token 还在,重发仍在;
//   · 会话隔离           —— 草稿本就按会话存,token 跟随所属会话。

/** 与原生 dsh-tool-skill SKILL_GESTURE 同形的 token 识别。 */
const SKILL_TOKEN_RE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g;

/** 草稿里已选技能的 slug,按首次出现顺序去重。 */
function selectedSlugs(draft) {
  const out = [];
  if (typeof draft !== 'string') return out;
  for (const match of draft.matchAll(SKILL_TOKEN_RE)) {
    const name = match[2];
    if (name !== undefined && !out.includes(name)) out.push(name);
  }
  return out;
}

/** 幂等追加一个 `/slug ` token。 */
function addToken(draft, slug) {
  const text = typeof draft === 'string' ? draft : '';
  if (selectedSlugs(text).includes(slug)) return text;
  const head = text.replace(/\s+$/, '');
  return (head ? head + ' ' : '') + '/' + slug + ' ';
}

/** 移除一个 slug 的**全部** token,并收拾多余空白。 */
function removeToken(draft, slug) {
  const text = typeof draft === 'string' ? draft : '';
  const safe = String(slug).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|\\s)/' + safe + '(?=\\s|$)', 'g');
  return text
    .replace(re, (_m, lead) => lead)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/g, '');
}

/**
 * 把一段模板文本**追加**到草稿末尾,空行分隔 —— 绝不覆盖已有内容。
 * 已有的 `/slug` token 因为仍然被空白包围,追加后依旧有效。
 */
function appendTemplate(draft, text) {
  const base = typeof draft === 'string' ? draft : '';
  const add = String(text == null ? '' : text).trim();
  if (!add) return base;
  const head = base.replace(/\s+$/, '');
  return head ? head + '\n\n' + add : add;
}

/**
 * 场景「写入当前对话」的完整运算:先把勾选的技能加成本条消息的 `/slug` token
 * (挨着用户原有文字、幂等去重),再把模板追加到末尾。
 * 全程只加不删 —— 原有文字与原有 token 都原样保留。
 */
function applyScene(draft, text, slugs) {
  let next = typeof draft === 'string' ? draft : '';
  for (const slug of Array.isArray(slugs) ? slugs : []) next = addToken(next, slug);
  return appendTemplate(next, text);
}
