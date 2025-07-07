import { TestDataGenerator } from './testDataGenerator';
import { SellStrategyTester } from './sellStrategyTester';
import { SystemMonitor } from './systemMonitor';
import { configManager } from '../src/main/infrastructure/config';

/**
 * 端到端测试套件
 * 集成所有测试组件，提供完整的测试流程
 */
export class E2ETestSuite {
  private dataGenerator: TestDataGenerator;
  private strategyTester: SellStrategyTester;
  private systemMonitor: SystemMonitor;
  private testResults: TestResult[] = [];

  constructor() {
    this.dataGenerator = new TestDataGenerator();
    this.strategyTester = new SellStrategyTester();
    this.systemMonitor = new SystemMonitor();
  }

  /**
   * 运行完整的测试套件
   */
  async runFullTestSuite(): Promise<void> {
    console.log('🚀 开始完整的端到端测试套件...\n');
    
    const testStartTime = Date.now();
    
    try {
      // 阶段1: 系统健康检查
      await this.runSystemHealthCheck();
      
      // 阶段2: 初始化测试环境
      await this.setupTestEnvironment();
      
      // 阶段3: 生成测试数据
      await this.generateTestData();
      
      // 阶段4: 测试跟单功能（模拟）
      await this.testTradingFollowUp();
      
      // 阶段5: 测试卖出策略
      await this.testSellStrategies();
      
      // 阶段6: 压力测试
      await this.runStressTests();
      
      // 阶段7: 生成最终报告
      await this.generateFinalReport(testStartTime);
      
    } catch (error: any) {
      console.error('❌ 测试套件执行失败:', error.message);
      this.addTestResult('E2E_TEST_SUITE', false, `执行失败: ${error.message}`);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 阶段1: 系统健康检查
   */
  async runSystemHealthCheck(): Promise<void> {
    console.log('🏥 阶段1: 系统健康检查');
    console.log('-'.repeat(60));
    
    try {
      await this.systemMonitor.initialize();
      await this.systemMonitor.performHealthCheck();
      
      this.addTestResult('SYSTEM_HEALTH_CHECK', true, '系统健康检查通过');
      console.log('✅ 系统健康检查完成\n');
    } catch (error: any) {
      this.addTestResult('SYSTEM_HEALTH_CHECK', false, `健康检查失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 阶段2: 初始化测试环境
   */
  async setupTestEnvironment(): Promise<void> {
    console.log('⚙️ 阶段2: 初始化测试环境');
    console.log('-'.repeat(60));
    
    try {
      await this.dataGenerator.initialize();
      await this.strategyTester.initialize();
      
      // 设置测试配置
      await this.configureTestSettings();
      
      this.addTestResult('TEST_ENVIRONMENT_SETUP', true, '测试环境初始化成功');
      console.log('✅ 测试环境初始化完成\n');
    } catch (error: any) {
      this.addTestResult('TEST_ENVIRONMENT_SETUP', false, `环境初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 配置测试设置
   */
  async configureTestSettings(): Promise<void> {
    console.log('📝 配置测试设置...');
    
    // 设置测试用的 Solana 配置
    configManager.setNested('solana.followAmount', 0.001); // 降低测试金额
    configManager.setNested('queue.consumerCount', 1); // 减少消费者数量
    configManager.setNested('queue.maxProcesses', 1); // 减少进程数量
    
    // 启用卖出策略并设置测试参数
    configManager.setNested('sellStrategy.enabled', true);
    
    console.log('   ✓ Solana 配置已设置');
    console.log('   ✓ 队列配置已优化');
    console.log('   ✓ 卖出策略已启用');
  }

  /**
   * 阶段3: 生成测试数据
   */
  async generateTestData(): Promise<void> {
    console.log('📊 阶段3: 生成测试数据');
    console.log('-'.repeat(60));
    
    try {
      // 清理旧数据
      await this.dataGenerator.cleanup();
      
      // 创建测试场景
      await this.dataGenerator.createTestScenarios();
      
      // 显示创建的持仓
      await this.dataGenerator.showCurrentPositions();
      
      this.addTestResult('TEST_DATA_GENERATION', true, '测试数据生成成功');
      console.log('✅ 测试数据生成完成\n');
    } catch (error: any) {
      this.addTestResult('TEST_DATA_GENERATION', false, `数据生成失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 阶段4: 测试跟单功能（模拟）
   */
  async testTradingFollowUp(): Promise<void> {
    console.log('📈 阶段4: 测试跟单功能');
    console.log('-'.repeat(60));
    
    try {
      // 模拟几个跟单交易
      await this.simulateFollowUpTrades();
      
      this.addTestResult('TRADING_FOLLOW_UP', true, '跟单功能测试通过');
      console.log('✅ 跟单功能测试完成\n');
    } catch (error: any) {
      this.addTestResult('TRADING_FOLLOW_UP', false, `跟单测试失败: ${error.message}`);
      console.error('⚠️ 跟单功能测试失败，继续其他测试...\n');
    }
  }

  /**
   * 模拟跟单交易
   */
  async simulateFollowUpTrades(): Promise<void> {
    console.log('🎭 模拟跟单交易...');
    
    // 模拟创建新的买入持仓
    const scenarios = [
      { symbol: 'FOLLOW_TOKEN_1', buyPrice: 0.0005, amount: 2000 },
      { symbol: 'FOLLOW_TOKEN_2', buyPrice: 0.002, amount: 500 },
      { symbol: 'FOLLOW_TOKEN_3', buyPrice: 0.0008, amount: 1250 }
    ];
    
    for (const scenario of scenarios) {
      await this.dataGenerator.createTestPosition(
        scenario.symbol,
        scenario.buyPrice,
        scenario.amount,
        scenario.buyPrice, // 当前价格等于买入价格
        0 // 刚刚买入
      );
      
      console.log(`   ✓ 模拟跟单: ${scenario.symbol}`);
    }
  }

  /**
   * 阶段5: 测试卖出策略
   */
  async testSellStrategies(): Promise<void> {
    console.log('💰 阶段5: 测试卖出策略');
    console.log('-'.repeat(60));
    
    try {
      // 设置策略测试配置
      await this.strategyTester.setupTestConfig();
      
      // 测试所有持仓的策略
      await this.strategyTester.testAllPositions();
      
      // 模拟价格波动场景
      await this.strategyTester.simulatePriceScenarios();
      
      this.addTestResult('SELL_STRATEGY_TEST', true, '卖出策略测试通过');
      console.log('✅ 卖出策略测试完成\n');
    } catch (error: any) {
      this.addTestResult('SELL_STRATEGY_TEST', false, `策略测试失败: ${error.message}`);
      console.error('⚠️ 卖出策略测试失败，继续其他测试...\n');
    }
  }

  /**
   * 阶段6: 压力测试
   */
  async runStressTests(): Promise<void> {
    console.log('⚡ 阶段6: 压力测试');
    console.log('-'.repeat(60));
    
    try {
      // 执行价格波动压力测试
      await this.strategyTester.stressTest();
      
      // 执行数据库压力测试
      await this.runDatabaseStressTest();
      
      this.addTestResult('STRESS_TEST', true, '压力测试通过');
      console.log('✅ 压力测试完成\n');
    } catch (error: any) {
      this.addTestResult('STRESS_TEST', false, `压力测试失败: ${error.message}`);
      console.error('⚠️ 压力测试失败，继续生成报告...\n');
    }
  }

  /**
   * 数据库压力测试
   */
  async runDatabaseStressTest(): Promise<void> {
    console.log('💾 执行数据库压力测试...');
    
    const iterations = 50;
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      // 模拟大量数据读写
      await this.dataGenerator.simulatePriceMovement();
      
      if (i % 10 === 0) {
        console.log(`   进度: ${i}/${iterations}`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`   ✓ 完成 ${iterations} 次数据库操作，耗时: ${duration}ms`);
  }

  /**
   * 阶段7: 生成最终报告
   */
  async generateFinalReport(testStartTime: number): Promise<void> {
    console.log('📄 阶段7: 生成最终报告');
    console.log('-'.repeat(60));
    
    const totalDuration = Date.now() - testStartTime;
    
    // 生成策略测试报告
    await this.strategyTester.generateTestReport();
    
    // 显示最终持仓状态
    await this.dataGenerator.showCurrentPositions();
    
    // 生成综合测试报告
    this.generateComprehensiveReport(totalDuration);
    
    console.log('✅ 测试报告生成完成\n');
  }

  /**
   * 生成综合测试报告
   */
  generateComprehensiveReport(totalDuration: number): void {
    console.log('\n📊 综合测试报告:');
    console.log('=' .repeat(80));
    
    const passedTests = this.testResults.filter(r => r.passed).length;
    const totalTests = this.testResults.length;
    const successRate = (passedTests / totalTests * 100).toFixed(2);
    
    console.log(`🎯 测试概览:`);
    console.log(`   总测试数: ${totalTests}`);
    console.log(`   通过测试: ${passedTests}`);
    console.log(`   失败测试: ${totalTests - passedTests}`);
    console.log(`   成功率: ${successRate}%`);
    console.log(`   总耗时: ${(totalDuration / 1000).toFixed(2)} 秒`);
    
    console.log('\n📋 详细结果:');
    this.testResults.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      const time = new Date(result.timestamp).toLocaleTimeString();
      console.log(`${icon} [${time}] ${result.testName}: ${result.message}`);
    });
    
    console.log('\n🎯 测试建议:');
    if (passedTests === totalTests) {
      console.log('   🟢 所有测试通过！系统运行正常');
      console.log('   🔥 可以开始生产环境部署');
    } else {
      console.log('   🟡 部分测试失败，请检查以下问题:');
      this.testResults.filter(r => !r.passed).forEach(result => {
        console.log(`     • ${result.testName}: ${result.message}`);
      });
    }
    
    console.log('\n📈 性能指标:');
    console.log(`   平均每个测试耗时: ${(totalDuration / totalTests / 1000).toFixed(2)} 秒`);
    console.log(`   系统响应速度: ${totalDuration < 60000 ? '良好' : '需要优化'}`);
    
    console.log('=' .repeat(80));
  }

  /**
   * 添加测试结果
   */
  addTestResult(testName: string, passed: boolean, message: string): void {
    this.testResults.push({
      testName,
      passed,
      message,
      timestamp: Date.now()
    });
  }

  /**
   * 清理测试环境
   */
  async cleanup(): Promise<void> {
    console.log('🧹 清理测试环境...');
    
    try {
      await this.dataGenerator.close();
      await this.strategyTester.close();
      await this.systemMonitor.close();
      
      console.log('✅ 测试环境清理完成');
    } catch (error: any) {
      console.error('⚠️ 清理过程中出现错误:', error.message);
    }
  }

  /**
   * 运行快速测试（仅核心功能）
   */
  async runQuickTest(): Promise<void> {
    console.log('⚡ 开始快速测试...\n');
    
    try {
      // 只运行核心测试
      await this.runSystemHealthCheck();
      await this.setupTestEnvironment();
      await this.generateTestData();
      await this.testSellStrategies();
      
      console.log('✅ 快速测试完成！');
    } catch (error: any) {
      console.error('❌ 快速测试失败:', error.message);
    } finally {
      await this.cleanup();
    }
  }
}

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  timestamp: number;
}

// 主执行函数
async function runE2ETests() {
  const testSuite = new E2ETestSuite();
  
  // 根据命令行参数决定运行模式
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--quick') || args.includes('-q')) {
      await testSuite.runQuickTest();
    } else {
      await testSuite.runFullTestSuite();
    }
  } catch (error) {
    console.error('❌ 测试套件执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runE2ETests();
} 