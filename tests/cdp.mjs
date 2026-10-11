// cdp.mjs — minimal Chrome DevTools Protocol client over the *installed* Chrome.
// Uses Node's global WebSocket (Node >= 22) so no browser-driver dependency is added.
// Not a general-purpose library: only what the panel runtime test needs.
//
// Every wait here is bounded: connect, each CDP command, and shutdown all have
// timeouts, so a wedged browser surfaces as an error instead of hanging the test.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export function chromeExe() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('找不到 Chrome,无法做真实浏览器验收');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CDP_CMD_TIMEOUT = 20000; // any single CDP round-trip
const CONNECT_TIMEOUT = 15000; // websocket handshake
const LAUNCH_TIMEOUT = 25000; // chrome writing DevToolsActivePort + target

export function killTree(pid) {
  if (!pid) return;
  try {
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch { try { process.kill(pid); } catch {} }
}

// Launch headless Chrome with a *fresh* throwaway profile (never reuses a prior
// run's profile dir, never touches the user's profile).
export async function launchChrome(url, { profileDir } = {}) {
  const dir = profileDir
    ? fs.mkdtempSync(path.join(profileDir + '-'))   // unique suffix: always fresh
    : fs.mkdtempSync(path.join(os.tmpdir(), 'panel-chrome-'));
  const child = spawn(chromeExe(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--window-size=1400,900',
    '--remote-debugging-port=0',
    '--user-data-dir=' + dir,
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  let killed = false;
  const kill = () => { if (killed) return; killed = true; killTree(child.pid); };

  try {
    const portFile = path.join(dir, 'DevToolsActivePort');
    let port = null;
    const portDeadline = Date.now() + LAUNCH_TIMEOUT;
    while (!port && Date.now() < portDeadline && !child.exitCode && !killed) {
      try { port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0].trim()); } catch { await sleep(50); }
    }
    if (!port) throw new Error('Chrome 没有写出调试端口(可能在 ' + LAUNCH_TIMEOUT + 'ms 内没启动)');

    // find the page target for our url
    let target = null;
    const targetDeadline = Date.now() + LAUNCH_TIMEOUT;
    while (!target && Date.now() < targetDeadline && !killed) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
        const list = await res.json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch { /* not up yet */ }
      if (!target) await sleep(50);
    }
    if (!target) throw new Error('Chrome 没有暴露页面调试目标');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('websocket 连接超时')), CONNECT_TIMEOUT);
      ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true });
      ws.addEventListener('error', (e) => { clearTimeout(t); rej(new Error('websocket 连接失败: ' + (e.message || ''))); }, { once: true });
    });

    const client = new CDP(ws);
    client.chrome = child;
    client.profileDir = dir;
    client.kill = () => { try { ws.close(); } catch {} kill(); };
    return client;
  } catch (e) {
    kill();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    throw e;
  }
}

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.errors = [];
    this.closed = false;
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const { res, rej, timer } = this.pending.get(m.id); this.pending.delete(m.id);
        clearTimeout(timer);
        m.error ? rej(new Error('CDP ' + JSON.stringify(m.error))) : res(m.result);
        return;
      }
      if (m.method === 'Runtime.consoleAPICalled') this.console.push((m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
      if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    });
    // closing must not leave anyone awaiting forever
    const fail = () => this._rejectAll(new Error('websocket 已关闭'));
    ws.addEventListener('close', fail, { once: true });
    ws.addEventListener('error', fail, { once: true });
  }
  _rejectAll(err) {
    if (this.closed) return;
    this.closed = true;
    for (const { rej, timer } of this.pending.values()) { clearTimeout(timer); rej(err); }
    this.pending.clear();
  }
  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('websocket 已关闭'));
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP ' + method + ' 超时(' + CDP_CMD_TIMEOUT + 'ms)')); } }, CDP_CMD_TIMEOUT);
      this.pending.set(id, { res, rej, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); rej(e); }
    });
  }
  async enable() { await this.send('Runtime.enable'); await this.send('Page.enable'); }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  // Poll an expression until it returns truthy (or timeout).
  async waitFor(expression, { timeout = 30000, interval = 200 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      let v; try { v = await this.evaluate(expression); } catch { v = false; }
      if (v) return v;
      if (Date.now() > deadline || this.closed) return null;
      await sleep(interval);
    }
  }
  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }
}

export { sleep };
