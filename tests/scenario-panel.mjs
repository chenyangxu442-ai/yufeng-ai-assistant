// scenario-panel.mjs — 「任务场景」页的真实浏览器验收(装机产物 + 真 Chrome)
//
// 复用 panel-runtime.mjs 的 boot/verifyServed:同一个隔离 DSH_HOME、同一份真实
// 随包 Harness、同一套真装机路径,只是换成驱动「任务场景」这条链。
//
// 证明的是用户在真实 DOM 里能看到/做到的事:
//   1. 侧栏出现「任务场景」行(线性 SVG glyph,不是 ★,不是 emoji),点它换主面板;
//   2. 主面板列出 4 个场景(整理文件/处理表格/写材料/做网页),每个都有结果、
//      需要你提供什么、一份可编辑模板;
//   3. 推荐技能默认**全不勾**(不静默启用),可以手动勾;
//   4. 「写入当前对话并返回」= 模板**追加**进当前会话草稿:原有文字、原有 /skill
//      令牌都还在,新勾的技能以 /name 令牌加进来,然后切回会话面板;
//   5. 不自动发送(草稿没被清空、没有新消息)。
//
//   node tests/scenario-panel.mjs
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { launchChrome, sleep } from './cdp.mjs';
import { boot, verifyServed, PAGE, setTheme, setViewport, SHOTS } from './panel-runtime.mjs';

const HARD_TIMEOUT_MS = 120 * 1000;
// 场景模板改成的独特标记 —— 用来在草稿里认出「我改的那份」。
const MARKER = '【场景模板·验收标记】请按文件类型归档,先给方案。';
const PRIOR_TEXT = '我已经写了一段需求。';
const ROW = 'button[aria-label="任务场景"]';

const DRAFT = `(() => { const el = document.querySelector('[data-composer-input]'); return el ? el.innerText : ''; })()`;
const TOKENS = `Array.from(document.querySelectorAll('[data-composer-input] [data-composer-text-ref]')).map(e => e.innerText)`;

function log(...a) { console.log(...a); }

// 把文字真的打进作曲器:焦点到 contenteditable,再用 CDP 的插入文本(等价于输入法/键盘输入)。
async function typeIntoComposer(chrome, text) {
  const box = await chrome.waitFor(`(() => { const el = document.querySelector('[data-composer-input]'); if (!el || el.contentEditable !== 'true') return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.x + 12, y: r.y + 12 } : null; })()`, { timeout: 8000 });
  assert.ok(box, '作曲器输入面不存在,无法预置草稿');
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 });
  await chrome.send('Input.insertText', { text });
  return chrome.waitFor(`${DRAFT}.includes(${JSON.stringify(text)})`, { timeout: 5000 });
}

async function main() {
  const results = [];
  let harness = null, chrome = null;
  const watchdog = setTimeout(() => {
    console.error('FAILED: 超出 ' + (HARD_TIMEOUT_MS / 1000) + 's 硬上限,强制退出');
    try { chrome?.kill(); } catch {}
    try { harness?.kill(); } catch {}
    process.exit(2);
  }, HARD_TIMEOUT_MS);
  watchdog.unref?.();
  try {
    harness = await boot({});
    const served = await verifyServed(harness.base, harness.token);
    results.push('服务端发现并服务扩展 bundle(HTTP 200,' + served.bundleBytes + ' 字节)');

    fs.mkdirSync(SHOTS, { recursive: true });
    chrome = await launchChrome(harness.url, { profileDir: path.join(path.dirname(SHOTS), 'chrome-profile-scenes') });
    await chrome.enable();
    assert.ok(await chrome.waitFor(`!!document.querySelector('[data-composer-input],button')`, { timeout: 20000 }), '前端没有渲染出任何控件');
    await sleep(2500);
    await setViewport(chrome, 1400, 900);
    await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').trim() === '继续'); if (b) b.click(); })()`);
    await sleep(500);

    // ── 0. 预置草稿:先有一段自己的文字 + 一个真实技能令牌(走技能库面板的原生写入)──
    assert.ok(await typeIntoComposer(chrome, PRIOR_TEXT), '预置的草稿文字没进作曲器');
    await chrome.evaluate(`(() => { const b = document.querySelector('button[title^="浏览本地技能"]'); if (!b) throw new Error('没有技能库入口'); b.click(); })()`);
    assert.ok(await chrome.waitFor(`!!document.querySelector('input[placeholder*="搜索技能"]')`, { timeout: 8000 }), '技能库面板没打开');
    await chrome.evaluate(PAGE.setInput('input[placeholder*="搜索技能"]', '面试'));
    await sleep(700);
    await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]')[0].click()`);
    await sleep(400);
    await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.innerText||'').startsWith('写入当前对话')); if (!b) throw new Error('没有写入按钮'); b.click(); })()`);
    await sleep(1200);
    const priorTokens = await chrome.evaluate(TOKENS);
    assert.equal(priorTokens.length, 1, '预置技能令牌失败:' + JSON.stringify(priorTokens));
    assert.ok(priorTokens.every((t) => /^\/library-/.test(t)), '预置令牌不是原生技能名:' + JSON.stringify(priorTokens));
    const draftBefore = await chrome.evaluate(DRAFT);
    assert.ok(draftBefore.includes(PRIOR_TEXT), '写入技能后原有文字丢了:' + JSON.stringify(draftBefore));
    results.push('预置草稿:自己的文字 + 真实技能令牌 ' + JSON.stringify(priorTokens));
    await chrome.screenshot(path.join(SHOTS, 'scenes-01-prior-draft.png'));

    // ── 1. 侧栏出现「任务场景」行,glyph 是线性 SVG ──────────────────────────
    assert.ok(await chrome.evaluate(`!!document.querySelector(${JSON.stringify(ROW)})`), '侧栏没有「任务场景」行');
    assert.ok(await chrome.evaluate(`!!document.querySelector(${JSON.stringify(ROW)}).querySelector('svg')`), '「任务场景」行没有 SVG 图标');
    assert.ok(await chrome.evaluate(`!document.querySelector(${JSON.stringify(ROW)}).innerText.includes('★')`), '「任务场景」行不该用 ★');
    results.push('侧栏出现「任务场景」行(线性 SVG glyph)');

    // ── 2. 点它 → 主面板换成任务场景;聊天作曲器让位 ─────────────────────────
    await chrome.evaluate(`document.querySelector(${JSON.stringify(ROW)}).click()`);
    assert.ok(await chrome.waitFor(`!!document.querySelector('.aiskill-scenes')`, { timeout: 8000 }), '点「任务场景」没有换出主面板');
    // 换面板会顺带收起右侧技能库页;等主列真的铺满再断言布局。
    assert.ok(await chrome.waitFor(`(() => { const s = document.querySelector('.aiskill-scenes'); return !!s && s.getBoundingClientRect().width >= 600; })()`, { timeout: 8000 }), '主列没有铺满(右栏没收起?)');
    assert.strictEqual(await chrome.evaluate(`document.querySelector(${JSON.stringify(ROW)}).getAttribute('aria-current')`), 'page', '选中行没有 aria-current');
    results.push('点侧栏行 → 主列换成任务场景面板(行 aria-current=page)');
    await chrome.screenshot(path.join(SHOTS, 'scenes-02-panel.png'));

    // ── 3. 四个场景,每个都有结果 / 需要你提供 / 可编辑模板 ───────────────────
    //    用 textContent(结构),不受列宽影响。
    const heads = await chrome.evaluate(`Array.from(document.querySelectorAll('.aiskill-scene-head')).map(b => (b.textContent||'').replace(/\\s+/g,' ').trim())`);
    assert.equal(heads.length, 4, '场景数不是 4:' + JSON.stringify(heads));
    for (const title of ['整理文件', '处理表格', '写材料', '做网页']) {
      assert.ok(heads.some((h) => h.includes(title)), '缺少场景 ' + title + ':' + JSON.stringify(heads));
    }
    assert.ok(heads.every((h) => h.includes('需要你提供')), '场景行缺少「需要你提供」:' + JSON.stringify(heads));
    assert.ok(heads.every((h) => h.length > 30), '场景行缺少「结果」描述:' + JSON.stringify(heads));
    results.push('主面板列出 4 个场景,每行有结果与「需要你提供」:' + heads.map((h) => h.split(' ')[0]).join('/'));

    // ── 3b. 容器查询:主列变窄时收起「需要你提供」,变宽再回来 ────────────────
    assert.ok(await chrome.evaluate(`getComputedStyle(document.querySelector('.aiskill-scene-needs')).display !== 'none'`), '整宽主列下「需要你提供」应可见');
    await setViewport(chrome, 640, 900);
    const narrowW = await chrome.evaluate(`Math.round(document.querySelector('.aiskill-scenes').getBoundingClientRect().width)`);
    assert.ok(narrowW < 600, '视口 640px 下主列没有变窄:' + narrowW);
    assert.strictEqual(await chrome.evaluate(`getComputedStyle(document.querySelector('.aiskill-scene-needs')).display`), 'none', '窄主列下应收起「需要你提供」');
    await chrome.screenshot(path.join(SHOTS, 'scenes-02-narrow.png'));
    await setViewport(chrome, 1400, 900);
    assert.ok(await chrome.evaluate(`getComputedStyle(document.querySelector('.aiskill-scene-needs')).display !== 'none'`), '恢复整宽后「需要你提供」应回来');
    results.push('容器查询生效:主列 ' + narrowW + 'px 时收起「需要你提供」,整宽时恢复');

    // ── 4. 展开「写材料」:模板可编辑、推荐技能默认全不勾 ──────────────────────
    const openScene = await chrome.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('.aiskill-scene-head')).find(x => (x.innerText||'').includes('写材料'));
      if (!b) return 'NOT_FOUND'; b.click(); return 'CLICKED'; })()`);
    assert.strictEqual(openScene, 'CLICKED', '展不开「写材料」');
    assert.ok(await chrome.waitFor(`!!document.querySelector('.aiskill-scene.is-open .aiskill-scene-textarea')`, { timeout: 5000 }), '展开后没有可编辑模板');
    const tpl = await chrome.evaluate(`document.querySelector('.aiskill-scene.is-open .aiskill-scene-textarea').value`);
    assert.ok(tpl && tpl.length > 40, '模板文本太短/为空:' + JSON.stringify(tpl));
    const skillCount = await chrome.evaluate(`document.querySelectorAll('.aiskill-scene.is-open .aiskill-scene-skill input[type=checkbox]').length`);
    const checkedCount = await chrome.evaluate(`document.querySelectorAll('.aiskill-scene.is-open .aiskill-scene-skill input[type=checkbox]:checked').length`);
    assert.ok(skillCount > 0, '场景没有推荐技能可勾');
    assert.strictEqual(checkedCount, 0, '推荐技能默认不该被勾上(会静默启用):' + checkedCount);
    results.push('展开「写材料」:模板可编辑(' + tpl.length + ' 字),推荐技能 ' + skillCount + ' 个默认全不勾');
    await chrome.screenshot(path.join(SHOTS, 'scenes-03-expanded.png'));

    // ── 5. 改模板 + 勾一个技能 ───────────────────────────────────────────────
    await chrome.evaluate(PAGE.setInput('.aiskill-scene.is-open .aiskill-scene-textarea', MARKER));
    assert.strictEqual(await chrome.evaluate(`document.querySelector('.aiskill-scene.is-open .aiskill-scene-textarea').value`), MARKER, '模板改不动');
    await chrome.evaluate(`document.querySelector('.aiskill-scene.is-open .aiskill-scene-skill input[type=checkbox]').click()`);
    await sleep(300);
    assert.strictEqual(await chrome.evaluate(`document.querySelectorAll('.aiskill-scene.is-open .aiskill-scene-skill input[type=checkbox]:checked').length`), 1, '勾选没生效');
    const pickedSkill = await chrome.evaluate(`(() => { const l = document.querySelector('.aiskill-scene.is-open .aiskill-scene-skill input[type=checkbox]:checked').closest('label'); return l ? l.getAttribute('title') : null; })()`);
    assert.match(pickedSkill, /^library-/, '勾中的推荐技能名不是真实目录名:' + pickedSkill);
    const useText = await chrome.evaluate(`Array.from(document.querySelectorAll('.aiskill-scene.is-open button')).map(b => b.innerText).find(t => t && t.includes('写入当前对话'))`);
    assert.ok(useText && /\(1\)/.test(useText), '按钮没有反映已勾 1 个技能:' + useText);
    results.push('改模板 + 勾 1 个推荐技能(' + pickedSkill + '),按钮显示 ' + JSON.stringify(useText));
    await chrome.screenshot(path.join(SHOTS, 'scenes-04-edited.png'));

    // ── 6. 写入当前对话并返回 ───────────────────────────────────────────────
    await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('.aiskill-scene.is-open button')).find(x => (x.innerText||'').includes('写入当前对话')); if (!b) throw new Error('没有写入按钮'); b.click(); })()`);
    assert.ok(await chrome.waitFor(`!document.querySelector('.aiskill-scenes')`, { timeout: 8000 }), '写入后没有切回会话面板');
    assert.ok(await chrome.waitFor(`!!document.querySelector('[data-composer-input]')`, { timeout: 8000 }), '切回后作曲器不见了');
    assert.strictEqual(await chrome.evaluate(`document.querySelector(${JSON.stringify(ROW)}).getAttribute('aria-current')`), null, '切回后侧栏行仍是选中态');
    results.push('点「写入当前对话并返回」→ 切回会话面板,作曲器回来了');

    // ── 7. 草稿:原有文字 + 原令牌 + 我改的模板 + 新令牌,一个都不少 ─────────────
    const draftAfter = await chrome.evaluate(DRAFT);
    const tokensAfter = await chrome.evaluate(TOKENS);
    assert.ok(draftAfter.includes(PRIOR_TEXT), '原有文字被覆盖了:' + JSON.stringify(draftAfter));
    assert.ok(draftAfter.includes(MARKER), '我改过的模板没进草稿:' + JSON.stringify(draftAfter));
    assert.ok(tokensAfter.length === 2, '草稿令牌数应为「原有 1 + 新勾 1」= 2,实际 ' + JSON.stringify(tokensAfter));
    for (const t of priorTokens) assert.ok(tokensAfter.includes(t), '原有技能令牌丢了:' + t);
    assert.ok(tokensAfter.includes('/' + pickedSkill), '新勾技能的令牌没进草稿:' + pickedSkill);
    assert.ok(/\n\s*\n/.test(draftAfter) || draftAfter.indexOf(MARKER) > draftAfter.indexOf(PRIOR_TEXT), '模板没有追加在原有内容之后');
    results.push('草稿保留原有文字 + 令牌 ' + JSON.stringify(tokensAfter) + ',并追加了改过的模板');
    await chrome.screenshot(path.join(SHOTS, 'scenes-05-written.png'));

    // ── 8. 不自动发送 ───────────────────────────────────────────────────────
    await sleep(2500);
    const draftStill = await chrome.evaluate(DRAFT);
    assert.ok(draftStill.includes(MARKER), '草稿被清空了 —— 说明被自动发送了');
    const stillTokens = await chrome.evaluate(TOKENS);
    assert.strictEqual(stillTokens.length, 2, '草稿令牌被清 —— 说明被自动发送了:' + JSON.stringify(stillTokens));
    results.push('等 2.5s 后草稿仍在(未自动发送,只作用于下一条)');
    await chrome.screenshot(path.join(SHOTS, 'scenes-06-no-autosend.png'));

    // ── 9. 最佳截图:回场景页,展开一个场景,明暗各一张(token 跟随宿主)────────
    await chrome.evaluate(`document.querySelector(${JSON.stringify(ROW)}).click()`);
    assert.ok(await chrome.waitFor(`!!document.querySelector('.aiskill-scenes')`, { timeout: 8000 }), '回不到场景页');
    await chrome.waitFor(`(() => { const s = document.querySelector('.aiskill-scenes'); return !!s && s.getBoundingClientRect().width >= 600; })()`, { timeout: 8000 });
    await chrome.evaluate(`(() => { const b = Array.from(document.querySelectorAll('.aiskill-scene-head')).find(x => (x.innerText||'').includes('整理文件')); if (b) b.click(); })()`);
    assert.ok(await chrome.waitFor(`!!document.querySelector('.aiskill-scene.is-open .aiskill-scene-textarea')`, { timeout: 5000 }), '「整理文件」展不开');
    const sceneFg = () => chrome.evaluate(`getComputedStyle(document.querySelector('.aiskill-scenes')).color`);
    await setTheme(chrome, false);
    const fgLight = await sceneFg();
    await chrome.screenshot(path.join(SHOTS, 'scenes-best.png'));
    await setTheme(chrome, true);
    const fgDark = await sceneFg();
    await chrome.screenshot(path.join(SHOTS, 'scenes-best-dark.png'));
    assert.ok(fgLight && fgDark && fgLight !== fgDark, '明暗主题下场景页文字色没变:' + JSON.stringify([fgLight, fgDark]));
    results.push('最佳截图 scenes-best.png / scenes-best-dark.png(明暗两态,文字色 ' + fgLight + ' → ' + fgDark + ')');

    assert.deepEqual(chrome.errors, [], '页面出现运行时错误:' + JSON.stringify(chrome.errors.slice(0, 3)));
    log('scenario-panel OK');
    for (const line of results) log('  ✓ ' + line);
  } finally {
    clearTimeout(watchdog);
    try { chrome?.kill(); } catch {}
    try { harness?.kill(); } catch {}
  }
}

main().catch((e) => { console.error('FAILED: ' + (e && e.message)); process.exitCode = 1; });
