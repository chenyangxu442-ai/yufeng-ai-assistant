'use strict';
const http = require('http');

// DSH 用启动 token 换 cookie，再 303 跳转到 /。就绪检查需要走完这个流程。
async function webReady(value) {
  let target;
  try { target = new URL(value); } catch { return false; }
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') return false;
  function get(url, cookie) {
    return new Promise(resolve => {
      const req = http.get(url, { timeout: 1500, headers: cookie ? { cookie } : {} }, res => {
        const result = { status: res.statusCode, location: res.headers.location, cookies: res.headers['set-cookie'] };
        res.resume(); res.on('end', () => resolve(result)); res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }
  const first = await get(target);
  if (first?.status === 200) return true;
  if (first?.status !== 303 || !first.location || !first.cookies?.length) return false;
  let clean;
  try { clean = new URL(first.location, target); } catch { return false; }
  if (clean.origin !== target.origin || clean.pathname !== '/' || clean.search) return false;
  const cookie = first.cookies.map(value => value.split(';')[0]).join('; ');
  return (await get(clean, cookie))?.status === 200;
}
module.exports = { webReady };
