'use strict';
const fs = require('fs');
const path = require('path');
const APP_ID = 'com.aisetup.app';
const NAME = '与风AI助手.lnk';
// 0.5.4 及更早版本的托管入口名。升级后清掉,桌面不留旧名字。
const LEGACY_NAMES = ['AI助手.lnk'];

function wantsAssistant(argv) { return argv.includes('--open-ai'); }

function createAssistantShortcut({ shell, desktop, executable, packaged, platform = process.platform, fileSystem = fs }) {
  if (!packaged || platform !== 'win32') return { ok: false, skipped: true, message: '桌面快捷方式在正式 Windows 安装版中提供' };
  try {
    const shortcut = path.join(desktop, NAME);
    // 旧的托管入口(名字变了)只删我们自己的 —— 按 AUMID 认,绝不误删别人的同名快捷方式。
    for (const legacy of LEGACY_NAMES) {
      const stale = path.join(desktop, legacy);
      if (legacy === NAME || !fileSystem.existsSync(stale)) continue;
      try { if (shell.readShortcutLink(stale).appUserModelId === APP_ID) fileSystem.unlinkSync(stale); }
      catch { /* 读不出/删不掉就留着,不影响新建 */ }
    }
    if (fileSystem.existsSync(shortcut)) {
      const previous = shell.readShortcutLink(shortcut);
      if (previous.appUserModelId !== APP_ID) return { ok: false, message: '桌面已有其他程序的“与风AI助手”，请先给它改名，再点“创建桌面入口”' };
    }
    const ok = shell.writeShortcutLink(shortcut, 'create', {
      target: executable, cwd: path.dirname(executable), args: '--open-ai',
      description: '启动与风AI助手并在浏览器中打开界面',
      icon: executable, iconIndex: 0, appUserModelId: APP_ID,
    });
    return ok ? { ok: true, message: '桌面“与风AI助手”已就绪，重启后也可双击打开' }
      : { ok: false, message: '已安装，但桌面入口创建失败；可点“打开与风AI助手”，或重试创建桌面入口' };
  } catch {
    return { ok: false, message: '桌面入口创建失败，请检查桌面是否可写，再点“创建桌面入口”；也可直接打开与风AI助手' };
  }
}
module.exports = { createAssistantShortcut, wantsAssistant, NAME, APP_ID };
