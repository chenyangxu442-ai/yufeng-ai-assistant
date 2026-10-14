'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.join(__dirname, '..');
let failed = 0;
// 被测启动器会 unref 常驻助手；测试仍需等待清理和后续断言。
const keepAlive = setInterval(() => {}, 1000);
async function check(name, run) {
  try { await run(); console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
}
async function ui(stream, rejectTest = false, state = { installed: false, configured: false }) {
  const els = new Map();
  const element = () => ({ style: {}, dataset: {}, classList: { toggle() {} }, textContent: '', innerHTML: '', value: '', disabled: false,
    querySelector() { return element(); }, appendChild() {}, scrollIntoView() {} });
  const get = id => { if (!els.has(id)) els.set(id, element()); return els.get(id); };
  get('key').value = 'sk-fake-test-only';
  const calls = [];
  const ctx = {
    document: { getElementById: get, querySelectorAll: () => [], querySelector: element, createElement: element },
    IntersectionObserver: class { observe() {} }, TextDecoder, AbortSignal, console,
    fetch: async (url) => {
      calls.push(url);
      if (url === '/api/install' || url === '/api/repair') return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
      if (url === '/api/test') { if (rejectTest) throw new Error('offline'); return Response.json({ ok: true }); }
      if (url === '/api/detect') return Response.json({ items: [] });
      return Response.json(state);
    },
  };
  vm.createContext(ctx);
  const source = fs.readFileSync(path.join(root, 'app/web/index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(source, ctx);
  await new Promise(resolve => setImmediate(resolve));
  return { get, ctx, calls };
}
(async () => {
  await check('配置拒绝换行注入且不改原文件', () => {
    const config = require('../engine/config');
    const dir = fs.mkdtempSync(path.join(root, 'work', 'config-test-'));
    try {
      fs.writeFileSync(path.join(dir, '.env'), 'OTHER=keep\n');
      assert.throws(() => config.write('sk-fake\nOTHER=changed', dir));
      assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), 'OTHER=keep\n');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  const server = http.createServer((q, r) => {
    if (q.url.startsWith('/empty/')) { r.setHeader('Content-Type', 'application/json'); r.end('{}'); }
    else { r.writeHead(401); r.end('Your API key: sk-fake-sensitive-value'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const { testDeepSeek } = require('../engine/test');
    await check('服务端报错不会回显密钥', async () => {
      const result = await testDeepSeek('sk-fake-sensitive-value', null, base);
      assert.ok(!result.err.includes('sk-fake-sensitive-value'));
    });
    await check('空的成功响应不能判为可用', async () => {
      assert.equal((await testDeepSeek('sk-fake', null, base + '/empty')).ok, false);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
  await check('安装流没有完成事件不能显示成功', async () => {
    const { get } = await ui('{"type":"stage-start","index":1,"total":3,"title":"test"}\n');
    await get('installBtn').onclick();
    assert.notEqual(get('doneCard').style.display, 'block');
    assert.match(get('banner').textContent, /中断|完成|出错/);
  });
  await check('最后一条无换行的失败事件必须生效', async () => {
    const { get } = await ui('{"type":"error","message":"fake failure"}');
    await get('installBtn').onclick();
    assert.notEqual(get('doneCard').style.display, 'block');
  });
  await check('连接失败后测试按钮恢复', async () => {
    const { get } = await ui('', true);
    await get('testKey').onclick();
    assert.equal(get('testKey').disabled, false);
    assert.match(get('banner').textContent, /失败|offline/);
  });
  await check('一键修复忽略未保存的错误密钥输入', async () => {
    const { get, calls } = await ui('{"type":"done"}\n', false, { installed: true, configured: true });
    get('key').value = '无关的未保存输入';
    await get('repairBtn').onclick();
    assert.ok(calls.includes('/api/repair'), '修复应使用已保存的密钥，不应被输入框阻止');
  });
  await check('仅修复桌面入口不额外测密钥且保留未保存输入', async () => {
    const { get, calls } = await ui('{"type":"done","scope":"shortcut"}\n', false, { installed: true, configured: true });
    get('key').value = 'sk-unsaved-input';
    await get('repairBtn').onclick();
    assert.ok(!calls.includes('/api/test'), '修复桌面入口不应触发模型连接测试');
    assert.equal(get('key').value, 'sk-unsaved-input');
    assert.match(get('banner').textContent, /桌面入口.*修复/);
  });
  await check('助手打印地址后立即崩溃不能报成功', async () => {
    const cp = require('node:child_process');
    const detect = require('../engine/detect');
    const oldSpawn = cp.spawn, oldEnv = detect.env;
    cp.spawn = () => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.unref = () => {}; child.kill = () => {};
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('dsh web: http://127.0.0.1:1/?token=fake\n'));
        child.stderr.emit('data', Buffer.from('startup crash'));
        child.emit('close', 1);
      });
      return child;
    };
    detect.env = () => ({ node: process.execPath, dshBin: 'fake.js' });
    delete require.cache[require.resolve('../app/server')];
    try { assert.equal((await require('../app/server').startAssistant()).ok, false); }
    finally { cp.spawn = oldSpawn; detect.env = oldEnv; delete require.cache[require.resolve('../app/server')]; }
  });
  await check('真实 HTTP 启动、分块地址、重复打开只起一个助手', async () => {
    const dir = fs.mkdtempSync(path.join(root, 'work', 'launch-test-'));
    const cp = require('node:child_process'), detect = require('../engine/detect');
    const savedSpawn = cp.spawn, savedEnv = detect.env, savedHome = process.env.DSH_HOME;
    let starts = 0, opens = 0, child;
    process.env.DSH_HOME = dir;
    require('../engine/config').write('sk-fake-only', dir);
    fs.writeFileSync(path.join(dir, 'fake.js'), `const http=require('http');const s=http.createServer((q,r)=>{if(q.url.includes('token=')){r.writeHead(303,{'location':'/','set-cookie':'session=fake; HttpOnly'});r.end()}else if(q.headers.cookie==='session=fake'){r.end('ready')}else{r.writeHead(401);r.end()}});s.listen(0,'127.0.0.1',()=>{process.stdout.write('dsh web: http://127.0.0.1:'+s.address().port+'/?token=');setTimeout(()=>process.stdout.write('fake\\n'),100)});`);
    detect.env = () => ({ node: process.execPath, dshBin: path.join(dir, 'fake.js') });
    cp.spawn = (exe, args, opts) => {
      if (exe === process.execPath) { starts++; child = savedSpawn(exe, args, opts); return child; }
      opens++;
      assert.match(args[3], /token=fake$/);
      const browser = new EventEmitter(); browser.unref = () => {};
      setImmediate(() => browser.emit('spawn'));
      return browser;
    };
    delete require.cache[require.resolve('../app/server')];
    let localServer;
    try {
      const mod = require('../app/server');
      assert.equal((await mod.startAssistant()).ok, true);
      assert.equal((await mod.startAssistant()).ok, true);
      assert.equal(starts, 1); assert.equal(opens, 2);
      delete require.cache[require.resolve('../app/server')];
      const reopened = require('../app/server');
      assert.equal((await reopened.startAssistant()).ok, true);
      assert.equal(starts, 1); assert.equal(opens, 3);
      assert.ok(!fs.readFileSync(path.join(dir, '.ai-setup-session.json'), 'utf8').includes('sk-fake-only'));
      const started = await mod.createServer(); localServer = started.server;
      const response = await fetch('http://127.0.0.1:' + started.port + '/api/status');
      assert.equal((await response.json()).running, true);
    } finally {
      if (localServer) await new Promise(resolve => localServer.close(resolve));
      if (child) { const closed = new Promise(resolve => child.once('close', resolve)); child.kill(); await closed; }
      cp.spawn = savedSpawn; detect.env = savedEnv;
      if (savedHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = savedHome;
      delete require.cache[require.resolve('../app/server')];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  await check('真实本地接口拒绝跨站操作和错误输入', async () => {
    const { server, port } = await require('../app/server').createServer();
    const url = 'http://127.0.0.1:' + port;
    try {
      let res = await fetch(url + '/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: '{}' });
      assert.equal(res.status, 403);
      res = await fetch(url + '/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"key":123}' });
      assert.equal(res.status, 400);
      res = await fetch(url + '/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
      assert.equal(res.status, 400);
      assert.equal((await fetch(url + '/api/health')).status, 200);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  await check('重复安装被拒绝，结束后可重试，进度脱敏', async () => {
    const dir = fs.mkdtempSync(path.join(root, 'work', 'install-test-'));
    const detect = require('../engine/detect');
    const savedEnv = detect.env;
    const saved = { DSH_HOME: process.env.DSH_HOME, AI_SETUP_AGENT: process.env.AI_SETUP_AGENT };
    process.env.DSH_HOME = path.join(dir, 'home'); process.env.AI_SETUP_AGENT = path.join(dir, 'agent');
    const fake = path.join(dir, 'npm.js');
    fs.writeFileSync(fake, `setTimeout(()=>{const fs=require('fs');fs.mkdirSync('node_modules/@deepseek-ai/dsh/lib',{recursive:true});fs.writeFileSync('node_modules/@deepseek-ai/dsh/lib/bin.js','');console.log('npm warn fake sk-fake-sensitive-value');},100);`);
    detect.env = () => ({ node: process.execPath, npmCli: fake });
    delete require.cache[require.resolve('../engine/install')];
    const { install } = require('../engine/install');
    const events = [];
    try {
      const first = install({ key: 'sk-fake-only', onEvent: e => events.push(e) });
      await assert.rejects(install({ key: 'sk-fake-only' }), /正在安装/);
      await first;
      assert.ok(events.some(e => e.type === 'done'));
      assert.ok(events.some(e => e.type === 'log'));
      assert.ok(!JSON.stringify(events).includes('sk-fake-sensitive-value'));
      assert.equal((await install({ key: 'sk-fake-only' })).ok, true);
    } finally {
      detect.env = savedEnv;
      for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  await check('安装超时后 npm 子进程也停止写文件', async () => {
    const dir = fs.mkdtempSync(path.join(root, 'work', 'timeout-test-'));
    const fixture = path.join(dir, 'npm.js'), marker = path.join(dir, 'heartbeat');
    const descendant = path.join(dir, 'child.js');
    fs.writeFileSync(descendant, `const fs=require('fs');setInterval(()=>fs.appendFileSync(${JSON.stringify(marker)},'x'),40);`);
    fs.writeFileSync(fixture, `require('child_process').spawn(process.execPath,[${JSON.stringify(descendant)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
    try {
      const result = await require('../engine/install').runNpm(process.execPath, fixture, dir, () => {}, () => {}, { timeoutMs: 500 });
      assert.equal(result.code, -1);
      assert.match(result.tail.join(' '), /超时/);
      const length = fs.statSync(marker).size;
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fs.statSync(marker).size, length);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  process.exitCode = failed ? 1 : 0;
  console.log('Regression failures: ' + failed);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => clearInterval(keepAlive));
