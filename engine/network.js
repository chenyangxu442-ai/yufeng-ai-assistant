'use strict';

const TARGETS = [
  { key: 'download', name: 'AI 下载源', url: 'https://registry.npmmirror.com/@deepseek-ai%2fdsh' },
  { key: 'service', name: 'DeepSeek 服务', url: 'https://api.deepseek.com/v1/models' },
];
async function checkNetwork({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const items = await Promise.all(TARGETS.map(async target => {
    try {
      const response = await fetchImpl(target.url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      try { await response.body?.cancel(); } catch { /* 请求已结束 */ }
      const status = response.status;
      if (target.key === 'download') return { key: target.key, name: target.name, ok: status >= 200 && status < 300,
        message: status >= 200 && status < 300 ? '可连接' : status >= 500 ? '下载服务暂时异常，请稍后重试' : '下载源响应异常，请检查网络后重试' };
      const ok = (status >= 200 && status < 300) || [401, 403, 429].includes(status);
      const message = status === 401 ? '可连接；密钥是否有效请点“测一下”确认' : status === 403 ? '服务有响应但访问受限，请用密钥测试确认' : status === 429 ? '服务可连接但暂时限流，请稍后重试' : ok ? '可连接；密钥是否有效需另行测试' : status >= 500 ? 'AI 服务暂时异常，请稍后重试' : 'AI 服务响应异常，请检查网络后重试';
      return { key: target.key, name: target.name, ok, message };
    } catch (error) {
      const code = error.cause?.code || error.code;
      const message = error.name === 'TimeoutError' || error.name === 'AbortError' ? '连接超时，请检查网络后重试' : ['ENOTFOUND', 'EAI_AGAIN'].includes(code) ? '域名解析失败，请检查网络或 DNS' : /CERT|TLS|SSL/.test(code || '') ? '安全连接失败，请检查系统时间或网络' : '连接失败，请检查网络或代理设置';
      return { key: target.key, name: target.name, ok: false, message };
    }
  }));
  return { items, downloadOk: items[0].ok, serviceOk: items[1].ok };
}
module.exports = { checkNetwork };
