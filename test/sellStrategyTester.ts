import { Connection } from '@solana/web3.js';
import { DatabaseManager, PositionManager } from '../src/main/infrastructure/database';
import { Position, SellStrategy } from '../src/main/infrastructure/database/models/position';
import { configManager } from '../src/main/infrastructure/config';
import { SellStrategyManager } from '../src/main/modules/trading/sellStrategyManager';
import { PriceMonitor } from '../src/main/modules/trading/priceMonitor';

/**
 * 卖出策略测试器
 * 模拟价格变化和策略触发逻辑
 */
export class SellStrategyTester {
  private db: DatabaseManager;
  private positionManager: PositionManager;
  private sellStrategyManager: SellStrategyManager;
  private priceMonitor: PriceMonitor;
  private connection: Connection;

  constructor() {
    this.db = new DatabaseManager();
    this.positionManager = new PositionManager(this.db);
    this.connection = new Connection('https://api.mainnet-beta.solana.com');
    this.sellStrategyManager = new SellStrategyManager(this.connection);
    this.priceMonitor = new PriceMonitor(this.connection, this.positionManager);
  }

  /**
   * 初始化测试环境
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
    console.log('✅ 策略测试器已初始化');
  }

  /**
   * 设置测试配置
   */
  async setupTestConfig(): Promise<void> {
    console.log('⚙️ 设置测试配置...');
    
    // 启用卖出策略
    configManager.setNested('sellStrategy.enabled', true);
    
    // 设置较为激进的测试策略参数
    configManager.setNested('sellStrategy.strategies.initial', {
      enabled: true,
      conditions: {
        profitRatio: 1.3,      // 30% 获利触发
        lossRatio: 0.7,        // 30% 亏损触发
        lossTimeMinutes: 15,   // 15分钟亏损时间
        pullbackRatio: 0.85,   // 15% 回撤触发
        pullbackTimeMinutes: 5 // 5分钟回撤时间
      },
      sellRatio: 0.5          // 卖出50%
    });
    
    configManager.setNested('sellStrategy.strategies.second', {
      enabled: true,
      conditions: {
        profitRatio: 1.6,      // 60% 获利触发
        lossRatio: 0.5,        // 50% 亏损触发
        lossTimeMinutes: 20,   // 20分钟亏损时间
        pullbackRatio: 0.8,    // 20% 回撤触发
        pullbackTimeMinutes: 8 // 8分钟回撤时间
      },
      sellRatio: 0.7          // 卖出70%
    });
    
    configManager.setNested('sellStrategy.strategies.third', {
      enabled: true,
      conditions: {
        profitRatio: 2.0,      // 100% 获利触发
        lossRatio: 0.3,        // 70% 亏损触发
        lossTimeMinutes: 30,   // 30分钟亏损时间
        pullbackRatio: 0.7,    // 30% 回撤触发
        pullbackTimeMinutes: 10 // 10分钟回撤时间
      },
      sellRatio: 1.0          // 卖出100%
    });
    
    console.log('✅ 测试配置设置完成');
  }

  /**
   * 测试单个持仓的策略触发
   */
  async testPositionStrategy(tokenMint: string, walletAddress: string): Promise<void> {
    console.log(`\n🎯 测试持仓策略: ${tokenMint.substring(0, 8)}...`);
    
    const position = await this.positionManager.getPosition(tokenMint, walletAddress);
    if (!position) {
      console.log('❌ 持仓不存在');
      return;
    }
    
    console.log(`📊 当前持仓状态:`);
    console.log(`   策略阶段: ${position.sell_strategy_phase}`);
    console.log(`   买入价: ${position.avg_buy_price_sol} SOL`);
    console.log(`   当前价: ${position.current_price_sol} SOL`);
    console.log(`   持仓量: ${position.current_amount}`);
    console.log(`   峰值价: ${position.peak_price_sol} SOL`);
    
    // 测试策略条件
    const shouldSell = await this.sellStrategyManager.evaluateSellConditions(
      position, 
      position.current_price_sol, 
      position.current_price_usd
    );
    
    if (shouldSell.shouldSell) {
      console.log('🔥 触发卖出策略!');
      console.log(`   触发条件: ${shouldSell.reason}`);
      console.log(`   卖出比例: ${(shouldSell.sellRatio * 100).toFixed(2)}%`);
      console.log(`   卖出数量: ${(position.current_amount * shouldSell.sellRatio).toFixed(6)}`);
      
      // 模拟执行卖出（不实际执行）
      console.log('🔄 模拟执行卖出...');
      const sellAmount = position.current_amount * shouldSell.sellRatio;
      await this.simulateSellExecution(position, sellAmount);
    } else {
      console.log('⏳ 未触发卖出条件');
    }
  }

  /**
   * 模拟卖出执行
   */
  async simulateSellExecution(position: Position, sellAmount: number): Promise<void> {
    console.log(`💰 模拟卖出执行:`);
    console.log(`   Token: ${position.token_mint.substring(0, 8)}...`);
    console.log(`   卖出数量: ${sellAmount}`);
    console.log(`   当前价格: ${position.current_price_sol} SOL`);
    console.log(`   预计收益: ${(sellAmount * position.current_price_sol).toFixed(6)} SOL`);
    
    // 更新持仓状态（模拟）
    const newAmount = position.current_amount - sellAmount;
    const newPhase = this.getNextStrategyPhase(position.sell_strategy_phase);
    
    await this.db.run(
      'UPDATE positions SET current_amount = ?, sell_strategy_phase = ?, last_sell_time = ? WHERE token_mint = ? AND wallet_address = ?',
      [newAmount, newPhase, new Date().toISOString(), position.token_mint, position.wallet_address]
    );
    
    console.log(`✅ 持仓已更新: 剩余${newAmount}, 策略阶段: ${newPhase}`);
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

  /**
   * 批量测试所有持仓
   */
  async testAllPositions(): Promise<void> {
    console.log('\n🎪 开始批量测试所有持仓...');
    
    const positions = await this.positionManager.getPositions({ status: 'open' });
    console.log(`📋 找到 ${positions.length} 个开仓持仓`);
    
    for (const position of positions) {
      await this.testPositionStrategy(position.token_mint, position.wallet_address);
      console.log('-'.repeat(80));
    }
    
    console.log('✅ 批量测试完成');
  }

  /**
   * 模拟价格波动测试
   */
  async simulatePriceScenarios(): Promise<void> {
    console.log('\n🎢 开始价格波动测试...');
    
    const positions = await this.positionManager.getPositions({ status: 'open' });
    
    for (const position of positions) {
      console.log(`\n📈 测试 ${position.token_mint.substring(0, 8)}... 的价格场景:`);
      
      // 场景1: 价格上涨50%
      console.log('🟢 场景1: 价格上涨50%');
      await this.simulatePriceChange(position, 1.5);
      
      // 场景2: 价格下跌30%
      console.log('🔴 场景2: 价格下跌30%');
      await this.simulatePriceChange(position, 0.7);
      
      // 场景3: 价格回撤20%（需要先设置峰值）
      console.log('🔻 场景3: 价格回撤20%');
      await this.simulatePullback(position, 0.8);
      
      console.log('-'.repeat(60));
    }
  }

  /**
   * 模拟价格变化
   */
  async simulatePriceChange(position: Position, multiplier: number): Promise<void> {
    const oldPrice = position.current_price_sol;
    const newPrice = position.avg_buy_price_sol * multiplier;
    
    await this.positionManager.updatePositionPrice(
      position.token_mint,
      position.wallet_address,
      newPrice,
      newPrice * 100
    );
    
    console.log(`   价格变化: ${oldPrice} → ${newPrice} SOL`);
    console.log(`   变化幅度: ${((newPrice / position.avg_buy_price_sol - 1) * 100).toFixed(2)}%`);
    
    // 测试策略触发
    await this.testPositionStrategy(position.token_mint, position.wallet_address);
  }

  /**
   * 模拟回撤场景
   */
  async simulatePullback(position: Position, pullbackRatio: number): Promise<void> {
    // 先设置一个较高的峰值价格
    const peakPrice = position.avg_buy_price_sol * 1.8; // 80% 峰值
    const pullbackPrice = peakPrice * pullbackRatio;
    
    // 更新峰值价格
    await this.db.run(
      'UPDATE positions SET peak_price_sol = ?, peak_price_usd = ?, peak_time = ? WHERE token_mint = ? AND wallet_address = ?',
      [peakPrice, peakPrice * 100, new Date(Date.now() - 10 * 60 * 1000).toISOString(), position.token_mint, position.wallet_address]
    );
    
    // 设置回撤价格
    await this.positionManager.updatePositionPrice(
      position.token_mint,
      position.wallet_address,
      pullbackPrice,
      pullbackPrice * 100
    );
    
    console.log(`   峰值价格: ${peakPrice} SOL`);
    console.log(`   回撤价格: ${pullbackPrice} SOL`);
    console.log(`   回撤幅度: ${((1 - pullbackRatio) * 100).toFixed(2)}%`);
    
    // 测试策略触发
    await this.testPositionStrategy(position.token_mint, position.wallet_address);
  }

  /**
   * 压力测试
   */
  async stressTest(): Promise<void> {
    console.log('\n⚡ 开始压力测试...');
    
    const positions = await this.positionManager.getPositions({ status: 'open' });
    const testCycles = 10;
    
    console.log(`🔄 将进行 ${testCycles} 轮价格变动测试`);
    
    for (let cycle = 1; cycle <= testCycles; cycle++) {
      console.log(`\n🎯 第 ${cycle} 轮测试:`);
      
      for (const position of positions) {
        // 随机价格变动 (-20% to +50%)
        const change = (Math.random() - 0.3) * 0.7; // -0.3 to +0.4
        const newPrice = position.avg_buy_price_sol * (1 + change);
        
        await this.positionManager.updatePositionPrice(
          position.token_mint,
          position.wallet_address,
          newPrice,
          newPrice * 100
        );
        
        console.log(`📊 ${position.token_mint.substring(0, 8)}... 价格变动: ${(change * 100).toFixed(2)}%`);
      }
      
      // 批量测试策略触发
      await this.testAllPositions();
      
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('✅ 压力测试完成');
  }

  /**
   * 生成测试报告
   */
  async generateTestReport(): Promise<void> {
    console.log('\n📄 生成测试报告...');
    
    const positions = await this.positionManager.getPositions();
    const openPositions = positions.filter(p => p.status === 'open');
    const closedPositions = positions.filter(p => p.status === 'closed');
    
    console.log('\n📊 测试报告:');
    console.log('=' .repeat(80));
    console.log(`总持仓数: ${positions.length}`);
    console.log(`开仓持仓: ${openPositions.length}`);
    console.log(`已平仓: ${closedPositions.length}`);
    
    // 按策略阶段分组
    const phaseGroups = {
      [SellStrategy.INITIAL]: 0,
      [SellStrategy.SECOND]: 0,
      [SellStrategy.THIRD]: 0,
      [SellStrategy.COMPLETED]: 0
    };
    
    openPositions.forEach(position => {
      phaseGroups[position.sell_strategy_phase]++;
    });
    
    console.log('\n📋 策略阶段分布:');
    console.log(`初始阶段: ${phaseGroups[SellStrategy.INITIAL]} 个`);
    console.log(`第二阶段: ${phaseGroups[SellStrategy.SECOND]} 个`);
    console.log(`第三阶段: ${phaseGroups[SellStrategy.THIRD]} 个`);
    console.log(`已完成: ${phaseGroups[SellStrategy.COMPLETED]} 个`);
    
    // 盈亏统计
    const totalPnL = positions.reduce((sum, p) => sum + p.unrealized_pnl_sol + p.realized_pnl_sol, 0);
    console.log(`\n💰 总盈亏: ${totalPnL.toFixed(6)} SOL`);
    
    console.log('=' .repeat(80));
  }

  /**
   * 关闭测试器
   */
  async close(): Promise<void> {
    await this.db.close();
    console.log('📱 策略测试器已关闭');
  }
}

// 主执行函数
async function runSellStrategyTest() {
  const tester = new SellStrategyTester();
  
  try {
    await tester.initialize();
    await tester.setupTestConfig();
    await tester.testAllPositions();
    await tester.simulatePriceScenarios();
    await tester.stressTest();
    await tester.generateTestReport();
    await tester.close();
  } catch (error) {
    console.error('❌ 策略测试失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runSellStrategyTest();
} 