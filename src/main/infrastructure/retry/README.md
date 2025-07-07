# 重试基础设施

这是一个通用的重试机制基础设施，可以为任何异步操作提供可靠的重试策略。

## 特性

- **指数退避**：自动计算重试延迟，避免系统过载
- **智能错误分类**：自动识别可重试和不可重试的错误
- **多种预设配置**：针对不同场景的优化配置
- **可选抖动**：避免雷群效应
- **详细统计**：跟踪重试使用情况和性能
- **上下文感知**：为不同操作提供独立的统计

## 快速开始

### 基本使用

```typescript
import { withRetry } from '../infrastructure/retry';

// 使用默认配置
const result = await withRetry(async () => {
  // 可能失败的操作
  return await someAsyncOperation();
});
```

### 使用预设配置

```typescript
import { withRetry, RETRY_CONFIGS } from '../infrastructure/retry';

// 网络请求重试
const data = await withRetry(async () => {
  return await fetch('https://api.example.com/data');
}, RETRY_CONFIGS.NETWORK, 'API调用');

// 数据库操作重试
const saved = await withRetry(async () => {
  return await database.save(record);
}, RETRY_CONFIGS.DATABASE, '数据库保存');
```

### 自定义配置

```typescript
import { withRetry, type RetryConfig } from '../infrastructure/retry';

const customConfig: RetryConfig = {
  maxRetries: 5,
  baseDelay: 2000,
  maxDelay: 20000,
  backoffFactor: 2.5,
  enableJitter: true
};

const result = await withRetry(async () => {
  return await customOperation();
}, customConfig, '自定义操作');
```

## 预设配置

### RETRY_CONFIGS.DEFAULT
- 最大重试次数：3
- 基础延迟：1000ms
- 最大延迟：10000ms
- 退避因子：2
- 启用抖动：是
- 适用于：通用操作

### RETRY_CONFIGS.NETWORK
- 最大重试次数：5
- 基础延迟：500ms
- 最大延迟：5000ms
- 退避因子：1.5
- 启用抖动：是
- 适用于：网络请求、API调用

### RETRY_CONFIGS.DATABASE
- 最大重试次数：3
- 基础延迟：100ms
- 最大延迟：2000ms
- 退避因子：2
- 启用抖动：否
- 适用于：数据库操作

### RETRY_CONFIGS.FAST
- 最大重试次数：2
- 基础延迟：200ms
- 最大延迟：1000ms
- 退避因子：2
- 启用抖动：是
- 适用于：快速操作

### RETRY_CONFIGS.PERSISTENT
- 最大重试次数：10
- 基础延迟：2000ms
- 最大延迟：30000ms
- 退避因子：1.5
- 启用抖动：是
- 适用于：长时间运行的操作

## 错误分类

系统会自动识别以下可重试的错误：

### 网络错误
- 连接超时
- 连接重置
- DNS解析失败
- 网络不可达

### HTTP错误
- 5xx 服务器错误
- 429 请求过多
- 502 网关错误
- 503 服务不可用
- 504 网关超时

### RPC错误
- 速率限制
- 临时不可用
- 内部服务器错误

## 统计信息

### 获取统计信息

```typescript
import { retryManager } from '../infrastructure/retry';

// 获取所有统计信息
const allStats = retryManager.getStats();

// 获取特定上下文的统计信息
const apiStats = retryManager.getStats('API调用');
```

### 通过前端API获取

```typescript
// 获取所有重试统计
const allStats = await window.electronAPI.getRetryStats();

// 获取特定上下文的统计
const apiStats = await window.electronAPI.getRetryStats('API调用');

// 清除统计信息
await window.electronAPI.clearRetryStats('API调用');
```

### 统计信息字段

```typescript
interface RetryStats {
  totalAttempts: number;      // 总尝试次数
  successfulRetries: number;  // 成功重试次数
  failedRetries: number;      // 失败重试次数
  averageAttempts: number;    // 平均尝试次数
  totalDelay: number;         // 总延迟时间(ms)
}
```

## 最佳实践

1. **选择合适的配置**：根据操作类型选择合适的预设配置
2. **提供上下文**：为不同的操作提供描述性的上下文名称
3. **监控统计**：定期查看重试统计，优化配置
4. **避免过度重试**：对于明确不可重试的错误，确保系统能正确识别
5. **测试重试逻辑**：在测试中验证重试行为

## 在已有代码中应用

### 替换现有重试逻辑

```typescript
// 旧代码
try {
  return await operation();
} catch (error) {
  // 手动重试逻辑
  for (let i = 0; i < 3; i++) {
    try {
      await delay(1000 * i);
      return await operation();
    } catch (retryError) {
      if (i === 2) throw retryError;
    }
  }
}

// 新代码
import { withRetry, RETRY_CONFIGS } from '../infrastructure/retry';

return await withRetry(async () => {
  return await operation();
}, RETRY_CONFIGS.DEFAULT, '操作名称');
```

### 集成到现有服务

```typescript
// 在服务类中使用
class ApiService {
  async getData(id: string) {
    return await withRetry(async () => {
      const response = await fetch(`/api/data/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    }, RETRY_CONFIGS.NETWORK, `getData(${id})`);
  }
}
```

## 日志记录

重试基础设施会自动记录以下信息：

- 重试尝试和失败信息（警告级别）
- 重试成功信息（信息级别）
- 最终失败信息（错误级别）
- 不可重试错误信息（错误级别）

日志会包含上下文信息，便于调试和监控。 