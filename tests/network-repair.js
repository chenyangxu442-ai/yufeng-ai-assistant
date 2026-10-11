'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { checkNetwork } = require('../engine/network');
const keepAlive = setInterval(() => {}, 1000);
(async () => {
  let cancelled = 0, active = 0, peak = 0;
  const statuses = [200, 401];
  const good = await checkNetwork({ fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers, undefined);
    assert(options.signal);
    assert(['https://registry.npmmirror.com/@deepseek-ai%2fdsh', 'https://api.deepseek.com/v1/models'].includes(url));
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return { status: statuses.shift(), body: { cancel: async () => { cancelled++; } } };
  } });
  assert(good.downloadOk && good.serviceOk);
  assert.equal(peak, 2); assert.equal(cancelled, 2);
  assert.match(good.items[1].message, /密钥/);
  for (const status of [302, 404, 500]) {
    const result = await checkNetwork({ fetchImpl: async () => ({ status }) });
    assert(!result.downloadOk && !result.serviceOk);
  }
  for (const status of [403, 429]) {
    const result = await checkNetwork({ fetchImpl: async () => ({ status }) });
    assert(!result.downloadOk && result.serviceOk);
  }
  const dns = await checkNetwork({ fetchImpl: async () => { throw Object.assign(Error('secret error'), { cause: { code: 'ENOTFOUND' } }); } });
  assert.match(dns.items[0].message, /域名解析/);
  assert(!JSON.stringify(dns).includes('secret error'));
  const timeout = await checkNetwork({ timeoutMs: 20, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  assert.match(timeout.items[0].message, /超时/);
  console.log('PASS 并发网络检查、下载和服务区分、无凭据、状态码、超时和脱敏');

  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(root, 'work', 'repair-test-'));
  const saved = { DSH_HOME: process.env.DSH_HOME, AI_SETUP_AGENT: process.env.AI_SETUP_AGENT };
  const detect = require('../engine/detect'), originalEnv = detect.env;
  try {
    process.env.DSH_HOME = path.join(dir, 'home');
    process.env.AI_SETUP_AGENT = path.join(dir, 'agent');
    const config = require('../engine/config');
    fs.mkdirSync(process.env.DSH_HOME, { recursive: true });
    const env = 'OTHER_SETTING=keep\n# retain comments\nDEEPSEEK_API_KEY=sk-fake-repair-only\n';
    fs.writeFileSync(config.envPath(), env);
    fs.writeFileSync(path.join(process.env.DSH_HOME, 'chat-data.txt'), 'keep chat data');
    const bin = path.join(process.env.AI_SETUP_AGENT, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
    fs.mkdirSync(path.dirname(bin), { recursive: true }); fs.writeFileSync(bin, 'old program');
    const fakeNpm = path.join(dir, 'npm.js');
    detect.env = () => ({ node: process.execPath, npmCli: fakeNpm, dshBin: fs.existsSync(bin) ? bin : null, bundled: false });
    delete require.cache[require.resolve('../engine/install')];
    const { install } = require('../engine/install');
    fs.writeFileSync(fakeNpm, "const fs=require('fs');fs.mkdirSync('node_modules',{recursive:true});fs.writeFileSync('node_modules/partial','partial');process.exit(1);");
    const failedEvents = [];
    await assert.rejects(install({ repair: true, key: 'ignore-this-input', onEvent: event => failedEvents.push(event) }));
    assert.equal(fs.readFileSync(bin, 'utf8'), 'old program');
    assert.equal(fs.readFileSync(config.envPath(), 'utf8'), env);
    assert(failedEvents.some(event => event.type === 'note' && /已恢复/.test(event.message)));
    assert(!fs.existsSync(path.join(process.env.AI_SETUP_AGENT, 'node_modules/partial')));
    fs.writeFileSync(fakeNpm, "const fs=require('fs');if(fs.existsSync('node_modules/@deepseek-ai/dsh/lib/bin.js'))process.exit(2);fs.mkdirSync('node_modules/@deepseek-ai/dsh/lib',{recursive:true});fs.writeFileSync('node_modules/@deepseek-ai/dsh/lib/bin.js','new program');");
    await install({ repair: true });
    assert.equal(fs.readFileSync(bin, 'utf8'), 'new program');
    assert.equal(fs.readFileSync(config.envPath(), 'utf8'), env);
    assert.equal(fs.readFileSync(path.join(process.env.DSH_HOME, 'chat-data.txt'), 'utf8'), 'keep chat data');
    assert(!fs.readdirSync(process.env.AI_SETUP_AGENT).some(name => name.includes('backup')));
    console.log('PASS 真实子进程修复、失败回滚、成功重装、密钥文件逐字节不变、聊天数据保留');
  } finally {
    detect.env = originalEnv;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.equal(path.dirname(dir), path.join(root, 'work'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearInterval(keepAlive));
