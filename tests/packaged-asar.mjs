// packaged-asar.mjs — 真·装机版回归:在**打包后的 app.asar** 里,用打包自带的
// Electron 以 ASAR 感知模式(ELECTRON_RUN_AS_NODE)真跑一遍「铺技能 + 装侧栏扩展」。
//
// 为什么非要有这个:源码/静态校验(verify-package.js)只比对字节,证明不了
// ASAR 内的**运行时路径解析**是对的。0.5.3 的线上故障正是 skills.js 把随包技能目录
// 解析成 app.asar/app/skill-library(打包后根本不存在)→ 技能库和任务场景两步全挂,
// 而当时所有源码级测试全绿。这个测试直接站在装机版运行时里复现那条路径。
//
// 依赖:已构建 app/release/win-unpacked(app/scripts/dist.js)。纯本地,不联网。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unpacked = path.join(root, 'app/release/win-unpacked');
const archive = path.join(unpacked, 'resources/app.asar');
assert.ok(fs.existsSync(archive), '先构建装机版:app/release/win-unpacked/resources/app.asar 不存在');

// 用**打包产物里的** Electron 可执行文件跑 ASAR 感知的 Node。
const electron = path.join(unpacked, '与风AI助手.exe');
assert.ok(fs.existsSync(electron), '打包 Electron 主程序不存在: ' + electron);

// 探针:只在 app.asar 内做真实调用,把结果以一行 JSON 打回。
const probe = `
const path=require('path'), fs=require('fs'), os=require('os');
const asarRoot=process.argv[2];
const home=fs.mkdtempSync(path.join(os.tmpdir(),'asar-home-'));
process.env.DSH_HOME=home;
process.env.AI_SETUP_WORK=fs.mkdtempSync(path.join(os.tmpdir(),'asar-work-'));
const engine=path.join(asarRoot,'engine');
const skills=require(path.join(engine,'skills.js'));
const ext=require(path.join(engine,'extension.js'));
const out={};
out.catalog=skills.catalog().length;
const built=ext.install(home);
out.builtCount=built.catalogCount;
out.changed=built.changed;
const client=fs.readFileSync(path.join(built.dir,'lib','client.js'),'utf8');
out.clientIsBundle=client.includes('window.__ModuleLoader__.load');
out.clientHasCatalog=!client.includes('__SKILL_LIBRARY_CATALOG__');
out.clientHasScenes=client.includes('"task-scenes"');
out.clientHasContact=client.includes('yufeng-contact')&&client.includes('chenyangxu442@gmail.com')&&client.includes('xxx890332');
const patch=fs.readFileSync(built.patchPath,'utf8');
out.patchHasHost=/\\bid:\\s*ui-skill-library\\b/.test(patch);
out.seeded=skills.seedAll(home).filter(r=>r.ok).length;
console.log('PROBE '+JSON.stringify(out));
`;
const probeFile = path.join(os.tmpdir(), 'ai-setup-asar-probe-' + process.pid + '.js');
fs.writeFileSync(probeFile, probe, 'utf8');
let stdout;
try {
  stdout = execFileSync(electron, [probeFile, archive], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 120000,
  });
} finally {
  fs.rmSync(probeFile, { force: true });
}

const line = stdout.split(/\r?\n/).find((l) => l.startsWith('PROBE '));
assert.ok(line, '探针没有输出结果:\n' + stdout);
const r = JSON.parse(line.slice('PROBE '.length));

assert.equal(r.catalog, 538, 'ASAR 内 catalog 必须读到 538 条(打包路径解析)');
assert.equal(r.builtCount, 538, '侧栏扩展必须把 538 条目录烘进 client bundle');
assert.ok(r.changed, '首次应写入 profile patch');
assert.ok(r.patchHasHost, 'patch 必须含 ui-skill-library 宿主行');
assert.ok(r.clientIsBundle, 'client.js 必须是浏览器 bundle 形态');
assert.ok(r.clientHasCatalog && r.clientHasScenes, '目录与场景占位必须被替换');
assert.ok(r.clientHasContact, '联系开发者入口(微信/邮箱)必须烘进 client bundle');
assert.equal(r.seeded, 538, '装机版里 seedAll 应真铺下 538 个技能');

console.log('PASS 打包 ASAR 运行时: catalog=538, 侧栏扩展接入, seedAll=538 (故障路径已复现并可回归)');
