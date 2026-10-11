// cli.js — 命令行入口
//
// 引擎永远能脱离界面单独跑(铁律:引擎与 UI 解耦)。界面卡住时,
// 这一层就是排障入口:同样的流程,看得见的输出。
//
//   node cli.js detect               看电脑环境
//   node cli.js test --key=sk-xxx    试 key
//   node cli.js install --key=sk-xxx 装
//   node cli.js selfcheck            全部自检
'use strict';

const path = require('path');
const log = require('./log');
const detect = require('./detect');
const { install } = require('./install');
const { testDeepSeek } = require('./test');

const LOG_FILE = process.env.AI_SETUP_LOG || path.join(__dirname, 'state', 'install.log');
log.setFile(LOG_FILE);

function fmt(items) {
  return items.map((i) => `  ${i.installed ? '✓' : '✗'} ${i.name}: ${i.version || '(缺失)'}`).join('\n');
}

function bad(msg) {
  log.error(msg);
  console.log('\n[失败] ' + msg);
  console.log('详细日志(已脱敏): ' + LOG_FILE);
  process.exit(1);
}

async function cmdDetect() {
  console.log(fmt(await detect.detect()));
  return true;
}

async function cmdTest(key, model) {
  const r = await testDeepSeek(key || require('./config').readKey(), model);
  if (r.ok) { console.log('✓ 连接成功,这把 key 能用'); return true; }
  bad(r.err);
  return false;
}

async function cmdInstall(key, model) {
  let last = 0;
  await install({
    key,
    onEvent: (e) => {
      if (e.type === 'stage-start') console.log(`\n[${e.index}/${e.total}] ${e.title}${e.note ? '  (' + e.note + ')' : ''}`);
      else if (e.type === 'note') console.log('  ' + e.message);
      else if (e.type === 'progress') {
        if (e.got >= last + 50) { last = e.got; console.log(`    已下载 ${e.got} 个包…`); }
      } else if (e.type === 'stage-done') console.log('  ✓ 完成' + (e.note ? ' — ' + e.note : ''));
      else if (e.type === 'log') console.log('    ' + e.message);
    },
  });
  console.log('\n✔ 装好了。');
  return true;
}

function parseArgs(argv) {
  const o = { key: null, model: null, cmd: 'full' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--key=')) o.key = a.slice(6);
    else if (a === '--key') o.key = argv[++i];
    else if (a.startsWith('--model=')) o.model = a.slice(8);
    else if (a === '--model') o.model = argv[++i];
    else if (!a.startsWith('--')) o.cmd = a;
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv);
  console.log('==== 与风AI助手(引擎) ====\n');

  try {
    if (o.cmd === 'detect') return await cmdDetect();
    if (o.cmd === 'test') return await cmdTest(o.key, o.model);
    if (o.cmd === 'install') {
      if (!o.key) bad('install 需要 --key=<你的 DeepSeek key>');
      return await cmdInstall(o.key, o.model);
    }
    if (o.cmd === 'selfcheck') {
      const { execFileSync } = require('child_process');
      let failed = false;
      for (const m of ['log', 'config', 'agent', 'detect', 'install', 'test']) {
        try {
          console.log('-- ' + m + ' --\n' + execFileSync(process.execPath, [path.join(__dirname, m + '.js')], { encoding: 'utf8' }));
        } catch (e) {
          failed = true;
          console.error('-- ' + m + ' FAILED --\n' + (e.stdout || '') + (e.stderr || ''));
        }
      }
      console.log('\nengine self-check: ' + (failed ? 'FAILED' : 'ALL OK'));
      process.exitCode = failed ? 1 : 0;
      return !failed;
    }

    // full:一步到位
    console.log('─── [1/3] 检查电脑环境 ───');
    console.log(fmt(await detect.detect()));

    console.log('\n─── [2/3] 下载并安装 ───');
    if (!o.key) bad('full 需要 --key=<你的 DeepSeek key>');
    await cmdInstall(o.key, o.model);

    console.log('\n─── [3/3] 测试 DeepSeek 连接 ───');
    await cmdTest(o.key, o.model);
    console.log('\n✔ 全部完成!回到界面点「打开与风AI助手」就能用了。\n');
    return true;
  } catch (e) {
    bad(e && e.message ? e.message : String(e));
    return false;
  }
}

module.exports = { main, parseArgs };

if (require.main === module) {
  main().then((ok) => process.exit(ok ? 0 : 1));
}
