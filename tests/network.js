'use strict';

const assert = require('assert');
const { checkNetwork, DOWNLOAD_URL, SERVICE_URL } = require('../engine/network.js');

let passed = 0;
async function t(name, fn) {
  try {
    await fn();
    passed++;
    console.log('ok - ' + name);
  } catch (e) {
    console.error('FAIL - ' + name);
    console.error('  ' + (e && e.message));
    process.exitCode = 1;
  }
}

function makeRes(status, spy) {
  return { status, body: { cancel() { spy.cancelled++; return Promise.resolve(); } } };
}

// fake fetch driven by a per-URL map; entry: number | Error | function(opts)
function fakeFetch(map, spy) {
  return async (url, opts) => {
    spy.calls.push({ url, opts });
    const entry = map[url];
    const v = typeof entry === 'function' ? entry(opts) : entry;
    if (v instanceof Error) throw v;
    return makeRes(v, spy);
  };
}

async function run(dl, svc) {
  const spy = { calls: [], cancelled: 0 };
  const r = await checkNetwork({ fetchImpl: fakeFetch({ [DOWNLOAD_URL]: dl, [SERVICE_URL]: svc }, spy), timeoutMs: 50 });
  return { r, spy };
}

(async () => {
  await t('download 200 + service 200 均可用', async () => {
    const { r } = await run(200, 200);
    assert.strictEqual(r.downloadOk, true);
    assert.strictEqual(r.serviceOk, true);
    assert.deepStrictEqual(r.items.map(i => i.key), ['download', 'service']);
  });

  await t('download 404 不可用', async () => {
    const { r } = await run(404, 200);
    assert.strictEqual(r.downloadOk, false);
    assert.strictEqual(r.items[0].ok, false);
  });

  await t('download 3xx 不跟随即不可用', async () => {
    const { r } = await run(302, 200);
    assert.strictEqual(r.downloadOk, false);
    assert.ok(r.items[0].message.includes('重定向'));
  });

  await t('service 401/403 可达且提示不代表密钥有效', async () => {
    for (const code of [401, 403]) {
      const { r } = await run(200, code);
      assert.strictEqual(r.serviceOk, true, 'HTTP ' + code);
      assert.ok(r.items[1].message.includes('不代表密钥有效'), 'HTTP ' + code);
    }
  });

  await t('service 429 限流但 serviceOk true', async () => {
    const { r } = await run(200, 429);
    assert.strictEqual(r.serviceOk, true);
    assert.ok(r.items[1].message.includes('限流'));
  });

  await t('service 5xx 暂不可用', async () => {
    const { r } = await run(200, 503);
    assert.strictEqual(r.serviceOk, false);
    assert.ok(r.items[1].message.includes('暂不可用'));
  });

  await t('service 3xx 不跟随且 false', async () => {
    const { r } = await run(200, 301);
    assert.strictEqual(r.serviceOk, false);
    assert.ok(r.items[1].message.includes('重定向'));
  });

  await t('DNS 失败给出固定中文信息', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const { r } = await run(err, err);
    assert.strictEqual(r.downloadOk, false);
    assert.strictEqual(r.serviceOk, false);
    assert.strictEqual(r.items[0].message, '域名解析失败，请检查网络连接');
    assert.ok(!r.items[0].message.includes('ENOTFOUND'));
  });

  await t('Abort 超时抛出并归为超时', async () => {
    const hang = (url, opts) => new Promise((_, rej) => {
      opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const spy = { calls: [], cancelled: 0 };
    const r = await checkNetwork({ fetchImpl: fakeFetch({ [DOWNLOAD_URL]: hang, [SERVICE_URL]: hang }, spy), timeoutMs: 20 });
    assert.strictEqual(r.downloadOk, false);
    assert.ok(r.items[1].message.includes('请求超时'));
  });

  await t('两个检查并发执行', async () => {
    let active = 0, max = 0;
    const spy = { calls: [], cancelled: 0 };
    const conc = async (url) => {
      active++; max = Math.max(max, active);
      await new Promise(res => setTimeout(res, 10));
      active--;
      return 200;
    };
    await checkNetwork({ fetchImpl: fakeFetch({ [DOWNLOAD_URL]: conc, [SERVICE_URL]: conc }, spy), timeoutMs: 100 });
    assert.strictEqual(max, 2);
  });

  await t('固定两个 URL、manual 重定向、无凭据头', async () => {
    const spy = { calls: [], cancelled: 0 };
    await checkNetwork({ fetchImpl: fakeFetch({ [DOWNLOAD_URL]: 200, [SERVICE_URL]: 200 }, spy), timeoutMs: 50 });
    assert.deepStrictEqual(spy.calls.map(c => c.url).sort(), [DOWNLOAD_URL, SERVICE_URL].sort());
    for (const { opts } of spy.calls) {
      assert.strictEqual(opts.redirect, 'manual');
      assert.ok(opts.signal, 'signal 存在');
      const h = opts.headers || {};
      const keys = Object.keys(h).map(k => k.toLowerCase());
      assert.ok(!keys.includes('authorization'), '无 Authorization');
      assert.ok(!keys.includes('cookie') && !keys.includes('x-api-key'), '无凭据头');
      assert.strictEqual(opts.credentials, undefined);
    }
  });

  await t('读取后取消释放 body', async () => {
    const spy = { calls: [], cancelled: 0 };
    await checkNetwork({ fetchImpl: fakeFetch({ [DOWNLOAD_URL]: 200, [SERVICE_URL]: 429 }, spy), timeoutMs: 50 });
    assert.strictEqual(spy.cancelled, 2);
  });

  console.log(`\n${passed} passed`);
})();
