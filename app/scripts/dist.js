// 打包脚本:1) 同步 engine → app/engine(排除运行态 state)
// 2) electron-builder --dir 出未打包目录  3) rcedit 写图标/版本  4) --prepackaged 只做 NSIS
//
// 为什么不一步到位:electron-builder 内嵌图标走 app-builder 的 rcedit,而它每次都先
// 下载 winCodeSign-2.6.0.7z;这个包里有 macOS 符号链接,本机 7-Zip 没有创建符号链接的
// 权限,解压必然失败。于是关掉 signAndEditExecutable,自己用同一缓存里的 rcedit-x64.exe
// 写资源,再用 --prepackaged 复用目录出安装包。
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const appDir = path.join(__dirname, '..');
const engineSrc = path.join(appDir, '..', 'engine');
const engineDst = path.join(appDir, 'engine');
const nodeDir = path.join(appDir, 'runtime', 'node');

// 不允许构建一个缺少自带环境的安装包。
for (const file of ['node.exe', 'node_modules/npm/bin/npm-cli.js', 'LICENSE']) {
  if (!fs.existsSync(path.join(nodeDir, file))) throw new Error('缺少自带运行环境: ' + file);
}
const nodeHash = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(nodeDir, 'node.exe'))).digest('hex');
if (nodeHash !== 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32') throw new Error('自带 Node 与官方校验值不一致');
const version = execFileSync(path.join(nodeDir, 'node.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
if (version !== 'v24.21.0') throw new Error('自带 Node 版本与验证版本不一致: ' + version);
execFileSync(path.join(nodeDir, 'node.exe'), [path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'), '--version'], { windowsHide: true });

// 图标是交付物的一部分:源图、多尺寸 ICO、以及引用配置,缺一项就不许打。
const ico = path.join(appDir, 'assets', 'yufeng.ico');
if (!fs.existsSync(path.join(appDir, 'assets', 'yufeng.png'))) throw new Error('缺少图标源: assets/yufeng.png');
if (!fs.existsSync(ico) || fs.statSync(ico).size === 0) throw new Error('缺少图标产物: assets/yufeng.ico(先跑 python app/scripts/make-ico.py)');
const pkg = require(path.join(appDir, 'package.json'));
if (pkg.build.win.icon !== 'assets/yufeng.ico') throw new Error('win.icon 未指向 assets/yufeng.ico');
if (pkg.build.win.signAndEditExecutable !== false) throw new Error('signAndEditExecutable 必须为 false(图标由本脚本用 rcedit 写入)');
if (pkg.build.nsis.installerIcon !== 'assets/yufeng.ico') throw new Error('nsis.installerIcon 未指向 assets/yufeng.ico');

function cpSync(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (f === 'state') continue; // 运行态(manifest/日志),不带进安装包
    fs.cpSync(path.join(src, f), path.join(dst, f), { recursive: true });
  }
}

function findRcedit() {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache)) {
      const exe = path.join(cache, dir, 'rcedit-x64.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('找不到 rcedit-x64.exe(electron-builder 缓存缺失,先跑一次 npx electron-builder --win --dir)');
}

cpSync(engineSrc, engineDst);
console.log('engine 已同步到 app/engine');

// nsis 工具本机已缓存,不开镜像(记忆里的 npmmirror 目前不可达)。
const env = { ...process.env };
const unpacked = path.join(appDir, 'release', 'win-unpacked');
try {
  console.log('[1/3] 打未打包目录…');
  execSync('npx electron-builder --win --dir --publish never', { cwd: appDir, stdio: 'inherit', env, encoding: 'utf8', timeout: 900000 });

  console.log('[2/3] 写入品牌图标与版本信息…');
  const exe = path.join(unpacked, `${pkg.build.productName}.exe`);
  if (!fs.existsSync(exe)) throw new Error('未找到主程序: ' + exe);
  const args = [
    exe,
    '--set-icon', ico,
    '--set-file-version', pkg.version,
    '--set-product-version', pkg.version,
    '--set-version-string', 'ProductName', pkg.build.productName,
    '--set-version-string', 'FileDescription', pkg.build.productName,
    '--set-version-string', 'InternalName', pkg.build.productName,
    '--set-version-string', 'OriginalFilename', `${pkg.build.productName}.exe`,
    '--set-version-string', 'CompanyName', pkg.build.productName,
    '--set-version-string', 'LegalCopyright', '© 2026 ' + pkg.build.productName,
  ];
  execFileSync(findRcedit(), args, { stdio: 'inherit', windowsHide: true });

  console.log('[3/3] 出 NSIS 安装包…');
  execSync(`npx electron-builder --win --prepackaged "${unpacked}" --publish never`, { cwd: appDir, stdio: 'inherit', env, encoding: 'utf8', timeout: 900000 });
} finally {
  fs.rmSync(engineDst, { recursive: true, force: true }); // 打完好清理临时副本
}
