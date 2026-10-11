// installer-branding.mjs — 用**真 Chrome** 打开装机首页,核对品牌名、联系方式、
// 复制处理与开源地址都是页面上真实、可点的 DOM(不是拿源码做字符串比对)。
//
// 页面是静态的(web/index.html),动态数据全靠 /api/*。这里用一个最小静态服务
// 顶掉那几个接口(只需 200 的桩响应让 init() 不报错),于是断言只针对品牌与联系,
// 不牵扯真实安装。纯本地、不联网、不用密钥。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { launchChrome } from './cdp.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(REPO, 'app', 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/api/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ installed: false, configured: false, shortcut: null })); }
  if (rel === '/api/detect') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ items: [] })); }
  const file = path.join(WEB, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';

let chrome;
try {
  chrome = await launchChrome(url, { profileDir: path.join(REPO, 'work', 'branding-chrome') });
  await chrome.enable();
  assert.ok(await chrome.waitFor(`!!document.querySelector('.sb-brand .name')`, { timeout: 15000 }), '装机首页没有渲染出品牌区');

  const info = await chrome.evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const img = q('.brandmark');
    return {
      title: document.title,
      name: q('.sb-brand .name').textContent.trim(),
      sub: q('.sb-brand .sub').textContent.trim(),
      wx: q('#copyWx').textContent.trim(),
      wxCopy: q('#copyWx').dataset.copy,
      mailHref: q('a[href^="mailto:"]').getAttribute('href'),
      mailText: q('a[href^="mailto:"]').textContent.trim(),
      ghHref: q('#githubLink').getAttribute('href'),
      ghText: q('#githubLink').textContent.trim(),
      imgOk: !!(img && img.complete && img.naturalWidth > 0),
      openBtn: q('#openBtn').textContent.trim(),
      shortcutHint: q('#shortcutHint').textContent.trim(),
    };
  })()`);

  assert.equal(info.title, '与风AI助手');
  assert.equal(info.name, '与风AI助手');
  assert.match(info.sub, /DeepSeek/);
  assert.match(info.wx, /xxx890332/);
  assert.equal(info.wxCopy, 'xxx890332');
  assert.equal(info.mailHref, 'mailto:chenyangxu442@gmail.com');
  assert.match(info.mailText, /chenyangxu442@gmail\.com/);
  assert.equal(info.ghHref, 'https://github.com/chenyangxu442-ai/yufeng-ai-assistant');
  assert.equal(info.ghText, '开源项目，欢迎交流。有疑问请联系，有问题欢迎反馈。');
  assert.ok(info.imgOk, '首页品牌图必须真的加载出来(证明 PNG 一并发布)');
  assert.match(info.openBtn, /与风AI助手/);
  assert.match(info.shortcutHint, /与风AI助手/);

  // 点微信:处理函数必须真的带着正确号码跑 —— 成功或失败都会把号码回显到提示条。
  await chrome.evaluate(`document.querySelector('#copyWx').click(); true`);
  const banner = await chrome.waitFor(
    `(document.querySelector('#banner')?.textContent || '').includes('xxx890332') ? document.querySelector('#banner').textContent : ''`,
    { timeout: 5000 });
  assert.ok(banner, '点微信应触发复制处理并回显号码');

  console.log('PASS 真 Chrome 装机首页: 品牌名/微信复制/邮箱 mailto/开源链接/品牌图');
} finally {
  if (chrome) chrome.kill();
  await new Promise((r) => server.close(r));
}
