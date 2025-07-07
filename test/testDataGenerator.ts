import { DatabaseManager, PositionManager } from '../src/main/infrastructure/database';
import { Position, TradeRecord, SellStrategy } from '../src/main/infrastructure/database/models/position';
import { configManager } from '../src/main/infrastructure/config';

/**
 * 测试数据生成器
 * 用于创建各种测试场景的持仓数据
 */
export class TestDataGenerator {
  private db: DatabaseManager;
  private positionManager: PositionManager;
  
  constructor() {
    this.db = new DatabaseManager();
    this.positionManager = new PositionManager(this.db);
  }

  /**
   * 初始化测试环境
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
    console.log('✅ 测试数据库已初始化');
  }

  /**
   * 清理测试数据
   */
  async cleanup(): Promise<void> {
    await this.db.run('DELETE FROM trades');
    await this.db.run('DELETE FROM positions');
    console.log('🧹 测试数据已清理');
  }

  /**
   * 生成测试钱包地址
   */
  generateTestWallet(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
    let result = '';
    for (let i = 0; i < 44; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 生成测试Token地址
   */
  generateTestToken(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
    let result = '';
    for (let i = 0; i < 44; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 生成测试交易签名
   */
  generateTestSignature(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
    let result = '';
    for (let i = 0; i < 88; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 创建基础测试持仓
   */
  async createTestPosition(
    tokenSymbol: string,
    buyPriceSol: number,
    buyAmount: number,
    currentPriceSol: number,
    minutesAgo = 0
  ): Promise<{ position: Position; tokenMint: string; walletAddress: string }> {
    const tokenMint = this.generateTestToken();
    const walletAddress = this.generateTestWallet();
    const buyDate = new Date(Date.now() - minutesAgo * 60 * 1000);
    
    const buyTrade: TradeRecord = {
      transaction_signature: this.generateTestSignature(),
      trade_type: 'buy',
      token_mint: tokenMint,
      wallet_address: walletAddress,
      amount: buyAmount,
      price_sol: buyPriceSol,
      price_usd: buyPriceSol * 100, // 假设1SOL=100USD
      value_sol: buyAmount * buyPriceSol,
      value_usd: buyAmount * buyPriceSol * 100,
      gas_fee_sol: 0.001,
      block_time: buyDate.toISOString(),
      created_at: buyDate.toISOString()
    };

    await this.positionManager.recordTrade(buyTrade);
    
    // 更新当前价格
    await this.positionManager.updatePositionPrice(
      tokenMint, 
      walletAddress, 
      currentPriceSol, 
      currentPriceSol * 100
    );

    const position = await this.positionManager.getPosition(tokenMint, walletAddress);
    
    console.log(`📊 创建测试持仓: ${tokenSymbol} | 买入价: ${buyPriceSol} SOL | 当前价: ${currentPriceSol} SOL`);
    
    return { position: position!, tokenMint, walletAddress };
  }

  /**
   * 创建完整的测试场景数据
   */
  async createTestScenarios(): Promise<void> {
    console.log('🎭 开始创建测试场景...\n');

    // 场景1: 获利场景（触发第一次卖出）
    console.log('📈 场景1: 获利场景');
    const scenario1 = await this.createTestPosition(
      'PROFIT_TOKEN',
      0.001,    // 买入价: 0.001 SOL
      1000,     // 买入数量: 1000 tokens
      0.0015,   // 当前价: 0.0015 SOL (50% 获利)
      30        // 30分钟前买入
    );
    
    // 场景2: 亏损场景（触发止损）
    console.log('📉 场景2: 亏损场景');
    const scenario2 = await this.createTestPosition(
      'LOSS_TOKEN',
      0.002,    // 买入价: 0.002 SOL
      500,      // 买入数量: 500 tokens
      0.001,    // 当前价: 0.001 SOL (50% 亏损)
      45        // 45分钟前买入
    );
    
    // 场景3: 回撤场景（需要设置峰值价格）
    console.log('🔻 场景3: 回撤场景');
    const scenario3 = await this.createTestPosition(
      'PULLBACK_TOKEN',
      0.001,    // 买入价: 0.001 SOL
      2000,     // 买入数量: 2000 tokens
      0.0008,   // 当前价: 0.0008 SOL
      20        // 20分钟前买入
    );
    
    // 手动设置峰值价格为0.0012 SOL (20% 回撤到0.0008)
    await this.db.run(
      'UPDATE positions SET peak_price_sol = ?, peak_price_usd = ?, peak_time = ? WHERE token_mint = ?',
      [0.0012, 0.0012 * 100, new Date(Date.now() - 15 * 60 * 1000).toISOString(), scenario3.tokenMint]
    );

    // 场景4: 第二次卖出场景（已经第一次卖出）
    console.log('🎯 场景4: 第二次卖出场景');
    const scenario4 = await this.createTestPosition(
      'SECOND_SELL_TOKEN',
      0.001,    // 买入价: 0.001 SOL
      1000,     // 买入数量: 1000 tokens
      0.002,    // 当前价: 0.002 SOL (100% 获利)
      60        // 60分钟前买入
    );
    
    // 设置为第二阶段策略
    await this.db.run(
      'UPDATE positions SET sell_strategy_phase = ?, current_amount = ? WHERE token_mint = ?',
      [SellStrategy.SECOND, 500, scenario4.tokenMint] // 假设已卖出50%
    );

    // 场景5: 第三次卖出场景（清仓）
    console.log('🎪 场景5: 第三次卖出场景');
    const scenario5 = await this.createTestPosition(
      'THIRD_SELL_TOKEN',
      0.001,    // 买入价: 0.001 SOL
      1000,     // 买入数量: 1000 tokens
      0.003,    // 当前价: 0.003 SOL (200% 获利)
      90        // 90分钟前买入
    );
    
    // 设置为第三阶段策略
    await this.db.run(
      'UPDATE positions SET sell_strategy_phase = ?, current_amount = ? WHERE token_mint = ?',
      [SellStrategy.THIRD, 300, scenario5.tokenMint] // 假设已卖出70%
    );

    // 场景6: 临界情况（接近触发条件）
    console.log('⚖️ 场景6: 临界情况');
    await this.createTestPosition(
      'EDGE_CASE_TOKEN',
      0.001,    // 买入价: 0.001 SOL
      800,      // 买入数量: 800 tokens
      0.00149,  // 当前价: 0.00149 SOL (49% 获利，接近50%触发线)
      25        // 25分钟前买入
    );

    console.log('\n✅ 所有测试场景创建完成！');
  }

  /**
   * 显示当前持仓状态
   */
  async showCurrentPositions(): Promise<void> {
    const positions = await this.positionManager.getPositions({
      order_by: 'created_at',
      order_dir: 'DESC'
    });

    console.log('\n📊 当前持仓状态:');
    console.log('=' .repeat(100));
    
    for (const position of positions) {
      const pnlPercent = ((position.current_price_sol - position.avg_buy_price_sol) / position.avg_buy_price_sol * 100).toFixed(2);
      const pnlColor = parseFloat(pnlPercent) >= 0 ? '🟢' : '🔴';
      
      console.log(`${pnlColor} Token: ${position.token_mint.substring(0, 8)}...`);
      console.log(`   策略阶段: ${position.sell_strategy_phase}`);
      console.log(`   买入价: ${position.avg_buy_price_sol} SOL`);
      console.log(`   当前价: ${position.current_price_sol} SOL`);
      console.log(`   盈亏: ${pnlPercent}%`);
      console.log(`   持仓量: ${position.current_amount}`);
      console.log(`   峰值价: ${position.peak_price_sol} SOL`);
      console.log(`   状态: ${position.status}`);
      console.log('-'.repeat(80));
    }
  }

  /**
   * 生成随机价格波动
   */
  async simulatePriceMovement(): Promise<void> {
    console.log('\n🎲 模拟价格波动...');
    
    const positions = await this.positionManager.getPositions({ status: 'open' });
    
    for (const position of positions) {
      // 随机生成价格变动 (-10% 到 +10%)
      const change = (Math.random() - 0.5) * 0.2; // -0.1 to +0.1
      const newPrice = position.current_price_sol * (1 + change);
      
      await this.positionManager.updatePositionPrice(
        position.token_mint,
        position.wallet_address,
        newPrice,
        newPrice * 100
      );
      
      console.log(`📈 ${position.token_mint.substring(0, 8)}... 价格变动: ${(change * 100).toFixed(2)}%`);
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    await this.db.close();
    console.log('📱 数据库连接已关闭');
  }
}

// 主执行函数
async function runTestDataGeneration() {
  const generator = new TestDataGenerator();
  try {
    await generator.initialize();
    await generator.cleanup();
    await generator.createTestScenarios();
    await generator.showCurrentPositions();
    await generator.simulatePriceMovement();
    await generator.showCurrentPositions();
    await generator.close();
  } catch (error) {
    console.error('❌ 测试数据生成失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runTestDataGeneration();
} 