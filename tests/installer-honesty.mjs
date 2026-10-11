// installer-honesty.mjs — the installer must never report a full success when a
// post-install stage (skills / sidebar) failed: those are exactly the features
// the user clicked on. No network, no real npm — the npm step is stubbed and the
// feature stages are stubbed to throw.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = (m) => require(path.join(REPO, 'engine', m));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-honesty-'));

// Stub the modules install.js holds references to (same cached objects).
const detect = E('detect.js');
detect.env = () => ({ node: 'node', npmCli: 'npm', dshBin: null, bundled: false });
detect.nodeVersion = () => 'v20.0.0';
detect.supportedNode = () => true;
detect.npmVersion = () => '10.0.0';
const agent = E('agent.js');
agent.AGENT_PKG = '@x/y';
agent.agentDir = () => tmp;
agent.writeManifest = () => {};
agent.dshBin = () => path.join(tmp, 'bin.js');
const config = E('config.js');
config.dshHome = () => tmp;
config.envPath = () => path.join(tmp, '.env');
config.write = () => path.join(tmp, '.env');
config.readKey = () => 'sk-test';
const skills = E('skills.js');
skills.seedAll = () => { throw new Error('技能铺设炸了'); };
const extensions = E('extension.js');
extensions.install = () => { throw new Error('侧栏炸了'); };

const { install } = E('install.js');

const events = [];
let threw = null;
try {
  await install({ key: 'sk-test', onEvent: (e) => events.push(e), _npm: async () => ({ code: 0, tail: [] }) });
} catch (e) { threw = e; }

const kinds = events.map((e) => e.type + (e.stage ? ':' + e.stage : ''));
assert.ok(threw, '两步都失败时 install 必须抛错(不能悄悄返回成功)');
assert.ok(!events.some((e) => e.type === 'done'), '有步骤失败时绝不能发 done 事件');
for (const s of ['skills', 'extension']) {
  assert.ok(events.some((e) => e.type === 'stage-fail' && e.stage === s), '缺少 ' + s + ' 的 stage-fail 事件');
}
assert.match(threw.message, /没装好/, '错误信息要点明「没装好」:' + threw.message);
assert.match(threw.message, /重试/, '错误信息要提示重试:' + threw.message);
assert.match(threw.message, /聊天可用/, '错误信息要保住「聊天仍可用」:' + threw.message);
assert.ok(kinds.includes('stage-done:install'), '主体安装步骤本身应已 stage-done');

// 反向:两步都成功时必须发 done(避免我把正常路径也堵死)
for (const m of ['skills', 'extension']) E(m + '.js');
skills.seedAll = () => [{ ok: true }];
extensions.install = () => ({ dir: tmp, catalogCount: 1, changed: true });
const okEvents = [];
const r = await install({ key: 'sk-test', onEvent: (e) => okEvents.push(e), _npm: async () => ({ code: 0, tail: [] }) });
assert.ok(r.ok, '全部成功时应返回 ok');
assert.ok(okEvents.some((e) => e.type === 'done'), '全部成功时应发 done');

console.log('installer-honesty OK — 失败不报成功,成功仍报成功');
console.log('  失败信息: ' + threw.message);
