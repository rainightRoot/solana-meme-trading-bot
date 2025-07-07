import { Connection } from '@solana/web3.js';
import { DatabaseManager, PositionManager } from '../src/main/infrastructure/database';
import { configManager } from '../src/main/infrastructure/config';
import { walletManager } from '../src/main/modules/trading/walletManager';
import { getWatcherStatus } from '../src/main/modules/monitoring/producer';
import { getPerformanceStats } from '../src/main/modules/monitoring/transactionProcessor';

/**
 * 系统监控器
 * 检查系统各个组件的运行状态和健康度
 */
export class SystemMonitor {
  private db: DatabaseManager;
  private positionManager: PositionManager;
  private connection: Connection;

  constructor() {
    this.db = new DatabaseManager();
    this.positionManager = new PositionManager(this.db);
    this.connection = new Connection('https://api.mainnet-beta.solana.com');
  }

  /**
   * 初始化监控器
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
    console.log('✅ 系统监控器已初始化');
  }

  /**
   * 执行完整的系统健康检查
   */
  async performHealthCheck(): Promise<void> {
    console.log('🏥 开始系统健康检查...\n');

    const results = {
      database: await this.checkDatabaseHealth(),
      configuration: await this.checkConfiguration(),
      blockchain: await this.checkBlockchainConnection(),
      wallet: await this.checkWalletStatus(),
      monitoring: await this.checkMonitoringServices(),
      positions: await this.checkPositionsHealth(),
      sellStrategy: await this.checkSellStrategyConfig()
    };

    console.log('\n📋 健康检查报告:');
    console.log('=' .repeat(80));
    
    Object.entries(results).forEach(([component, status]) => {
      const icon = status.healthy ? '✅' : '❌';
      console.log(`${icon} ${component.toUpperCase()}: ${status.message}`);
      if (status.details) {
        status.details.forEach((detail: string) => {
          console.log(`   • ${detail}`);
        });
      }
    });

    const overallHealth = Object.values(results).every(result => result.healthy);
    console.log('\n' + '=' .repeat(80));
    console.log(`🎯 系统整体状态: ${overallHealth ? '健康' : '有问题'}`);
    
    if (!overallHealth) {
      console.log('⚠️  请检查上述问题并修复后重新运行');
    }
  }

  /**
   * 检查数据库健康状态
   */
  async checkDatabaseHealth(): Promise<HealthStatus> {
    try {
      // 测试数据库连接
      await this.db.get('SELECT 1 as test');
      
      // 检查表是否存在
      const tables = await this.db.all(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      
      const expectedTables = ['positions', 'trades'];
      const existingTables = tables.map((t: any) => t.name);
      const missingTables = expectedTables.filter(table => !existingTables.includes(table));
      
      if (missingTables.length > 0) {
        return {
          healthy: false,
          message: '数据库表缺失',
          details: [`缺失表: ${missingTables.join(', ')}`]
        };
      }

      // 检查数据库大小和记录数
      const positionCount = await this.db.get('SELECT COUNT(*) as count FROM positions');
      const tradeCount = await this.db.get('SELECT COUNT(*) as count FROM trades');

      return {
        healthy: true,
        message: '数据库连接正常',
        details: [
          `持仓记录: ${positionCount?.count || 0} 条`,
          `交易记录: ${tradeCount?.count || 0} 条`,
          `表结构: ${existingTables.join(', ')}`
        ]
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: '数据库连接失败',
        details: [`错误: ${error.message}`]
      };
    }
  }

  /**
   * 检查配置状态
   */
  async checkConfiguration(): Promise<HealthStatus> {
    try {
      const config = configManager.getConfig();
      const issues: string[] = [];
      const details: string[] = [];

      // 检查Solana配置
      if (!config.solana.rpcUrl) {
        issues.push('RPC URL 未配置');
      } else {
        details.push(`RPC URL: ${config.solana.rpcUrl}`);
      }

      if (!config.solana.privateKey) {
        issues.push('私钥未配置');
      } else {
        details.push('私钥: 已配置');
      }

      if (config.solana.monitoredWallets.length === 0) {
        issues.push('监控钱包未配置');
      } else {
        details.push(`监控钱包: ${config.solana.monitoredWallets.length} 个`);
      }

      details.push(`跟单金额: ${config.solana.followAmount} SOL`);
      details.push(`队列配置: ${config.queue.consumerCount} 消费者, ${config.queue.maxProcesses} 进程`);
      details.push(`卖出策略: ${config.sellStrategy.enabled ? '已启用' : '未启用'}`);

      return {
        healthy: issues.length === 0,
        message: issues.length === 0 ? '配置检查通过' : '配置存在问题',
        details: issues.length > 0 ? issues : details
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: '配置检查失败',
        details: [`错误: ${error.message}`]
      };
    }
  }

  /**
   * 检查区块链连接
   */
  async checkBlockchainConnection(): Promise<HealthStatus> {
    try {
      const startTime = Date.now();
      
      // 测试RPC连接
      const version = await this.connection.getVersion();
      const slot = await this.connection.getSlot();
      
      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        message: 'Solana RPC 连接正常',
        details: [
          `Solana 版本: ${version['solana-core']}`,
          `当前区块: ${slot}`,
          `响应时间: ${responseTime}ms`
        ]
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: 'Solana RPC 连接失败',
        details: [`错误: ${error.message}`]
      };
    }
  }

  /**
   * 检查钱包状态
   */
  async checkWalletStatus(): Promise<HealthStatus> {
    try {
      const signer = walletManager.getSigner();
      
      if (!signer) {
        return {
          healthy: false,
          message: '钱包未加载',
          details: ['请检查私钥配置']
        };
      }

      const publicKey = signer.publicKey.toString();
      const balance = await this.connection.getBalance(signer.publicKey);
      const balanceSOL = balance / 1e9;

      const details = [
        `钱包地址: ${publicKey}`,
        `SOL 余额: ${balanceSOL.toFixed(6)} SOL`
      ];

      if (balanceSOL < 0.01) {
        details.push('⚠️  余额较低，可能影响交易');
      }

      return {
        healthy: true,
        message: '钱包状态正常',
        details
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: '钱包检查失败',
        details: [`错误: ${error.message}`]
      };
    }
  }

  /**
   * 检查监控服务状态
   */
  async checkMonitoringServices(): Promise<HealthStatus> {
    try {
      const watcherStatus = getWatcherStatus();
      const performanceStats = getPerformanceStats();

      const details = [
        `监控器状态: ${watcherStatus.isRunning ? '运行中' : '已停止'}`,
        `连接状态: ${watcherStatus.connection}`,
        `最新区块: ${watcherStatus.latestSlot}`,
        `队列长度: ${watcherStatus.queueLength}`,
        `消费者状态: ${watcherStatus.consumerStatus?.activeCount || 0}/${watcherStatus.consumerStatus?.targetCount || 0}`,
        `已处理任务: ${performanceStats.totalProcessed}`,
        `错误率: ${performanceStats.errorRate}`
      ];

      const healthy = watcherStatus.isRunning && watcherStatus.connection === 'connected';

      return {
        healthy,
        message: healthy ? '监控服务运行正常' : '监控服务存在问题',
        details
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: '监控服务检查失败',
        details: [`错误: ${error.message}`]
      };
    }
  }

  /**
   * 检查持仓健康状态
   */
  async checkPositionsHealth(): Promise<HealthStatus> {
    try {
      const stats = await this.positionManager.getPositionStats();
      const openPositions = await this.positionManager.getPositions({ status: 'open' });

      // 检查异常持仓
      const issues: string[] = [];
      let abnormalPositions = 0;

      for (const position of openPositions) {
        // 检查持仓量是否为负数
        if (position.current_amount < 0) {
          abnormalPositions++;
          issues.push(`持仓 ${position.token_mint.substring(0, 8)}... 数量为负`);
        }

        // 检查价格更新时间
        const lastUpdate = new Date(position.updated_at || 0).getTime();
        const hourAgo = Date.now() - 60 * 60 * 1000;
        if (lastUpdate < hourAgo) {
          abnormalPositions++;
          issues.push(`持仓 ${position.token_mint.substring(0, 8)}... 价格数据过期`);
        }
      }

      const details = [
        `总持仓: ${stats.total_positions}`,
        `开仓持仓: ${stats.open_positions}`,
        `已平仓: ${stats.closed_positions}`,
        `总投资: ${stats.total_invested_sol.toFixed(6)} SOL`,
        `总盈亏: ${stats.total_pnl_sol.toFixed(6)} SOL`,
        `胜率: ${(stats.win_rate * 100).toFixed(2)}%`,
        ...(abnormalPositions > 0 ? [`异常持仓: ${abnormalPositions} 个`] : [])
      ];

      return {
        healthy: abnormalPositions === 0,
        message: abnormalPositions === 0 ? '持仓状态正常' : '发现异常持仓',
        details: abnormalPositions > 0 ? issues : details
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: '持仓检查失败',
        details: [`错误: ${error.message}`]
      };
    }
  }

  /**
   * 检查卖出策略配置
   */
  async checkSellStrategyConfig(): Promise<HealthStatus> {
    try {
      const config = configManager.getConfig();
      const strategy = config.sellStrategy;

      if (!strategy.enabled) {
        return {
          healthy: true,
          message: '卖出策略未启用',
          details: ['策略处于关闭状态']
        };
      }

      const issues: string[] = [];
      const details: string[] = [];

      // 检查各阶段配置
      ['initial', 'second', 'third'].forEach((phase) => {
        const phaseConfig = strategy.strategies[phase as keyof typeof strategy.strategies];
        if (phaseConfig.enabled) {
          details.push(`${phase} 阶段: 启用`);
          
          // 检查配置合理性
          if (phaseConfig.conditions.profitRatio <= 1) {
            issues.push(`${phase} 阶段获利比例配置错误`);
          }
          if (phaseConfig.conditions.lossRatio >= 1) {
            issues.push(`${phase} 阶段亏损比例配置错误`);
          }
          if (phaseConfig.sellRatio <= 0 || phaseConfig.sellRatio > 1) {
            issues.push(`${phase} 阶段卖出比例配置错误`);
          }
        } else {
          details.push(`${phase} 阶段: 禁用`);
        }
      });

      return {
        healthy: issues.length === 0,
        message: issues.length === 0 ? '卖出策略配置正常' : '卖出策略配置有问题',
        details: issues.length > 0 ? issues : details
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: '卖出策略检查失败',
        details: [`错误: ${error.message}`]
      };
    }
  }

  /**
   * 实时监控系统状态
   */
  async startRealTimeMonitoring(intervalSeconds = 30): Promise<void> {
    console.log(`🔄 开始实时监控，每 ${intervalSeconds} 秒更新一次\n`);
    console.log('按 Ctrl+C 停止监控...\n');

    let cycle = 0;
    const startRealTimeLoop = () => {
      setTimeout(async () => {
        cycle++;
        console.clear();
        console.log(`📊 实时监控 - 第 ${cycle} 轮 (${new Date().toLocaleTimeString()})`);
        console.log('=' .repeat(80));
        
        // 快速状态检查
        await this.quickStatusCheck();
        
        startRealTimeLoop();
      }, intervalSeconds * 1000);
    };

    startRealTimeLoop();
  }

  /**
   * 快速状态检查
   */
  async quickStatusCheck(): Promise<void> {
    try {
      // 数据库状态
      const positionCount = await this.db.get('SELECT COUNT(*) as count FROM positions WHERE status = "open"');
      console.log(`📊 开仓持仓: ${positionCount?.count || 0} 个`);

      // 监控服务状态
      const watcherStatus = getWatcherStatus();
      const statusIcon = watcherStatus.isRunning ? '🟢' : '🔴';
      console.log(`${statusIcon} 监控服务: ${watcherStatus.isRunning ? '运行中' : '已停止'}`);
      console.log(`📡 当前区块: ${watcherStatus.latestSlot}`);
      console.log(`📋 队列长度: ${watcherStatus.queueLength}`);

      // 性能统计
      const perfStats = getPerformanceStats();
      console.log(`⚡ 已处理: ${perfStats.totalProcessed} | 错误率: ${perfStats.errorRate}`);

      // 卖出策略状态
      const config = configManager.getConfig();
      const strategyIcon = config.sellStrategy.enabled ? '🟢' : '⚪';
      console.log(`${strategyIcon} 卖出策略: ${config.sellStrategy.enabled ? '启用' : '禁用'}`);

    } catch (error: any) {
      console.log(`❌ 状态检查失败: ${error.message}`);
    }
  }

  /**
   * 关闭监控器
   */
  async close(): Promise<void> {
    await this.db.close();
    console.log('📱 系统监控器已关闭');
  }
}

interface HealthStatus {
  healthy: boolean;
  message: string;
  details?: string[];
}

// 主执行函数
async function runSystemMonitor() {
  const monitor = new SystemMonitor();
  
  try {
    await monitor.initialize();
    
    // 根据命令行参数决定运行模式
    const args = process.argv.slice(2);
    
    if (args.includes('--realtime') || args.includes('-r')) {
      const interval = parseInt(args[args.indexOf('--interval') + 1] || '30');
      await monitor.startRealTimeMonitoring(interval);
    } else if (args.includes('--health') || args.includes('-h')) {
      // 只执行健康检查
      await monitor.performHealthCheck();
      await monitor.close();
    } else {
      // 默认模式：健康检查
      await monitor.performHealthCheck();
      await monitor.close();
    }
  } catch (error) {
    console.error('❌ 系统监控失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runSystemMonitor();
} 