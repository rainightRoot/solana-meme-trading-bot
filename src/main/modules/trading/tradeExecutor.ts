import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { walletManager } from './walletManager';
import { solanaLogger } from '../../infrastructure/logging';
import { configManager } from '../../infrastructure/config';
import { getProxyAgent , getTokenPriceUSD } from '../../infrastructure/network';
import { withRetry, RETRY_CONFIGS } from '../../infrastructure/retry';
import { TradeRecord } from '../../infrastructure/database';
import fetch from 'cross-fetch';

// Dynamic imports to avoid bundling browser-specific code
let jupiterApi: any = null;
let connection: Connection;

// Type definition for QuoteResponse (to avoid import issues)
interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: any;
  priceImpactPct: string;
  routePlan: any[];
  contextSlot?: number;
  timeTaken?: number;
}

// 获取持仓管理器（延迟导入避免循环依赖）
let getPositionManager: () => import('../../infrastructure/database').PositionManager | null;

/**
 * 设置持仓管理器的获取器
 */
export function setPositionManagerGetter(getter: () => import('../../infrastructure/database').PositionManager | null) {
  getPositionManager = getter;
}

/**
 * 动态加载 Jupiter API
 */
async function loadJupiterApi() {
  if (jupiterApi) return jupiterApi;
  
  try {
    // 确保在Node.js环境中运行
    if (typeof window !== 'undefined') {
      throw new Error('Jupiter API should not be loaded in browser environment');
    }
    
    const { createJupiterApiClient } = await import('@jup-ag/api');
    const agent = getProxyAgent();
    const customFetch = (url: any, options: any) => {
      return fetch(url, { ...options, agent: agent as any });
    };

    jupiterApi = createJupiterApiClient({
      fetchApi: customFetch as any
    });
    
    solanaLogger.info('Jupiter API 加载成功');
    return jupiterApi;
  } catch (error: any) {
    solanaLogger.error('加载 Jupiter API 失败:', error.message);
    return null;
  }
}

/**
 * 初始化/重新初始化交易执行器
 * 这会使用最新的配置创建所有客户端和连接
 */
export function initializeTradeExecutor() {
  const agent = getProxyAgent();
  const customFetch = (url: any, options: any) => {
    return fetch(url, { ...options, agent: agent as any });
  };

  const rpcUrl = configManager.getNested<string>('solana.rpcUrl');
  connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    fetch: customFetch as any,
  });
  
  solanaLogger.info('交易执行器已初始化/重新初始化');
}

/**
 * 获取 Jupiter 报价
 * (这个函数现在会使用在 initializeTradeExecutor 中创建的 jupiterApi 实例)
 * @param inputMint - 输入 Token (e.g., SOL)
 * @param outputMint - 输出 Token (要买入的 Token)
 * @param amount - 输入 Token 的数量 (lamports)
 * @param slippageBps - 滑点 (e.g., 50 for 0.5%)
 * @param connectionToUse - 要使用的连接（可选，如果不提供则使用全局连接）
 * @returns {Promise<QuoteResponse | null>}
 */
async function getQuote(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  slippageBps: number,
  connectionToUse?: Connection
): Promise<QuoteResponse | null> {
  try {
    return await withRetry(async () => {
      const api = await loadJupiterApi();
      if (!api) {
        throw new Error('Jupiter API 未初始化');
      }
      
      const quote = await api.quoteGet({
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount,
        slippageBps,
        onlyDirectRoutes: false, // 允许间接路由以获得更好的价格
        asLegacyTransaction: false, // 使用 VersionedTransaction
      });
      
      if (!quote) {
        throw new Error('未获得有效报价');
      }
      
      return quote;
    }, RETRY_CONFIGS.NETWORK, `getQuote(${inputMint.toBase58()}->${outputMint.toBase58()})`);
  } catch (error: any) {
    solanaLogger.error('获取 Jupiter 报价失败:', error.message);
    return null;
  }
}

/**
 * 执行兑换
 * @param quote - Jupiter 的报价
 * @param connectionToUse - 要使用的连接（可选，如果不提供则使用全局连接）
 * @returns {Promise<string | null>} - 交易签名
 */
async function executeSwap(quote: QuoteResponse, connectionToUse?: Connection): Promise<string | null> {
  const signer = walletManager.getSigner();
  if (!signer) {
    solanaLogger.error('无法执行兑换：交易钱包未加载');
    return null;
  }

  try {
    // 确定要使用的连接
    const activeConnection = connectionToUse || connection;
    
    // 确保连接已初始化
    if (!activeConnection) {
      solanaLogger.info('连接未初始化，正在初始化交易执行器...');
      initializeTradeExecutor();
      // 如果没有传递连接参数，使用全局连接
      if (!connectionToUse && !connection) {
        throw new Error('无法初始化连接');
      }
    }

    const finalConnection = connectionToUse || connection;
    
    const api = await loadJupiterApi();
    if (!api) {
      solanaLogger.error('Jupiter API 未初始化');
      return null;
    }
    
    // 获取用于兑换的序列化交易
    const swapResult = await api.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: signer.publicKey.toBase58(),
        wrapAndUnwrapSol: true, // 自动处理 SOL 的包装和解包
      },
    });

    // 反序列化交易
    const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // 签名交易
    transaction.sign([signer]);

    // 发送交易（带重试机制）
    const rawTransaction = transaction.serialize();
    solanaLogger.info('准备发送交易...');
    const txid = await withRetry(async () => {
      return await finalConnection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 0, // 在这里不重试，让外层重试机制处理
      });
    }, RETRY_CONFIGS.FAST, `sendTransaction`);
    
    solanaLogger.info(`交易已发送，签名: ${txid}，开始确认...`);

    // 确认交易（使用专门的交易确认配置）
    let confirmationResult = null;
    try {
      confirmationResult = await withRetry(async () => {
        const result = await finalConnection.confirmTransaction(txid, 'confirmed');
        if (result.value.err) {
          throw new Error(`交易确认失败: ${result.value.err}`);
        }
        return result;
      }, RETRY_CONFIGS.TRANSACTION_CONFIRM, `confirmTransaction(${txid})`);
    } catch (confirmError: any) {
      // 即使确认超时，也先记录交易签名
      solanaLogger.warn(`交易确认超时，但交易可能仍然成功: https://solscan.io/tx/${txid}`);
      solanaLogger.warn(`确认错误: ${confirmError.message}`);
      
      // 尝试多次检查交易状态
      let isConfirmed = false;
      for (let i = 0; i < 3; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
          const signature = await finalConnection.getSignatureStatus(txid);
          
          if (signature.value && signature.value.confirmationStatus) {
            solanaLogger.info(`交易状态检查 ${i + 1}: ${signature.value.confirmationStatus}`);
            if (signature.value.confirmationStatus === 'confirmed' || signature.value.confirmationStatus === 'finalized') {
              solanaLogger.info(`交易实际上已确认: https://solscan.io/tx/${txid}`);
              isConfirmed = true;
              break;
            }
          }
        } catch (statusError: any) {
          solanaLogger.warn(`交易状态检查失败 ${i + 1}: ${statusError.message}`);
        }
      }
      
      if (isConfirmed) {
        return txid; // 返回交易签名，因为交易实际上成功了
      }
      
      // 最后尝试通过RPC检查交易
      try {
        const transaction = await finalConnection.getTransaction(txid);
        if (transaction && transaction.meta && !transaction.meta.err) {
          solanaLogger.info(`通过RPC确认交易成功: https://solscan.io/tx/${txid}`);
          return txid;
        }
      } catch (rpcError: any) {
        solanaLogger.warn(`RPC交易查询失败: ${rpcError.message}`);
      }
      
      // 如果确认失败，仍然返回交易签名，让用户知道交易已发送
      solanaLogger.warn(`交易已发送但确认状态未知，请手动检查: https://solscan.io/tx/${txid}`);
      return txid;
    }
    

    solanaLogger.info(`兑换成功！交易签名: https://solscan.io/tx/${txid}`);
    return txid;
  } catch (error: any) {
    solanaLogger.error('执行 Jupiter 兑换失败:', error.message);
    return null;
  }
}

/**
 * 执行通用交换操作（买入/卖出）
 * @param inputMint - 输入 Token 的 mint 地址
 * @param outputMint - 输出 Token 的 mint 地址  
 * @param amount - 输入 Token 的数量
 * @param connection - Solana 连接
 * @param signer - 签名者（可选，如果不提供则使用钱包管理器中的签名者）
 * @returns {Promise<string | null>} - 交易签名
 */
export async function performSwap(
  inputMint: string,
  outputMint: string,
  amount: number,
  connection?: Connection,
  signer?: any
): Promise<string | null> {
  try {
    const inputMintPubkey = new PublicKey(inputMint);
    const outputMintPubkey = new PublicKey(outputMint);
    
    // 将Token数量转换为正确的单位
    // 对于大多数Token，使用6位小数，对于SOL使用9位小数
    const decimals = inputMint === 'So11111111111111111111111111111111111111112' ? 9 : 6;
    const amountInBaseUnits = Math.floor(amount * Math.pow(10, decimals));
    
    const slippageBps = configManager.getNested<number>('solana.slippageBps') || 50;
    
    // 1. 获取报价
    const quote = await getQuote(inputMintPubkey, outputMintPubkey, amountInBaseUnits, slippageBps, connection);
    if (!quote) {
      solanaLogger.error('无法获取交换报价');
      return null;
    }
    
    solanaLogger.info(`获得交换报价: ${Number(quote.outAmount) / 1e6} ${outputMint} for ${amount} ${inputMint}`);
    
    // 2. 执行兑换
    const txSignature = await executeSwap(quote, connection);
    
    return txSignature;
  } catch (error: any) {
    solanaLogger.error('执行交换失败:', error.message);
    return null;
  }
}

/**
 * 跟单买入的主函数
 * @param tokenToBuyMint - 要买入的 Token 的 mint 地址
 * @param solAmountToSpend - 花费的 SOL 数量
 */
export async function followUpBuy(tokenToBuyMint: string, solAmountToSpend: number) {
  const signer = walletManager.getSigner();
  if (!signer) return;

  solanaLogger.info(`[开始跟单] 买入: ${tokenToBuyMint}, 花费: ${solAmountToSpend} SOL`);

  const solMint = new PublicKey('So11111111111111111111111111111111111111112');
  const tokenMint = new PublicKey(tokenToBuyMint);
  const amountInLamports = Math.floor(solAmountToSpend * 1e9);
  //如果 tokenMint 是 SOL，则跳过买入
  if (tokenToBuyMint === 'So11111111111111111111111111111111111111112') {
    return;
  }
  // 从配置读取滑点
  const slippageBps = configManager.getNested<number>('solana.slippageBps') || 50; // 默认 0.5%

  // 获取SOL价格 usd
  const solPrice = await getTokenPriceUSD('So11111111111111111111111111111111111111112');
  // 确保连接已初始化
  if (!connection) {
    solanaLogger.info('连接未初始化，正在初始化交易执行器...');
    initializeTradeExecutor();
  }

  // 1. 获取报价
  const quote = await getQuote(solMint, tokenMint, amountInLamports, slippageBps, connection);
  if (!quote) {
    solanaLogger.error('无法获取报价，取消跟单');
    return;
  }
  solanaLogger.info(`获得报价: ${Number(quote.outAmount) / 1e5} ${tokenToBuyMint} for ${solAmountToSpend} SOL`);
  // 计算token买入价格
  const tokenAmount = Number(quote.outAmount) / 1e5;
  const tokenPricePerUnitSol = solAmountToSpend / tokenAmount;
  const tokenPricePerUnitUsd = tokenPricePerUnitSol * solPrice;
  
  solanaLogger.info(`Token价格: ${tokenPricePerUnitSol} SOL / ${tokenPricePerUnitUsd} USD per token`);
  
  // 2. 执行兑换
  const txSignature = await executeSwap(quote, connection);
  
  // 3. 记录持仓（如果交易成功）
  if (txSignature && getPositionManager) {
    const positionManager = getPositionManager();
    if (positionManager) {
      try {
        const tradeRecord: TradeRecord = {
          transaction_signature: txSignature,
          trade_type: 'buy',
          token_mint: tokenToBuyMint,
          wallet_address: signer.publicKey.toBase58(),
          amount: tokenAmount,
          price_sol: tokenPricePerUnitSol,
          price_usd: tokenPricePerUnitUsd,
          value_sol: solAmountToSpend,
          value_usd: solAmountToSpend * solPrice,
          slippage_bps: slippageBps,
          gas_fee_sol: 0, // TODO: 计算实际Gas费用
          block_time: new Date().toISOString()
        };
        solanaLogger.info(`tradeRecord: ${JSON.stringify(tradeRecord)}`);
        
        const recorded = await positionManager.recordTrade(tradeRecord);
        if (recorded) {
          solanaLogger.info(`持仓记录成功: ${tokenToBuyMint}`);
        } else {
          solanaLogger.warn(`持仓记录失败: ${tokenToBuyMint}`);
        }
      } catch (error: any) {
        solanaLogger.error('记录持仓时发生错误:', error.message);
      }
    }
  }
  
} 