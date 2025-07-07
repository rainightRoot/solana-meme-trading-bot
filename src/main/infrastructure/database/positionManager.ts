import { DatabaseManager } from './databaseManager';
import { Position, TradeRecord, PositionStats, PositionQuery, PositionModel } from './models/position';
import { appLogger } from '../logging';

export class PositionManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * 记录新交易并更新持仓
   * @param trade 交易记录
   * @returns 是否成功
   */
  async recordTrade(trade: TradeRecord): Promise<boolean> {
    try {
      await this.db.beginTransaction();

      // 1. 检查交易是否已存在（防止重复记录）
      const existingTrade = await this.db.get<TradeRecord>(
        'SELECT id FROM trades WHERE transaction_signature = ?',
        [trade.transaction_signature]
      );

      if (existingTrade) {
        appLogger.warn(`交易已存在: ${trade.transaction_signature}`);
        await this.db.rollback();
        return false;
      }

      // 2. 查找或创建持仓
      const position = await this.db.get<Position>(
        'SELECT * FROM positions WHERE token_mint = ? AND wallet_address = ?',
        [trade.token_mint, trade.wallet_address]
      );

      let positionId: number;

      if (!position) {
        // 创建新持仓
        const newPosition = PositionModel.createNewPosition(trade);
        const result = await this.db.run(
          `INSERT INTO positions (
            token_mint, wallet_address, status, total_buy_amount, total_buy_cost_sol, 
            total_buy_cost_usd, total_sell_amount, total_sell_value_sol, total_sell_value_usd,
            avg_buy_price_sol, avg_buy_price_usd, current_amount, realized_pnl_sol, 
            realized_pnl_usd, unrealized_pnl_sol, unrealized_pnl_usd, current_price_sol,
            current_price_usd, sell_strategy_phase, peak_price_sol, peak_price_usd, peak_time,
            last_sell_time, first_buy_at, last_trade_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newPosition.token_mint, newPosition.wallet_address, newPosition.status,
            newPosition.total_buy_amount, newPosition.total_buy_cost_sol, newPosition.total_buy_cost_usd,
            newPosition.total_sell_amount, newPosition.total_sell_value_sol, newPosition.total_sell_value_usd,
            newPosition.avg_buy_price_sol, newPosition.avg_buy_price_usd, newPosition.current_amount,
            newPosition.realized_pnl_sol, newPosition.realized_pnl_usd, newPosition.unrealized_pnl_sol,
            newPosition.unrealized_pnl_usd, newPosition.current_price_sol, newPosition.current_price_usd,
            newPosition.sell_strategy_phase, newPosition.peak_price_sol, newPosition.peak_price_usd,
            newPosition.peak_time, newPosition.last_sell_time, newPosition.first_buy_at,
            newPosition.last_trade_at, newPosition.created_at, newPosition.updated_at
          ]
        );
        positionId = result.lastID!;
        appLogger.info(`创建新持仓: ${trade.token_mint} for wallet ${trade.wallet_address}`);
      } else {
        // 更新现有持仓
        const updatedPosition = PositionModel.updatePositionWithTrade(position, trade);
        await this.db.run(
          `UPDATE positions SET
            total_buy_amount = ?, total_buy_cost_sol = ?, total_buy_cost_usd = ?,
            total_sell_amount = ?, total_sell_value_sol = ?, total_sell_value_usd = ?,
            avg_buy_price_sol = ?, avg_buy_price_usd = ?, current_amount = ?,
            realized_pnl_sol = ?, realized_pnl_usd = ?, unrealized_pnl_sol = ?,
            unrealized_pnl_usd = ?, current_price_sol = ?, current_price_usd = ?,
            sell_strategy_phase = ?, peak_price_sol = ?, peak_price_usd = ?, peak_time = ?,
            last_sell_time = ?, status = ?, last_trade_at = ?, updated_at = ?
          WHERE id = ?`,
          [
            updatedPosition.total_buy_amount, updatedPosition.total_buy_cost_sol, updatedPosition.total_buy_cost_usd,
            updatedPosition.total_sell_amount, updatedPosition.total_sell_value_sol, updatedPosition.total_sell_value_usd,
            updatedPosition.avg_buy_price_sol, updatedPosition.avg_buy_price_usd, updatedPosition.current_amount,
            updatedPosition.realized_pnl_sol, updatedPosition.realized_pnl_usd, updatedPosition.unrealized_pnl_sol,
            updatedPosition.unrealized_pnl_usd, updatedPosition.current_price_sol, updatedPosition.current_price_usd,
            updatedPosition.sell_strategy_phase, updatedPosition.peak_price_sol, updatedPosition.peak_price_usd,
            updatedPosition.peak_time, updatedPosition.last_sell_time, updatedPosition.status,
            updatedPosition.last_trade_at, updatedPosition.updated_at, position.id
          ]
        );
        positionId = position.id!;
        appLogger.info(`更新持仓: ${trade.token_mint} for wallet ${trade.wallet_address}`);
      }

      // 3. 记录交易
      await this.db.run(
        `INSERT INTO trades (
          position_id, transaction_signature, trade_type, token_mint, wallet_address,
          amount, price_sol, price_usd, value_sol, value_usd, slippage_bps, gas_fee_sol,
          block_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          positionId, trade.transaction_signature, trade.trade_type, trade.token_mint,
          trade.wallet_address, trade.amount, trade.price_sol, trade.price_usd,
          trade.value_sol, trade.value_usd, trade.slippage_bps, trade.gas_fee_sol,
          trade.block_time, new Date().toISOString()
        ]
      );

      await this.db.commit();
      appLogger.info(`交易记录成功: ${trade.trade_type} ${trade.amount} ${trade.token_mint}`);
      return true;

    } catch (error: any) {
      await this.db.rollback();
      appLogger.error('记录交易失败:', error.message);
      return false;
    }
  }

  /**
   * 获取持仓列表
   */
  async getPositions(query: PositionQuery = {}): Promise<Position[]> {
    try {
      const {
        wallet_address,
        status,
        token_mint,
        limit = 50,
        offset = 0,
        order_by = 'updated_at',
        order_dir = 'DESC'
      } = query;

      let sql = 'SELECT * FROM positions WHERE 1=1';
      const params: any[] = [];

      if (wallet_address) {
        sql += ' AND wallet_address = ?';
        params.push(wallet_address);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      if (token_mint) {
        sql += ' AND token_mint = ?';
        params.push(token_mint);
      }

      sql += ` ORDER BY ${order_by} ${order_dir} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const positions = await this.db.all<Position>(sql, params);
      return positions.map(PositionModel.formatForDisplay);
    } catch (error: any) {
      appLogger.error('获取持仓列表失败:', error.message);
      return [];
    }
  }

  /**
   * 获取单个持仓详情
   */
  async getPosition(tokenMint: string, walletAddress: string): Promise<Position | null> {
    try {
      const position = await this.db.get<Position>(
        'SELECT * FROM positions WHERE token_mint = ? AND wallet_address = ?',
        [tokenMint, walletAddress]
      );

      return position ? PositionModel.formatForDisplay(position) : null;
    } catch (error: any) {
      appLogger.error('获取持仓详情失败:', error.message);
      return null;
    }
  }

  /**
   * 获取交易记录
   */
  async getTrades(
    positionId?: number,
    walletAddress?: string,
    limit = 100,
    offset = 0
  ): Promise<TradeRecord[]> {
    try {
      let sql = 'SELECT * FROM trades WHERE 1=1';
      const params: any[] = [];

      if (positionId) {
        sql += ' AND position_id = ?';
        params.push(positionId);
      }

      if (walletAddress) {
        sql += ' AND wallet_address = ?';
        params.push(walletAddress);
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      return await this.db.all<TradeRecord>(sql, params);
    } catch (error: any) {
      appLogger.error('获取交易记录失败:', error.message);
      return [];
    }
  }

  /**
   * 获取持仓统计信息
   */
  async getPositionStats(walletAddress?: string): Promise<PositionStats> {
    try {
      let whereClause = '';
      const params: any[] = [];

      if (walletAddress) {
        whereClause = 'WHERE wallet_address = ?';
        params.push(walletAddress);
      }

      const stats = await this.db.get<any>(
        `SELECT 
          COUNT(*) as total_positions,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_positions,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_positions,
          SUM(total_buy_cost_sol) as total_invested_sol,
          SUM(total_buy_cost_usd) as total_invested_usd,
          SUM(realized_pnl_sol) as total_realized_pnl_sol,
          SUM(realized_pnl_usd) as total_realized_pnl_usd,
          SUM(unrealized_pnl_sol) as total_unrealized_pnl_sol,
          SUM(unrealized_pnl_usd) as total_unrealized_pnl_usd
        FROM positions ${whereClause}`,
        params
      );

      // 计算总盈亏
      const totalPnLSol = (stats?.total_realized_pnl_sol || 0) + (stats?.total_unrealized_pnl_sol || 0);
      const totalPnLUsd = (stats?.total_realized_pnl_usd || 0) + (stats?.total_unrealized_pnl_usd || 0);

      // 计算胜率
      const winTrades = await this.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM positions 
         ${whereClause ? whereClause + ' AND' : 'WHERE'} realized_pnl_sol > 0`,
        params
      );

      const totalTrades = stats?.closed_positions || 0;
      const winRate = totalTrades > 0 ? (winTrades?.count || 0) / totalTrades : 0;

      // 获取最佳和最差交易
      const bestTrade = await this.db.get<{ best_pnl: number }>(
        `SELECT MAX(realized_pnl_sol) as best_pnl FROM positions ${whereClause}`,
        params
      );

      const worstTrade = await this.db.get<{ worst_pnl: number }>(
        `SELECT MIN(realized_pnl_sol) as worst_pnl FROM positions ${whereClause}`,
        params
      );

      return {
        total_positions: stats?.total_positions || 0,
        open_positions: stats?.open_positions || 0,
        closed_positions: stats?.closed_positions || 0,
        total_invested_sol: stats?.total_invested_sol || 0,
        total_invested_usd: stats?.total_invested_usd || 0,
        total_realized_pnl_sol: stats?.total_realized_pnl_sol || 0,
        total_realized_pnl_usd: stats?.total_realized_pnl_usd || 0,
        total_unrealized_pnl_sol: stats?.total_unrealized_pnl_sol || 0,
        total_unrealized_pnl_usd: stats?.total_unrealized_pnl_usd || 0,
        total_pnl_sol: totalPnLSol,
        total_pnl_usd: totalPnLUsd,
        win_rate: winRate,
        best_trade_pnl_sol: bestTrade?.best_pnl || 0,
        worst_trade_pnl_sol: worstTrade?.worst_pnl || 0
      };
    } catch (error: any) {
      appLogger.error('获取持仓统计失败:', error.message);
      return {
        total_positions: 0,
        open_positions: 0,
        closed_positions: 0,
        total_invested_sol: 0,
        total_invested_usd: 0,
        total_realized_pnl_sol: 0,
        total_realized_pnl_usd: 0,
        total_unrealized_pnl_sol: 0,
        total_unrealized_pnl_usd: 0,
        total_pnl_sol: 0,
        total_pnl_usd: 0,
        win_rate: 0,
        best_trade_pnl_sol: 0,
        worst_trade_pnl_sol: 0
      };
    }
  }

  /**
   * 更新持仓的当前价格和未实现盈亏
   */
  async updatePositionPrice(
    tokenMint: string,
    walletAddress: string,
    currentPriceSol: number,
    currentPriceUsd: number
  ): Promise<boolean> {
    try {
      const position = await this.getPosition(tokenMint, walletAddress);
      if (!position) {
        return false;
      }

      // 计算未实现盈亏
      const unrealizedPnLSol = PositionModel.calculateUnrealizedPnL(
        position.current_amount,
        position.avg_buy_price_sol,
        currentPriceSol
      );

      const unrealizedPnLUsd = PositionModel.calculateUnrealizedPnL(
        position.current_amount,
        position.avg_buy_price_usd,
        currentPriceUsd
      );

      await this.db.run(
        `UPDATE positions SET 
          current_price_sol = ?, current_price_usd = ?,
          unrealized_pnl_sol = ?, unrealized_pnl_usd = ?,
          updated_at = ?
        WHERE token_mint = ? AND wallet_address = ?`,
        [
          currentPriceSol, currentPriceUsd, unrealizedPnLSol, unrealizedPnLUsd,
          new Date().toISOString(), tokenMint, walletAddress
        ]
      );

      return true;
    } catch (error: any) {
      appLogger.error('更新持仓价格失败:', error.message);
      return false;
    }
  }

  /**
   * 删除持仓（谨慎使用）
   */
  async deletePosition(tokenMint: string, walletAddress: string): Promise<boolean> {
    try {
      await this.db.beginTransaction();

      // 先删除相关交易记录
      await this.db.run(
        'DELETE FROM trades WHERE token_mint = ? AND wallet_address = ?',
        [tokenMint, walletAddress]
      );

      // 删除持仓记录
      const result = await this.db.run(
        'DELETE FROM positions WHERE token_mint = ? AND wallet_address = ?',
        [tokenMint, walletAddress]
      );

      await this.db.commit();
      appLogger.info(`删除持仓: ${tokenMint} for wallet ${walletAddress}`);
      
      return result.changes! > 0;
    } catch (error: any) {
      await this.db.rollback();
      appLogger.error('删除持仓失败:', error.message);
      return false;
    }
  }
} 