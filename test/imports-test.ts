/**
 * 导入测试脚本
 * 验证所有核心模块是否可以正常导入
 */

import { Connection } from '@solana/web3.js';
import { DatabaseManager, PositionManager } from '../src/main/infrastructure/database';
import { configManager } from '../src/main/infrastructure/config';
import { appLogger } from '../src/main/infrastructure/logging';
import { walletManager } from '../src/main/modules/trading/walletManager';
import { getWatcherStatus } from '../src/main/modules/monitoring/producer';
import { getPerformanceStats } from '../src/main/modules/monitoring/transactionProcessor';

async function testImports() {
  console.log('🔍 开始导入测试...');

  try {
    // 测试基础设施模块
    console.log('📦 测试基础设施模块...');
    console.log('✅ 数据库模块导入成功');
    console.log('✅ 配置模块导入成功');
    console.log('✅ 日志模块导入成功');
    
    // 测试交易模块
    console.log('📦 测试交易模块...');
    console.log('✅ 钱包管理模块导入成功');
    
    // 测试监控模块
    console.log('📦 测试监控模块...');
    console.log('✅ 监控生产者模块导入成功');
    console.log('✅ 性能统计模块导入成功');
    
    // 测试Solana连接
    console.log('📦 测试Solana连接...');
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    console.log('✅ Solana连接模块导入成功');
    
    console.log('\n🎉 所有模块导入测试通过！');
    
  } catch (error: any) {
    console.error('❌ 导入测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testImports();
} 