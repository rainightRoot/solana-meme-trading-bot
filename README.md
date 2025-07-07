# Solana 区块链交易机器人

> 一个基于 Electron + TypeScript + React 的 Solana 区块链实时监控和自动跟单交易工具

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-18.x-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/electron-37.0.0-blue.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-4.5.4-blue.svg)](https://www.typescriptlang.org/)

## 📋 目录

- [项目简介](#项目简介)
- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [架构设计](#架构设计)
- [关键逻辑](#关键逻辑)
- [配置说明](#配置说明)
- [测试](#测试)
- [部署](#部署)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)

## 🚀 项目简介

这是一个专为 Solana 区块链设计的智能交易机器人，具备实时监控、自动跟单、智能卖出等功能。项目采用现代化的多进程架构，支持高并发处理，提供友好的桌面应用界面。

### 主要特性

- 🔍 **实时监控**：监控指定钱包的 Solana 区块链交易
- 🤖 **自动跟单**：智能识别交易机会并自动执行跟单
- 💰 **智能卖出**：多层级卖出策略，最大化收益
- 🏗️ **多进程架构**：充分利用多核 CPU，提升处理性能
- 📊 **实时监控面板**：直观的性能监控和系统状态显示
- 🔧 **灵活配置**：支持多种配置选项，适应不同交易策略

## 🎯 核心功能

### 1. 区块链监控
- 实时监听 Solana 区块链新区块
- 解析区块中的交易数据
- 识别目标钱包的交易行为

### 2. 智能跟单
- 自动识别买入机会
- 使用 Jupiter 聚合器获取最优价格
- 支持滑点控制和交易确认

### 3. 多层卖出策略
- **初次卖出**：盈利1.5倍或亏损50%时卖出50%
- **二次卖出**：盈利2倍或亏损70%时卖出60%
- **三次卖出**：盈利3倍或亏损80%时全部卖出

### 4. 风险控制
- 支持止损和止盈设置
- 回撤保护机制
- 交易金额限制

## 🛠️ 技术栈

### 前端技术
- **React 19.1.0** - 现代化 UI 框架
- **TypeScript 4.5.4** - 类型安全的 JavaScript
- **Ant Design 5.26.3** - 企业级 UI 组件库
- **Vite 5.4.19** - 快速构建工具

### 后端技术
- **Electron 37.0.0** - 跨平台桌面应用框架
- **Node.js** - JavaScript 运行时
- **Solana Web3.js 1.98.2** - Solana 区块链交互库
- **Jupiter API 6.0.44** - 去中心化交易聚合器

### 数据存储
- **SQLite3 5.1.7** - 轻量级关系型数据库
- **Electron Store 8** - 配置文件存储

### 开发工具
- **Electron Forge 7.8.1** - 应用打包和分发
- **Vitest 3.2.4** - 现代化测试框架
- **ESLint 8.57.1** - 代码质量检查

## 🚀 快速开始

### 环境要求

- Node.js 22.x 或更高版本
- npm 包管理器
- Git

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/rainightRoot/solana-meme-trading-bot.git
   cd solana-meme-trading-bot
   ```

2. **安装依赖**
   ```bash
   npm install
   ```


3. **启动开发环境**
   ```bash
   npm run start
   ```

### 基本使用

1. **配置钱包**
   - 在设置面板中导入你的 Solana 钱包私钥
   - 设置要监控的目标钱包地址
   - 设置Solana RPC(公共rpc会有限制，建议使用付费rpc，或者自己搭建)

2. **配置交易参数**
   - 设置跟单金额
   - 配置滑点容忍度
   - 设置卖出策略参数

3. **启动监控**
   - 点击"开始监控"按钮
   - 系统将自动开始监控区块链交易

## 🏗️ 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Solana 区块链交易机器人                      │
├─────────────────────────────────────────────────────────────┤
│  🖥️  渲染进程 (Renderer Process)                             │
│  ├── React UI 界面                                           │
│  ├── 实时监控面板                                             │
│  └── 配置管理界面                                             │
├─────────────────────────────────────────────────────────────┤
│  ⚙️  主进程 (Main Process)                                   │
│  ├── 📱 应用层 (app/)                                        │
│  │   ├── IPC 通信处理                                         │
│  │   └── 应用生命周期管理                                       │
│  ├── 🎯 业务模块层 (modules/)                                │
│  │   ├── 交易模块 (trading/)                                 │
│  │   ├── 监控模块 (monitoring/)                              │
│  │   ├── 队列模块 (queue/)                                   │
│  │   └── 进程模块 (process/)                                 │
│  ├── 🔧 基础设施层 (infrastructure/)                          │
│  │   ├── 配置管理 (config/)                                  │
│  │   ├── 网络层 (network/)                                   │
│  │   └── 日志系统 (logging/)                                 │
│  └── 🔗 共享层 (shared/)                                     │
├─────────────────────────────────────────────────────────────┤
│  🔄 子进程池 (Child Processes)                               │
│  ├── 进程1: 区块链数据处理                                     │
│  ├── 进程2: 交易分析处理                                       │
│  └── 进程N: 动态扩展...                                       │
└─────────────────────────────────────────────────────────────┘
```

### 分层架构详解

#### 1. 应用层 (app/)
**职责**：应用程序入口和顶层逻辑
- **ipcHandlers.ts** - 处理渲染进程与主进程的通信
- **update.ts** - 应用程序自动更新逻辑

#### 2. 业务模块层 (modules/)
**职责**：核心业务逻辑实现

##### 交易模块 (trading/)
- **tradeExecutor.ts** - 交易执行器，负责买入卖出操作
- **walletManager.ts** - 钱包管理，处理私钥和签名

##### 监控模块 (monitoring/)
- **producer.ts** - 区块生产者，监听 Solana 区块链
- **transactionProcessor.ts** - 交易处理器，分析交易数据

##### 队列模块 (queue/)
- **persistentQueue.ts** - 持久化队列，保证数据不丢失
- **queueProxy.ts** - 队列代理，统一队列访问接口
- **ConsumerManager.ts** - 消费者管理器，管理多个消费者

##### 进程模块 (process/)
- **processManager.ts** - 进程管理器，管理子进程池

#### 3. 基础设施层 (infrastructure/)
**职责**：提供基础服务支持

##### 配置管理 (config/)
- **configManager.ts** - 统一配置管理

##### 网络层 (network/)
- **fetch.ts** - 网络请求工具
- **price.ts** - 价格查询服务

##### 日志系统 (logging/)
- **logger.ts** - 统一日志管理

#### 4. 共享层 (shared/)
**职责**：公共类型定义和工具函数


### 数据流架构

```
Solana 区块链
    ↓
producer.ts (槽位监听)
    ↓
queueProxy (队列管理)
    ↓
ConsumerManager (消费者管理)
    ↓
transactionProcessor (交易处理器)
    ↓
ProcessManager (进程管理器)
    ↓
子进程池 (并行处理)
    ↓
区块链数据处理 → 交易机会识别
    ↓
返回主进程
    ↓
tradeExecutor (跟单执行)
    ↓
walletManager (钱包操作)
    ↓
Jupiter API (交易执行)
    ↓
交易确认
```

## 🔧 关键逻辑

### 1. 区块链监控流程

#### 生产者监听 (producer.ts)
```typescript
// 监听 Solana 区块链新槽位
async function monitorSlots() {
  connection.onSlotChange((slotInfo) => {
    // 将新槽位信息放入队列
    queueProxy.enqueue('slots', {
      slot: slotInfo.slot,
      timestamp: Date.now()
    });
  });
}
```

#### 消费者处理 (ConsumerManager.ts)
```typescript
// 事件驱动的消费者架构
async function processMessage(message: any) {
  if (message.type === 'slot') {
    // 提交到子进程处理
    const result = await processManager.submitTask('processSlot', {
      slot: message.slot
    });
    
    // 处理返回结果
    if (result.tradingOpportunities.length > 0) {
      await handleTradingOpportunities(result.tradingOpportunities);
    }
  }
}
```

### 2. 多进程处理架构

#### 进程管理器 (processManager.ts)
```typescript
class ProcessManager {
  // 任务分发到最空闲的进程
  async submitTask(taskType: string, taskData: any): Promise<ProcessResult> {
    const availableProcess = this.getAvailableProcess();
    
    return new Promise((resolve, reject) => {
      const taskId = this.generateTaskId();
      
      // 设置超时处理
      const timeout = setTimeout(() => {
        reject(new Error('任务处理超时'));
      }, this.processTimeout);
      
      // 发送任务到子进程
      availableProcess.process.send({
        id: taskId,
        type: taskType,
        data: taskData
      });
      
      // 等待子进程返回结果
      this.pendingTasks.set(taskId, { resolve, reject, timeout });
    });
  }
}


### 3. 智能交易执行

#### 跟单逻辑 (tradeExecutor.ts)
```typescript
async function followUpBuy(tokenMint: string, solAmount: number) {
  try {
    // 1. 获取 Jupiter 报价
    const quote = await getQuote(
      SOL_MINT,           // 输入代币 (SOL)
      new PublicKey(tokenMint), // 输出代币
      solAmount * LAMPORTS_PER_SOL,
      configManager.getNested('solana.slippageBps', 50)
    );
    
    if (!quote) {
      throw new Error('无法获取有效报价');
    }
    
    // 2. 执行交易
    const txSignature = await executeSwap(quote);
    
    if (txSignature) {
      // 3. 记录交易到数据库
      await recordTrade({
        signature: txSignature,
        tokenMint,
        solAmount,
        type: 'buy',
        timestamp: Date.now()
      });
      
      logger.info(`跟单买入成功: ${txSignature}`);
      return txSignature;
    }
  } catch (error) {
    logger.error('跟单买入失败:', error);
    throw error;
  }
}
```

#### 智能卖出策略
```typescript
async function checkSellConditions(position: Position) {
  const currentPrice = await getTokenPrice(position.tokenMint);
  const profitRatio = currentPrice / position.buyPrice;
  const timeSinceHold = Date.now() - position.createdAt;
  
  // 获取当前策略配置
  const strategy = getSellStrategy(position.sellStage);
  
  // 检查卖出条件
  const shouldSell = 
    profitRatio >= strategy.profitRatio ||  // 达到盈利目标
    profitRatio <= strategy.lossRatio ||    // 达到止损线
    (profitRatio <= strategy.pullbackRatio && // 回撤保护
     timeSinceHold >= strategy.pullbackTimeMinutes * 60000);
  
  if (shouldSell) {
    await executeSell(position, strategy.sellRatio);
  }
}
```

### 4. 性能优化机制

#### 事件驱动消费者
```typescript
// 避免 CPU 忙等待的事件驱动机制
async function waitForNewMessage(state: ConsumerState): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(); // 5秒超时
    }, 5000);
    
    // 监听队列新消息事件
    queueProxy.once('newMessage', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
```

#### 批量磁盘持久化
```typescript
class PersistentQueue {
  private markDirtyAndSchedulePersist() {
    this.isDirty = true;
    this.operationCount++;
    
    // 达到批处理大小时立即持久化
    if (this.operationCount >= this.MAX_BATCH_SIZE) {
      this.forcePersist();
      return;
    }
    
    // 否则延迟1秒批量持久化
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.forcePersist();
    }, this.PERSIST_DELAY);
  }
}


## ⚙️ 配置说明

### 主要配置文件

项目使用 `electron-store` 进行配置管理，配置文件自动保存在用户目录下。

#### 基础配置
```typescript
{
  "solana": {
    "rpcUrl": "https://api.mainnet-beta.solana.com",
    "commitment": "confirmed",
    "timeout": 30000,
    "monitoredWallets": [],  // 监控的钱包地址
    "privateKey": "",        // 交易钱包私钥
    "followAmount": 0.01,    // 跟单金额 (SOL)
    "slippageBps": 50        // 滑点 (0.5%)
  }
}
```

#### 队列配置
```typescript
{
  "queue": {
    "maxSize": 1000,         // 队列最大大小
    "consumerCount": 3,      // 消费者数量
    "retryAttempts": 3,      // 重试次数
    "maxProcesses": 2,       // 最大子进程数
    "processTimeout": 90000  // 进程超时时间
  }
}
```

#### 卖出策略配置
```typescript
{
  "sellStrategy": {
    "enabled": true,
    "strategies": {
      "initial": {
        "enabled": true,
        "conditions": {
          "profitRatio": 1.5,      // 盈利1.5倍
          "lossRatio": 0.5,        // 亏损50%
          "pullbackRatio": 0.8,    // 回撤到80%
          "pullbackTimeMinutes": 10 // 回撤时间10分钟
        },
        "sellRatio": 0.5           // 卖出50%
      },
      "second": {
        "enabled": true,
        "conditions": {
          "profitRatio": 2.0,      // 盈利2倍
          "lossRatio": 0.3,        // 亏损70%
          "pullbackRatio": 0.7,    // 回撤到70%
          "pullbackTimeMinutes": 15
        },
        "sellRatio": 0.6           // 卖出60%
      },
      "third": {
        "enabled": true,
        "conditions": {
          "profitRatio": 3.0,      // 盈利3倍
          "lossRatio": 0.2,        // 亏损80%
          "pullbackRatio": 0.6,    // 回撤到60%
          "pullbackTimeMinutes": 20
        },
        "sellRatio": 1.0           // 全部卖出
      }
    }
  }
}
```



## 🧪 测试

### 测试命令

```bash
# 运行所有测试
npm run test

# 快速测试 (核心功能)
npm run test:quick

# 完整测试套件
npm run test:full

# 系统健康检查
npm run test:health

# 生成测试数据
npm run test:data

# 测试卖出策略
npm run test:strategy

# 系统监控测试
npm run test:monitor
```

### 测试覆盖范围

#### 1. 单元测试
- 配置管理器测试
- 队列操作测试
- 交易执行器测试
- 钱包管理器测试

#### 2. 集成测试
- 生产者-消费者系统测试
- 多进程通信测试
- 数据库操作测试

#### 3. 端到端测试
- 完整交易流程测试
- 卖出策略测试
- 系统健康检查

#### 4. 性能测试
- 高并发处理测试
- 内存泄漏检测
- CPU 使用率测试

### 测试示例

```typescript
// 系统健康检查示例
describe('系统健康检查', () => {
  it('应该通过所有健康检查项', async () => {
    const healthCheck = new SystemMonitor();
    const result = await healthCheck.runHealthCheck();
    
    expect(result.database).toBe(true);
    expect(result.blockchain).toBe(true);
    expect(result.wallet).toBe(true);
    expect(result.overall).toBe(true);
  });
});
```

## 📦 部署

### 开发环境部署

```bash
# 启动开发服务器
npm run start

# 构建开发版本
npm run build
```

### 生产环境部署

```bash
# 构建生产版本
npm run build

# 打包应用程序
npm run package

# 创建安装包
npm run make

# 发布到 GitHub Releases
npm run publish
```

### 支持的平台

- **Windows** - `.exe` 安装包
- **macOS** - `.dmg` 和 `.zip` 格式
- **Linux** - `.deb` 和 `.rpm` 包



## 🔧 常见问题

### Q1: 应用启动失败，提示"模块未找到"
**A**: 确保已正确安装所有依赖：
```bash
rm -rf node_modules
npm install
```

### Q2: 区块链连接失败
**A**: 检查网络连接和 RPC 地址配置：
```bash
# 测试 RPC 连接
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}' \
  https://api.mainnet-beta.solana.com
```

### Q3: 交易执行失败
**A**: 检查以下几点：
- 钱包是否有足够的 SOL 余额
- 私钥是否正确
- 滑点设置是否合理
- 网络是否稳定

### Q4: 性能问题，CPU 使用率过高
**A**: 调整以下配置：
```json
{
  "queue": {
    "consumerCount": 2,    // 减少消费者数量
    "maxProcesses": 1      // 减少子进程数量
  }
}
```

### Q5: 数据库错误
**A**: 删除并重新创建数据库：
```bash
# 删除数据库文件
rm -rf ~/Library/Application\ Support/solana-meme-trading-bot/
# 重新启动应用
npm run start
```

## 🤝 贡献指南

### 开发流程

1. **Fork 项目**
   ```bash
   git clone https://github.com/rainightRoot/solana-meme-trading-bot.git
   cd solana-meme-trading-bot
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **开发和测试**
   ```bash
   npm run start    # 启动开发环境
   npm run test     # 运行测试
   npm run lint     # 代码检查
   ```

4. **提交代码**
   ```bash
   git add .
   git commit -m "feat: 添加新功能"
   git push origin feature/your-feature-name
   ```

5. **创建 Pull Request**

### 代码规范

- 使用 TypeScript 编写代码
- 遵循 ESLint 配置
- 编写单元测试
- 添加适当的注释
- 遵循 Git 提交规范

### 提交规范

```bash
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建过程或辅助工具的变动
```

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系我们

- **项目主页**: https://github.com/rainightRoot/solana-meme-trading-bot
- **问题反馈**: https://github.com/rainightRoot/solana-meme-trading-bot/issues
- **X**: [@Rainight](https://x.com/0xrainight?from=tool) 

## 🙏 致谢

感谢以下开源项目和服务：

- [Solana](https://solana.com/) - 高性能区块链平台
- [Jupiter](https://jup.ag/) - 去中心化交易聚合器
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://reactjs.org/) - 用户界面库
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的 JavaScript

---

<div align="center">
  <p>⭐ 如果这个项目对你有帮助，请给它一个星标！</p>
  <p>Made with ❤️ by <a href="https://x.com/0xrainight?from=tool" target="_blank">@Rainight</a></p>
</div> 