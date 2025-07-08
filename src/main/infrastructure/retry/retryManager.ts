
// 重试配置接口
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  enableJitter?: boolean; // 是否启用抖动
}

// 预定义的重试配置
export const RETRY_CONFIGS = {
  // 默认配置
  DEFAULT: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    enableJitter: true
  },
  // 网络请求配置
  NETWORK: {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 5000,
    backoffFactor: 1.5,
    enableJitter: true
  },
  // 数据库操作配置
  DATABASE: {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 2000,
    backoffFactor: 2,
    enableJitter: false
  },
  // 快速重试配置
  FAST: {
    maxRetries: 2,
    baseDelay: 200,
    maxDelay: 1000,
    backoffFactor: 2,
    enableJitter: true
  },
  // 长时间重试配置
  PERSISTENT: {
    maxRetries: 10,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 1.5,
    enableJitter: true
  },
  // 交易确认重试配置
  TRANSACTION_CONFIRM: {
    maxRetries: 5,
    baseDelay: 3000,
    maxDelay: 15000,
    backoffFactor: 1.2,
    enableJitter: true
  }
} as const;

// 重试统计信息
export interface RetryStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
  totalDelay: number;
}

/**
 * 重试管理器
 */
export class RetryManager {
  private static instance: RetryManager;
  private stats = new Map<string, RetryStats>();

  private constructor() {
    // 私有构造函数，确保单例模式
  }

  static getInstance(): RetryManager {
    if (!RetryManager.instance) {
      RetryManager.instance = new RetryManager();
    }
    return RetryManager.instance;
  }

  /**
   * 通用重试函数
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = RETRY_CONFIGS.DEFAULT,
    context = 'operation'
  ): Promise<T> {
    let lastError: Error;
    let totalDelay = 0;
    
    // 初始化统计
    if (!this.stats.has(context)) {
      this.stats.set(context, {
        totalAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageAttempts: 0,
        totalDelay: 0
      });
    }
    
    const stats = this.stats.get(context)!;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      stats.totalAttempts++;
      
      try {
        const result = await fn();
        
        // 成功后更新统计
        if (attempt > 0) {
          stats.successfulRetries++;
          stats.totalDelay += totalDelay;
        }
        
        // 更新平均尝试次数
        stats.averageAttempts = stats.totalAttempts / (stats.successfulRetries + stats.failedRetries + 1);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // 如果是最后一次尝试，直接抛出错误
        if (attempt === config.maxRetries) {
          stats.failedRetries++;
          stats.totalDelay += totalDelay;
          throw lastError;
        }
        
        // 判断是否需要重试的错误类型
        if (!this.isRetryableError(error)) {
          stats.failedRetries++;
          throw lastError;
        }
        
        // 计算延迟时间（指数退避 + 可选抖动）
        const baseDelay = config.baseDelay * Math.pow(config.backoffFactor, attempt);
        let delay = Math.min(baseDelay, config.maxDelay);
        
        // 添加抖动（±25%的随机变化）
        if (config.enableJitter) {
          const jitter = delay * 0.25 * (Math.random() * 2 - 1);
          delay = Math.max(0, delay + jitter);
        }
        
        delay = Math.floor(delay);
        totalDelay += delay;
        
        
        // 等待后重试
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * 判断是否为可重试的错误
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code;
    const errorStatus = error.status || error.statusCode;
    
    // 网络相关错误
    if (errorMessage.includes('network') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('connection') ||
        errorMessage.includes('fetch') ||
        errorMessage.includes('econnreset') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('etimedout') ||
        errorMessage.includes('socket') ||
        errorMessage.includes('dns')) {
      return true;
    }
    
    // HTTP/网络状态码错误
    if (errorCode === 'ECONNRESET' || 
        errorCode === 'ENOTFOUND' || 
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ECONNREFUSED' ||
        errorCode === 'ENETDOWN' ||
        errorCode === 'ENETUNREACH' ||
        errorCode === 'EAI_AGAIN') {
      return true;
    }
    
    // RPC 和 API 相关错误
    if (errorMessage.includes('too many requests') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('server error') ||
        errorMessage.includes('service unavailable') ||
        errorMessage.includes('internal server error') ||
        errorMessage.includes('bad gateway') ||
        errorMessage.includes('gateway timeout') ||
        errorMessage.includes('temporarily unavailable')) {
      return true;
    }
    
    // HTTP 状态码错误 (5xx 和特定 4xx)
    if (errorStatus >= 500 && errorStatus < 600) {
      return true;
    }
    
    // 429 Too Many Requests
    if (errorStatus === 429) {
      return true;
    }
    
    // 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
    if (errorStatus === 502 || errorStatus === 503 || errorStatus === 504) {
      return true;
    }
    
    // Solana RPC 特定错误
    if (errorMessage.includes('slot') && errorMessage.includes('not available')) {
      return true;
    }
    
    // Solana 交易确认超时错误
    if (errorMessage.includes('transaction was not confirmed') ||
        errorMessage.includes('not confirmed in') ||
        errorMessage.includes('confirmation timeout') ||
        errorMessage.includes('signature not found')) {
      return true;
    }
    
    return false;
  }

  /**
   * 休眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取重试统计信息
   */
  getStats(context?: string): RetryStats | Map<string, RetryStats> {
    if (context) {
      return this.stats.get(context) || {
        totalAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageAttempts: 0,
        totalDelay: 0
      };
    }
    return new Map(this.stats);
  }

  /**
   * 清除统计信息
   */
  clearStats(context?: string): void {
    if (context) {
      this.stats.delete(context);
    } else {
      this.stats.clear();
    }
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats.clear();
  }
}

// 导出单例实例
export const retryManager = RetryManager.getInstance();

// 便捷函数
export const withRetry = retryManager.withRetry.bind(retryManager); 