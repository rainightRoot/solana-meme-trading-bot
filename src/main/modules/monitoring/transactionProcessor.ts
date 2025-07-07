import { Connection } from '@solana/web3.js';
import { solanaLogger, queueLogger } from '../../infrastructure/logging';
import { configManager } from '../../infrastructure/config';
import { followUpBuy } from '../trading/tradeExecutor';
import { ProcessManager } from '../process/processManager';

let connection: Connection;
let processManager: ProcessManager;

// 添加性能统计
const performanceStats = {
  totalProcessed: 0,
  totalErrors: 0,
  avgProcessingTime: 0,
  processTasks: 0,
  processErrors: 0,
  totalNetworkTime: 0,
  totalProcessTime: 0
};

/**
 * 初始化交易处理器
 */
export async function initializeTransactionProcessor() {
  const rpcUrl = configManager.getNested<string>('solana.rpcUrl');
  connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
  });
  
  // 初始化进程管理器
  processManager = new ProcessManager(
    configManager.getNested<number>('queue.maxProcesses') || 2, // 最大进程数量
    configManager.getNested<number>('queue.processTimeout') || 90000 // 进程超时（子进程超时时间更长）
  );
  
  try {
    await processManager.initialize();
    solanaLogger.info('交易处理器和进程管理器已初始化');
  } catch (error: any) {
    solanaLogger.error('初始化进程管理器失败:', error.message);
    throw error;
  }
  
  // 监听配置变化，动态调整进程数量
  configManager.onKeyChange('queue', (newQueueConfig, oldQueueConfig) => {
    if (newQueueConfig.maxProcesses !== oldQueueConfig.maxProcesses) {
      if (processManager) {
        processManager.setMaxProcesses(newQueueConfig.maxProcesses);
      }
    }
  });
}

/**
 * 主处理函数：使用子进程处理区块数据
 * @param slot - 区块号
 */
export async function processSlotAndBuy(slot: number) {
  const startTime = Date.now();
  queueLogger.debug(`[Consumer] processSlotAndBuy slot: ${slot} (使用子进程)`);

  try {
    // 获取配置
    const rpcUrl = configManager.getNested<string>('solana.rpcUrl');
    const monitoredWallets = configManager.getNested<string[]>('solana.monitoredWallets') || [];
    const followAmount = configManager.getNested<number>('solana.followAmount');
    const retryAttempts = configManager.getNested<number>('queue.retryAttempts') || 3;

    // 将任务提交到子进程
    const processResult = await processManager.submitTask('processSlot', {
      slot,
      rpcUrl,
      monitoredWallets,
      followAmount,
      retryAttempts
    });

    // 处理子进程返回的结果
    if (processResult.success && processResult.data) {
      const { tradingOpportunities, blockInfo } = processResult.data;
      
      if (tradingOpportunities && tradingOpportunities.length > 0) {
        solanaLogger.info(`发现 ${tradingOpportunities.length} 个跟单机会`);
        
        // 处理跟单机会（在主进程中执行，因为涉及钱包操作）
        for (const opportunity of tradingOpportunities) {
          await handleTradingOpportunity(opportunity);
        }
      }

      // 记录性能数据
      updatePerformanceStats(processResult, startTime);
      
      solanaLogger.info(
        `处理完成 slot: ${slot}, 交易数: ${blockInfo?.transactionCount || 0}, ` +
        `网络耗时: ${processResult.performance.networkTime}ms, ` +
        `处理耗时: ${processResult.performance.processTime}ms, ` +
        `总耗时: ${processResult.performance.totalTime}ms`
      );
    } else {
      queueLogger.warn(`子进程处理失败: ${processResult.error || '未知错误'}`);
      performanceStats.totalErrors++;
      performanceStats.processErrors++;
    }

  } catch (error: any) {
    performanceStats.totalErrors++;
    performanceStats.processErrors++;
    solanaLogger.error(`处理区块 ${slot} 失败:`, error.message);
    
    // 如果子进程处理失败，记录错误但不影响其他任务
    if (error.message.includes('进程') || error.message.includes('超时')) {
      queueLogger.warn(`子进程处理失败，跳过区块 ${slot}: ${error.message}`);
    }
  }
}

/**
 * 处理跟单机会
 */
async function handleTradingOpportunity(opportunity: any) {
  try {
    solanaLogger.info(`[跟单机会] 
      监控地址: ${opportunity.signer}
      交易: ${opportunity.txUrl}
      买入 Token: ${opportunity.tokenMint}
      买入数量: ${opportunity.amountBought}
      花费 SOL: ${opportunity.solSpent}
    `);

    const followAmount = configManager.getNested<number>('solana.followAmount');
    if (followAmount && followAmount > 0) {
      await followUpBuy(opportunity.tokenMint, followAmount);
    } else {
      solanaLogger.warn('未配置跟单金额 (solana.followAmount)，跳过跟单');
    }
  } catch (error: any) {
    solanaLogger.error('处理跟单机会失败:', error.message);
  }
}

/**
 * 更新性能统计
 */
function updatePerformanceStats(processResult: any, startTime: number) {
  const totalTime = Date.now() - startTime;
  
  performanceStats.totalProcessed++;
  performanceStats.processTasks++;
  performanceStats.totalNetworkTime += processResult.performance.networkTime;
  performanceStats.totalProcessTime += processResult.performance.totalTime;
  
  // 计算平均处理时间
  performanceStats.avgProcessingTime = 
    (performanceStats.avgProcessingTime * (performanceStats.totalProcessed - 1) + totalTime) / 
    performanceStats.totalProcessed;
}

/**
 * 获取性能统计信息
 */
export function getPerformanceStats() {
  const processStatus = processManager ? processManager.getStatus() : null;
  
  return {
    ...performanceStats,
    avgNetworkTime: performanceStats.processTasks > 0 ? 
      (performanceStats.totalNetworkTime / performanceStats.processTasks).toFixed(2) + 'ms' : '0ms',
    avgProcessTime: performanceStats.processTasks > 0 ? 
      (performanceStats.totalProcessTime / performanceStats.processTasks).toFixed(2) + 'ms' : '0ms',
    processStatus,
    errorRate: performanceStats.totalProcessed > 0 ? 
      ((performanceStats.totalErrors / performanceStats.totalProcessed) * 100).toFixed(2) + '%' : '0%'
  };
}

/**
 * 重置性能统计
 */
export function resetPerformanceStats() {
  performanceStats.totalProcessed = 0;
  performanceStats.totalErrors = 0;
  performanceStats.avgProcessingTime = 0;
  performanceStats.processTasks = 0;
  performanceStats.processErrors = 0;
  performanceStats.totalNetworkTime = 0;
  performanceStats.totalProcessTime = 0;
}

/**
 * 关闭交易处理器和进程管理器
 */
export async function shutdownTransactionProcessor() {
  if (processManager) {
    await processManager.shutdown();
    solanaLogger.info('交易处理器已关闭');
  }
} 