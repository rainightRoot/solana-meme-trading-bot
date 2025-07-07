import Store from 'electron-store';
import { queueLogger } from '../../infrastructure/logging';

type StoreSchema = {
  queues: Record<string, any[]>;
};

class PersistentMessageQueue {
  private queues: Map<string, any[]> = new Map();
  private store = new Store<StoreSchema>({
    name: 'message-queues',
    defaults: {
      queues: {}
    }
  });
  
  private isDirty = false;
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly PERSIST_DELAY = 1000; // 1秒后批量持久化
  private readonly MAX_BATCH_SIZE = 100; // 最大批处理大小
  private operationCount = 0;

  constructor() {
    // 初始化时尝试从 store 加载
    const saved = (this.store as any).get('queues') as Record<string, any[]> || {};
    for (const [channel, messages] of Object.entries(saved)) {
      this.queues.set(channel, messages);
      queueLogger.info(`Loaded queue from storage`, { 
        channel, 
        messageCount: messages.length 
      });
    }
    queueLogger.info(`Persistent queue initialized`, { 
      channelCount: this.queues.size 
    });
    
    // 进程退出时确保数据持久化
    process.on('beforeExit', () => {
      this.forcePersist();
    });
    
    process.on('SIGINT', () => {
      this.forcePersist();
      process.exit(0);
    });
  }

  enqueue(channel: string, message: any) {
    if (!this.queues.has(channel)) this.queues.set(channel, []);
    this.queues.get(channel)!.push(message);
    this.markDirtyAndSchedulePersist();
    queueLogger.debug(`Message enqueued`, { 
      channel, 
      queueSize: this.queues.get(channel)!.length 
    });
  }

  dequeue(channel: string): any | undefined {
    const queue = this.queues.get(channel);
    if (!queue || queue.length === 0) return undefined;
    const msg = queue.shift();
    this.markDirtyAndSchedulePersist();
    queueLogger.debug(`Message dequeued`, { 
      channel, 
      remainingSize: queue.length 
    });
    return msg;
  }

  peek(channel: string): any | undefined {
    return this.queues.get(channel)?.[0];
  }

  size(channel: string): number {
    return this.queues.get(channel)?.length ?? 0;
  }

  clear(channel: string) {
    const queueSize = this.queues.get(channel)?.length || 0;
    this.queues.set(channel, []);
    this.markDirtyAndSchedulePersist();
    queueLogger.info(`Queue cleared`, { 
      channel, 
      clearedCount: queueSize 
    });
  }

  channels(): string[] {
    return Array.from(this.queues.keys());
  }

  // 获取所有队列的统计信息
  getStats() {
    const stats: Record<string, number> = {};
    for (const [channel, queue] of this.queues.entries()) {
      stats[channel] = queue.length;
    }
    return {
      channels: stats,
      totalMessages: Object.values(stats).reduce((sum, count) => sum + count, 0),
      operationCount: this.operationCount,
      isDirty: this.isDirty
    };
  }

  private markDirtyAndSchedulePersist() {
    this.isDirty = true;
    this.operationCount++;
    
    // 如果操作数量达到批处理大小，立即持久化
    if (this.operationCount >= this.MAX_BATCH_SIZE) {
      this.forcePersist();
      return;
    }
    
    // 否则延迟持久化
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    
    this.persistTimer = setTimeout(() => {
      this.forcePersist();
    }, this.PERSIST_DELAY);
  }

  private forcePersist() {
    if (!this.isDirty) return;
    
    try {
      const startTime = Date.now();
      const obj: Record<string, any[]> = {};
      for (const [key, value] of this.queues.entries()) {
        obj[key] = value;
      }
      (this.store as any).set('queues', obj);
      
      const persistTime = Date.now() - startTime;
      queueLogger.debug(`Persisted queues to disk`, {
        operationCount: this.operationCount,
        persistTime: `${persistTime}ms`,
        totalMessages: Object.values(obj).reduce((sum, arr) => sum + arr.length, 0)
      });
      
      this.isDirty = false;
      this.operationCount = 0;
      
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
    } catch (error: any) {
      queueLogger.error(`Failed to persist queues:`, error.message);
    }
  }
}

export const messageQueue = new PersistentMessageQueue();