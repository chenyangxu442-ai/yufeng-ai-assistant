// main.js — Electron 主进程(壳:起本地服务 + 加载 localhost)
const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;
const path = require('path');
const fs = require('fs');
const { createAssistantShortcut, wantsAssistant } = require('./assistant-shortcut');

// 启动全程留一份文件日志。
//
// 为什么值得专门写:窗口都没建起来的时候,用户能看到的只有"双击没反应",
// 弹框也不一定弹得出来 —— 没有文件就完全没法查(白电脑上被这一类坑过好几轮)。
// 有个 startup.log 至少能把现场发回来。
function startupLog(msg) {
  try {
    const dir = (app && app.getPath ? app.getPath('userData') : process.env.APPDATA) || '.';
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(msg).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/([?&]token=)[^\s&]+/g, '$1***');
    fs.appendFileSync(path.join(dir, 'startup.log'), new Date().toISOString() + '  ' + safe + '\n');
  } catch (e) { /* 日志写不了也不能耽误启动 */ }
}

startupLog('--- 启动 --- electron 模块类型=' + typeof electron + ' app=' + typeof app);

// 启动失败必须**看得见**。
// 打包后曾经因为一句 require 路径写错,窗口根本没创建,用户看到的就是
// "双击没反应" —— 最难排查的一种故障。任何启动异常都要弹框说人话。
function fail(e) {
  const msg = String((e && e.stack) || e).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/([?&]token=)[^\s&]+/g, '$1***');
  startupLog('启动失败: ' + msg);
  try {
    dialog.showErrorBox('启动失败', '程序没能启动,请把下面这段发给开发者:\n\n' + msg.slice(0, 800));
  } catch (err) { /* 连对话框都弹不出来就只能退 */ }
  app.quit();
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

// 已经有本程序在跑时,后一个直接退(否则会开两个窗口、抢同一个端口)。
const primary = app.requestSingleInstanceLock();
startupLog('单实例锁 = ' + primary);
if (!primary) {
  app.quit();
} else {
  let win = null;
  let openRequested = wantsAssistant(process.argv);
  let openFromShortcut = null;
  app.on('second-instance', (_event, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    if (wantsAssistant(argv)) {
      if (openFromShortcut) openFromShortcut();
      else openRequested = true;
    }
  });
  app.whenReady().then(async () => {
    startupLog('whenReady 到了');
    const { createServer, enginePath, startAssistant } = require('./server');
    const { isInstalling } = require(path.join(enginePath(), 'install'));
    const { isPreparing } = require(path.join(enginePath(), 'private-env'));

    // 安装过程的日志也要落文件。
    // GUI 程序的 console.log 是没人看得见的 —— 不落文件,白电脑上一出问题
    // 现场就完全没有了,只能靠猜。用户至少能把这个文件发给开发者。
    const log = require(path.join(enginePath(), 'log'));
    log.setFile(path.join(app.getPath('userData'), 'install.log'));

    const onInstalled = () => createAssistantShortcut({ shell: electron.shell, desktop: app.getPath('desktop'), executable: process.execPath, packaged: app.isPackaged });
    const detect = require(path.join(enginePath(), 'detect'));
    const config = require(path.join(enginePath(), 'config'));
    const initialShortcut = detect.env().dshBin && config.isConfigured() ? onInstalled() : null;

    // 原生能力交给主进程:选文件夹(批准目录)、复制提示词、打开官方页/安装程序。
    // 网页侧只能通过本地接口触发这些,永远拿不到任意路径的写权限。
    const nativeBridge = {
      async pickFolder(opts = {}) {
        const options = { title: opts.title || '选择文件夹', properties: ['openDirectory', 'createDirectory'] };
        const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
        return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
      },
      clipboard: { writeText: (text) => electron.clipboard.writeText(text) },
      openExternal: (url) => electron.shell.openExternal(url),
      async launchInstaller(file) {
        const error = await electron.shell.openPath(file);
        if (error) throw new Error('安装程序没能打开:' + error);
        return true;
      },
    };
    const { port } = await createServer({ onInstalled, initialShortcut, native: nativeBridge });
    startupLog('本地服务端口 ' + port);

    win = new BrowserWindow({
      width: 1080,
      height: 820,
      title: '与风AI助手',
      icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'yufeng.ico' : 'yufeng.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    win.setMenuBarVisibility(false);
    // 安装中的 npm 属于本程序，关闭窗口会丢掉监督和进度。
    win.on('close', e => {
      if (isInstalling() || isPreparing()) { e.preventDefault(); dialog.showMessageBoxSync(win, { type: 'info', message: '正在安装或准备环境，请完成后再关闭窗口。' }); }
    });
    app.on('before-quit', e => { if (isInstalling() || isPreparing()) e.preventDefault(); });
    win.webContents.setWindowOpenHandler(({ url }) => {
      // 只放行写死的官方页、开源仓库与 mailto: 承接「联系我们」的邮件链接,其余一律拒绝。
      const allowed = url === 'https://platform.deepseek.com/' || url === 'https://platform.deepseek.com'
        || url === 'https://github.com/chenyangxu442-ai/yufeng-ai-assistant' || /^mailto:/i.test(url);
      if (allowed) electron.shell.openExternal(url).catch(error => startupLog(error.message));
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (new URL(url).origin !== `http://127.0.0.1:${port}`) e.preventDefault();
    });
    await win.loadURL(`http://127.0.0.1:${port}`);
    startupLog('窗口已创建');
    let opening = false;
    openFromShortcut = async () => {
      if (opening) return;
      opening = true;
      try {
        const result = await startAssistant();
        if (!result.ok) await dialog.showMessageBox(win, { type: 'warning', title: '与风AI助手未能打开', message: result.error || '请在与风AI助手中完成安装后重试' });
      } catch (e) {
        startupLog('桌面入口启动失败: ' + e.message);
        await dialog.showMessageBox(win, { type: 'warning', title: '与风AI助手未能打开', message: '请在与风AI助手中点“打开与风AI助手”重试。' });
      } finally { opening = false; }
    };
    if (openRequested) await openFromShortcut();
  }).catch(fail);

  app.on('window-all-closed', () => {
    startupLog('窗口全关了,退出');
    if (process.platform !== 'darwin') app.quit();
  });
}
