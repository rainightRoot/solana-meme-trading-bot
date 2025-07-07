import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { appLogger } from './main/infrastructure/';
import { registerIPCHandlers } from './main/app/ipcHandlers';
import { initializeAutoUpdater } from './main/app/update';
// Import all other modules
import { configManager } from './main/infrastructure/config';
import { DatabaseManager, PositionManager } from './main/infrastructure/database';
import { restartWatcher, initializeTransactionProcessor, shutdownTransactionProcessor } from './main/modules/monitoring';
import { initializeTradeExecutor, walletManager, setPositionManagerGetter } from './main/modules/trading';




appLogger.info('All modules imported successfully');

// Declare Vite environment variables
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow;

// 数据库实例
export let databaseManager: DatabaseManager;
export let positionManager: PositionManager;

// Variables to track initialization state
const appInitializationState = {
  isInitialized: false,
  isInitializing: false
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Safe check for development mode and dev server URL
  const isDevelopment = process.env.NODE_ENV === 'development';
  const hasDevServerUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL;

  appLogger.info('Environment info:', {
    NODE_ENV: process.env.NODE_ENV,
    isDevelopment,
    hasDevServerUrl,
    devServerUrl: hasDevServerUrl ? MAIN_WINDOW_VITE_DEV_SERVER_URL : 'not available'
  });

  // HMR for renderer based on electron-vite cli.
  if (isDevelopment && hasDevServerUrl) {
    const url = MAIN_WINDOW_VITE_DEV_SERVER_URL;
    mainWindow.loadURL(url);
    appLogger.info('Loading development URL', { url });

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
    appLogger.info('Main window created and DevTools opened');
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    appLogger.info('Loading production file from:', htmlPath);
    mainWindow.loadFile(htmlPath);
    appLogger.info('Loading production file', { path: htmlPath });
  }
};

// Initialize the application
async function initializeApp() {


  appInitializationState.isInitializing = true;

  try {
    appLogger.info('Initializing application...');

    appLogger.info('About to initialize database...');
    // Initialize database first
    databaseManager = new DatabaseManager();
    await databaseManager.initialize();
    positionManager = new PositionManager(databaseManager);
    appLogger.info('Database initialization completed');
    appLogger.info('数据库系统已成功初始化');

    appLogger.info('About to set position manager...');
    // Set position manager for trading module
    setPositionManagerGetter(() => positionManager);
    appLogger.info('Position manager set');

    appLogger.info('About to load wallet...');
    // Load wallet (this is sync, not async)
    walletManager.loadSignerFromConfig();
    appLogger.info('Wallet loaded');
    appLogger.info('交易钱包已成功加载');

    appLogger.info('About to initialize transaction processor...');
    // Initialize transaction processor with process manager
    await initializeTransactionProcessor();
    appLogger.info('Transaction processor initialized');



    // Setup config monitoring
    appLogger.info('About to setup config monitoring...');
    configManager.onKeyChange('solana', (newConfig, oldConfig) => {
      const rpcChanged = newConfig.rpcUrl !== oldConfig.rpcUrl;
      const proxiesChanged = JSON.stringify(newConfig.proxies) !== JSON.stringify(oldConfig.proxies);
      const privateKeyChanged = newConfig.privateKey !== oldConfig.privateKey;

      // Reload wallet if private key changed
      if (privateKeyChanged) {
        appLogger.info('私钥已更改，正在重新加载钱包...');
        walletManager.loadSignerFromConfig();
      }

      if (rpcChanged || proxiesChanged) {
        appLogger.info('Solana 连接配置已更改，正在重新初始化服务...');

        // Reinitialize services that use connection
        initializeTransactionProcessor();
        initializeTradeExecutor();

        // Restart watcher with new connection config
        restartWatcher().catch(err => {
          appLogger.error('重启监听器失败:', err);
        });
      }
    });
    appLogger.info('Config monitoring setup completed');

    appInitializationState.isInitialized = true;
    appLogger.info('App initialization completed successfully');
    appLogger.info('应用程序初始化完成');
    
    // 初始化自动更新
    initializeAutoUpdater();
  } catch (error: any) {
    console.error('App initialization failed:', error);
    appLogger.error('应用程序初始化失败:', error.message);
    appLogger.error('Error stack:', error.stack);
    throw error;
  } finally {
    appInitializationState.isInitializing = false;
  }
}

// Clean up resources
async function cleanupApp() {
  try {
    appLogger.info('开始清理应用程序资源...');

    // Shutdown transaction processor and child processes
    await shutdownTransactionProcessor();

    // Close database connection
    if (databaseManager) {
      await databaseManager.close();
      appLogger.info('数据库连接已关闭');
    }

    appLogger.info('应用程序资源清理完成');
  } catch (error: any) {
    appLogger.error('清理应用程序资源失败:', error.message);
  }
}

// Create window and ensure initialization
async function ensureAppReadyAndCreateWindow() {
  try {

    if (BrowserWindow.getAllWindows().length === 0) {
      // Ensure app is initialized first
      await initializeApp();
      // Create window if none exists
      appLogger.info('Creating main window...');
      createWindow();
    }
  } catch (error: any) {
    appLogger.error('Failed to ensure app ready and create window:', error.message);
    // Show error dialog to user
    dialog.showErrorBox('Startup Error', `Application failed to start: ${error.message}`);
    app.quit();
  }
}

// App ready event
app.on('ready', async () => {
  try {
    appLogger.info('App ready event triggered');
    await ensureAppReadyAndCreateWindow();
    appLogger.info('App fully initialized and ready');
      // Register IPC handlers 
  appLogger.info('Registering IPC handlers...');
  registerIPCHandlers(mainWindow);
  appLogger.info('IPC handlers registered');
  } catch (error: any) {
    appLogger.error('Error stack:', error.stack);
    // Show error dialog to user
    dialog.showErrorBox('Startup Error', `Application failed to start: ${error.message}`);

    app.quit();
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', async () => {
  appLogger.info('All windows closed');
  // Clean up resources
  await cleanupApp();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app activation (macOS)
app.on('activate', async () => {
  appLogger.info('App activated');
  if (BrowserWindow.getAllWindows().length === 0) {
    await ensureAppReadyAndCreateWindow();
  }
});

// Handle app quit
app.on('before-quit', async (event) => {
  appLogger.info('App is about to quit, cleaning up...');

  // Prevent default quit behavior, clean up first
  event.preventDefault();

  try {
    await cleanupApp();
  } catch (error: any) {
    appLogger.error('退出前清理失败:', error.message);
  } finally {
    // Force quit
    app.exit(0);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  appLogger.error('Uncaught Exception:', error);
  cleanupApp().finally(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  appLogger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
