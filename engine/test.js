// test.js — 试一下这把 key 能不能用(原生 fetch,零依赖)
//
// 打的就是 DeepSeek 自己的 OpenAI 兼容端点,不是另一套 ——
// 这里测通了,装完就一定能用。
'use strict';

const { DEFAULT_MODEL, BASE_URL, validateKey } = require('./config');

// 返回 { ok:boolean, text?:string, err?:string(中文可读,铁律 #4) }
async function testDeepSeek(key, model, baseUrl) {
  try { key = validateKey(key); }
  catch (e) { return { ok: false, err: e.message }; }
  const base = baseUrl || BASE_URL;
  const m = model || DEFAULT_MODEL;
  let res;
  try {
    res = await fetch(base + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: m, max_tokens: 8, messages: [{ role: 'user', content: '你好' }] }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || /timed out/i.test(e.message)) {
      return { ok: false, err: '连接超时:网络太慢或被拦截,请检查网络后重试' };
    }
    return { ok: false, err: '网络连接失败:请检查网络(代理/VPN)后重试' };
  }

  if (!res.ok) {
    const map = {
      401: 'API Key 不对或已失效,请重新粘贴正确的 key',
      402: 'DeepSeek 账户余额不足,请去官网充值后再试',
      429: '请求太频繁(限流),请稍等几分钟再试',
      400: '这把 key 用不了:请确认是在 DeepSeek 官网申请的、并且已经充值',
    };
    // 不展示上游原文：鉴权错误可能包含用户的密钥。
    try { await res.body?.cancel(); } catch { /* 连接已关闭 */ }
    return { ok: false, err: map[res.status] || 'DeepSeek 服务器报错(' + res.status + ')' };
  }

  try {
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return { ok: false, err: '服务没有返回有效回复，请稍后重试' };
    return { ok: true }; // 测试只回传结果，不展示可能含凭据的上游文本。
  } catch {
    return { ok: false, err: '服务回复不完整或格式不对，请稍后重试' };
  }
}

module.exports = { testDeepSeek };

// 自检(纯结构,不真发请求)
if (require.main === module) {
  const assert = require('assert');
  assert.strictEqual(typeof testDeepSeek, 'function');
  assert.ok(DEFAULT_MODEL && BASE_URL, '默认值要来自 config');
  // key 格式不对时要被服务端拒绝,但我们这里只验形态
  assert.ok(BASE_URL.startsWith('https://'), '必须走 https');
  console.log('test.js self-check OK (未真发请求)');
}
