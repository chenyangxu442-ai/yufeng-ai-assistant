// extensions.js — 把技能库界面作为**随包客户端扩展**装进 Harness 的 web profile
//
// 不 fork 任何随包插件、不往 node_modules 里塞文件、不动全局 PATH。走的是
// Harness 自己的 profile 机制:
//   · profile 目录:$DSH_HOME/profiles/web/
//   · 用户 patch 层:$DSH_HOME/profiles/web/cordis.patch.yml(启动时热加载)
//   · patch 里的 `- insert:` 行会被装载器读成插件组合;行内 `name: ./...`
//     被 anchorInsertedPluginNames 转成**紧挨 patch 文件**的 file URL。
// 于是把扩展实体放在 profiles/web/extensions/skill-library/,再往 patch 里追加
// 一行宿主插件即可。宿主行按 package.json 的 dsh.client 声明,被
// dsh-client-modules 扫描出浏览器端 bundle,自动进 window.__DSH_BOOT__。
//
// 幂等:同一条目只插一次;patch 模板里的空数组 `[]` 会被顶掉。
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const skills = require('./skills');
const scenarios = require('./scenarios');

const PROFILE = 'web';
const EXT_ID = 'ui-skill-library';
const DIR_NAME = 'skill-library';
const SRC_DIR = path.join(__dirname, 'extensions', DIR_NAME);
const MARKER = '# ai-setup skill library (managed — do not edit by hand)';

function profileDir(home) { return path.join(home, 'profiles', PROFILE); }
function patchPath(home) { return path.join(profileDir(home), 'cordis.patch.yml'); }
function extensionDir(home) { return path.join(profileDir(home), 'extensions', DIR_NAME); }

// 随包目录 → 浏览器端只需要的字段(省掉 source_url/license 等噪声)。
function clientCatalog(root) {
  return skills.catalog(root).map(item => ({
    id: item.id, name: item.name, title: item.title,
    category: item.category, description: item.description, tags: item.tags || [],
  }));
}

function renderClient(catalog) {
  const template = fs.readFileSync(path.join(SRC_DIR, 'client.source.js'), 'utf8');
  const tokens = fs.readFileSync(path.join(SRC_DIR, 'tokens.fragment.js'), 'utf8');
  // 推荐技能点名到 catalog 的真实 id,所以场景要在目录烘进来之后、用同一份 catalog 构建。
  const scenes = scenarios.build(catalog);
  // 用函数式替换:注入文本里的 `$&`/`$1` 会被当成 replace 的特殊模式而串味。
  return template
    .replace('/*__SKILL_LIBRARY_TOKENS__*/', () => tokens)
    .replace('/*__SKILL_LIBRARY_CATALOG__*/[]', () => JSON.stringify(catalog))
    .replace('/*__SKILL_LIBRARY_SCENARIOS__*/[]', () => JSON.stringify(scenes));
}

// 把扩展实体铺到 profile 里。写 lib/client.js 前先写临时文件再改名,避免半截文件。
function materialize(home = config.dshHome(), root) {
  const dir = extensionDir(home);
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  for (const rel of ['package.json']) {
    fs.copyFileSync(path.join(SRC_DIR, rel), path.join(dir, rel));
  }
  fs.copyFileSync(path.join(SRC_DIR, 'lib', 'index.js'), path.join(dir, 'lib', 'index.js'));
  const catalog = clientCatalog(root);
  const client = renderClient(catalog);
  const tmp = path.join(dir, 'lib', 'client.js.' + process.pid + '.tmp');
  fs.writeFileSync(tmp, client, 'utf8');
  fs.renameSync(tmp, path.join(dir, 'lib', 'client.js'));
  return { dir, catalogCount: catalog.length };
}

function patchBlock() {
  return [MARKER, '- insert:', '    - id: ' + EXT_ID, '      name: ./extensions/' + DIR_NAME + '/lib/index.js', ''].join('\n');
}

// 往 profile patch 追加宿主行。已有(看幂等标记或 id)就原样返回。
function register(home = config.dshHome()) {
  const file = patchPath(home);
  fs.mkdirSync(profileDir(home), { recursive: true });
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '[]\n';
  if (new RegExp('(^|\\n)\\s*- id: ' + EXT_ID + '\\s*(\\n|$)').test(content) || content.includes(MARKER)) {
    return { ok: true, changed: false, patchPath: file };
  }
  // 顶掉模板里的空数组占位(只顶**独占一行**的 `[]`,不碰 `foo: []`)。
  content = content.replace(/^[ \t]*\[\][ \t]*\r?\n?/m, '');
  if (content && !content.endsWith('\n')) content += '\n';
  const next = content + '\n' + patchBlock();
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, next, 'utf8');
  fs.renameSync(tmp, file);
  return { ok: true, changed: true, patchPath: file };
}

function install(home = config.dshHome(), root) {
  const built = materialize(home, root);
  const reg = register(home);
  return { ...built, ...reg };
}

module.exports = { install, materialize, register, extensionDir, profileDir, patchPath, clientCatalog, EXT_ID };

// 自检:不依赖真实 Harness,只钉住"铺文件 + 幂等插 patch"。
if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-home-'));
  try {
    const first = install(home);
    assert.strictEqual(first.catalogCount, 538, '应把 538 条目录写进 client bundle');
    const clientFile = path.join(first.dir, 'lib', 'client.js');
    const client = fs.readFileSync(clientFile, 'utf8');
    assert.ok(!client.includes('__SKILL_LIBRARY_CATALOG__'), '目录占位必须被替换');
    assert.ok(!client.includes('__SKILL_LIBRARY_TOKENS__'), 'token 片段占位必须被替换');
    assert.ok(!client.includes('__SKILL_LIBRARY_SCENARIOS__'), '场景占位必须被替换');
    assert.ok(client.includes('window.__ModuleLoader__.load'), '必须是浏览器 bundle 形态');
    assert.ok(client.includes('@ai-setup/dsh-client-ui-skill-library'), 'bundle id 要对');
    assert.ok(client.includes('function addToken'), 'token 模型要内联进去');
    assert.ok(client.includes('function applyScene'), '场景写入运算要内联进去');
    assert.ok(client.includes('"task-scenes"'), '场景面板要注册进 main / sidebar.panellist');
    assert.doesNotThrow(() => new (require('vm').Script)(client, { filename: 'client.js' }), 'client bundle 必须是合法 JS');
    assert.strictEqual(first.changed, true, '首次要写 patch');
    const p1 = fs.readFileSync(first.patchPath, 'utf8');
    assert.ok(p1.includes('id: ui-skill-library'), 'patch 要含宿主行');
    assert.ok(!/^[ \t]*\[\][ \t]*$/m.test(p1), '空数组占位要被顶掉');
    // 再装一次:patch 不变(幂等)
    const second = install(home);
    assert.strictEqual(second.changed, false, '重复注册不应再写 patch');
    assert.strictEqual(fs.readFileSync(first.patchPath, 'utf8'), p1, 'patch 内容应完全不变');
    // 用户已有条目时:只追加,不改动原有内容
    const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-home2-'));
    try {
      fs.mkdirSync(path.join(home2, 'profiles', 'web'), { recursive: true });
      fs.writeFileSync(patchPath(home2), '- id: tools\n  config:\n    mode: !!js process.env.DSH_TOOLS_MODE\n');
      register(home2);
      const p2 = fs.readFileSync(patchPath(home2), 'utf8');
      assert.ok(p2.includes('mode: !!js process.env.DSH_TOOLS_MODE'), '不能动用户已有行');
      assert.ok(p2.includes('id: ui-skill-library'), '要追加宿主行');
      const before = p2;
      register(home2);
      assert.strictEqual(fs.readFileSync(patchPath(home2), 'utf8'), before, '再注册仍幂等');
      console.log('extension.js self-check OK (铺扩展/幂等插 patch/保留用户行)');
    } finally { fs.rmSync(home2, { recursive: true, force: true }); }
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
