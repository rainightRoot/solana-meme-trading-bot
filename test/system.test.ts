import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { queueProxy } from '../src/main/core/queueProxy';
import { ConsumerManager } from '../src/main/core/ConsumerManager';
import * as transactionProcessor from '../src/main/core/transactionProcessor';

// 模拟整个 transactionProcessor 模块
vi.mock('./transactionProcessor', async (importOriginal) => {
  const original = await importOriginal<typeof transactionProcessor>();
  return {
    ...original,
    // 只模拟 processSlotAndBuy 函数
    processSlotAndBuy: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Producer-Consumer System Test', () => {
  let consumerManager: ConsumerManager;
  const testChannel = 'TestChannel';

  beforeAll(() => {
    // 在所有测试开始前，创建一个消费者管理器实例
    consumerManager = new ConsumerManager(testChannel);
  });

  afterAll(() => {
    // 在所有测试结束后，停止所有消费者
    consumerManager.stopAll();
  });

  it('should process a message from producer to consumer', async () => {
    // 1. 清理之前的队列，确保测试环境干净
    queueProxy.clear(testChannel);

    // 2. 启动一个消费者
    consumerManager.setTargetConsumerCount(1);
    
    // 3. 模拟生产者，往队列中放入一个消息
    const testSlot = 12345;
    const producerMessage = {
      type: 'transaction',
      data: {
        slot: testSlot,
        timestamp: Date.now()
      }
    };
    queueProxy.enqueue(testChannel, producerMessage);

    // 4. 等待一小段时间，让消费循环能够处理消息
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. 验证消费者是否调用了处理函数，并且参数正确
    expect(transactionProcessor.processSlotAndBuy).toHaveBeenCalledOnce();
    expect(transactionProcessor.processSlotAndBuy).toHaveBeenCalledWith(testSlot);
  });
}); 