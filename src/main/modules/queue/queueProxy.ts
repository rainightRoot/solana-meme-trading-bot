import { messageQueue } from './persistentQueue';

// 消费者管理器实例引用，用于事件通知
let consumerManagerInstance: any = null;

export const queueProxy = {
  enqueue: (channel: string, data: any): void => {
    // 包装一层，使其符合生产者的数据结构
    const message = {
      queueName: channel,
      data: data
    };
    messageQueue.enqueue(channel, message);
    
    // 通知消费者有新消息
    if (consumerManagerInstance) {
      consumerManagerInstance.notifyNewMessage();
    }
  },
  
  dequeue: (channel: string): any | undefined => {
    return messageQueue.dequeue(channel);
  },

  size: (channel: string): number => {
    return messageQueue.size(channel);
  },

  clear: (channel: string): void => {
    messageQueue.clear(channel);
  },

  // 获取队列统计信息
  getStats: () => {
    return messageQueue.getStats();
  },

  // 设置消费者管理器实例引用
  setConsumerManager: (manager: any) => {
    consumerManagerInstance = manager;
  }
};