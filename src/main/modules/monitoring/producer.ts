import { Connection } from "@solana/web3.js";
import { queueProxy } from '../queue/queueProxy';
import { solanaLogger } from '../../infrastructure/logging';
import { configManager } from '../../infrastructure/config';
import { ConsumerManager } from '../queue/ConsumerManager';

let connectionRetries = 0;
let connection: Connection | null = null; // 全局连接对象
let latestSlot = 0;
let isRunning = false;

// 消费者管理器实例
const consumerManager = new ConsumerManager('SlotUpdate');

// 注册消费者管理器到队列代理，用于事件通知
queueProxy.setConsumerManager(consumerManager);

// 启动消费者
export function startConsumers() {
  const count = configManager.getNested<number>('queue.consumerCount') || 1;
  
  // 限制消费者数量，避免过多消费者导致系统卡顿
  const maxConsumers = 100;
  const actualCount = Math.min(count, maxConsumers);
  
  if (actualCount !== count) {
    solanaLogger.warn(`消费者数量已限制为 ${actualCount}，原配置为 ${count}`);
  }
  
  consumerManager.setTargetConsumerCount(actualCount);
  solanaLogger.info(`启动 ${actualCount} 个消费者`);
}

// 停止所有消费者
export function stopConsumers() {
  consumerManager.stopAll();
  solanaLogger.info('已停止所有消费者');
}

// 监听配置变化，动态调整消费者数量
configManager.onKeyChange('queue', (newQueueConfig, oldQueueConfig) => {
  if (newQueueConfig.consumerCount !== oldQueueConfig.consumerCount) {
    // 限制消费者数量
    const maxConsumers = 5;
    const actualCount = Math.min(newQueueConfig.consumerCount, maxConsumers);
    
    if (actualCount !== newQueueConfig.consumerCount) {
      solanaLogger.warn(`消费者数量已限制为 ${actualCount}，原配置为 ${newQueueConfig.consumerCount}`);
    }
    
    consumerManager.setTargetConsumerCount(actualCount);
    solanaLogger.info(`动态调整消费者数量为 ${actualCount}`);
  }
});

// 启动监视器 - 生产者
export async function startWatcher() {
  if (isRunning) {
    solanaLogger.warn("监控器已在运行中");
    return;
  }

  solanaLogger.info("🔄 启动链上监控器（生产者）");

  try {
    connection = await createConnection();
    isRunning = true;
    
    setupSlotWatcher();
  } catch (err: any) {
    solanaLogger.error(`初始化RPC连接失败: ${err.message}`);
    isRunning = false;
    return;
  }
}

// 停止监视器
export function stopWatcher() {
  if (!isRunning) {
    solanaLogger.warn("监控器未在运行");
    return;
  }

  solanaLogger.info("🛑 停止链上监控器");
  
  if (connection) {
    connection = null;
  }
  
  isRunning = false;
}

// 重启监视器
export async function restartWatcher() {
  solanaLogger.info("🔄 重启链上监控器");
  stopWatcher();
  await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
  await startWatcher();
}

// 设置槽位监听器
function setupSlotWatcher() {
  if (!connection) {
    solanaLogger.error("连接未建立，无法设置槽位监听器");
    return;
  }

  let consecutiveErrors = 0;
  const maxConsecutiveErrors = configManager.getNested<number>('queue.retryAttempts') || 3;

  connection.onSlotUpdate(async (slotInfo) => {
    if (!isRunning) return;
    if (slotInfo.type === 'completed') {
      const currSlot = slotInfo.slot;
      try {
        solanaLogger.debug(`检查新区块: ${currSlot}`);
        
        queueProxy.enqueue('SlotUpdate', {
          type: 'transaction',
          data: {
            slot: currSlot,
            timestamp: Date.now()
          }
        });

        // 更新最新区块
        latestSlot = currSlot;

        // 重置连续错误计数器
        consecutiveErrors = 0;
      } catch (e: any) {
        consecutiveErrors++;
        solanaLogger.error("扫链错误:", e.message);

        // 如果连续错误过多，尝试重新连接
        if (consecutiveErrors >= maxConsecutiveErrors) {
          solanaLogger.warn(`连续错误达到 ${maxConsecutiveErrors} 次，尝试重新连接`);
          await restartWatcher();
        }
      }
    }
  });

  solanaLogger.info("槽位监听器设置完成");
}

// 创建RPC连接，带有重试机制
async function createConnection(): Promise<Connection> {
  connectionRetries = 0;
  const config = configManager.get('solana');
  
  solanaLogger.info(`📡 连接RPC: ${config.rpcUrl}`);

  try {
  
    // 带超时和重试的连接检查
    const conn = new Connection('https://api.mainnet-beta.solana.com', {
      commitment: config.commitment,
    });

    // 测试连接是否正常工作
    const version = await conn.getVersion();
    solanaLogger.info(`✅ RPC连接成功: Solana ${version['solana-core']}`);

    return conn;
  } catch (err: any) {
    solanaLogger.error(`RPC连接失败: ${err.message}`);
    throw err;
  }
}

// 获取当前状态
export function getWatcherStatus() {
  const queueLength = queueProxy.size('SlotUpdate');
  const queueStats = queueProxy.getStats();
  const consumerStatus = consumerManager.getStatus();
  
  return {
    isRunning,
    connection: connection ? 'connected' : 'disconnected',
    latestSlot,
    queueLength,
    queueStats,
    consumerStatus,
    config: {
      rpcUrl: configManager.getNested<string>('solana.rpcUrl'),
      commitment: configManager.getNested<string>('solana.commitment'),
      timeout: configManager.getNested<number>('solana.timeout')
    }
  };
}

// 获取最新槽位
export function getLatestSlot(): number {
  return latestSlot;
}