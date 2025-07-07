/**
 * 卖出策略阶段
 */
export enum SellStrategy {
  INITIAL = 'initial',
  SECOND = 'second', 
  THIRD = 'third',
  COMPLETED = 'completed'
}

/**
 * 持仓记录
 */
export interface Position {
  id?: number;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  wallet_address: string;
  status: 'open' | 'closed';
  total_buy_amount: number;           // 总买入数量
  total_buy_cost_sol: number;         // 总买入成本（SOL）
  total_buy_cost_usd: number;         // 总买入成本（USD）
  total_sell_amount: number;          // 总卖出数量
  total_sell_value_sol: number;       // 总卖出价值（SOL）
  total_sell_value_usd: number;       // 总卖出价值（USD）
  avg_buy_price_sol: number;          // 平均买入价格（SOL）
  avg_buy_price_usd: number;          // 平均买入价格（USD）
  current_amount: number;             // 当前持有数量
  realized_pnl_sol: number;           // 已实现盈亏（SOL）
  realized_pnl_usd: number;           // 已实现盈亏（USD）
  unrealized_pnl_sol: number;         // 未实现盈亏（SOL）
  unrealized_pnl_usd: number;         // 未实现盈亏（USD）
  current_price_sol: number;          // 当前价格（SOL）
  current_price_usd: number;          // 当前价格（USD）
  first_buy_at?: string;              // 首次买入时间
  last_trade_at?: string;             // 最后交易时间
  created_at?: string;                // 创建时间
  updated_at?: string;                // 更新时间
  sell_strategy_phase: SellStrategy;
  peak_price_sol: number;
  peak_price_usd: number;
  peak_time: string;
  last_sell_time?: string;
}

/**
 * 交易记录
 */
export interface TradeRecord {
  id?: number;
  position_id?: number;
  transaction_signature: string;
  trade_type: 'buy' | 'sell';
  token_mint: string;
  wallet_address: string;
  amount: number;                     // 交易数量
  price_sol: number;                  // 交易价格（SOL）
  price_usd: number;                  // 交易价格（USD）
  value_sol: number;                  // 交易价值（SOL）
  value_usd: number;                  // 交易价值（USD）
  slippage_bps?: number;              // 滑点（基点）
  gas_fee_sol: number;                // Gas费用（SOL）
  block_time?: string;                // 区块时间
  created_at?: string;                // 创建时间
}

/**
 * 持仓统计信息
 */
export interface PositionStats {
  total_positions: number;            // 总持仓数
  open_positions: number;             // 开仓持仓数
  closed_positions: number;           // 已平仓数
  total_invested_sol: number;         // 总投资（SOL）
  total_invested_usd: number;         // 总投资（USD）
  total_realized_pnl_sol: number;     // 总已实现盈亏（SOL）
  total_realized_pnl_usd: number;     // 总已实现盈亏（USD）
  total_unrealized_pnl_sol: number;   // 总未实现盈亏（SOL）
  total_unrealized_pnl_usd: number;   // 总未实现盈亏（USD）
  total_pnl_sol: number;              // 总盈亏（SOL）
  total_pnl_usd: number;              // 总盈亏（USD）
  win_rate: number;                   // 胜率
  best_trade_pnl_sol: number;         // 最佳交易盈亏（SOL）
  worst_trade_pnl_sol: number;        // 最差交易盈亏（SOL）
}

/**
 * 持仓查询条件
 */
export interface PositionQuery {
  wallet_address?: string;
  status?: 'open' | 'closed';
  token_mint?: string;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at' | 'total_buy_cost_sol' | 'unrealized_pnl_sol';
  order_dir?: 'ASC' | 'DESC';
}

/**
 * 持仓模型类
 */
export class PositionModel {
  /**
   * 计算平均买入价格
   */
  static calculateAvgBuyPrice(totalCost: number, totalAmount: number): number {
    return totalAmount > 0 ? totalCost / totalAmount : 0;
  }

  /**
   * 计算未实现盈亏
   */
  static calculateUnrealizedPnL(
    currentAmount: number,
    avgBuyPrice: number,
    currentPrice: number
  ): number {
    return currentAmount * (currentPrice - avgBuyPrice);
  }

  /**
   * 计算已实现盈亏
   */
  static calculateRealizedPnL(
    sellValue: number,
    sellAmount: number,
    avgBuyPrice: number
  ): number {
    return sellValue - (sellAmount * avgBuyPrice);
  }

  /**
   * 判断持仓是否应该关闭
   */
  static shouldClosePosition(position: Position): boolean {
    return position.current_amount <= 0;
  }

  /**
   * 创建新持仓
   */
  static createNewPosition(trade: TradeRecord): Omit<Position, 'id'> {
    const now = new Date().toISOString();
    
    return {
      token_mint: trade.token_mint,
      wallet_address: trade.wallet_address,
      status: 'open',
      total_buy_amount: trade.trade_type === 'buy' ? trade.amount : 0,
      total_buy_cost_sol: trade.trade_type === 'buy' ? trade.value_sol : 0,
      total_buy_cost_usd: trade.trade_type === 'buy' ? trade.value_usd : 0,
      total_sell_amount: trade.trade_type === 'sell' ? trade.amount : 0,
      total_sell_value_sol: trade.trade_type === 'sell' ? trade.value_sol : 0,
      total_sell_value_usd: trade.trade_type === 'sell' ? trade.value_usd : 0,
      avg_buy_price_sol: trade.trade_type === 'buy' ? trade.price_sol : 0,
      avg_buy_price_usd: trade.trade_type === 'buy' ? trade.price_usd : 0,
      current_amount: trade.trade_type === 'buy' ? trade.amount : -trade.amount,
      realized_pnl_sol: 0,
      realized_pnl_usd: 0,
      unrealized_pnl_sol: 0,
      unrealized_pnl_usd: 0,
      current_price_sol: trade.price_sol,
      current_price_usd: trade.price_usd,
      first_buy_at: trade.trade_type === 'buy' ? now : undefined,
      last_trade_at: now,
      created_at: now,
      updated_at: now,
      sell_strategy_phase: SellStrategy.INITIAL,
      peak_price_sol: trade.price_sol,
      peak_price_usd: trade.price_usd,
      peak_time: now,
      last_sell_time: undefined
    };
  }

  /**
   * 更新持仓数据
   */
  static updatePositionWithTrade(position: Position, trade: TradeRecord): Position {
    const updatedPosition = { ...position };
    const now = new Date().toISOString();

    if (trade.trade_type === 'buy') {
      // 买入交易
      const newTotalBuyAmount = updatedPosition.total_buy_amount + trade.amount;
      const newTotalBuyCostSol = updatedPosition.total_buy_cost_sol + trade.value_sol;
      const newTotalBuyCostUsd = updatedPosition.total_buy_cost_usd + trade.value_usd;

      updatedPosition.total_buy_amount = newTotalBuyAmount;
      updatedPosition.total_buy_cost_sol = newTotalBuyCostSol;
      updatedPosition.total_buy_cost_usd = newTotalBuyCostUsd;
      updatedPosition.avg_buy_price_sol = this.calculateAvgBuyPrice(newTotalBuyCostSol, newTotalBuyAmount);
      updatedPosition.avg_buy_price_usd = this.calculateAvgBuyPrice(newTotalBuyCostUsd, newTotalBuyAmount);
      updatedPosition.current_amount += trade.amount;

      if (!updatedPosition.first_buy_at) {
        updatedPosition.first_buy_at = now;
      }
    } else {
      // 卖出交易
      updatedPosition.total_sell_amount += trade.amount;
      updatedPosition.total_sell_value_sol += trade.value_sol;
      updatedPosition.total_sell_value_usd += trade.value_usd;
      updatedPosition.current_amount -= trade.amount;

      // 计算已实现盈亏
      const realizedPnLSol = this.calculateRealizedPnL(
        trade.value_sol,
        trade.amount,
        updatedPosition.avg_buy_price_sol
      );
      const realizedPnLUsd = this.calculateRealizedPnL(
        trade.value_usd,
        trade.amount,
        updatedPosition.avg_buy_price_usd
      );

      updatedPosition.realized_pnl_sol += realizedPnLSol;
      updatedPosition.realized_pnl_usd += realizedPnLUsd;
    }

    // 更新当前价格
    updatedPosition.current_price_sol = trade.price_sol;
    updatedPosition.current_price_usd = trade.price_usd;

    // 更新峰值价格
    if (trade.price_sol > updatedPosition.peak_price_sol) {
      updatedPosition.peak_price_sol = trade.price_sol;
      updatedPosition.peak_price_usd = trade.price_usd;
      updatedPosition.peak_time = now;
    }

    // 如果是卖出交易，更新最后卖出时间
    if (trade.trade_type === 'sell') {
      updatedPosition.last_sell_time = now;
    }

    // 计算未实现盈亏
    updatedPosition.unrealized_pnl_sol = this.calculateUnrealizedPnL(
      updatedPosition.current_amount,
      updatedPosition.avg_buy_price_sol,
      updatedPosition.current_price_sol
    );
    updatedPosition.unrealized_pnl_usd = this.calculateUnrealizedPnL(
      updatedPosition.current_amount,
      updatedPosition.avg_buy_price_usd,
      updatedPosition.current_price_usd
    );

    // 检查是否应该关闭持仓
    if (this.shouldClosePosition(updatedPosition)) {
      updatedPosition.status = 'closed';
    }

    updatedPosition.last_trade_at = now;
    updatedPosition.updated_at = now;

    return updatedPosition;
  }

  /**
   * 格式化持仓显示数据
   */
  static formatForDisplay(position: Position) {
    return {
      ...position,
      total_buy_cost_sol: Number(position.total_buy_cost_sol.toFixed(6)),
      total_buy_cost_usd: Number(position.total_buy_cost_usd.toFixed(2)),
      total_sell_value_sol: Number(position.total_sell_value_sol.toFixed(6)),
      total_sell_value_usd: Number(position.total_sell_value_usd.toFixed(2)),
      avg_buy_price_sol: Number(position.avg_buy_price_sol.toFixed(8)),
      avg_buy_price_usd: Number(position.avg_buy_price_usd.toFixed(6)),
      current_amount: Number(position.current_amount.toFixed(6)),
      realized_pnl_sol: Number(position.realized_pnl_sol.toFixed(6)),
      realized_pnl_usd: Number(position.realized_pnl_usd.toFixed(2)),
      unrealized_pnl_sol: Number(position.unrealized_pnl_sol.toFixed(6)),
      unrealized_pnl_usd: Number(position.unrealized_pnl_usd.toFixed(2)),
      current_price_sol: Number(position.current_price_sol.toFixed(8)),
      current_price_usd: Number(position.current_price_usd.toFixed(6))
    };
  }
} 