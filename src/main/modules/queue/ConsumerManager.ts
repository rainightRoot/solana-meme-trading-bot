import { v4 as uuidv4 } from 'uuid';
import { queueProxy } from './queueProxy';
import { queueLogger } from '../../infrastructure/logging';
import { processSlotAndBuy } from '../monitoring/transactionProcessor';
import { EventEmitter } from 'events';

export class ConsumerManager {
  private consumers = new Map<string, { active: boolean; processing: boolean }>();
  private targetCount = 0;
  private eventEmitter = new EventEmitter();
  private isProcessing = false;

  constructor(private channel: string) {
    this.channel = channel
    // 设置最大监听器数量，避免内存泄漏警告
    this.eventEmitter.setMaxListeners(50);
  }

  /** 设置消费者数量 */
  setTargetConsumerCount(n: number) {
    this.targetCount = n;
    this.adjustConsumers();
  }

  // 通知有新消息可用
  notifyNewMessage() {
    this.eventEmitter.emit('newMessage');
  }

  private adjustConsumers() {
    const current = this.consumers.size;
    if (current < this.targetCount) {
      const toAdd = this.targetCount - current;
      for (let i = 0; i < toAdd; i++) this.addConsumer();
    } else if (current > this.targetCount) {
      const toRemove = current - this.targetCount;
      const ids = Array.from(this.consumers.keys()).slice(0, toRemove);
      for (const id of ids) this.removeConsumer(id);
    }
  }

  private addConsumer() {
    const id = uuidv4();
    const consumerState = { active: true, processing: false };
    this.consumers.set(id, consumerState);
    this.consumeLoop(id, consumerState);
    queueLogger.debug(`Started consumer ${id}`, { channel: this.channel });
  }

  private async consumeLoop(id: string, state: { active: boolean; processing: boolean }) {
    const consumerId = id.slice(0, 6);
    
    while (state.active) {
      try {
        const msg = queueProxy.dequeue(this.channel);

        if (msg) {
          state.processing = true;
          queueLogger.info(`Consumer ${consumerId} consumed message`, {
            message: msg
          });
          
          try {
            await this.processMessage(msg);
          } catch (error: any) {
            queueLogger.error(`Consumer ${consumerId} failed to process message:`, error.message);
          } finally {
            state.processing = false;
          }
        } else {
          // 队列为空，等待新消息事件，避免 CPU 空转
          await this.waitForNewMessage(state);
        }
      } catch (error: any) {
        queueLogger.error(`Consumer ${consumerId} error:`, error.message);
        // 发生错误时等待更长时间再重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    queueLogger.info(`Consumer ${id} stopped`, { channel: this.channel });
  }

  private async waitForNewMessage(state: { active: boolean; processing: boolean }) {
    return new Promise<void>((resolve) => {
      // 设置较长的超时时间，避免无限等待
      const timeout = setTimeout(() => {
        resolve();
      }, 5000); // 5秒超时

      // 监听新消息事件
      const onNewMessage = () => {
        clearTimeout(timeout);
        this.eventEmitter.removeListener('newMessage', onNewMessage);
        resolve();
      };

      this.eventEmitter.once('newMessage', onNewMessage);

      // 如果消费者被停止，立即返回
      if (!state.active) {
        clearTimeout(timeout);
        this.eventEmitter.removeListener('newMessage', onNewMessage);
        resolve();
      }
    });
  }

  private async processMessage(message: any): Promise<void> {
    const slotData = message.data?.data?.slot;
    if (slotData) {
      queueLogger.debug(`[Consumer] Processing slot: ${slotData}`);
      
      // 添加处理超时控制
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), 30000); // 30秒超时
      });
      
      try {
        await Promise.race([
          processSlotAndBuy(slotData),
          timeoutPromise
        ]);
      } catch (error: any) {
        if (error.message === 'Processing timeout') {
          queueLogger.warn(`[Consumer] Processing slot ${slotData} timed out`);
        } else {
          throw error;
        }
      }
    } else {
      queueLogger.warn(`[Consumer] Received message with invalid format`, { message });
    }
  }

  private removeConsumer(id: string) {
    const consumer = this.consumers.get(id);
    if (consumer) {
      consumer.active = false;
      this.consumers.delete(id);
      queueLogger.info(`Marked consumer ${id} for shutdown`, { channel: this.channel });
    }
  }

  stopAll() {
    for (const id of this.consumers.keys()) this.removeConsumer(id);
    // 清理事件监听器
    this.eventEmitter.removeAllListeners();
  }

  getConsumerIds(): string[] {
    return Array.from(this.consumers.keys());
  }

  // 获取消费者状态信息
  getStatus() {
    const consumers = Array.from(this.consumers.entries()).map(([id, state]) => ({
      id: id.slice(0, 6),
      active: state.active,
      processing: state.processing
    }));
    
    return {
      targetCount: this.targetCount,
      activeCount: this.consumers.size,
      consumers
    };
  }
}