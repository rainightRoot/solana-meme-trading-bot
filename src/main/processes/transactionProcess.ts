import { Connection, ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';
import { withRetry, RETRY_CONFIGS, type RetryConfig } from '../infrastructure/retry';

// 子进程日志系统
class ChildProcessLogger {
  private context: string;

  constructor(context = 'ChildProcess') {
    this.context = context;
  }

  private sendLog(level: string, message: string, ...args: any[]): void {
    if (process.send) {
      process.send({
        type: 'log',
        level,
        context: this.context,
        message,
        args: args.length > 0 ? args : undefined
      });
    }
  }

  debug(message: string, ...args: any[]): void {
    this.sendLog('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.sendLog('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.sendLog('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.sendLog('error', message, ...args);
  }
}

// 创建日志实例
const childLogger = new ChildProcessLogger('TransactionProcess');

// 子进程处理区块数据的接口
interface ProcessTask {
  id: string;
  type: 'processSlot';
  data: {
    slot: number;
    rpcUrl: string;
    monitoredWallets: string[];
    followAmount?: number;
    retryAttempts?: number;
  };
}

interface ProcessResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  performance: {
    networkTime: number;
    processTime: number;
    totalTime: number;
    transactionCount: number;
  };
}

const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
let connection: Connection | null = null;

// 初始化连接
async function initializeConnection(rpcUrl: string, retryConfig: RetryConfig = RETRY_CONFIGS.NETWORK): Promise<void> {
  if (!connection) {
    try {
      childLogger.info('正在初始化RPC连接', { rpcUrl });
      connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
      });
      
      // 测试连接是否可用
      await withRetry(
        () => connection!.getSlot(),
        {
          maxRetries: Math.min(retryConfig.maxRetries, 2), // 连接测试用较少重试次数
          baseDelay: 500,
          maxDelay: 2000,
          backoffFactor: 2
        },
        `connection test for ${rpcUrl}`
      );
      
      childLogger.info('RPC连接初始化成功', { rpcUrl });
    } catch (error) {
      childLogger.error('RPC连接初始化失败', { rpcUrl, error: error instanceof Error ? error.message : String(error) });
      connection = null;
      throw error;
    }
  }
}

// 子进程中的核心处理函数
async function processSlotInChild(task: ProcessTask): Promise<ProcessResult> {
  const startTime = Date.now();
  const { slot, rpcUrl, monitoredWallets, followAmount, retryAttempts } = task.data;
  
  childLogger.info('开始处理区块', { 
    slot, 
    monitoredWalletsCount: monitoredWallets.length, 
    followAmount, 
    retryAttempts 
  });
  
  // 根据配置设置重试次数
  const retryConfig: RetryConfig = {
    ...RETRY_CONFIGS.NETWORK,
    maxRetries: retryAttempts !== undefined ? retryAttempts : RETRY_CONFIGS.NETWORK.maxRetries
  };
  
  try {
    // 初始化连接
    await initializeConnection(rpcUrl, retryConfig);
    
    // 获取区块数据（带重试机制）
    const networkStartTime = Date.now();
    childLogger.debug('正在获取区块数据', { slot });
    
    const block = await withRetry(
      () => connection!.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
      }),
      retryConfig,
      `getBlock(slot: ${slot})`
    );
    
    const networkTime = Date.now() - networkStartTime;
    childLogger.debug('区块数据获取完成', { slot, networkTime: `${networkTime}ms` });
    
    if (!block) {
      childLogger.warn('区块未找到', { slot });
      return {
        id: task.id,
        success: true,
        data: { message: `区块 ${slot} 未找到` },
        performance: {
          networkTime,
          processTime: 0,
          totalTime: Date.now() - startTime,
          transactionCount: 0
        }
      };
    }

    childLogger.info('区块数据获取成功', { 
      slot, 
      transactionCount: block.transactions.length,
      blockTime: block.blockTime ? new Date(block.blockTime * 1000).toISOString() : 'unknown'
    });

    if (monitoredWallets.length === 0) {
      childLogger.warn('没有配置要监控的钱包地址');
      return {
        id: task.id,
        success: true,
        data: { message: '没有配置要监控的钱包地址' },
        performance: {
          networkTime,
          processTime: 0,
          totalTime: Date.now() - startTime,
          transactionCount: block.transactions.length
        }
      };
    }

    // 处理交易数据
    const processStartTime = Date.now();
    const monitoredWalletsSet = new Set(monitoredWallets);
    const tradingOpportunities: any[] = [];
    
    childLogger.info('开始分析交易', { 
      transactionCount: block.transactions.length,
      monitoredWallets: Array.from(monitoredWalletsSet)
    });

    // 批量处理交易，避免阻塞太久
    const BATCH_SIZE = 50;
    let processedTransactions = 0;
    
    for (let i = 0; i < block.transactions.length; i += BATCH_SIZE) {
      const batch = (block.transactions as any[]).slice(i, i + BATCH_SIZE);
      
      childLogger.debug('处理交易批次', { 
        batchIndex: Math.floor(i / BATCH_SIZE) + 1,
        batchSize: batch.length,
        totalBatches: Math.ceil(block.transactions.length / BATCH_SIZE)
      });
      
      for (const tx of batch) {
        if (tx && tx.meta && tx.meta.err === null) {
          const opportunity = await analyzeTransactionInChild(tx, monitoredWalletsSet);
          if (opportunity) {
            tradingOpportunities.push(opportunity);
            childLogger.info('发现交易机会', { 
              signature: opportunity.signature,
              signer: opportunity.signer,
              tokenMint: opportunity.tokenMint,
              solSpent: opportunity.solSpent
            });
          }
        }
        processedTransactions++;
      }
      
      // 每处理一批后让出CPU，避免长时间占用
      if (i + BATCH_SIZE < block.transactions.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    const processTime = Date.now() - processStartTime;
    const totalTime = Date.now() - startTime;

    childLogger.info('区块处理完成', {
      slot,
      processedTransactions,
      tradingOpportunities: tradingOpportunities.length,
      networkTime: `${networkTime}ms`,
      processTime: `${processTime}ms`,
      totalTime: `${totalTime}ms`
    });

    return {
      id: task.id,
      success: true,
      data: {
        slot,
        tradingOpportunities,
        blockInfo: {
          transactionCount: block.transactions.length,
          timestamp: block.blockTime
        }
      },
      performance: {
        networkTime,
        processTime,
        totalTime,
        transactionCount: block.transactions.length
      }
    };
  } catch (error: any) {
    childLogger.error('区块处理失败', { 
      slot, 
      error: error.message,
      stack: error.stack 
    });
    
    return {
      id: task.id,
      success: false,
      error: error.message,
      performance: {
        networkTime: 0,
        processTime: 0,
        totalTime: Date.now() - startTime,
        transactionCount: 0
      }
    };
  }
}

// 分析单笔交易
async function analyzeTransactionInChild(tx: ParsedTransactionWithMeta, monitoredWallets: Set<string>) {
  try {
    const signature = tx.transaction.signatures[0];
    const signerAccount = tx.transaction.message.accountKeys.find(acc => acc.signer);

    if (!signerAccount) {
      childLogger.debug('交易没有签名者', { signature });
      return null;
    }
    
    const signer = signerAccount.pubkey.toBase58();
    childLogger.debug('分析交易', { signature, signer });

    if (!monitoredWallets.has(signer)) {
      childLogger.debug('签名者不在监控列表中', { signature, signer });
      return null; // 不是来自我们监控的钱包
    }

    childLogger.debug('发现监控钱包交易', { signature, signer });

    // 查找Raydium交易
    for (const instruction of tx.transaction.message.instructions) {
      if ('parsed' in instruction && instruction.programId.equals(RAYDIUM_PROGRAM_ID)) {
        childLogger.debug('发现Raydium指令', { signature, signer });
        const swapInfo = analyzeRaydiumSwapInChild(tx, instruction.parsed, signer, signature);
        if (swapInfo) {
          childLogger.info('Raydium交易分析成功', { 
            signature, 
            signer, 
            tokenMint: swapInfo.tokenMint,
            type: swapInfo.type
          });
          return swapInfo;
        }
      }
    }
    
    childLogger.debug('未发现有效的Raydium交易', { signature, signer });
  } catch (error) {
    // 静默处理单个交易错误，不影响整体处理
    childLogger.debug('交易分析出错', { 
      signature: tx.transaction.signatures[0],
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
  return null;
}

// 分析Raydium Swap
function analyzeRaydiumSwapInChild(
  tx: ParsedTransactionWithMeta,
  parsedInstruction: any,
  signer: string,
  signature: string
) {
  childLogger.debug('分析Raydium Swap指令', { signature, signer, instructionType: parsedInstruction.type });
  
  if (parsedInstruction.type !== 'swap') {
    childLogger.debug('不是swap指令', { signature, signer, instructionType: parsedInstruction.type });
    return null;
  }

  const { preTokenBalances, postTokenBalances } = tx.meta!;
  if (!preTokenBalances || !postTokenBalances) {
    childLogger.debug('缺少代币余额信息', { signature, signer });
    return null;
  }

  // 找到 SOL 余额变化
  const preSolBalance = preTokenBalances.find(b => 
    b.owner === signer && b.mint === 'So11111111111111111111111111111111111111112'
  )?.uiTokenAmount.uiAmount || 0;
  
  const postSolBalance = postTokenBalances.find(b => 
    b.owner === signer && b.mint === 'So1111111111111111111111111111111111111111112'
  )?.uiTokenAmount.uiAmount || 0;
  
  const solBalanceChange = postSolBalance - preSolBalance;
  
  childLogger.debug('SOL余额变化', { 
    signature, 
    signer, 
    preSolBalance, 
    postSolBalance, 
    solBalanceChange 
  });

  if (solBalanceChange < 0) { // SOL 减少，视为买入
    childLogger.debug('检测到SOL减少，可能是买入操作', { signature, signer, solBalanceChange });
    
    // 寻找哪个 token 的余额增加了
    const boughtTokenAccount = postTokenBalances.find(b => {
      if (b.owner !== signer || b.mint === 'So11111111111111111111111111111111111111112') return false;
      const preBalance = preTokenBalances.find(pre => 
        pre.mint === b.mint && pre.owner === signer
      )?.uiTokenAmount.uiAmount || 0;
      return b.uiTokenAmount.uiAmount! > preBalance;
    });

    if (boughtTokenAccount) {
      const result = {
        type: 'buy_opportunity',
        signer,
        signature,
        tokenMint: boughtTokenAccount.mint,
        amountBought: boughtTokenAccount.uiTokenAmount.uiAmount,
        solSpent: Math.abs(solBalanceChange),
        timestamp: Date.now(),
        txUrl: `https://solscan.io/tx/${signature}`
      };
      
      childLogger.info('发现买入机会', { 
        signature, 
        signer, 
        tokenMint: result.tokenMint,
        amountBought: result.amountBought,
        solSpent: result.solSpent
      });
      
      return result;
    } else {
      childLogger.debug('SOL减少但未找到对应的代币增加', { signature, signer });
    }
  } else {
    childLogger.debug('SOL未减少，不是买入操作', { signature, signer, solBalanceChange });
  }
  
  return null;
}

// 子进程消息处理
if (process.send) {
  childLogger.info('交易处理子进程启动', { pid: process.pid });
  
  // 监听来自主进程的消息
  process.on('message', async (task: ProcessTask) => {
    const startTime = Date.now();
    
    try {
      childLogger.debug('收到处理任务', { taskId: task.id, taskType: task.type });
      
      if (task.type === 'processSlot') {
        const result = await processSlotInChild(task);
        childLogger.debug('任务处理完成', { 
          taskId: task.id, 
          success: result.success,
          duration: Date.now() - startTime
        });
        process.send!(result);
      }
    } catch (error: any) {
      childLogger.error('任务处理失败', { 
        taskId: task.id, 
        error: error.message,
        stack: error.stack
      });
      
      const result: ProcessResult = {
        id: task.id,
        success: false,
        error: error.message,
        performance: {
          networkTime: 0,
          processTime: 0,
          totalTime: Date.now() - startTime,
          transactionCount: 0
        }
      };
      process.send!(result);
    }
  });

  // 子进程准备就绪
  process.send({ type: 'ready', pid: process.pid });
  
  // 处理子进程退出
  process.on('SIGTERM', () => {
    childLogger.info('子进程收到SIGTERM信号，正在关闭');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    childLogger.info('子进程收到SIGINT信号，正在关闭');
    process.exit(0);
  });
  
  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    childLogger.error('子进程未捕获异常', { error: error.message, stack: error.stack });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    childLogger.error('子进程未处理的Promise拒绝', { reason, promise });
    process.exit(1);
  });
}

export { ProcessTask, ProcessResult }; 