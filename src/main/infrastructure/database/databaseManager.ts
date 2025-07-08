import sqlite3 from 'sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { appLogger } from '../logging';
import os from 'node:os';
import fs from 'node:fs';

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    // 数据库文件存储在用户数据目录 - 支持测试环境
    const userDataPath = this.getUserDataPath();
    this.dbPath = path.join(userDataPath, 'trading.db');
    
    appLogger.info(`数据库路径: ${this.dbPath}`);
  }

  /**
   * 获取用户数据目录路径 - 支持测试环境
   */
  private getUserDataPath(): string {
    try {
      // 尝试使用Electron的app路径
      if (app && app.getPath) {
        return app.getPath('userData');
      }
    } catch (error) {
      // 在测试环境中，app对象可能不可用
    }
    
    // 备用路径（测试环境）
    const testDataPath = path.join(os.tmpdir(), 'my-app-test-data');
    
    // 确保目录存在
    try {
      if (!fs.existsSync(testDataPath)) {
        fs.mkdirSync(testDataPath, { recursive: true });
      }
    } catch (error) {
      console.warn('无法创建数据目录:', error);
    }
    
    return testDataPath;
  }

  /**
   * 初始化数据库连接和表结构
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          appLogger.error('数据库连接失败:', err.message);
          reject(err);
          return;
        }
        
        appLogger.info('数据库连接成功');
        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  /**
   * 创建数据库表结构
   */
  private async createTables(): Promise<void> {
    const queries = [
      `CREATE TABLE IF NOT EXISTS positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_mint TEXT NOT NULL,
        token_symbol TEXT,
        token_name TEXT,
        wallet_address TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
        total_buy_amount REAL DEFAULT 0,
        total_buy_cost_sol REAL DEFAULT 0,
        total_buy_cost_usd REAL DEFAULT 0,
        total_sell_amount REAL DEFAULT 0,
        total_sell_value_sol REAL DEFAULT 0,
        total_sell_value_usd REAL DEFAULT 0,
        avg_buy_price_sol REAL DEFAULT 0,
        avg_buy_price_usd REAL DEFAULT 0,
        current_amount REAL DEFAULT 0,
        realized_pnl_sol REAL DEFAULT 0,
        realized_pnl_usd REAL DEFAULT 0,
        unrealized_pnl_sol REAL DEFAULT 0,
        unrealized_pnl_usd REAL DEFAULT 0,
        current_price_sol REAL DEFAULT 0,
        current_price_usd REAL DEFAULT 0,
        sell_strategy_phase TEXT DEFAULT 'initial' CHECK(sell_strategy_phase IN ('initial', 'second', 'third', 'completed')),
        peak_price_sol REAL DEFAULT 0,
        peak_price_usd REAL DEFAULT 0,
        peak_time DATETIME,
        last_sell_time DATETIME,
        first_buy_at DATETIME,
        last_trade_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(token_mint, wallet_address)
      )`,
      
      `CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id INTEGER,
        transaction_signature TEXT UNIQUE NOT NULL,
        trade_type TEXT NOT NULL CHECK(trade_type IN ('buy', 'sell')),
        token_mint TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        amount REAL NOT NULL,
        price_sol REAL NOT NULL,
        price_usd REAL DEFAULT 0,
        value_sol REAL NOT NULL,
        value_usd REAL DEFAULT 0,
        slippage_bps INTEGER,
        gas_fee_sol REAL DEFAULT 0,
        block_time DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(position_id) REFERENCES positions(id)
      )`,
      
      // 创建索引以提高查询性能
      `CREATE INDEX IF NOT EXISTS idx_positions_token_wallet ON positions(token_mint, wallet_address)`,
      `CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_signature ON trades(transaction_signature)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_position ON trades(position_id)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_address)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at)`
    ];

    for (const query of queries) {
      await this.run(query);
    }
    
    // 执行数据库迁移
    await this.runMigrations();
    
    appLogger.info('数据库表结构创建完成');
  }

  /**
   * 执行数据库迁移
   */
  private async runMigrations(): Promise<void> {
    try {
      // 检查positions表是否缺少新列
      const columnsResult = await this.all<any>('PRAGMA table_info(positions)');
      const existingColumns = columnsResult.map(col => col.name);
      
      // 需要添加的新列
      const requiredColumns = [
        'sell_strategy_phase',
        'peak_price_sol',
        'peak_price_usd',
        'peak_time',
        'last_sell_time'
      ];
      
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        appLogger.info(`检测到缺少的列: ${missingColumns.join(', ')}, 开始迁移...`);
        
        // 添加缺少的列
        for (const column of missingColumns) {
          let alterQuery = '';
          
          switch (column) {
            case 'sell_strategy_phase':
              alterQuery = `ALTER TABLE positions ADD COLUMN sell_strategy_phase TEXT DEFAULT 'initial'`;
              break;
            case 'peak_price_sol':
              alterQuery = `ALTER TABLE positions ADD COLUMN peak_price_sol REAL DEFAULT 0`;
              break;
            case 'peak_price_usd':
              alterQuery = `ALTER TABLE positions ADD COLUMN peak_price_usd REAL DEFAULT 0`;
              break;
            case 'peak_time':
              alterQuery = `ALTER TABLE positions ADD COLUMN peak_time DATETIME`;
              break;
            case 'last_sell_time':
              alterQuery = `ALTER TABLE positions ADD COLUMN last_sell_time DATETIME`;
              break;
          }
          
          if (alterQuery) {
            await this.run(alterQuery);
            appLogger.info(`成功添加列: ${column}`);
          }
        }
        
        // 更新现有记录的默认值
        await this.run(`
          UPDATE positions 
          SET 
            sell_strategy_phase = 'initial',
            peak_price_sol = current_price_sol,
            peak_price_usd = current_price_usd,
            peak_time = COALESCE(updated_at, created_at)
          WHERE sell_strategy_phase IS NULL OR peak_price_sol IS NULL
        `);
        
        appLogger.info('数据库迁移完成');
      } else {
        appLogger.info('数据库结构已是最新版本');
      }
    } catch (error: any) {
      appLogger.error('数据库迁移失败:', error.message);
      throw error;
    }
  }

  /**
   * 执行SQL查询（写操作）
   */
  async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      this.db.run(sql, params, function(err) {
        if (err) {
          appLogger.error('SQL执行失败:', err.message, { sql, params });
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * 执行SQL查询（读操作，返回单条记录）
   */
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          appLogger.error('SQL查询失败:', err.message, { sql, params });
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  /**
   * 执行SQL查询（读操作，返回多条记录）
   */
  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          appLogger.error('SQL查询失败:', err.message, { sql, params });
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * 开始事务
   */
  async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  /**
   * 提交事务
   */
  async commit(): Promise<void> {
    await this.run('COMMIT');
  }

  /**
   * 回滚事务
   */
  async rollback(): Promise<void> {
    await this.run('ROLLBACK');
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          appLogger.error('数据库关闭失败:', err.message);
          reject(err);
        } else {
          appLogger.info('数据库连接已关闭');
          this.db = null;
          resolve();
        }
      });
    });
  }

  /**
   * 获取数据库实例（用于复杂查询）
   */
  getDatabase(): sqlite3.Database | null {
    return this.db;
  }
} 