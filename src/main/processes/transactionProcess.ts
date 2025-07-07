import { Connection, ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';
import { withRetry, RETRY_CONFIGS, type RetryConfig } from '../infrastructure/retry';

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
      
      console.log(`Connection initialized successfully for ${rpcUrl}`);
    } catch (error) {
      console.error(`Failed to initialize connection for ${rpcUrl}:`, error);
      connection = null;
      throw error;
    }
  }
}

// 子进程中的核心处理函数
async function processSlotInChild(task: ProcessTask): Promise<ProcessResult> {
  const startTime = Date.now();
  const { slot, rpcUrl, monitoredWallets, followAmount, retryAttempts } = task.data;
  
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
      const block = await withRetry(
        () => connection!.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
        }),
        retryConfig,
        `getBlock(slot: ${slot})`
      );
    const networkTime = Date.now() - networkStartTime;
    
    if (!block) {
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

    if (monitoredWallets.length === 0) {
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

    // 批量处理交易，避免阻塞太久
    const BATCH_SIZE = 50;
    for (let i = 0; i < block.transactions.length; i += BATCH_SIZE) {
      const batch = (block.transactions as any[]).slice(i, i + BATCH_SIZE);
      
      for (const tx of batch) {
        if (tx && tx.meta && tx.meta.err === null) {
          const opportunity = await analyzeTransactionInChild(tx, monitoredWalletsSet);
          if (opportunity) {
            tradingOpportunities.push(opportunity);
          }
        }
      }
      
      // 每处理一批后让出CPU，避免长时间占用
      if (i + BATCH_SIZE < block.transactions.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    const processTime = Date.now() - processStartTime;
    const totalTime = Date.now() - startTime;

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

    if (!signerAccount) return null;
    const signer = signerAccount.pubkey.toBase58();

    if (!monitoredWallets.has(signer)) {
      return null; // 不是来自我们监控的钱包
    }

    // 查找Raydium交易
    for (const instruction of tx.transaction.message.instructions) {
      if ('parsed' in instruction && instruction.programId.equals(RAYDIUM_PROGRAM_ID)) {
        const swapInfo = analyzeRaydiumSwapInChild(tx, instruction.parsed, signer, signature);
        if (swapInfo) {
          return swapInfo;
        }
      }
    }
  } catch (error) {
    // 静默处理单个交易错误，不影响整体处理
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
  if (parsedInstruction.type !== 'swap') return null;

  const { preTokenBalances, postTokenBalances } = tx.meta!;
  if (!preTokenBalances || !postTokenBalances) return null;

  // 找到 SOL 余额变化
  const preSolBalance = preTokenBalances.find(b => 
    b.owner === signer && b.mint === 'So11111111111111111111111111111111111111112'
  )?.uiTokenAmount.uiAmount || 0;
  
  const postSolBalance = postTokenBalances.find(b => 
    b.owner === signer && b.mint === 'So1111111111111111111111111111111111111111112'
  )?.uiTokenAmount.uiAmount || 0;
  
  const solBalanceChange = postSolBalance - preSolBalance;

  if (solBalanceChange < 0) { // SOL 减少，视为买入
    // 寻找哪个 token 的余额增加了
    const boughtTokenAccount = postTokenBalances.find(b => {
      if (b.owner !== signer || b.mint === 'So11111111111111111111111111111111111111112') return false;
      const preBalance = preTokenBalances.find(pre => 
        pre.mint === b.mint && pre.owner === signer
      )?.uiTokenAmount.uiAmount || 0;
      return b.uiTokenAmount.uiAmount! > preBalance;
    });

    if (boughtTokenAccount) {
      return {
        type: 'buy_opportunity',
        signer,
        signature,
        tokenMint: boughtTokenAccount.mint,
        amountBought: boughtTokenAccount.uiTokenAmount.uiAmount,
        solSpent: Math.abs(solBalanceChange),
        timestamp: Date.now(),
        txUrl: `https://solscan.io/tx/${signature}`
      };
    }
  }
  return null;
}

// 子进程消息处理
if (process.send) {
  console.log('Transaction process started, PID:', process.pid);
  
  // 监听来自主进程的消息
  process.on('message', async (task: ProcessTask) => {
    const startTime = Date.now();
    
    try {
      if (task.type === 'processSlot') {
        const result = await processSlotInChild(task);
        process.send!(result);
      }
    } catch (error: any) {
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
    console.log('Transaction process received SIGTERM, shutting down...');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('Transaction process received SIGINT, shutting down...');
    process.exit(0);
  });
  
  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in transaction process:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection in transaction process:', promise, reason);
    process.exit(1);
  });
}

export { ProcessTask, ProcessResult }; 