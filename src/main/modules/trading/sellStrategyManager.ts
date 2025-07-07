import { Connection, Transaction, VersionedTransaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { solanaLogger } from '../../infrastructure/logging';
import { configManager } from '../../infrastructure/config';
import { Position, SellStrategy, TradeRecord } from '../../infrastructure/database/models/position';
import { walletManager } from './walletManager';
import { performSwap } from './tradeExecutor';

export interface SellDecision {
  shouldSell: boolean;
  reason?: string;
  sellRatio: number;
  nextStrategyPhase?: SellStrategy;
  isProfitSell?: boolean;
  expectedProfitSol?: number;
}

export class SellStrategyManager {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * 检查持仓是否满足卖出条件
   */
  public async evaluateSellConditions(position: Position, currentPriceSol: number, currentPriceUsd: number): Promise<SellDecision> {
    const config = configManager.getConfig();
    
    // 如果卖出策略未启用，返回不卖出
    if (!config.sellStrategy.enabled) {
      return { shouldSell: false, sellRatio: 0 };
    }

    // 如果策略已完成，返回不卖出
    if (position.sell_strategy_phase === SellStrategy.COMPLETED) {
      return { shouldSell: false, sellRatio: 0 };
    }

    // 获取当前策略阶段的配置
    const currentStrategy = config.sellStrategy.strategies[position.sell_strategy_phase];
    if (!currentStrategy.enabled) {
      return { shouldSell: false, sellRatio: 0 };
    }

    const now = Date.now();
    const firstBuyTime = position.first_buy_at ? new Date(position.first_buy_at).getTime() : now;
    const peakTime = position.peak_time ? new Date(position.peak_time).getTime() : now;

    // 检查获利条件
    if (this.checkProfitCondition(position, currentPriceSol, currentStrategy.conditions.profitRatio)) {
      const sellAmount = position.current_amount * currentStrategy.sellRatio;
      const expectedProfitSol = sellAmount * (currentPriceSol - position.avg_buy_price_sol);
      
      return {
        shouldSell: true,
        reason: `达到获利目标: ${((currentStrategy.conditions.profitRatio - 1) * 100).toFixed(1)}%`,
        sellRatio: currentStrategy.sellRatio,
        nextStrategyPhase: this.getNextStrategyPhase(position.sell_strategy_phase),
        isProfitSell: true,
        expectedProfitSol: expectedProfitSol
      };
    }

    // 检查止损条件
    if (this.checkStopLossCondition(position, currentPriceSol, currentStrategy.conditions.lossRatio, 
        currentStrategy.conditions.lossTimeMinutes, firstBuyTime, now)) {
      return {
        shouldSell: true,
        reason: `触发止损: ${((1 - currentStrategy.conditions.lossRatio) * 100).toFixed(1)}% 亏损`,
        sellRatio: currentStrategy.sellRatio,
        nextStrategyPhase: this.getNextStrategyPhase(position.sell_strategy_phase),
        isProfitSell: false
      };
    }

    // 检查回撤保护条件
    if (this.checkPullbackCondition(position, currentPriceSol, currentStrategy.conditions.pullbackRatio,
        currentStrategy.conditions.pullbackTimeMinutes, peakTime, now)) {
      const sellAmount = position.current_amount * currentStrategy.sellRatio;
      const expectedProfitSol = sellAmount * (currentPriceSol - position.avg_buy_price_sol);
      const isProfitSell = currentPriceSol > position.avg_buy_price_sol;
      
      return {
        shouldSell: true,
        reason: `触发回撤保护: ${((1 - currentStrategy.conditions.pullbackRatio) * 100).toFixed(1)}% 回撤`,
        sellRatio: currentStrategy.sellRatio,
        nextStrategyPhase: this.getNextStrategyPhase(position.sell_strategy_phase),
        isProfitSell: isProfitSell,
        expectedProfitSol: isProfitSell ? expectedProfitSol : 0
      };
    }

    return { shouldSell: false, sellRatio: 0 };
  }

  /**
   * 执行卖出操作
   */
  public async executeSell(position: Position, sellRatio: number, reason: string, isProfitSell = false, expectedProfitSol = 0): Promise<string | null> {
    try {
      const signer = walletManager.getSigner();
      if (!signer) {
        solanaLogger.error('钱包未加载，无法执行卖出');
        return null;
      }

      // 计算卖出数量
      const sellAmount = position.current_amount * sellRatio;
      
      solanaLogger.info(`准备卖出 ${position.token_mint}`, {
        sellAmount,
        sellRatio,
        reason,
        currentAmount: position.current_amount,
        strategyPhase: position.sell_strategy_phase,
        isProfitSell,
        expectedProfitSol
      });

      // 执行卖出交易
      const txSignature = await performSwap(
        position.token_mint,
        'So11111111111111111111111111111111111111112', // WSOL
        sellAmount,
        this.connection,
        signer
      );

      if (txSignature) {
        solanaLogger.info(`卖出交易已提交: ${txSignature}`, {
          tokenMint: position.token_mint,
          sellAmount,
          reason
        });

        // 如果是获利卖出，处理工具使用费
        if (isProfitSell && expectedProfitSol > 0) {
          await this.handleToolFee(expectedProfitSol, signer);
        }
      }

      return txSignature;
    } catch (error: any) {
      solanaLogger.error('执行卖出交易失败:', error.message);
      return null;
    }
  }

  /**
   * 处理工具使用费
   */
  private async handleToolFee(profitSol: number, signer: any): Promise<void> {
    try {
      const config = configManager.getConfig();
      const toolFeeEnabled = config.sellStrategy.toolFee.enabled;
      
      if (!toolFeeEnabled) {
        return;
      }

      // 硬编码的工具使用费配置
      const TOOL_FEE_RATE = 0.01; // 1%
      const TOOL_FEE_RECIPIENT = 'DbiaahpvRpkm9c22JTRDvbmGW1jjGk8rTo8cRGwZPbfr';
      
      const toolFeeAmount = profitSol * TOOL_FEE_RATE;
      
      solanaLogger.info(`计算工具使用费`, {
        profitSol,
        feeRate: TOOL_FEE_RATE,
        toolFeeAmount,
        recipient: TOOL_FEE_RECIPIENT
      });

      // 执行工具使用费转账
      const feeTxSignature = await this.sendToolFee(toolFeeAmount, TOOL_FEE_RECIPIENT, signer);
      
      if (feeTxSignature) {
        solanaLogger.info(`工具使用费已转账: ${feeTxSignature}`, {
          amount: toolFeeAmount,
          recipient: TOOL_FEE_RECIPIENT
        });
      }
    } catch (error: any) {
      solanaLogger.error('处理工具使用费失败:', error.message);
    }
  }

  /**
   * 发送工具使用费到指定地址
   */
  private async sendToolFee(amountSol: number, recipientAddress: string, signer: any): Promise<string | null> {
    try {
      const recipient = new PublicKey(recipientAddress);
      const lamports = Math.floor(amountSol * 1e9); // 转换为lamports
      
      if (lamports < 1000) {
        solanaLogger.warn('工具使用费金额过小，跳过转账', { amountSol, lamports });
        return null;
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: recipient,
          lamports
        })
      );

      const signature = await this.connection.sendTransaction(transaction, [signer]);
      
      // 等待确认
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`工具使用费转账确认失败: ${confirmation.value.err}`);
      }

      return signature;
    } catch (error: any) {
      solanaLogger.error('发送工具使用费失败:', error.message);
      return null;
    }
  }

  /**
   * 检查获利条件
   */
  private checkProfitCondition(position: Position, currentPrice: number, profitRatio: number): boolean {
    return currentPrice >= position.avg_buy_price_sol * profitRatio;
  }

  /**
   * 检查止损条件
   */
  private checkStopLossCondition(
    position: Position, 
    currentPrice: number, 
    lossRatio: number, 
    lossTimeMinutes: number,
    firstBuyTime: number,
    now: number
  ): boolean {
    const timeElapsed = (now - firstBuyTime) / (1000 * 60); // 转换为分钟
    return currentPrice <= position.avg_buy_price_sol * lossRatio && timeElapsed >= lossTimeMinutes;
  }

  /**
   * 检查回撤保护条件
   */
  private checkPullbackCondition(
    position: Position,
    currentPrice: number,
    pullbackRatio: number,
    pullbackTimeMinutes: number,
    peakTime: number,
    now: number
  ): boolean {
    const timeElapsed = (now - peakTime) / (1000 * 60); // 转换为分钟
    return currentPrice <= position.peak_price_sol * pullbackRatio && timeElapsed >= pullbackTimeMinutes;
  }

  /**
   * 获取下一个策略阶段
   */
  private getNextStrategyPhase(currentPhase: SellStrategy): SellStrategy {
    switch (currentPhase) {
      case SellStrategy.INITIAL:
        return SellStrategy.SECOND;
      case SellStrategy.SECOND:
        return SellStrategy.THIRD;
      case SellStrategy.THIRD:
        return SellStrategy.COMPLETED;
      default:
        return SellStrategy.COMPLETED;
    }
  }
} 