import { app, ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { ipcLogger, updateLogger, appLogger } from '../infrastructure/logging';
import { configManager } from '../infrastructure/config';
import { retryManager } from '../infrastructure/retry';
import { getWatcherStatus, startWatcher, stopWatcher, startConsumers, stopConsumers } from '../modules/monitoring';
import { getPerformanceStats ,processSlotAndBuy} from '../modules/monitoring/transactionProcessor';
import { PositionQuery } from '../infrastructure/database';
import { walletManager } from '../modules/trading';
import { Connection } from '@solana/web3.js';
import { checkForUpdates } from './update';
// Import positionManager directly from main.ts
import { positionManager } from '../../main';

export function registerIPCHandlers(mainWindow: BrowserWindow): void {
  // 渲染进程日志记录
  ipcMain.on('log-message', (_, msg) => {
    ipcLogger.info('Received log message from renderer', { message: msg });
  });

  // 获取应用版本
  ipcMain.handle('get-app-version', () => {
    const version = app.getVersion();
    ipcLogger.debug('App version requested', { version });
    return version;
  });

  // ping-pong 测试
  ipcMain.on('ping', (event) => {
    ipcLogger.debug('Ping received, sending pong');
    event.reply('pong', 'Pong from main process');
  });

  

  // 文件选择对话框
  ipcMain.handle('dialog:select-files', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections']
      });
      ipcLogger.info('File selection dialog completed', { 
        canceled: result.canceled, 
        fileCount: result.filePaths.length 
      });
      return result.filePaths;
    } catch (error) {
      ipcLogger.error('File selection dialog failed', error);
      throw error;
    }
  });
  // 扫描固定区块
  ipcMain.handle('scan:block', async (_, block: number | string) => {
    try {
      // 确保区块号是数字类型
      const blockNumber = typeof block === 'string' ? parseInt(block, 10) : block;
      
      // 验证区块号
      if (isNaN(blockNumber) || blockNumber <= 0) {
        throw new Error(`无效的区块号: ${block}`);
      }
      
      ipcLogger.info('Block scan requested', { block: blockNumber });
      
      const startTime = Date.now();
      await processSlotAndBuy(blockNumber);
      const duration = Date.now() - startTime;
      
      ipcLogger.info('Block scan completed', { block: blockNumber, duration });
      
      return {
        success: true,
        block: blockNumber,
        duration,
        message: `区块 ${blockNumber} 扫描完成，耗时 ${duration}ms`
      };
    } catch (error) {
      ipcLogger.error('scan:block failed', error);
      throw error;
    }
  });

  // 打开外部链接
  ipcMain.on('shell:open-link', (_, url) => {
    ipcLogger.info('Opening external link', { url });
    shell.openExternal(url);
  });

  // 更新检查
  ipcMain.on('update:check', () => {
    updateLogger.info('Update check requested');
    checkForUpdates();
  });

  // 配置管理 IPC 处理器
  ipcMain.handle('config:get', () => {
    ipcLogger.debug('Configuration requested');
    return configManager.getConfig();
  });

  ipcMain.handle('config:update', (_, path: string, value: any) => {
    try {
      appLogger.info('配置更新请求', { path, valueKeys: Object.keys(value || {}) });
      
      if (path) {
        configManager.setNested(path, value);
        appLogger.info('配置嵌套更新成功', { path });
      } else {
        // 如果路径为空，则用 value 替换整个配置
        configManager.replaceAll(value);
        appLogger.info('配置完全替换成功', { configKeys: Object.keys(value || {}) });
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      appLogger.error('配置更新失败', { error: message, path });
      return { success: false, error: message };
    }
  });

 

  

  // 监听配置变化并通知渲染进程
  configManager.onConfigChange((newConfig, oldConfig) => {
    appLogger.info('配置变化检测到，通知渲染进程', { 
      changedKeys: Object.keys(newConfig).filter(key => 
        JSON.stringify(newConfig[key as keyof typeof newConfig]) !== 
        JSON.stringify(oldConfig[key as keyof typeof oldConfig])
      ) 
    });
    
    // 检查私钥是否发生变化，如果变化则重新加载钱包
    if (newConfig.solana?.privateKey !== oldConfig.solana?.privateKey) {
      appLogger.info('检测到私钥变化，重新加载钱包');
      walletManager.loadSignerFromConfig();
    }
    
    BrowserWindow.getAllWindows().forEach(window => {
      if (window && !window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
        window.webContents.send('config:changed', newConfig, oldConfig);
      }
    });
  });

  // 监控器控制 IPC 处理器
  ipcMain.handle('watcher:status', () => {
    ipcLogger.debug('Watcher status requested');
    return getWatcherStatus();
  });

  ipcMain.handle('watcher:start', async () => {
    try {
      ipcLogger.info('Watcher start requested');
      await startWatcher();
      return { success: true };
    } catch (error) {
      ipcLogger.error('Watcher start failed', error);
      throw error;
    }
  });

  ipcMain.handle('watcher:stop', async () => {
    try {
      ipcLogger.info('Watcher stop requested');
      stopWatcher();
      return { success: true };
    } catch (error) {
      ipcLogger.error('Watcher stop failed', error);
      throw error;
    }
  });

  // 消费者控制 IPC 处理器
  ipcMain.handle('consumers:start', async () => {
    try {
      ipcLogger.info('Consumers start requested');
      startConsumers();
      return { success: true };
    } catch (error) {
      ipcLogger.error('Consumers start failed', error);
      throw error;
    }
  });

  ipcMain.handle('consumers:stop', async () => {
    try {
      ipcLogger.info('Consumers stop requested');
      stopConsumers();
      return { success: true };
    } catch (error) {
      ipcLogger.error('Consumers stop failed', error);
      throw error;
    }
  });

  // 监控状态 IPC 处理器
  ipcMain.handle('monitoring:status', async () => {
    try {
      ipcLogger.debug('Monitoring status requested');
      
      // 获取性能统计
      const performanceStats = getPerformanceStats();
      
      return {
        success: true,
        data: {
          performance: performanceStats
        }
      };
    } catch (error) {
      ipcLogger.error('Get monitoring status failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 重试统计 IPC 处理器
  ipcMain.handle('retry:stats', async (_, context?: string) => {
    try {
      ipcLogger.debug('Retry stats requested', { context });
      const stats = retryManager.getStats(context);
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      ipcLogger.error('Get retry stats failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('retry:clear-stats', async (_, context?: string) => {
    try {
      ipcLogger.debug('Clear retry stats requested', { context });
      retryManager.clearStats(context);
      return {
        success: true
      };
    } catch (error) {
      ipcLogger.error('Clear retry stats failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 持仓管理 IPC 处理器
  // 获取持仓列表
  ipcMain.handle('positions:list', async (_, query?: PositionQuery) => {
    try {
      ipcLogger.debug('Positions list requested', { query });
      if (!positionManager) {
        throw new Error('数据库未初始化');
      }
      return await positionManager.getPositions(query || {});
    } catch (error) {
      appLogger.error('获取持仓列表失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 获取单个持仓详情
  ipcMain.handle('positions:get', async (_, tokenMint: string, walletAddress: string) => {
    try {
      ipcLogger.debug('Position detail requested', { tokenMint, walletAddress });
      if (!positionManager) {
        throw new Error('数据库未初始化');
      }
      return await positionManager.getPosition(tokenMint, walletAddress);
    } catch (error) {
      appLogger.error('获取持仓详情失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 获取交易记录
  ipcMain.handle('positions:trades', async (_, positionId?: number, walletAddress?: string, limit?: number, offset?: number) => {
    try {
      ipcLogger.debug('Trades requested', { positionId, walletAddress, limit, offset });
      if (!positionManager) {
        throw new Error('数据库未初始化');
      }
      return await positionManager.getTrades(positionId, walletAddress, limit, offset);
    } catch (error) {
      appLogger.error('获取交易记录失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 获取持仓统计
  ipcMain.handle('positions:stats', async (_, walletAddress?: string) => {
    try {
      ipcLogger.debug('Position stats requested', { walletAddress });
      if (!positionManager) {
        throw new Error('数据库未初始化');
      }
      return await positionManager.getPositionStats(walletAddress);
    } catch (error) {
      appLogger.error('获取持仓统计失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 更新持仓价格
  ipcMain.handle('positions:update-price', async (_, tokenMint: string, walletAddress: string, priceSol: number, priceUsd: number) => {
    try {
      ipcLogger.debug('Position price update requested', { tokenMint, walletAddress, priceSol, priceUsd });
      if (!positionManager) {
        throw new Error('数据库未初始化');
      }
      return await positionManager.updatePositionPrice(tokenMint, walletAddress, priceSol, priceUsd);
    } catch (error) {
      appLogger.error('更新持仓价格失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 删除持仓（管理功能）
  ipcMain.handle('positions:delete', async (_, tokenMint: string, walletAddress: string) => {
    try {
      ipcLogger.info('Position deletion requested', { tokenMint, walletAddress });
      if (!positionManager) {
        throw new Error('数据库未初始化');
      }
      return await positionManager.deletePosition(tokenMint, walletAddress);
    } catch (error) {
      appLogger.error('删除持仓失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 手动卖出持仓
  ipcMain.handle('positions:sell', async (_, tokenMint: string, walletAddress: string, sellRatio: number) => {
    try {
      ipcLogger.info('Manual sell requested', { tokenMint, walletAddress, sellRatio });
      
      // 获取持仓信息
      if (!positionManager) {
        throw new Error('数据库未初始化');
      }
      
      const position = await positionManager.getPosition(tokenMint, walletAddress);
      if (!position) {
        throw new Error('持仓不存在');
      }
      
      if (position.status !== 'open') {
        throw new Error('持仓已关闭');
      }
      
      if (position.current_amount <= 0) {
        throw new Error('持仓数量不足');
      }
      
      // 导入卖出策略管理器
      const { SellStrategyManager } = await import('../modules/trading/sellStrategyManager');
      const { getProxyAgent } = await import('../infrastructure/network');
      const fetch = (await import('cross-fetch')).default;
      
      const rpcUrl = configManager.getNested<string>('solana.rpcUrl') || 'https://api.mainnet-beta.solana.com';
      const agent = getProxyAgent();
      const customFetch = (url: any, options: any) => {
        return fetch(url, { ...options, agent: agent as any });
      };
      const connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        fetch: customFetch as any,
      });
      const sellStrategyManager = new SellStrategyManager(connection);
      
      // 执行卖出
      const txSignature = await sellStrategyManager.executeSell(
        position,
        sellRatio,
        '手动卖出',
        false,
        0
      );
      
      if (!txSignature) {
        throw new Error('卖出交易失败');
      }
      
      // 记录卖出交易
      const sellAmount = position.current_amount * sellRatio;
      const sellValueSol = sellAmount * position.current_price_sol;
      const sellValueUsd = sellAmount * position.current_price_usd;
      
      const tradeRecord = {
        transaction_signature: txSignature,
        trade_type: 'sell' as const,
        token_mint: tokenMint,
        wallet_address: walletAddress,
        amount: sellAmount,
        price_sol: position.current_price_sol,
        price_usd: position.current_price_usd,
        value_sol: sellValueSol,
        value_usd: sellValueUsd,
        slippage_bps: 50,
        gas_fee_sol: 0,
        block_time: new Date().toISOString()
      };
      
      await positionManager.recordTrade(tradeRecord);
      
      ipcLogger.info('Manual sell completed', { tokenMint, txSignature, sellAmount });
      return { success: true, txSignature, sellAmount };
    } catch (error) {
      appLogger.error('手动卖出失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 清空队列
  ipcMain.handle('queue:clear', async (_, channel?: string) => {
    try {
      ipcLogger.info('Queue clear requested', { channel });
      const { queueProxy } = await import('../modules/queue/queueProxy');
      
      if (channel) {
        // 清空指定队列
        queueProxy.clear(channel);
        ipcLogger.info(`Queue ${channel} cleared`);
      } else {
        // 清空所有队列（默认清空主要的 SlotUpdate 队列）
        queueProxy.clear('SlotUpdate');
        ipcLogger.info('SlotUpdate queue cleared');
      }
      
      return { success: true };
    } catch (error) {
      appLogger.error('清空队列失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  // 钱包信息 IPC 处理器
  ipcMain.handle('wallet:info', async () => {
    try {
      ipcLogger.debug('Wallet info requested');
      const signer = walletManager.getSigner();
      
      if (!signer) {
        return { address: null, balance: 0 };
      }

      const address = signer.publicKey.toBase58();

      // 获取SOL余额
      let balance = 0;
      try {
        const { getProxyAgent } = await import('../infrastructure/network');
        const fetch = (await import('cross-fetch')).default;
        
        const rpcUrl = configManager.getNested<string>('solana.rpcUrl') || 'https://api.mainnet-beta.solana.com';
        const agent = getProxyAgent();
        const customFetch = (url: any, options: any) => {
          return fetch(url, { ...options, agent: agent as any });
        };
        const connection = new Connection(rpcUrl, {
          commitment: 'confirmed',
          fetch: customFetch as any,
        });
        const balanceLamports = await connection.getBalance(signer.publicKey);
        balance = balanceLamports / 1e9; // 转换为SOL单位
      } catch (balanceError) {
        ipcLogger.warn('Failed to get wallet balance', balanceError);
      }
      
      ipcLogger.debug('Wallet info retrieved', { address, balance });
      return { address, balance };
    } catch (error) {
      ipcLogger.error('Get wallet info failed', error);
      return { address: null, balance: 0 };
    }
  });

  appLogger.info('IPC handlers registered');
}