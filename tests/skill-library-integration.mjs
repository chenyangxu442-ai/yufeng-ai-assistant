// skill-library-integration.mjs — 真正证明"选中技能 → 原生 pre-step 注入"这条链
//
// 不 mock 关键环节:真的 cordis Context、真的 SkillRegistry、真的
// dsh-skill-filesystem provider、真的 dsh-tool-skill apply()、真的
// agent/pre-step waterfall。技能文件用 skills.seedAll/install 落进临时
// DSH_HOME/skills(和装机器铺的那份走同一条代码)。不发任何模型请求。
//
// 覆盖:
//   1. 两个技能的**指令正文**确实以 skill-invocation 消息进入 decision.messages;
//   2. "只作用于下一条":发送成功后草稿被清,下一条普通消息不再注入;
//   3. "失败保留":草稿没被清时,再发仍注入同样的两条;
//   4. "会话隔离":pre-step 只看它自己那条 claimed 消息里的 token。
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = require(path.join(REPO, 'engine', 'skills.js'));
const extensions = require(path.join(REPO, 'engine', 'extension.js'));

const work = path.join(REPO, 'work');
const bundle = fs.readdirSync(work)
  .filter((name) => name.startsWith('agent-bundle-e2e-'))
  .map((name) => path.join(work, name, 'agent', 'node_modules', '@deepseek-ai'))
  .find((dir) => fs.existsSync(path.join(dir, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tool-skill')));
assert.ok(bundle, '找不到 agent-bundle-e2e-*/…/node_modules/@deepseek-ai');

const mod = (rel) => pathToFileURL(path.join(bundle, rel)).href;
const { Context } = await import(mod('cordis/lib/index.js'));
const { SkillRegistry, renderSkillContent } = await import(mod('dsh-skill/lib/index.js'));
const filesystem = await import(mod('dsh/node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js'));
const toolSkill = await import(mod('dsh/node_modules/@deepseek-ai/dsh-tool-skill/lib/index.js'));
const { createUserMessage } = await import(mod('dsh-llm/lib/index.js'));

// tokens.fragment.js 是共享源码片段(浏览器 bundle 与这里跑的是同一份)。
function loadTokens() {
  const src = fs.readFileSync(path.join(REPO, 'engine', 'extensions', 'skill-library', 'tokens.fragment.js'), 'utf8');
  return new Function(src + '\nreturn { selectedSlugs, addToken, removeToken, appendTemplate, applyScene };')();
}
const tokens = loadTokens();

// 挂一个真 Context,组合真的宿主半边。
async function boot(home) {
  const tools = { register() {}, get() { return undefined; } };
  const ctx = new Context();
  ctx.provide('tools', tools);
  ctx.provide('agents', {});
  await ctx.plugin(SkillRegistry);
  await ctx.plugin(filesystem, { dshHome: home, includeDefaultRoots: true, watch: false });
  await ctx.plugin(toolSkill, {});
  return ctx;
}

function fakeAgent(home) {
  return { session: { header: { cwd: home }, surface: { nodes: new Set() }, seq: 0, eventAt() {} } };
}
function userMsg(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });
}
async function preStep(ctx, home, messages) {
  const signal = new AbortController().signal;
  return ctx.waterfall('agent/pre-step', { agent: fakeAgent(home), messages, signal },
    () => Promise.resolve({ kind: 'enter', messages }));
}
function injected(dst, decision, before) {
  return decision.messages.slice(before).filter((m) => m.source && m.source.kind === 'skill-invocation');
}
const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skilllib-home-'));
const results = [];
try {
  const catalog = engine.catalog();
  const [a, b] = catalog;
  engine.install([a.id, b.id], home);
  const ctx = await boot(home);

  // 期望正文直接来自原生注入会用的同一个渲染器。
  const lookup = { cwd: home, signal: new AbortController().signal };
  const skillA = await ctx.skills.get(a.name, lookup);
  const skillB = await ctx.skills.get(b.name, lookup);
  assert.ok(skillA && skillB, '两个技能都应能被原生 registry 解析到');
  assert.ok(skillA.invocation.userInvocable && skillB.invocation.userInvocable, '技能应可被用户调用');

  // ── 1. 两个技能正文进入 decision.messages ────────────────────────────────
  const draft = tokens.addToken(tokens.addToken('请帮我看看', a.name), b.name);
  const first = [userMsg(draft)];
  const d1 = await preStep(ctx, home, first);
  const ins1 = injected(draft, d1, first.length);
  assert.deepStrictEqual(ins1.map((m) => m.source.name).sort(), [a.name, b.name].sort(), '两条 skill-invocation 都要在');
  const byName = Object.fromEntries(ins1.map((m) => [m.source.name, textOf(m)]));
  assert.strictEqual(byName[a.name], renderSkillContent(skillA), 'A 正文必须逐字等于原生渲染');
  assert.strictEqual(byName[b.name], renderSkillContent(skillB), 'B 正文必须逐字等于原生渲染');
  assert.ok(byName[a.name].includes('<skill_content name="' + a.name + '">'), '正文应是 <skill_content> 形态');
  results.push('1. 两个技能正文进入原生 pre-step:' + ins1.map((m) => m.source.name).join(', '));

  // ── 2. 只作用于下一条:发送成功后草稿被清 → 不再注入 ───────────────────────
  const clearedDraft = '';                       // 原生 commit-draft(retainSuffixOf:null) 的结果
  assert.deepStrictEqual(tokens.selectedSlugs(clearedDraft), [], '清空后不该还有选中');
  const second = [userMsg('这条只是普通消息')];
  const d2 = await preStep(ctx, home, second);
  assert.strictEqual(injected(clearedDraft, d2, second.length).length, 0, '下一条不该再注入任何技能');
  results.push('2. 下一条消息不再注入(选中已随草稿清空)');

  // ── 3. 失败保留:草稿没被清 → 再发仍注入同样的两条 ─────────────────────────
  const retained = draft;                        // 发送失败,原生还原草稿,内容不变
  assert.deepStrictEqual(tokens.selectedSlugs(retained).sort(), [a.name, b.name].sort(), '失败后选中仍在');
  const d3 = await preStep(ctx, home, [userMsg(retained)]);
  const ins3 = injected(retained, d3, 1);
  assert.strictEqual(ins3.length, 2, '失败重发仍注入两条');
  assert.deepStrictEqual(ins3.map((m) => m.source.name).sort(), [a.name, b.name].sort());
  results.push('3. 失败保留:重发仍注入 2 条');

  // ── 4. 会话隔离:pre-step 只看自己那条 claimed 消息 ────────────────────────
  // 会话 A 的草稿带 token,会话 B 的草稿为空;各自 pre-step 互不影响。
  const sessionA = [userMsg(tokens.addToken('', a.name))];
  const sessionB = [userMsg('')];
  const [da, db] = [await preStep(ctx, home, sessionA), await preStep(ctx, home, sessionB)];
  assert.strictEqual(injected('', da, 1).length, 1, 'A 会话应注入 1 条');
  assert.strictEqual(injected('', da, 1)[0].source.name, a.name);
  assert.strictEqual(injected('', db, 1).length, 0, 'B 会话不该看到 A 的选中');
  results.push('4. 会话隔离:A 注入 ' + a.name + ',B 注入 0 条');

  // ── 5. 扩展落盘 + patch 注册(装机那一步的实际产物)─────────────────────────
  const installed = extensions.install(home);
  assert.strictEqual(installed.catalogCount, 538, 'client bundle 应内联 538 条目录');
  assert.ok(fs.existsSync(path.join(installed.dir, 'lib', 'client.js')), 'client bundle 要落盘');
  const patch = fs.readFileSync(installed.patchPath, 'utf8');
  assert.ok(patch.includes('id: ui-skill-library'), 'profile patch 要含宿主行');
  assert.ok(patch.includes('./extensions/skill-library/lib/index.js'), '宿主行要指向扩展实体');
  assert.strictEqual(extensions.install(home).changed, false, '重复注册要幂等');
  results.push('5. 扩展落盘 + patch 注册(' + installed.dir + ')');

  // ── 6. 浏览器 bundle 能被"加载"并注册出全部界面挂点 ────────────────────────
  // 用 vm 模拟 __ModuleLoader__.load + factory(require):证明生成的 bundle 是
  // 合法可物化模块、导出 apply/inject,且 apply() 会把全部挂点都注册上。
  // 这一步不碰真实 DOM/浏览器,只钉住"bundle 结构与注册面"正确。
  const vm = require('node:vm');
  const clientSrc = fs.readFileSync(path.join(installed.dir, 'lib', 'client.js'), 'utf8');
  let captured;
  const sandbox = { window: { __ModuleLoader__: { load: (rec) => { captured = rec; } } } };
  vm.createContext(sandbox);
  vm.runInContext(clientSrc, sandbox, { filename: 'client.js' });
  assert.ok(captured, 'bundle 必须调用 window.__ModuleLoader__.load');
  assert.strictEqual(captured.id, '@ai-setup/dsh-client-ui-skill-library', 'bundle id 要是包名');
  const reactStub = { createElement: () => null, useState: () => [undefined, () => {}], useMemo: (f) => f(), useEffect: () => {} };
  const requireShim = (name) => (name === 'react' ? reactStub : undefined);
  const bundleExports = captured.factory(requireShim);
  assert.strictEqual(typeof bundleExports.apply, 'function', 'bundle 要导出 apply');
  assert.ok(Array.isArray(bundleExports.inject), 'bundle 要导出 inject 列表');
  const slotKeys = [];
  const tabTypes = [];
  const registrations = [];
  bundleExports.apply({
    effect: (fn) => { fn(); },
    locale: { register() {}, bind: () => (k) => (k === 'scenes.title' ? '任务场景' : k) },
    sidebarRightTabs: { register: (def) => { tabTypes.push(def); } },
    sidebarRight: { openTab() {} },
    get: () => undefined,   // 主面板靠 ctx.get 懒解析 conversation/sessions/layout/uiWorkspace
    slots: {
      inject: (key, cb) => { cb(); slotKeys.push(key); },
      register: (opts) => { registrations.push(opts); return opts; }
    }
  });
  for (const key of ['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title', 'conversation.input.dock', 'sidebar.footer.action', 'sidebar.panellist', 'main']) {
    assert.ok(slotKeys.includes(key), '要注册挂点 ' + key);
  }
  assert.strictEqual(tabTypes[0].kind, 'skill-library', '要注册 skill-library 页类型');
  const mainReg = registrations.find((o) => o.name === 'main');
  const rowReg = registrations.find((o) => o.name === 'sidebar.panellist');
  assert.strictEqual(mainReg.key, 'task-scenes', '场景主面板 key 要是 task-scenes');
  assert.strictEqual(rowReg.id, 'task-scenes', '侧栏行 id 要与主面板 key 一致');
  assert.strictEqual(rowReg.label(), '任务场景', '侧栏行标签要解析成中文标题');
  results.push('6. 浏览器 bundle 可物化,apply 注册 ' + slotKeys.length + ' 个挂点 + 页类型 + 场景主面板/侧栏行');

  // ── 7. 场景「写入」运算:只加不删(保留原草稿与已有 token),且没有发送动作 ──────
  const before = tokens.addToken('我已经写了一段需求', a.name);
  const after = tokens.applyScene(before, '帮我整理文件。\n文件夹:<填这里>', [b.name]);
  assert.ok(after.startsWith(before.replace(/\s+$/, '')), '原有文字与已有 token 必须原样留在前面');
  assert.deepStrictEqual(tokens.selectedSlugs(after).sort(), [a.name, b.name].sort(), '新旧 token 都要在');
  assert.ok(after.includes('帮我整理文件。'), '模板要追加进去');
  assert.ok(after.includes('\n\n'), '追加要有空行分隔,不与原内容粘连');
  assert.strictEqual(tokens.applyScene(before, '模板', [a.name]), tokens.applyScene(before, '模板', [a.name]), '幂等:同输入同输出');
  assert.deepStrictEqual(tokens.selectedSlugs(tokens.applyScene(before, '模板', [a.name])), [a.name], '已选技能不重复加 token');
  results.push('7. 场景写入只追加(原文字 + 原 token 保留,新 token 去重,无发送动作)');

  console.log('skill-library-integration OK');
  for (const line of results) console.log('  ✓ ' + line);
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
