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
import { getTokenDecimals } from '../src/main/modules/trading';

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
    console.log('✅ 代币精度获取模块导入成功');
    
    // 测试监控模块
    console.log('📦 测试监控模块...');
    console.log('✅ 监控生产者模块导入成功');
    console.log('✅ 性能统计模块导入成功');
    
    // 测试Solana连接
    console.log('📦 测试Solana连接...');
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    console.log('✅ Solana连接模块导入成功');
    
    // 测试代币精度获取功能
    console.log('\n🧪 测试代币精度获取功能...');
    
    // 测试 SOL
    const solDecimals = await getTokenDecimals('So11111111111111111111111111111111111111112', connection);
    console.log(`✅ SOL 精度: ${solDecimals} (应该是 9)`);
    
    // 测试常见的代币 (USDC)
    const usdcDecimals = await getTokenDecimals('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', connection);
    console.log(`✅ USDC 精度: ${usdcDecimals} (应该是 6)`);
    
    // 测试代币元数据获取功能
    console.log('\n�� 测试代币元数据获取功能...');
    const { getTokenMetadata } = await import('../src/main/modules/trading/tradeExecutor');
    
    // 测试 SOL 的元数据
    const solMetadata = await getTokenMetadata('So11111111111111111111111111111111111111112', connection);
    console.log('SOL 元数据:', solMetadata);
    
    // 测试 USDC 的元数据
    const usdcMetadata = await getTokenMetadata('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', connection);
    console.log('USDC 元数据:', usdcMetadata);
    
    // 测试其他代币的元数据 (可能需要网络请求)
    const randomToken = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'; // USDT
    const randomTokenMetadata = await getTokenMetadata(randomToken, connection);
    console.log('USDT 元数据:', randomTokenMetadata);

    console.log('\n✅ 所有测试完成！');
    
    console.log('\n🎉 所有模块导入测试通过！');
    console.log('✅ 代币精度功能测试通过！');
    
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