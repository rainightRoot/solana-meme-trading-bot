import { Connection } from '@solana/web3.js';
import { solanaLogger } from '../../infrastructure/logging';
import { configManager } from '../../infrastructure/config';
import { PositionManager } from '../../infrastructure/database';
import { SellStrategyManager, SellDecision } from './sellStrategyManager';
import { getTokenPriceUSD } from '../../infrastructure/network';
import { Position, SellStrategy, TradeRecord } from '../../infrastructure/database/models/position';

export class PriceMonitor {
  private connection: Connection;
  private positionManager: PositionManager;
  private sellStrategyManager: SellStrategyManager;
  private monitorInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(connection: Connection, positionManager: PositionManager) {
    this.connection = connection;
    this.positionManager = positionManager;
    this.sellStrategyManager = new SellStrategyManager(connection);
  }

  /**
   * 启动价格监控
   */
  public start(): void {
    if (this.isRunning) {
      solanaLogger.warn('价格监控器已在运行');
      return;
    }

    const config = configManager.getConfig();
    if (!config.sellStrategy.enabled) {
      solanaLogger.info('卖出策略未启用，价格监控器不会启动');
      return;
    }

    this.isRunning = true;
    const intervalMs = 30000; // 30秒检查一次
    
    this.monitorInterval = setInterval(async () => {
      await this.checkPositionsForSell();
    }, intervalMs);

    solanaLogger.info('价格监控器已启动，每30秒检查一次');
  }

  /**
   * 停止价格监控
   */
  public stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isRunning = false;
    solanaLogger.info('价格监控器已停止');
  }

  /**
   * 获取运行状态
   */
  public getStatus(): { isRunning: boolean; lastCheck?: string } {
    return {
      isRunning: this.isRunning,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * 检查所有开仓持仓的卖出条件
   */
  private async checkPositionsForSell(): Promise<void> {
    try {
      // 获取所有开仓持仓
      const openPositions = await this.positionManager.getPositions({
        status: 'open',
        limit: 100
      });

      if (openPositions.length === 0) {
        return;
      }

      solanaLogger.debug(`检查 ${openPositions.length} 个持仓的卖出条件`);

      for (const position of openPositions) {
        try {
          await this.checkPositionForSell(position);
        } catch (error: any) {
          solanaLogger.error(`检查持仓 ${position.token_mint} 卖出条件失败:`, error.message);
        }
      }
    } catch (error: any) {
      solanaLogger.error('检查持仓卖出条件失败:', error.message);
    }
  }

  /**
   * 检查单个持仓的卖出条件
   */
  private async checkPositionForSell(position: Position): Promise<void> {
    try {
      // 获取当前价格
      const currentPriceUsd = await getTokenPriceUSD(position.token_mint);
      if (!currentPriceUsd) {
        solanaLogger.warn(`无法获取 Token ${position.token_mint} 的价格`);
        return;
      }

      // 转换为SOL价格（假设SOL价格）
      const solPriceUsd = await getTokenPriceUSD('So11111111111111111111111111111111111111112');
      const currentPriceSol = currentPriceUsd / (solPriceUsd || 1);

      // 更新持仓的当前价格
      await this.positionManager.updatePositionPrice(
        position.token_mint,
        position.wallet_address,
        currentPriceSol,
        currentPriceUsd
      );

      // 检查卖出条件
      const sellDecision = await this.sellStrategyManager.evaluateSellConditions(
        position,
        currentPriceSol,
        currentPriceUsd
      );

      if (sellDecision.shouldSell) {
        await this.executeSellOrder(position, sellDecision);
      }
    } catch (error: any) {
      solanaLogger.error(`处理持仓 ${position.token_mint} 失败:`, error.message);
    }
  }

  /**
   * 执行卖出订单
   */
  private async executeSellOrder(position: Position, sellDecision: SellDecision): Promise<void> {
    try {
      solanaLogger.info(`执行卖出策略`, {
        tokenMint: position.token_mint,
        strategy: position.sell_strategy_phase,
        reason: sellDecision.reason,
        sellRatio: sellDecision.sellRatio
      });

      // 执行卖出
      const txSignature = await this.sellStrategyManager.executeSell(
        position,
        sellDecision.sellRatio,
        sellDecision.reason || '策略卖出',
        sellDecision.isProfitSell || false,
        sellDecision.expectedProfitSol || 0
      );

      if (txSignature) {
        // 记录卖出交易
        await this.recordSellTrade(position, sellDecision, txSignature);
        
        // 更新持仓策略阶段
        if (sellDecision.nextStrategyPhase) {
          await this.updatePositionStrategyPhase(position, sellDecision.nextStrategyPhase);
        }

        solanaLogger.info(`卖出交易完成`, {
          tokenMint: position.token_mint,
          txSignature,
          sellRatio: sellDecision.sellRatio,
          reason: sellDecision.reason
        });
      } else {
        solanaLogger.error(`卖出交易失败: ${position.token_mint}`);
      }
    } catch (error: any) {
      solanaLogger.error(`执行卖出订单失败:`, error.message);
    }
  }

  /**
   * 记录卖出交易
   */
  private async recordSellTrade(
    position: Position,
    sellDecision: SellDecision,
    txSignature: string
  ): Promise<void> {
    try {
      const sellAmount = position.current_amount * sellDecision.sellRatio;
      const sellValueSol = sellAmount * position.current_price_sol;
      const sellValueUsd = sellAmount * position.current_price_usd;

      const tradeRecord: TradeRecord = {
        transaction_signature: txSignature,
        trade_type: 'sell',
        token_mint: position.token_mint,
        wallet_address: position.wallet_address,
        amount: sellAmount,
        price_sol: position.current_price_sol,
        price_usd: position.current_price_usd,
        value_sol: sellValueSol,
        value_usd: sellValueUsd,
        slippage_bps: configManager.getNested<number>('solana.slippageBps') || 50,
        gas_fee_sol: 0,
        block_time: new Date().toISOString()
      };

      await this.positionManager.recordTrade(tradeRecord);
      solanaLogger.info(`卖出交易记录成功: ${position.token_mint}`);
    } catch (error: any) {
      solanaLogger.error('记录卖出交易失败:', error.message);
    }
  }

  /**
   * 更新持仓策略阶段
   */
  private async updatePositionStrategyPhase(position: Position, newPhase: SellStrategy): Promise<void> {
    try {
      // 这里需要添加一个更新持仓策略阶段的方法到PositionManager
      // 暂时使用日志记录
      solanaLogger.info(`持仓策略阶段更新`, {
        tokenMint: position.token_mint,
        oldPhase: position.sell_strategy_phase,
        newPhase
      });
    } catch (error: any) {
      solanaLogger.error('更新持仓策略阶段失败:', error.message);
    }
  }
} 