import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { ProcessTask, ProcessResult } from '../../processes/transactionProcess';
import { queueLogger } from '../../infrastructure/logging';

interface ProcessInfo {
  process: ChildProcess;
  id: string;
  pid: number;
  busy: boolean;
  tasksProcessed: number;
  errors: number;
  createdAt: number;
  lastActivity: number;
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ProcessInfo>();
  private taskQueue: ProcessTask[] = [];
  private pendingTasks = new Map<string, {
    resolve: (result: ProcessResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    assignedProcessId?: string;
  }>();

  private maxProcesses: number;
  private readonly processTimeout: number;
  private readonly processPath: string;
  private taskIdCounter = 0;
  private isShuttingDown = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(maxProcesses = 2, processTimeout = 90000) {
    super();
    this.maxProcesses = maxProcesses;
    this.processTimeout = processTimeout;

    // 使用编译后的JavaScript文件路径
    this.processPath = path.join(__dirname, '../processes/transactionProcess.js');

    // 设置最大监听器数量
    this.setMaxListeners(100);

    // 监听进程退出，确保清理资源
    process.on('exit', () => {
      this.cleanup();
    });

    process.on('SIGINT', () => {
      this.shutdown().finally(() => {
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      this.shutdown().finally(() => {
        process.exit(0);
      });
    });
  }

  /**
   * 初始化进程池
   */
  async initialize(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('进程管理器正在关闭，无法初始化');
    }

    queueLogger.info(`初始化进程管理器，最大进程数量: ${this.maxProcesses}`);

    // 创建初始进程
    const initialProcesses = Math.min(2, this.maxProcesses);
    const createPromises = [];

    for (let i = 0; i < initialProcesses; i++) {
      createPromises.push(this.createProcess());
    }

    await Promise.all(createPromises);

    // 启动健康检查
    this.startHealthCheck();

    queueLogger.info(`进程池初始化完成，创建了 ${this.processes.size} 个进程`);
  }

  /**
   * 创建新的子进程
   */
  private async createProcess(): Promise<ProcessInfo> {
    if (this.isShuttingDown) {
      throw new Error('进程管理器正在关闭，无法创建进程');
    }

    const processId = `process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const childProcess = fork(this.processPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'development',
          // 传递日志配置
          LOG_LEVEL: process.env.LOG_LEVEL || 'info',
          LOG_CONTEXT: 'ChildProcess'
        }
      });

      const processInfo: ProcessInfo = {
        process: childProcess,
        id: processId,
        pid: childProcess.pid || -1,
        busy: false,
        tasksProcessed: 0,
        errors: 0,
        createdAt: Date.now(),
        lastActivity: Date.now()
      };

      // 监听子进程消息
      childProcess.on('message', (message: any) => {
        processInfo.lastActivity = Date.now();

        if (message.type === 'ready') {
          queueLogger.info(`子进程 ${processId} (PID: ${message.pid}) 已准备就绪`);
          this.processes.set(processId, processInfo);
          this.emit('processReady', processId);
          resolve(processInfo);
          return;
        }

        // 处理子进程的日志消息
        if (message.type === 'log') {
          const { level, context, message: logMessage, args } = message;
          const contextPrefix = `[${processId}][${context}]`;
          
          switch (level) {
            case 'debug':
              queueLogger.debug(`${contextPrefix} ${logMessage}`, ...(args || []));
              break;
            case 'info':
              queueLogger.info(`${contextPrefix} ${logMessage}`, ...(args || []));
              break;
            case 'warn':
              queueLogger.warn(`${contextPrefix} ${logMessage}`, ...(args || []));
              break;
            case 'error':
              queueLogger.error(`${contextPrefix} ${logMessage}`, ...(args || []));
              break;
            default:
              queueLogger.info(`${contextPrefix} ${logMessage}`, ...(args || []));
          }
          return;
        }

        this.handleProcessResult(processId, message as ProcessResult);
      });

      // 监听子进程错误
      childProcess.on('error', (error) => {
        queueLogger.error(`子进程 ${processId} 发生错误:`, error);
        processInfo.errors++;
        this.handleProcessError(processId, error);
      });

      // 监听子进程退出
      childProcess.on('exit', (code, signal) => {
        queueLogger.warn(`子进程 ${processId} 退出，代码: ${code}, 信号: ${signal}`);
        this.processes.delete(processId);
        if (!this.isShuttingDown) {
          this.checkAndCreateProcesses();
        }
      });

      // 监听子进程标准输出和错误输出
      childProcess.stdout?.on('data', (data) => {
        queueLogger.debug(`子进程 ${processId} stdout:`, data.toString().trim());
      });

      childProcess.stderr?.on('data', (data) => {
        queueLogger.error(`子进程 ${processId} stderr:`, data.toString().trim());
      });

      // 设置创建超时
      const createTimeout = setTimeout(() => {
        childProcess.kill('SIGTERM');
        reject(new Error(`创建子进程 ${processId} 超时`));
      }, 10000);

      // 清理超时
      childProcess.once('message', () => {
        clearTimeout(createTimeout);
      });
    });
  }

  /**
   * 处理子进程返回的结果
   */
  private handleProcessResult(processId: string, result: ProcessResult): void {
    const processInfo = this.processes.get(processId);
    if (processInfo) {
      processInfo.busy = false;
      processInfo.tasksProcessed++;
      processInfo.lastActivity = Date.now();
    }

    const pendingTask = this.pendingTasks.get(result.id);
    if (pendingTask) {
      clearTimeout(pendingTask.timeout);
      this.pendingTasks.delete(result.id);

      if (result.success) {
        pendingTask.resolve(result);
      } else {
        pendingTask.reject(new Error(result.error || '子进程处理失败'));
      }
    }

    // 处理队列中的下一个任务
    if (!this.isShuttingDown) {
      this.processNextTask();
    }
  }

  /**
   * 处理子进程错误
   */
  private handleProcessError(processId: string, error: Error): void {
    const processInfo = this.processes.get(processId);
    if (processInfo) {
      processInfo.busy = false;
      processInfo.lastActivity = Date.now();
    }

    // 找到分配给该进程的任务并报错
    for (const [taskId, pendingTask] of this.pendingTasks.entries()) {
      if (pendingTask.assignedProcessId === processId) {
        clearTimeout(pendingTask.timeout);
        this.pendingTasks.delete(taskId);
        pendingTask.reject(error);
      }
    }
  }

  /**
   * 提交任务到进程池
   */
  async submitTask(taskType: 'processSlot', taskData: any): Promise<ProcessResult> {
    if (this.isShuttingDown) {
      throw new Error('进程管理器正在关闭，无法提交任务');
    }

    const taskId = `task_${++this.taskIdCounter}_${Date.now()}`;

    const task: ProcessTask = {
      id: taskId,
      type: taskType,
      data: taskData
    };

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        const pendingTask = this.pendingTasks.get(taskId);
        if (pendingTask?.assignedProcessId) {
          // 如果任务已分配，尝试重启该进程
          this.restartProcess(pendingTask.assignedProcessId);
        }
        this.pendingTasks.delete(taskId);
        reject(new Error(`任务 ${taskId} 超时`));
      }, this.processTimeout);

      this.pendingTasks.set(taskId, { resolve, reject, timeout });

      // 添加到队列
      this.taskQueue.push(task);

      // 尝试立即处理
      this.processNextTask();
    });
  }

  /**
   * 处理队列中的下一个任务
   */
  private processNextTask(): void {
    if (this.taskQueue.length === 0 || this.isShuttingDown) return;

    // 找到空闲的进程
    const availableProcess = Array.from(this.processes.values()).find(p => !p.busy);

    if (availableProcess) {
      const task = this.taskQueue.shift()!;
      availableProcess.busy = true;
      availableProcess.lastActivity = Date.now();

      // 记录任务分配
      const pendingTask = this.pendingTasks.get(task.id);
      if (pendingTask) {
        pendingTask.assignedProcessId = availableProcess.id;
      }

      availableProcess.process.send(task);
      queueLogger.debug(`将任务 ${task.id} 分配给进程 ${availableProcess.id}`);
    } else if (this.processes.size < this.maxProcesses) {
      // 如果没有空闲进程且未达到最大数量，创建新的进程
      this.createProcess().then(() => {
        this.processNextTask();
      }).catch(error => {
        queueLogger.error('创建子进程失败:', error);
      });
    }
  }

  /**
   * 检查并创建进程（用于进程意外退出后的恢复）
   */
  private checkAndCreateProcesses(): void {
    if (this.isShuttingDown) return;

    const activeProcesses = this.processes.size;
    const minProcesses = 1;

    if (activeProcesses < minProcesses) {
      queueLogger.info(`进程数量不足 (${activeProcesses}/${minProcesses})，创建新进程`);
      this.createProcess().catch(error => {
        queueLogger.error('恢复子进程失败:', error);
      });
    }
  }

  /**
   * 重启指定进程
   */
  private async restartProcess(processId: string): Promise<void> {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    queueLogger.warn(`重启子进程 ${processId}`);

    // 终止旧进程
    try {
      processInfo.process.kill('SIGTERM');
    } catch (error) {
      // 忽略错误
    }

    // 创建新进程
    try {
      await this.createProcess();
    } catch (error) {
      queueLogger.error(`重启子进程 ${processId} 失败:`, error);
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const now = Date.now();
      const HEALTH_CHECK_TIMEOUT = 5 * 60 * 1000; // 5分钟无活动视为不健康
      // 空闲进程超过5个，则停止多余进程
      if (Array.from(this.processes.values()).filter(p => !p.busy).length > 5) {
        const excessProcesses = this.processes.size - 5
        const processesToKill = Array.from(this.processes.values())
          .filter(p => !p.busy) // 优先关闭空闲进程
          .slice(0, excessProcesses);

        // 如果空闲进程不够，再关闭一些繁忙进程
        if (processesToKill.length < excessProcesses) {
          const busyProcesses = Array.from(this.processes.values())
            .filter(p => p.busy)
            .slice(0, excessProcesses - processesToKill.length);
          processesToKill.push(...busyProcesses);
        }

        processesToKill.forEach(processInfo => {
          queueLogger.info(`关闭多余进程 ${processInfo.id}`);
          try {
            processInfo.process.kill('SIGTERM');
            this.processes.delete(processInfo.id);
          } catch (error) {
            queueLogger.error(`关闭进程 ${processInfo.id} 失败:`, error);
          }
        });
      }
      for (const [processId, processInfo] of this.processes.entries()) {
        if (now - processInfo.lastActivity > HEALTH_CHECK_TIMEOUT) {
          queueLogger.warn(`子进程 ${processId} 长时间无响应，准备重启`);
          this.restartProcess(processId);
        }
      }
    }, 2 * 60 * 1000); // 每2分钟检查一次
  }

  /**
   * 设置最大进程数量
   */
  setMaxProcesses(maxProcesses: number): void {
    if (this.isShuttingDown) {
      queueLogger.warn('进程管理器正在关闭，无法设置最大进程数量');
      return;
    }

    const oldMaxProcesses = this.maxProcesses;
    this.maxProcesses = Math.max(1, Math.min(maxProcesses, 50)); // 限制在 1-8 之间

    if (this.maxProcesses !== oldMaxProcesses) {
      queueLogger.info(`最大进程数量从 ${oldMaxProcesses} 调整为 ${this.maxProcesses}`);
      this.adjustProcessCount();
    }
  }

  /**
   * 调整进程数量以匹配最大进程数
   */
  private adjustProcessCount(): void {
    const currentProcesses = this.processes.size;

    if (currentProcesses > this.maxProcesses) {
      // 需要减少进程数量
      const excessProcesses = currentProcesses - this.maxProcesses;
      const processesToKill = Array.from(this.processes.values())
        .filter(p => !p.busy) // 优先关闭空闲进程
        .slice(0, excessProcesses);

      // 如果空闲进程不够，再关闭一些繁忙进程
      if (processesToKill.length < excessProcesses) {
        const busyProcesses = Array.from(this.processes.values())
          .filter(p => p.busy)
          .slice(0, excessProcesses - processesToKill.length);
        processesToKill.push(...busyProcesses);
      }

      processesToKill.forEach(processInfo => {
        queueLogger.info(`关闭多余进程 ${processInfo.id}`);
        try {
          processInfo.process.kill('SIGTERM');
        } catch (error) {
          queueLogger.error(`关闭进程 ${processInfo.id} 失败:`, error);
        }
      });
    } else if (currentProcesses < this.maxProcesses) {
      // 需要增加进程数量
      const processesToCreate = this.maxProcesses - currentProcesses;
      queueLogger.info(`创建 ${processesToCreate} 个新进程`);

      for (let i = 0; i < processesToCreate; i++) {
        this.createProcess().catch(error => {
          queueLogger.error('创建新进程失败:', error);
        });
      }
    }
  }

  /**
   * 获取进程池状态
   */
  getStatus() {
    const processes = Array.from(this.processes.values()).map(p => ({
      id: p.id.slice(-8), // 只显示ID的后8位
      pid: p.pid,
      busy: p.busy,
      tasksProcessed: p.tasksProcessed,
      errors: p.errors,
      uptime: Date.now() - p.createdAt,
      lastActivity: Date.now() - p.lastActivity
    }));

    return {
      totalProcesses: this.processes.size,
      maxProcesses: this.maxProcesses,
      busyProcesses: processes.filter(p => p.busy).length,
      queuedTasks: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size,
      processes,
      isShuttingDown: this.isShuttingDown
    };
  }

  /**
   * 同步清理资源（用于进程退出时）
   */
  private cleanup(): void {
    queueLogger.info('同步清理进程资源...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // 清理所有待处理的任务
    for (const [taskId, pendingTask] of this.pendingTasks.entries()) {
      clearTimeout(pendingTask.timeout);
      pendingTask.reject(new Error('主进程正在退出'));
    }
    this.pendingTasks.clear();
    this.taskQueue.length = 0;

    // 强制终止所有子进程
    for (const [processId, processInfo] of this.processes.entries()) {
      try {
        processInfo.process.kill('SIGKILL');
      } catch (error) {
        // 静默处理错误
      }
    }
    this.processes.clear();
  }

  /**
   * 关闭所有子进程
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      queueLogger.warn('进程管理器已经在关闭中...');
      return;
    }

    this.isShuttingDown = true;
    queueLogger.info('关闭进程管理器...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // 清理所有待处理的任务
    for (const [taskId, pendingTask] of this.pendingTasks.entries()) {
      clearTimeout(pendingTask.timeout);
      pendingTask.reject(new Error('进程管理器正在关闭'));
    }
    this.pendingTasks.clear();
    this.taskQueue.length = 0;

    // 优雅地终止所有子进程
    const terminatePromises = Array.from(this.processes.values()).map(async (processInfo) => {
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // 强制杀死进程
          try {
            processInfo.process.kill('SIGKILL');
          } catch (error) {
            // 忽略错误
          }
          resolve();
        }, 5000);

        processInfo.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        try {
          processInfo.process.kill('SIGTERM');
        } catch (error) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await Promise.all(terminatePromises);
    this.processes.clear();
    queueLogger.info('所有子进程已关闭');
  }
} 