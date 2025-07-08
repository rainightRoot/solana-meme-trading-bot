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

// 代币精度缓存
const tokenDecimalsCache = new Map<string, number>();

// 代币元数据缓存
const tokenMetadataCache = new Map<string, { symbol: string; name: string }>();

/**
 * 代币元数据结构
 */
interface TokenMetadata {
  symbol: string;
  name: string;
}

/**
 * 获取代币元数据
 * @param mintAddress - 代币 mint 地址
 * @param connection - Solana 连接
 * @returns {Promise<TokenMetadata | null>} - 代币元数据
 */
async function getTokenMetadata(mintAddress: string, connection: Connection): Promise<TokenMetadata | null> {
  try {
    // 检查缓存
    if (tokenMetadataCache.has(mintAddress)) {
      return tokenMetadataCache.get(mintAddress)!;
    }

    // SOL/WSOL 的元数据
    if (mintAddress === 'So11111111111111111111111111111111111111112') {
      const metadata = { symbol: 'SOL', name: 'Solana' };
      tokenMetadataCache.set(mintAddress, metadata);
      return metadata;
    }

    // 尝试从 Jupiter API 获取代币信息
    try {
      const api = await loadJupiterApi();
      if (api) {
        const tokenList = await api.tokenList();
        const tokenInfo = tokenList.find((token: any) => token.address === mintAddress);
        
        if (tokenInfo && tokenInfo.symbol) {
          const metadata = {
            symbol: tokenInfo.symbol,
            name: tokenInfo.name || tokenInfo.symbol
          };
          tokenMetadataCache.set(mintAddress, metadata);
          solanaLogger.debug(`从 Jupiter API 获取代币元数据: ${mintAddress} -> ${metadata.symbol}`);
          return metadata;
        }
      }
    } catch (error) {
      solanaLogger.debug(`从 Jupiter API 获取代币元数据失败: ${mintAddress}`);
    }

    // 尝试从 Metaplex Token Metadata 程序获取
    try {
      const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      
      // 生成 metadata PDA
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          new PublicKey(mintAddress).toBuffer()
        ],
        TOKEN_METADATA_PROGRAM_ID
      );

      const metadataAccount = await connection.getAccountInfo(metadataPDA);
      
      if (metadataAccount && metadataAccount.data) {
        const metadata = parseTokenMetadata(metadataAccount.data);
        if (metadata) {
          tokenMetadataCache.set(mintAddress, metadata);
          solanaLogger.debug(`从 Metaplex 获取代币元数据: ${mintAddress} -> ${metadata.symbol}`);
          return metadata;
        }
      }
    } catch (error) {
      solanaLogger.debug(`从 Metaplex 获取代币元数据失败: ${mintAddress}`);
    }

    // 如果都失败了，返回 null
    solanaLogger.warn(`无法获取代币 ${mintAddress} 的元数据`);
    return null;
  } catch (error: any) {
    solanaLogger.error(`获取代币 ${mintAddress} 元数据失败:`, error.message);
    return null;
  }
}

/**
 * 解析 Metaplex Token Metadata 数据
 * @param data - 账户数据
 * @returns {TokenMetadata | null} - 解析后的元数据
 */
function parseTokenMetadata(data: Buffer): TokenMetadata | null {
  try {
    // Metaplex Token Metadata 数据结构很复杂，这里简化处理
    // 实际实现需要更复杂的解析逻辑
    
    // 跳过前面的元数据头部
    let offset = 1; // 跳过 key (1 byte)
    offset += 32; // 跳过 update_authority (32 bytes)
    offset += 32; // 跳过 mint (32 bytes)
    
    // 读取 name 长度和内容
    const nameLength = data.readUInt32LE(offset);
    offset += 4;
    const nameData = data.slice(offset, offset + nameLength);
    const name = nameData.toString('utf8').replace(/\0/g, '').trim();
    offset += nameLength;
    
    // 读取 symbol 长度和内容
    const symbolLength = data.readUInt32LE(offset);
    offset += 4;
    const symbolData = data.slice(offset, offset + symbolLength);
    const symbol = symbolData.toString('utf8').replace(/\0/g, '').trim();
    
    if (symbol && name) {
      return { symbol, name };
    }
    
    return null;
  } catch (error) {
    solanaLogger.debug('解析 Metaplex 元数据失败:', error);
    return null;
  }
}

/**
 * 获取代币精度
 * @param mintAddress - 代币 mint 地址
 * @param connection - Solana 连接
 * @returns {Promise<number>} - 代币精度，如果获取失败则返回默认值
 */
async function getTokenDecimals(mintAddress: string, connection: Connection): Promise<number> {
  try {
    // 检查缓存
    if (tokenDecimalsCache.has(mintAddress)) {
      return tokenDecimalsCache.get(mintAddress)!;
    }

    // SOL/WSOL 的精度是 9
    if (mintAddress === 'So11111111111111111111111111111111111111112') {
      tokenDecimalsCache.set(mintAddress, 9);
      return 9;
    }

    const mintPublicKey = new PublicKey(mintAddress);
    const accountInfo = await connection.getAccountInfo(mintPublicKey);
    
    if (!accountInfo || !accountInfo.data) {
      solanaLogger.warn(`无法获取代币 ${mintAddress} 的账户信息，使用默认精度 6`);
      tokenDecimalsCache.set(mintAddress, 6); // 缓存默认值
      return 6;
    }

    // SPL Token Mint 的数据结构：
    // - 前 44 字节是固定数据
    // - 第 44 字节是 decimals (0-based indexing)
    const decimals = accountInfo.data[44];
    
    if (decimals === undefined || decimals > 18) {
      solanaLogger.warn(`代币 ${mintAddress} 的精度值异常: ${decimals}，使用默认精度 6`);
      tokenDecimalsCache.set(mintAddress, 6); // 缓存默认值
      return 6;
    }

    solanaLogger.debug(`代币 ${mintAddress} 精度: ${decimals}`);
    tokenDecimalsCache.set(mintAddress, decimals); // 缓存结果
    return decimals;
  } catch (error: any) {
    solanaLogger.error(`获取代币 ${mintAddress} 精度失败:`, error.message);
    tokenDecimalsCache.set(mintAddress, 6); // 缓存默认值
    return 6;
  }
}

/**
 * 设置持仓管理器的获取器
 */
export function setPositionManagerGetter(getter: () => import('../../infrastructure/database').PositionManager | null) {
  getPositionManager = getter;
}

/**
 * 导出代币元数据获取函数，供其他模块使用
 */
export { getTokenMetadata };

/**
 * 导出代币精度获取函数，供其他模块使用
 */
export { getTokenDecimals };

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
    
    // 确定要使用的连接
    const activeConnection = connection || 
      (() => {
        if (!connection) {
          solanaLogger.info('连接未初始化，正在初始化交易执行器...');
          initializeTradeExecutor();
        }
        return connection;
      })();
    
    if (!activeConnection) {
      throw new Error('无法初始化连接');
    }
    
    // 动态获取输入和输出代币的精度
    const [inputDecimals, outputDecimals] = await Promise.all([
      getTokenDecimals(inputMint, activeConnection),
      getTokenDecimals(outputMint, activeConnection)
    ]);
    
    solanaLogger.debug(`代币精度 - 输入: ${inputDecimals}, 输出: ${outputDecimals}`);
    
    // 将Token数量转换为正确的单位
    const amountInBaseUnits = Math.floor(amount * Math.pow(10, inputDecimals));
    
    const slippageBps = configManager.getNested<number>('solana.slippageBps') || 50;
    
    // 1. 获取报价
    const quote = await getQuote(inputMintPubkey, outputMintPubkey, amountInBaseUnits, slippageBps, activeConnection);
    if (!quote) {
      solanaLogger.error('无法获取交换报价');
      return null;
    }
    
    // 使用正确的输出精度计算输出数量
    const outputAmount = Number(quote.outAmount) / Math.pow(10, outputDecimals);
    solanaLogger.info(`获得交换报价: ${outputAmount} ${outputMint} for ${amount} ${inputMint}`);
    
    // 2. 执行兑换
    const txSignature = await executeSwap(quote, activeConnection);
    
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
  const amountInLamports = Math.floor(solAmountToSpend * 1e9); // SOL 精度是 9
  
  // 如果 tokenMint 是 SOL，则跳过买入
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

  // 获取要买入的代币精度
  const tokenDecimals = await getTokenDecimals(tokenToBuyMint, connection);
  solanaLogger.debug(`目标代币 ${tokenToBuyMint} 精度: ${tokenDecimals}`);

  // 1. 获取报价
  const quote = await getQuote(solMint, tokenMint, amountInLamports, slippageBps, connection);
  if (!quote) {
    solanaLogger.error('无法获取报价，取消跟单');
    return;
  }
  
  // 使用正确的代币精度计算数量
  const tokenAmount = Number(quote.outAmount) / Math.pow(10, tokenDecimals);
  solanaLogger.info(`获得报价: ${tokenAmount} ${tokenToBuyMint} for ${solAmountToSpend} SOL`);
  
  // 计算token买入价格
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