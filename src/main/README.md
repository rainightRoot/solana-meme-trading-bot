# 主进程模块架构重构

## 📁 新的目录结构

```
src/main/
├── app/                         # 应用层
│   ├── ipcHandlers.ts          # IPC 通信处理
│   ├── update.ts               # 应用更新逻辑
│   └── index.ts                # 应用层统一导出
├── modules/                     # 业务模块层
│   ├── trading/                # 交易模块
│   │   ├── tradeExecutor.ts    # 交易执行器
│   │   ├── walletManager.ts    # 钱包管理
│   │   └── index.ts            # 交易模块导出
│   ├── monitoring/             # 监控模块
│   │   ├── producer.ts         # 区块生产者
│   │   ├── transactionProcessor.ts # 交易处理器
│   │   └── index.ts            # 监控模块导出
│   ├── queue/                  # 队列模块
│   │   ├── persistentQueue.ts  # 持久化队列
│   │   ├── queueProxy.ts       # 队列代理
│   │   ├── ConsumerManager.ts  # 消费者管理
│   │   └── index.ts            # 队列模块导出
│   ├── process/                # 进程模块
│   │   ├── processManager.ts   # 进程管理器
│   │   ├── transactionProcess.ts # 子进程处理逻辑
│   │   └── index.ts            # 进程模块导出
│   └── index.ts                # 业务模块统一导出
├── infrastructure/             # 基础设施层
│   ├── config/                 # 配置管理
│   │   ├── configManager.ts    # 配置管理器
│   │   └── index.ts            # 配置模块导出
│   ├── network/                # 网络相关
│   │   ├── fetch.ts            # 网络请求工具
│   │   ├── price.ts            # 价格查询
│   │   └── index.ts            # 网络模块导出
│   ├── logging/                # 日志系统
│   │   ├── logger.ts           # 日志工具
│   │   └── index.ts            # 日志模块导出
│   └── index.ts                # 基础设施统一导出
└── shared/                     # 共享层
    ├── types/                  # 类型定义 (待扩展)
    ├── constants/              # 常量定义 (待扩展)
    └── utils/                  # 通用工具 (待扩展)
```

## 🎯 模块职责

### **应用层 (app/)**
- **职责**: 应用程序入口和顶层逻辑
- **包含**: IPC 处理、应用更新、程序生命周期管理

### **业务模块层 (modules/)**
- **trading**: 交易相关功能 (钱包、执行器)
- **monitoring**: 监控相关功能 (生产者、处理器)
- **queue**: 队列系统 (持久化、代理、消费者)
- **process**: 进程管理 (子进程、任务调度)

### **基础设施层 (infrastructure/)**
- **config**: 配置管理
- **network**: 网络请求和价格查询
- **logging**: 日志系统

### **共享层 (shared/)**
- **types**: 公共类型定义
- **constants**: 常量
- **utils**: 通用工具函数

## 🚀 重构优势

### **1. 清晰的分层架构**
- 按照业务功能和技术领域分组
- 降低模块间的耦合度
- 提高代码的可维护性

### **2. 统一的导入导出**
```typescript
// 重构前 - 分散的导入
import { configManager } from './core/configManager';
import { tradeExecutor } from './core/tradeExecutor';
import { ConsumerManager } from './core/ConsumerManager';

// 重构后 - 清晰的模块导入
import { configManager } from './infrastructure/config';
import { tradeExecutor } from './modules/trading';
import { ConsumerManager } from './modules/queue';
```

### **3. 更好的代码组织**
- 相关功能聚合在一起
- 便于新功能的添加和扩展
- 便于单元测试和模块测试

### **4. 符合企业级架构**
- 分层架构模式
- 领域驱动设计思想
- 便于团队协作开发

## 📝 导入路径迁移指南

### **旧路径 → 新路径**
```typescript
// 配置管理
'./core/configManager' → './infrastructure/config'

// 交易相关
'./core/tradeExecutor' → './modules/trading'
'./core/walletManager' → './modules/trading'

// 监控相关
'./core/producer' → './modules/monitoring'
'./core/transactionProcessor' → './modules/monitoring'

// 队列相关
'./core/ConsumerManager' → './modules/queue'
'./core/persistentQueue' → './modules/queue'
'./core/queueProxy' → './modules/queue'

// 进程相关
'./core/processManager' → './modules/process'
'./processes/transactionProcess' → './modules/process'

// 基础设施
'./utils/logger' → './infrastructure/logging'
'./utils/fetch' → './infrastructure/network'
'./utils/price' → './infrastructure/network'

// 应用层
'./ipcHandlers' → './app'
'./update' → './app'
```

## ⚠️ 待完成的工作

1. **修复所有文件的导入路径**
2. **更新构建配置中的路径引用**
3. **完善共享层的类型定义**
4. **添加各模块的单元测试**
5. **更新文档和注释**

这个重构使代码结构更加清晰，便于维护和扩展！ 