import { autoUpdater } from 'electron-updater';
import { dialog, shell, BrowserWindow } from 'electron';
import { updateLogger } from '../infrastructure/logging';

// 根据平台设置自动下载行为
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// 所有平台都不自动下载，需要用户确认
autoUpdater.autoDownload = false;

// 强制跳过签名校验（测试环境下使用）
(autoUpdater as any).disableCodeSignatureValidation = true;

autoUpdater.on('checking-for-update', () => {
  updateLogger.info('Checking for updates');
});

autoUpdater.on('update-available', (info) => {
  updateLogger.info('Update available', { version: info.version, platform: process.platform });
  
  // 所有平台都显示确认对话框
  showUpdateConfirmDialog(info);
});

autoUpdater.on('update-not-available', () => {
  updateLogger.info('No update available, already on latest version');
});

autoUpdater.on('error', (err) => {
  updateLogger.error('Update error occurred', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = `Download speed: ${progressObj.bytesPerSecond}`;
  log_message = log_message + ` - Downloaded ${progressObj.percent}%`;
  log_message = log_message + ` (${progressObj.transferred}/${progressObj.total})`;
  updateLogger.info('Download progress:', log_message);
  
  // 通知渲染进程更新下载进度
  const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', () => {
  updateLogger.info('Update downloaded, ready to install');
  
  // 所有平台都显示安装确认对话框
  showInstallConfirmDialog();
});

// 统一的更新确认对话框
function showUpdateConfirmDialog(updateInfo: any) {
  const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  
  if (!mainWindow) {
    updateLogger.warn('No window available to show update dialog');
    return;
  }
  
  const currentVersion = autoUpdater.currentVersion.version;
  const newVersion = updateInfo.version;
  const releaseDate = updateInfo.releaseDate ? new Date(updateInfo.releaseDate).toLocaleDateString() : '未知';
  
  let detailMessage = `当前版本: ${currentVersion}\n新版本: ${newVersion}\n发布日期: ${releaseDate}\n\n`;
  
  if (updateInfo.releaseNotes) {
    detailMessage += '更新内容:\n' + updateInfo.releaseNotes + '\n\n';
  }
  
  if (isMac) {
    detailMessage += '由于macOS的安全机制，需要手动下载并安装更新。\n点击"立即下载"将打开GitHub发布页面。';
  } else {
    detailMessage += '点击"立即下载"开始下载更新文件。';
  }
  
  const options = {
    type: 'info' as const,
    buttons: ['立即下载', '稍后提醒', '忽略此版本'],
    defaultId: 0,
    cancelId: 2,
    title: '发现新版本',
    message: `新版本 ${newVersion} 可用！`,
    detail: detailMessage,
    checkboxLabel: '不再提醒此版本',
    checkboxChecked: false
  };
  
  dialog.showMessageBox(mainWindow, options).then((result) => {
    const { response, checkboxChecked } = result;
    
    if (response === 0) {
      // 立即下载
      if (isMac) {
        // Mac系统：打开GitHub发布页面
        const releaseUrl = `https://github.com/rainightRoot/solana-meme-trading-bot/releases/tag/v${newVersion}`;
        shell.openExternal(releaseUrl);
        updateLogger.info('Opening specific release page for manual download', { url: releaseUrl, version: newVersion });
      } else {
        // Windows/Linux系统：开始自动下载
        updateLogger.info('User confirmed download, starting automatic download', { version: newVersion });
        autoUpdater.downloadUpdate();
      }
    } else if (response === 1) {
      // 稍后提醒
      updateLogger.info('User chose to be reminded later');
    } else {
      // 忽略此版本
      updateLogger.info('User chose to ignore this version', { version: newVersion });
    }
    
    if (checkboxChecked) {
      updateLogger.info('User chose not to be reminded about this version', { version: newVersion });
      // 这里可以添加逻辑来记住用户的选择，比如保存到配置文件中
    }
  }).catch((err) => {
    updateLogger.error('Error showing update dialog', err);
  });
}

// 安装确认对话框
function showInstallConfirmDialog() {
  const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    // 如果没有窗口，直接安装
    updateLogger.info('No window available, installing update automatically');
    autoUpdater.quitAndInstall();
    return;
  }
  
  const options = {
    type: 'info' as const,
    buttons: ['立即重启安装', '稍后重启'],
    defaultId: 0,
    cancelId: 1,
    title: '更新已下载',
    message: '更新已下载完成',
    detail: '新版本已下载并准备安装。\n点击"立即重启安装"来完成更新，或选择"稍后重启"在您方便时手动重启。'
  };
  
  dialog.showMessageBox(mainWindow, options).then((result) => {
    if (result.response === 0) {
      updateLogger.info('User chose to restart and install immediately');
      autoUpdater.quitAndInstall();
    } else {
      updateLogger.info('User chose to restart later');
    }
  }).catch((err) => {
    updateLogger.error('Error showing install dialog', err);
  });
}

// 设置日志记录器
autoUpdater.logger = updateLogger as any;

// 导出更新检查函数
export function checkForUpdates() {
  updateLogger.info('Manual update check triggered', { platform: process.platform });
  autoUpdater.checkForUpdatesAndNotify();
}

// 应用启动时的更新检查
export function initializeAutoUpdater() {
  updateLogger.info('Initializing auto updater', { platform: process.platform, autoDownload: autoUpdater.autoDownload });
  
  // 应用启动后延迟检查更新（避免阻塞启动）
  setTimeout(() => {
    updateLogger.info('Checking for updates on startup');
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000); // 5秒后检查
}

// 导出平台信息
export { isMac, isWindows };