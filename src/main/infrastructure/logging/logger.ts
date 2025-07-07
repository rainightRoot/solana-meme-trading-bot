import log from 'electron-log';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';

// 配置日志文件路径 - 支持测试环境
function getLogPath(): string {
  try {
    // 尝试使用Electron的app路径
    if (app && app.getPath) {
      return path.join(app.getPath('userData'), 'logs');
    }
  } catch (error) {
    // 在测试环境中，app对象可能不可用
  }
  
  // 备用路径（测试环境）
  const testLogPath = path.join(os.tmpdir(), 'my-app-test-logs');
  
  // 确保目录存在
  try {
    if (!fs.existsSync(testLogPath)) {
      fs.mkdirSync(testLogPath, { recursive: true });
    }
  } catch (error) {
    console.warn('无法创建日志目录:', error);
  }
  
  return testLogPath;
}

const logPath = getLogPath();

// 配置 electron-log
log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log');
log.transports.file.level = 'debug';
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// 控制台输出配置 - 开发环境显示debug日志
const isDevelopment = process.env.NODE_ENV === 'development';
log.transports.console.level = isDevelopment ? 'debug' : 'info';
log.transports.console.format = '[{level}] {text}';

// 日志广播到渲染进程的函数
function broadcastLogToRenderer(level: string, message: string, context: string): void {
  // 检查是否在测试环境或BrowserWindow不可用
  if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') {
    // 在测试环境中，跳过广播
    return;
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: String(level),
    context: String(context),
    message: String(message)
  };
  
  try {
    // 广播到所有窗口
    const windows = BrowserWindow.getAllWindows();
    let sentCount = 0;
    
    windows.forEach(window => {
      if (window && !window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
        try {
          window.webContents.send('main-log', logEntry);
          sentCount++;
        } catch (error) {
          console.error('Failed to send log to renderer:', error);
        }
      }
    });
    
    // 在debug模式下记录发送状态
    if (isDevelopment && level === 'debug') {
      console.log(`📡 Log broadcasted to ${sentCount}/${windows.length} windows`);
    }
  } catch (error) {
    // 在测试环境中，可能会抛出错误，静默忽略
    if (isDevelopment) {
      console.log('📡 Log broadcast skipped (test environment)');
    }
  }
}

export class Logger {
  private context: string;

  constructor(context = 'App') {
    this.context = context;
  }

  /**
   * 记录调试信息
   */
  debug(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    log.debug(`[${this.context}] ${fullMessage}`);
    broadcastLogToRenderer('debug', fullMessage, this.context);
  }

  /**
   * 记录一般信息
   */
  info(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    log.info(`[${this.context}] ${fullMessage}`);
    broadcastLogToRenderer('info', fullMessage, this.context);
  }

  /**
   * 记录警告信息
   */
  warn(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    log.warn(`[${this.context}] ${fullMessage}`);
    broadcastLogToRenderer('warn', fullMessage, this.context);
  }

  /**
   * 记录错误信息
   */
  error(message: string, error?: Error | any, ...args: any[]): void {
    let fullMessage = message;
    if (error instanceof Error) {
      fullMessage = `${message} - ${error.message}`;
      log.error(`[${this.context}] ${message}`, error.stack, ...args);
    } else if (error !== undefined && error !== null) {
      // 确保error被正确转换为字符串
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      fullMessage = args.length > 0 ? `${message} ${errorStr} ${JSON.stringify(args)}` : `${message} ${errorStr}`;
      log.error(`[${this.context}] ${message}`, error, ...args);
    } else {
      // 没有error参数时
      fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
      log.error(`[${this.context}] ${message}`, ...args);
    }
    broadcastLogToRenderer('error', fullMessage, this.context);
  }

  /**
   * 记录致命错误
   */
  fatal(message: string, error?: Error | any, ...args: any[]): void {
    const fatalMessage = `[FATAL] ${message}`;
    this.error(fatalMessage, error, ...args);
  }

  /**
   * 获取日志文件路径
   */
  static getLogPath(): string {
    return logPath;
  }

  /**
   * 清理旧日志文件
   */
  static async cleanOldLogs(maxDays = 7): Promise<void> {
    try {
      const files = await fs.promises.readdir(logPath);
      const now = Date.now();
      const maxAge = maxDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(logPath, file);
          const stats = await fs.promises.stat(filePath);
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.promises.unlink(filePath);
            log.info(`[LOGGER] Cleaned old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      log.error('[LOGGER] Failed to clean old logs:', error);
    }
  }

  /**
   * 设置日志级别
   */
  static setLevel(level: 'error' | 'warn' | 'info' | 'debug'): void {
    log.transports.file.level = level;
    log.transports.console.level = level;
  }

  /**
   * 获取当前日志级别
   */
  static getLevel(): 'error' | 'warn' | 'info' | 'debug' {
    return log.transports.file.level as 'error' | 'warn' | 'info' | 'debug';
  }

  /**
   * 手动广播日志到渲染进程
   */
  static broadcastToRenderer(level: string, message: string, context = 'System'): void {
    broadcastLogToRenderer(level, message, context);
  }
}

// 创建默认日志记录器
export const logger = new Logger('Main');

// 导出常用的日志记录器
export const appLogger = new Logger('App');
export const queueLogger = new Logger('Queue');
export const ipcLogger = new Logger('IPC');
export const updateLogger = new Logger('Update');
export const solanaLogger = new Logger('Solana');

// 导出原始的 electron-log 实例，以便在特殊情况下使用
export { log };

// 导出广播函数
export { broadcastLogToRenderer };

// 默认导出 Logger 类
export default Logger;
