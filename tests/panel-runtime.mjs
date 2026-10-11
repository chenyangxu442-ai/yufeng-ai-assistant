// panel-runtime.mjs — real runtime acceptance of the skill-library panel.
//
// Boots the *actual pinned* DeepSeek Harness (the bundle already installed under
// work/agent-bundle-e2e-*/agent) in a NEW isolated DSH_HOME, seeds all 538 skills
// and registers the packaged client extension through the real installer modules,
// then drives the installed Google Chrome over CDP to verify the panel in a real
// DOM. Dummy key only; no paid model calls; never reads an existing .env.
//
//   node tests/panel-runtime.mjs            full run (+ screenshots under work/…/shots)
//   node tests/panel-runtime.mjs --explore  dump DOM, no assertions (first-time probing)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import { launchChrome, sleep } from './cdp.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTDIR = path.join(REPO, 'work', 'harness-panel-runtime-test');
const HOME = path.join(TESTDIR, 'home');
const AGENT = path.join(REPO, 'work', 'agent-bundle-e2e-qJTB72', 'agent');
const SHOTS = path.join(TESTDIR, 'shots');
const DUMMY_KEY = 'sk-fake-runtime-no-billing';
const EXPLORE = process.argv.includes('--explore');
// --submit 模式:把模型端点指向本地桩,真实走一次「发送」,验证草稿在成功后被清、
// 失败后被还原。绝不发真实模型请求。
const SUBMIT = process.argv.includes('--submit');

// Hard ceilings: browser acceptance must never hang the CLI. The watchdog force-
// exits; the finally block cleans up only the processes this run spawned.
const HARD_TIMEOUT_MS = 90 * 1000;
const BOOT_TIMEOUT_MS = 45 * 1000;
const FETCH_OPTS = { signal: AbortSignal.timeout(10000) };

const EXT_ID = '@ai-setup/dsh-client-ui-skill-library';

function log(...a) { console.log(...a); }

// ── boot the real harness in the isolated home ────────────────────────────────
async function boot(extraEnv = {}) {
  process.env.DSH_HOME = HOME;
  process.env.AI_SETUP_AGENT = AGENT;
  process.env.AI_SETUP_WORK = path.join(TESTDIR, 'work');
  fs.mkdirSync(HOME, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const detect = require(path.join(REPO, 'engine', 'detect.js'));
  const runtime = require(path.join(REPO, 'engine', 'runtime.js'));
  const skills = require(path.join(REPO, 'engine', 'skills.js'));
  const extensions = require(path.join(REPO, 'engine', 'extension.js'));

  const seeded = skills.seedAll(HOME);
  const ok = seeded.filter(r => r.ok).length;
  log(`· 技能铺设:新增 ${ok} / 已有 ${seeded.length - ok}`);
  const built = extensions.install(HOME);
  log(`· 扩展落盘:${built.dir}(目录 ${built.catalogCount} 条,patch ${built.changed ? '已更新' : '已存在'})`);
  // 假 key 只写进**这个新 home**,绝不读用户已有的 .env
  fs.writeFileSync(path.join(HOME, '.env'), 'DEEPSEEK_API_KEY=' + DUMMY_KEY + '\n');
  // 前端要有会话才有输入面;而会话要挂在工作区上。空 home 里没有工作区,
  // 于是直接给 storages/workspace.json 播种一个(指向本 home 自己,真实存在)。
  const now = new Date().toISOString();
  const wsFile = path.join(HOME, 'storages', 'workspace.json');
  fs.mkdirSync(path.dirname(wsFile), { recursive: true });
  fs.writeFileSync(wsFile, JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: ['ws-acceptance'], archivedSessionIds: [] },
    tables: { workspaces: { 'ws-acceptance': { path: fs.realpathSync(HOME), title: '验收工作区', sessionIds: [], createdAt: now, updatedAt: now } } },
  }, null, 2) + '\n');

  const { node, dshBin } = detect.env();
  const child = spawn(node, [dshBin, 'web', '--no-open'], {
    cwd: HOME,
    env: { ...runtime.childEnv(node), DSH_HOME: HOME, DEEPSEEK_API_KEY: DUMMY_KEY, ...extraEnv },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '', err = '', url = null;
  child.stdout.on('data', d => {
    out += d.toString();
    fs.writeFileSync(path.join(TESTDIR, 'startup.stdout.log'), out.slice(-8192));
    const m = out.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s\x1b]*[ \r\n]/);
    if (m && !url) url = m[0].trim();
  });
  child.stderr.on('data', d => { err += d.toString(); fs.writeFileSync(path.join(TESTDIR, 'startup.stderr.log'), err.slice(-8192)); });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (!url && Date.now() < deadline && child.exitCode === null) await sleep(150);
  assert.ok(url, 'DSH 没有打印出访问地址: ' + (err || out).slice(-800));
  const u = new URL(url);
  log('· 助手已启动:' + u.origin);
  return { child, url, base: u.origin, token: u.searchParams.get('token') || '', kill: () => killTree(child.pid) };
}

function killTree(pid) {
  if (!pid) return;
  try { execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { try { process.kill(pid); } catch {} }
}

// ── server-side checks: the extension really is discovered and served ─────────
async function verifyServed(base, token) {
  // 首页是 __DSH_BOOT__ 的宿主;扩展的 bundle URL 就写在里面(带 rev 的 combo 形式)。
  // ?token= 会 303 到 /,并把 token 换成 cookie —— Node fetch 不自动存 cookie,手动带上。
  const first = await fetch(`${base}/?token=${token}`, { redirect: 'manual', ...FETCH_OPTS });
  const cookie = String(first.headers.get('set-cookie') || '').split(';')[0];
  const index = await fetch(`${base}/`, { headers: cookie ? { cookie } : {}, ...FETCH_OPTS });
  const html = await index.text();
  assert.ok(html.includes('__DSH_BOOT__'), '首页不含 __DSH_BOOT__');
  const m = new RegExp('/plugins/[^"\'\\\\ ]*' + EXT_ID.replace(/[/@.]/g, '\\$&') + '/client\\.js[^"\'\\\\ ]*').exec(html);
  assert.ok(m, '首页的 __DSH_BOOT__ 未收录扩展(装载器没发现它)');
  const bundle = await fetch(base + m[0].replace(/&amp;/g, '&'), FETCH_OPTS);
  assert.equal(bundle.status, 200, '扩展 bundle 未被服务:' + bundle.status);
  const body = await bundle.text();
  assert.ok(body.includes(EXT_ID), 'bundle 内容不含包 id');
  assert.ok(body.includes('window.__ModuleLoader__.load'), 'bundle 不是 __ModuleLoader__ 形态');
  log('· 服务端已发现并服务扩展 bundle(HTTP 200,' + body.length + ' 字节,已进 __DSH_BOOT__)');
  return { bundleBytes: body.length, url: m[0] };
}

// ── local model stub: OpenAI-compatible SSE, no paid calls ────────────────────
function startStub() {
  let mode = 'ok';
  const hits = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') hits.push(mode + ' ' + req.url);
    if (req.method === 'GET' && /\/models/.test(req.url || '')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-chat', object: 'model' }] }));
      return;
    }
    if (req.method === 'POST' && /\/chat\/completions/.test(req.url || '')) {
      req.resume();
      if (mode === 'fail') {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'stub failure', type: 'server_error' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write('data: ' + JSON.stringify({ id: 'stub', object: 'chat.completion.chunk', created: 0, model: 'deepseek-chat', choices: [{ index: 0, delta: { role: 'assistant', content: '好的。' } }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ id: 'stub', object: 'chat.completion.chunk', created: 0, model: 'deepseek-chat', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port, url: 'http://127.0.0.1:' + server.address().port,
      set: (m) => { mode = m; }, hits,
      close: () => { try { server.close(); } catch {} },
    }));
  });
}

// ── in-page helpers ──────────────────────────────────────────────────────────
const PAGE = {
  // describe every interactive control — used to learn the UI and to assert
  controls: `(() => Array.from(document.querySelectorAll('button,a,input,textarea,[role="button"],[contenteditable="true"],[role="tab"]'))
    .filter(el => el.offsetParent !== null || el.getClientRects().length)
    .map(el => ({ tag: el.tagName.toLowerCase(), text: (el.innerText||el.value||el.getAttribute('aria-label')||el.title||'').trim().slice(0,30),
      aria: el.getAttribute('aria-label')||'', title: el.title||'', id: el.id||'', type: el.type||'',
      cls: (typeof el.className==='string'?el.className:'').split(/\\s+/).filter(Boolean).slice(0,3).join('.'),
      disabled: !!el.disabled })))()`,
  bodyText: `document.body.innerText.slice(0, 4000)`,
  // 面板自身:是否可见、页脚是否在面板可视区内(不随长列表滚走)
  panelBox: `(() => { const p = document.querySelector('.aiskill-panel'); if (!p) return null;
    const r = p.getBoundingClientRect(); const f = document.querySelector('.aiskill-foot');
    const fr = f ? f.getBoundingClientRect() : null;
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width),
      footBottom: fr ? Math.round(fr.bottom) : null, footVisible: fr ? (fr.bottom <= r.bottom + 1 && fr.top >= r.top - 1) : false }; })()`,
  // click the first control whose visible text/aria/title contains `t`
  clickText: (t) => `(() => {
    const t = ${JSON.stringify(t)};
    const els = Array.from(document.querySelectorAll('button,a,[role="button"],[role="tab"],li,div,span'));
    const el = els.find(e => { const s = ((e.innerText||'') + ' ' + (e.getAttribute('aria-label')||'') + ' ' + (e.title||'')); return s.includes(t) && (e.offsetParent!==null || e.getClientRects().length); });
    if (!el) return 'NOT_FOUND';
    (el.closest('button,a,[role="button"],[role="tab"]') || el).click();
    return 'CLICKED';
  })()`,
  // set a React-controlled input's value and fire input event
  setInput: (selector, value) => `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'NOT_FOUND';
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'SET';
  })()`,
  // read the composer draft text (textarea value or contenteditable text)
  draft: `(() => { const ta = document.querySelector('textarea'); if (ta) return ta.value;
    const ce = document.querySelector('[contenteditable="true"]'); return ce ? ce.innerText : null; })()`,
  hasText: (t) => `document.body.innerText.includes(${JSON.stringify(t)})`,
  textCount: (t) => `document.body.innerText.split(${JSON.stringify(t)}).length - 1`,
};

// ── 主题 / 视口:走宿主自己的切换机制,不写死颜色 ────────────────────────────
// 宿主的主题运行时就是 `document.body.toggleAttribute('data-ds-dark-theme', dark)`,
// 且只有在偏好为 system 时才跟随 prefers-color-scheme。于是:先模拟媒体特性,若没
// 翻转(说明偏好被显式设成了 light/dark),再按宿主同一行翻转 —— 等价于用户在设置里点。
async function setTheme(chrome, dark) {
  await chrome.send('Emulation.setEmulatedMedia', {
    media: '', features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
  });
  await sleep(600);
  const isDark = await chrome.evaluate(`document.body.hasAttribute('data-ds-dark-theme')`);
  if (isDark !== dark) {
    await chrome.evaluate(`document.body.toggleAttribute('data-ds-dark-theme', ${dark})`);
    await sleep(250);
  }
  return dark;
}

async function setViewport(chrome, width, height) {
  await chrome.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(600);
}

/** 面板关键视觉量(全部取**解析后**的值):面板文字色 + 标题文字色。
    面板本身刻意透明(继承右侧栏底色),所以断言落在 token 驱动的文字色上。 */
const PROBE = `(() => { const p = document.querySelector('.aiskill-panel'); if (!p) return null;
  const ttl = document.querySelector('.aiskill-rowtitle');
  const pn = getComputedStyle(p);
  return { bg: pn.backgroundColor, fg: pn.color, title: ttl ? getComputedStyle(ttl).color : null }; })()`;

/** 面板可能随视口变化被关掉;没了就用侧栏入口再开。 */
async function ensurePanel(chrome) {
  if (await chrome.evaluate(`!!document.querySelector('.aiskill-panel')`)) return true;
  await chrome.evaluate(`(() => { const b = document.querySelector('button[title^="浏览本地技能"]'); if (b) b.click(); })()`);
  return chrome.waitFor(`!!document.querySelector('.aiskill-panel')`, { timeout: 8000 });
}

async function main() {
  const results = [];
  let harness = null, chrome = null, stub = null;
  const watchdog = setTimeout(() => {
    console.error('FAILED: 超出 ' + (HARD_TIMEOUT_MS / 1000) + 's 硬上限,强制退出');
    try { chrome?.kill(); } catch {}
    try { harness?.kill(); } catch {}
    try { stub?.close(); } catch {}
    process.exit(2);
  }, HARD_TIMEOUT_MS);
  watchdog.unref?.();
  try {
    if (SUBMIT) { stub = await startStub(); log('· 本地模型桩:' + stub.url + '(不发真实请求)'); }
    harness = await boot(stub ? { DEEPSEEK_BASE_URL: stub.url } : {});
    const served = await verifyServed(harness.base, harness.token);
    results.push('服务端发现并服务扩展 bundle(HTTP 200,' + served.bundleBytes + ' 字节),已进 __DSH_BOOT__');

    chrome = await launchChrome(harness.url, { profileDir: path.join(TESTDIR, 'chrome-profile') });
    await chrome.enable();

    // wait for the app shell to actually render
    const ready = await chrome.waitFor(`!!document.querySelector('textarea,[contenteditable="true"],button')`, { timeout: 20000 });
    assert.ok(ready, '前端没有渲染出任何控件');
    await sleep(2500); // let the client connect to the server websocket
    await chrome.screenshot(path.join(SHOTS, '01-home.png'));

    const controls = await chrome.evaluate(PAGE.controls);
    const bodyText = await chrome.evaluate(PAGE.bodyText);
    log('· 首页控件 ' + controls.length + ' 个:');
    for (const c of controls.slice(0, 60)) log('   ' + JSON.stringify(c));

    if (EXPLORE) {
      log('--- body text ---\n' + bodyText);
      const exactBtn = (label) => `(() => { const b = Array.from(document.querySelectorAll('button')).filter(x => (x.innerText||'').trim() === ${JSON.stringify(label)}); if (!b.length) return 'NONE'; b[b.length-1].click(); return 'CLICKED:'+b.length; })()`;
      const step = async (name, expr, waitMs = 1500) => {
        const r = await chrome.evaluate(expr).catch(e => 'ERR:' + e.message);
        await sleep(waitMs);
        await chrome.screenshot(path.join(SHOTS, name + '.png'));
        const bt = String(await chrome.evaluate(PAGE.bodyText)).replace(/\s+\n/g, '\n').slice(0, 1500);
        log('=== ' + name + ' (' + r + ') ===\n' + bt);
      };
      await step('02-dismiss', exactBtn('继续'));
      log('· 控件(去弹窗后):\n' + JSON.stringify(await chrome.evaluate(PAGE.controls), null, 0));
      await step('03-newsession', exactBtn('新会话'), 3000);
      log('· 控件(新会话后):\n' + JSON.stringify(await chrome.evaluate(PAGE.controls), null, 0));
      await step('04-library', `(() => { const b = document.querySelector('button[title^="浏览本地技能"]'); if (!b) return 'NONE'; b.click(); return 'CLICKED'; })()`, 2000);
      log('· 控件(技能库后):\n' + JSON.stringify(await chrome.evaluate(PAGE.controls), null, 0));
      log('· 技能/搜索 叶子节点:\n' + await chrome.evaluate(`(() => Array.from(document.querySelectorAll('*')).filter(e => e.childElementCount===0 && /技能|搜索技能|分类/.test(e.textContent||'')).slice(0,25).map(e => e.tagName+'.'+(typeof e.className==='string'?e.className.slice(0,24):'')+' :: '+(e.textContent||'').trim().slice(0,28)).join('\\n'))()`));
      log('· 搜索技能输入框存在: ' + await chrome.evaluate(`!!document.querySelector('input[placeholder*="搜索技能"]')`));
      // 搜索过滤 → 勾选两个 → 写入当前对话 → 看草稿/芯片
      const rowsBefore = await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]').length`);
      await chrome.evaluate(PAGE.setInput('input[placeholder*="搜索技能"]', '面试'));
      await sleep(600);
      const rowsAfter = await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]').length`);
      log('· 行数 before=' + rowsBefore + ' after搜索"面试"=' + rowsAfter);
      log('· 前3行文本: ' + JSON.stringify(await chrome.evaluate(`(() => Array.from(document.querySelectorAll('input[type=checkbox]')).slice(0,3).map(c => (c.closest('label')||c.parentElement).innerText.replace(/\\n/g,' | ').slice(0,60)))()`)));
      await chrome.evaluate(`(() => { const cbs = document.querySelectorAll('input[type=checkbox]'); cbs[0].click(); cbs[1].click(); return 'picked2'; })()`);
      await sleep(400);
      const addText = await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').startsWith('写入当前对话')); return b ? b.innerText : 'NO_BUTTON'; })()`);
      log('· 写入按钮: ' + addText);
      await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').startsWith('写入当前对话')); if (b) b.click(); return 'ok'; })()`);
      await sleep(1200);
      await chrome.screenshot(path.join(SHOTS, '05-chips.png'));
      log('· 编辑器 DOM:\n' + await chrome.evaluate(`(() => { const e = document.querySelector('.uV2eYG_input'); return e ? e.outerHTML.slice(0,700) : 'NO_INPUT'; })()`));
      log('· 编辑器文案: ' + JSON.stringify(await chrome.evaluate(`(() => { const e = document.querySelector('.uV2eYG_input'); return e ? e.innerText : null; })()`)));
      log('· body 含 /面试官 等 token? ' + await chrome.evaluate(`/\\/[a-z0-9-]+/.test(document.querySelector('.uV2eYG_input')?.innerText||'')`));
      log('· 控制台错误: ' + JSON.stringify(chrome.errors.slice(-5)));
      log('--- workspace.json ---\n' + fs.readFileSync(path.join(HOME, 'storages', 'workspace.json'), 'utf8'));
      log('--- console ---\n' + chrome.console.slice(-40).join('\n'));
      log('--- page errors ---\n' + chrome.errors.slice(-20).join('\n'));
      log('探索完成;截图 ' + SHOTS);
      return;
    }

    // ── 真实 DOM 验收 ──────────────────────────────────────────────────────
    // 首次启动可能弹出内测声明;有就点掉(没有也不报错)。
    await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').trim() === '继续'); if (b) b.click(); })()`);
    await sleep(500);

    // 1) 侧栏页脚入口
    assert.ok(await chrome.evaluate(`!!document.querySelector('button[title^="浏览本地技能"]')`), '侧栏页脚没有「技能库」入口');
    results.push('侧栏页脚渲染出「技能库」入口');

    // 1b) 侧栏页脚「联系开发者」:微信复制行、邮箱 mailto、开源地址都在真实 DOM 里
    assert.ok(await chrome.evaluate(`!!document.querySelector('button[title^="有疑问"]')`), '侧栏页脚没有「联系开发者」入口');
    assert.ok(await chrome.evaluate(`!!document.querySelector('a[href="https://github.com/chenyangxu442-ai/yufeng-ai-assistant"]')`), '侧栏页脚没有开源仓库链接');
    await chrome.evaluate(`document.querySelector('button[title^="有疑问"]').click()`);
    assert.ok(await chrome.waitFor(`!!document.querySelector('a[href^="mailto:chenyangxu442@gmail.com"]')`, { timeout: 5000 }), '展开后没有邮箱 mailto 链接');
    assert.ok(await chrome.evaluate(`Array.from(document.querySelectorAll('button')).some(b => (b.innerText||'').includes('xxx890332'))`), '展开后没有微信复制行');
    results.push('侧栏页脚「联系开发者」:微信复制行 + 邮箱 mailto + 开源链接均在真实 DOM');
    await chrome.evaluate(`document.querySelector('button[title^="有疑问"]').click()`);

    // 2) 点开:旁边开面板,聊天不消失
    await chrome.evaluate(`document.querySelector('button[title^="浏览本地技能"]').click()`);
    assert.ok(await chrome.waitFor(`!!document.querySelector('input[placeholder*="搜索技能"]')`, { timeout: 8000 }), '点「技能库」没打开右侧面板');
    assert.ok(await chrome.evaluate(`!!document.querySelector('[data-composer-input]')`), '打开面板后聊天输入面消失了(面板顶掉了聊天)');
    results.push('点「技能库」在右侧开面板,聊天输入面仍在');
    await chrome.screenshot(path.join(SHOTS, 'a-panel-open.png'));

    // home 是复用的,上一条会话可能残留草稿;清干净再开始,断言才确定。
    for (let i = 0; i < 6; i++) {
      const n = await chrome.evaluate(`document.querySelectorAll('button[title="从本条消息移除"]').length`);
      if (!n) break;
      await chrome.evaluate(`document.querySelector('button[title="从本条消息移除"]').click()`);
      await sleep(300);
    }

    // 3) 搜索过滤
    const rowsBefore = await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]').length`);
    assert.ok(rowsBefore > 100, '技能目录行数异常:' + rowsBefore);
    await chrome.evaluate(PAGE.setInput('input[placeholder*="搜索技能"]', '面试'));
    await sleep(700);
    const rowsAfter = await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]').length`);
    assert.ok(rowsAfter > 0 && rowsAfter < rowsBefore, '搜索没有过滤:' + rowsBefore + '→' + rowsAfter);
    results.push('搜索「面试」把 ' + rowsBefore + ' 条过滤到 ' + rowsAfter + ' 条');

    // 4) 选两个 → 写入当前对话 → 草稿出现两个原生 / 令牌
    await chrome.evaluate(`(() => { const c = document.querySelectorAll('input[type=checkbox]'); c[0].click(); c[1].click(); })()`);
    await sleep(400);
    await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').startsWith('写入当前对话')); if (!b) throw new Error('找不到写入按钮'); b.click(); })()`);
    await sleep(1200);
    const tokens = await chrome.evaluate(`Array.from(document.querySelectorAll('[data-composer-input] [data-composer-text-ref]')).map(e => e.innerText)`);
    assert.equal(tokens.length, 2, '写入后草稿令牌数不是 2:' + JSON.stringify(tokens));
    assert.ok(tokens.every(t => /^\/library-/.test(t)), '草稿令牌不是原生 /技能名:' + JSON.stringify(tokens));
    results.push('选两条→写入,草稿出现原生令牌 ' + JSON.stringify(tokens));
    await chrome.screenshot(path.join(SHOTS, 'b-draft.png'));

    // 5) 作曲器上方中文芯片
    const chips = await chrome.evaluate(`document.querySelectorAll('button[title="从本条消息移除"]').length`);
    assert.equal(chips, 2, '中文技能芯片数不是 2:' + chips);
    results.push('作曲器上方出现 2 个中文技能芯片');
    await chrome.screenshot(path.join(SHOTS, 'c-chips.png'));

    // 6) 点芯片 × → 草稿真的少一个令牌
    await chrome.evaluate(`document.querySelectorAll('button[title="从本条消息移除"]')[0].click()`);
    await sleep(800);
    const left = await chrome.evaluate(`Array.from(document.querySelectorAll('[data-composer-input] [data-composer-text-ref]')).length`);
    assert.equal(left, 1, '移除芯片后草稿令牌应剩 1,实际 ' + left);
    results.push('点芯片 × 后草稿真的少一个令牌(剩 1)');
    await chrome.screenshot(path.join(SHOTS, 'd-removed.png'));

    // 7) 面板结构:紧凑头部 + 单个分类下拉 + 结果计数 + 无内部 ID + 固定页脚
    const catOptions = await chrome.evaluate(`(() => { const s = document.querySelector('.aiskill-select'); return s ? s.options.length : -1; })()`);
    assert.strictEqual(catOptions, 23, '分类下拉应是「全部类别 + 22 个分类」,实际 ' + catOptions);
    const noPillWall = await chrome.evaluate(`document.querySelectorAll('.aiskill-panel button').length`);
    assert.ok(noPillWall <= 3, '面板里不该有一墙分类胶囊按钮,实际 ' + noPillWall + ' 个 button');
    assert.ok(await chrome.evaluate(PAGE.hasText('个技能')), '头部缺少技能总数');
    assert.ok(await chrome.evaluate(PAGE.hasText('仅用于下一条消息')), '头部缺少一行用途说明');
    assert.ok(await chrome.evaluate(`!!document.querySelector('.aiskill-rowtitle') && !/library-/.test(document.querySelector('.aiskill-panel').innerText)`), '列表里出现了内部 library- 哈希 ID');
    assert.ok(await chrome.evaluate(`!!document.querySelector('button[title^="浏览本地技能"] svg') && !document.querySelector('button[title^="浏览本地技能"]').innerText.includes('★')`), '侧栏入口应是线性 SVG 图标,不是 ★');
    const box = await chrome.evaluate(PAGE.panelBox);
    assert.ok(box && box.footVisible, '操作页脚没有固定在面板可视区内:' + JSON.stringify(box));
    results.push('面板结构:紧凑头部 + 分类下拉(' + catOptions + ' 项)+ 固定页脚,列表无内部 ID,入口用 SVG');

    // 8) 明暗 + 宽窄:只切宿主主题/视口,颜色全靠 token 跟随。
    //    勾两条,让截图里同时有「选中行 + 可用主按钮」,而不是只有禁用态。
    const pickTwoRows = async () => {
      for (let i = 0; i < 3; i++) {
        if (await chrome.evaluate(`!document.querySelector('.aiskill-primary').disabled`)) return true;
        await chrome.evaluate(`(() => { const c = document.querySelectorAll('input[type=checkbox]'); c[0].click(); c[1].click(); })()`);
        await sleep(400);
      }
      return chrome.evaluate(`!document.querySelector('.aiskill-primary').disabled`);
    };
    const panels = () => chrome.evaluate(`document.querySelectorAll('.aiskill-panel').length`);
    await setViewport(chrome, 1400, 900);
    await setTheme(chrome, false);
    assert.ok(await ensurePanel(chrome), '1400px 下面板打不开');
    assert.strictEqual(await panels(), 1, '1400px 下应只有一个面板实例');
    assert.ok(await pickTwoRows(), '1400px 下勾选两行后面板主按钮仍禁用');
    const primary = await chrome.evaluate(`(() => { const b = document.querySelector('.aiskill-primary'); return b ? { text: b.innerText, disabled: b.disabled } : null; })()`);
    assert.ok(primary && !primary.disabled && /\(2\)/.test(primary.text), '选中两条后主按钮应是可用的「写入当前对话 (2)」:' + JSON.stringify(primary));
    const light = await chrome.evaluate(PROBE);
    await chrome.screenshot(path.join(SHOTS, 'g-light-1400.png'));
    await setTheme(chrome, true);
    const dark = await chrome.evaluate(PROBE);
    await chrome.screenshot(path.join(SHOTS, 'h-dark-1400.png'));
    assert.ok(light && dark && light.fg !== dark.fg, '明暗主题下面板文字色没变:' + JSON.stringify([light?.fg, dark?.fg]));
    assert.ok(dark.title && dark.title !== light.title, '明暗主题下标题文字色没变');
    await setViewport(chrome, 1024, 768);
    await setTheme(chrome, false);
    assert.ok(await ensurePanel(chrome), '1024px 后面板打不开');
    const panelN = await panels();
    assert.ok(await pickTwoRows(), '1024px 下勾选两行后面板主按钮仍禁用(面板实例 ' + panelN + ' 个)');
    await chrome.screenshot(path.join(SHOTS, 'i-light-1024.png'));
    const narrow = await chrome.evaluate(PAGE.panelBox);
    assert.ok(narrow && narrow.width <= 460, '1024px 下面板没有收窄:' + JSON.stringify(narrow));
    assert.strictEqual(await panels(), 1, '1024px 下应只有一个面板实例(不应隐藏挂载第二份)');
    assert.ok(await chrome.evaluate(`getComputedStyle(document.querySelector('.aiskill-rowdesc')).display === 'none'`), '窄面板应收起描述行');
    await setTheme(chrome, true);
    await chrome.screenshot(path.join(SHOTS, 'j-dark-1024.png'));
    await setViewport(chrome, 1400, 900);
    await setTheme(chrome, false);
    assert.ok(await ensurePanel(chrome), '切回 1400px 后面板消失了');
    results.push('明暗 + 宽窄四态截图(含选中态):token 跟随主题,1024px 面板宽 ' + (narrow && narrow.width) + 'px');
    await chrome.screenshot(path.join(SHOTS, 'k-final-1400.png'));
    // 收尾:把勾选清空,后续步骤从「未选」这个确定状态开始。
    await chrome.evaluate(`(() => { const b = document.querySelector('.aiskill-ghost'); if (b && !b.disabled) b.click(); })()`);
    await sleep(300);
    assert.strictEqual(await chrome.evaluate(`document.querySelector('.aiskill-primary').disabled`), true, '清空选择后主按钮应变回禁用');

    if (SUBMIT) {
      // 真实走一次「发送」:模型端点指向本地桩(不发真实请求)。
      // 已核实的确切宿主语义:提交后草稿即被清;模型调用失败被当作**可重试错误**,
      // 消息已进会话(带所选技能)并自动重试,不是「丢掉重来」。
      const tokExpr = `Array.from(document.querySelectorAll('[data-composer-input] [data-composer-text-ref]')).map(e => e.innerText)`;
      const clearDraft = async () => {
        for (let i = 0; i < 6; i++) {
          const n = await chrome.evaluate(`document.querySelectorAll('button[title="从本条消息移除"]').length`);
          if (!n) break;
          await chrome.evaluate(`document.querySelector('button[title="从本条消息移除"]').click()`);
          await sleep(300);
        }
      };
      const pickTwo = async () => {
        await clearDraft();
        await chrome.evaluate(PAGE.setInput('input[placeholder*="搜索技能"]', '面试'));
        await sleep(600);
        await chrome.evaluate(`(() => { const c = document.querySelectorAll('input[type=checkbox]'); c[0].click(); c[1].click(); })()`);
        await sleep(300);
        await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').startsWith('写入当前对话')); if (!b) throw new Error('no write btn'); b.click(); })()`);
        await sleep(1000);
        return chrome.evaluate(tokExpr);
      };
      const send = () => chrome.evaluate(`document.querySelector('button[aria-label="发送消息"]').click()`);

      // 1) 发送成功 → 草稿清空,且所选技能随该条消息一起提交(会话里可见)
      const picked = await pickTwo();
      assert.equal(picked.length, 2, '准备草稿失败:' + JSON.stringify(picked));
      stub.set('ok');
      await send();
      const cleared = await chrome.waitFor(`${tokExpr}.length === 0`, { timeout: 20000 });
      assert.ok(cleared, '发送成功后草稿没被清空');
      results.push('发送成功 → 草稿被清空');
      const attached = await chrome.evaluate(`(${JSON.stringify(picked)}).every(t => document.body.innerText.includes(t))`);
      assert.ok(attached, '已提交的消息里看不到所选技能令牌:' + JSON.stringify(picked));
      results.push('所选技能随该条消息提交到当前会话(' + picked.join(' ') + ')');
      await chrome.screenshot(path.join(SHOTS, 'e-sent.png'));

      // 2) 模型调用报错 → 消息已提交并自动重试,不丢消息
      const picked2 = await pickTwo();
      assert.equal(picked2.length, 2, '第二次准备草稿失败:' + JSON.stringify(picked2));
      stub.set('fail');
      await send();
      const committed = await chrome.waitFor(`/正在重试模型请求|深度求索中|重试/.test(document.body.innerText)`, { timeout: 12000 });
      assert.ok(committed, '模型报错时应表现为「已提交并重试」,而不是丢消息');
      const stillThere = await chrome.evaluate(`(${JSON.stringify(picked2)}).every(t => document.body.innerText.includes(t))`);
      assert.ok(stillThere, '报错后会话里看不到已提交的技能令牌');
      results.push('模型报错 → 该条消息已提交并自动重试(消息与技能未丢失)');
      await chrome.screenshot(path.join(SHOTS, 'f-retry.png'));
      assert.ok(stub.hits.length >= 3, '桩没有收到预期请求:' + JSON.stringify(stub.hits));
    }

    assert.deepEqual(chrome.errors, [], '页面出现运行时错误:' + JSON.stringify(chrome.errors.slice(0, 3)));
    log('runtime OK');
    for (const line of results) log('  ✓ ' + line);
  } finally {
    clearTimeout(watchdog);
    try { chrome?.kill(); } catch {}
    try { harness?.kill(); } catch {}
    try { stub?.close(); } catch {}
  }
}

// 作为模块被别的测试 import 时,不要顺手跑一遍完整验收(scenario-panel.mjs 复用 boot/verifyServed)。
export { boot, verifyServed, startStub, PAGE, setTheme, setViewport, ensurePanel, EXT_ID, TESTDIR, HOME, SHOTS };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FAILED: ' + (e && e.message)); process.exitCode = 1; });
}
