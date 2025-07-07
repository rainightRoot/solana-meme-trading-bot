import Store from 'electron-store';
import { EventEmitter } from 'events';
import { appLogger } from '../logging';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';

// 配置接口定义
export interface AppConfig {
  solana: {
    rpcUrl: string;
    commitment: 'processed' | 'confirmed' | 'finalized';
    timeout: number;
    monitoredWallets: string[];
    proxies: string[];
    privateKey: string;
    followAmount: number;
    slippageBps: number;
  };
  queue: {
    maxSize: number;
    consumerCount: number;
    retryAttempts: number;
    maxProcesses: number;
    processTimeout: number;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    maxFileSize: number;
    maxFiles: number;
  };
  ui: {
    theme: 'light' | 'dark' | 'auto';
    language: 'zh-CN' | 'en-US';
    autoUpdate: boolean;
  };
  sellStrategy: {
    enabled: boolean;
    toolFee: {
      enabled: boolean;
    };
    strategies: {
      initial: {
        enabled: boolean;
        conditions: {
          profitRatio: number;
          lossRatio: number;
          lossTimeMinutes: number;
          pullbackRatio: number;
          pullbackTimeMinutes: number;
        };
        sellRatio: number;
      };
      second: {
        enabled: boolean;
        conditions: {
          profitRatio: number;
          lossRatio: number;
          lossTimeMinutes: number;
          pullbackRatio: number;
          pullbackTimeMinutes: number;
        };
        sellRatio: number;
      };
      third: {
        enabled: boolean;
        conditions: {
          profitRatio: number;
          lossRatio: number;
          lossTimeMinutes: number;
          pullbackRatio: number;
          pullbackTimeMinutes: number;
        };
        sellRatio: number;
      };
    };
  };
}

// 默认配置
const defaultConfig: AppConfig = {
  solana: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed',
    timeout: 30000,
    monitoredWallets: [],
    proxies: [],
    privateKey: '',
    followAmount: 0.01,
    slippageBps: 50
  },
  queue: {
    maxSize: 1000,
    consumerCount: 10,
    retryAttempts: 3,
    maxProcesses: 10,
    processTimeout: 90000
  },
  logging: {
    level: 'info',
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5
  },
  ui: {
    theme: 'auto',
    language: 'zh-CN',
    autoUpdate: true
  },
  sellStrategy: {
    enabled: true,
    toolFee: {
      enabled: true
    },
    strategies: {
      initial: {
        enabled: true,
        conditions: {
          profitRatio: 1.5,
          lossRatio: 0.5,
          lossTimeMinutes: 30,
          pullbackRatio: 0.8,
          pullbackTimeMinutes: 10
        },
        sellRatio: 0.5
      },
      second: {
        enabled: true,
        conditions: {
          profitRatio: 2.0,
          lossRatio: 0.3,
          lossTimeMinutes: 60,
          pullbackRatio: 0.7,
          pullbackTimeMinutes: 15
        },
        sellRatio: 0.6
      },
      third: {
        enabled: true,
        conditions: {
          profitRatio: 3.0,
          lossRatio: 0.2,
          lossTimeMinutes: 90,
          pullbackRatio: 0.6,
          pullbackTimeMinutes: 20
        },
        sellRatio: 1.0
      }
    }
  }
};

class ConfigManager extends EventEmitter {
  private store: Store<AppConfig> | null = null;
  private config: AppConfig;
  private isTestMode = false;

  constructor() {
    super();

    this.initializeStore();
    this.config = this.loadConfig();

    appLogger.info('配置管理器已初始化');
  }

  private initializeStore(): void {
    try {
      const skFile = path.join(this.getSKPath(), 'sk.dat')
      if (!fs.existsSync(skFile)) {
        fs.mkdirSync(this.getSKPath(), { recursive: true });
        fs.writeFileSync(skFile, uuidv4())
      }
      const sk = fs.readFileSync(skFile, 'utf-8')
      // 初始化存储
      this.store = new Store<AppConfig>({
        name: 'config-meme',
        defaults: defaultConfig,
        encryptionKey: sk,
        schema: {
          solana: {
            type: 'object',
            properties: {
              rpcUrl: { type: 'string' },
              commitment: { type: 'string', enum: ['processed', 'confirmed', 'finalized'] },
              timeout: { type: 'number', minimum: 1000, maximum: 120000 },
              monitoredWallets: { type: 'array', items: { type: 'string' } },
              proxies: { type: 'array', items: { type: 'string' } },
              privateKey: { type: 'string' },
              followAmount: { type: 'number', minimum: 0.001, maximum: 100 },
              slippageBps: { type: 'number', minimum: 1, maximum: 10000 }
            }
          },
          queue: {
            type: 'object',
            properties: {
              maxSize: { type: 'number', minimum: 10, maximum: 10000 },
              consumerCount: { type: 'number', minimum: 1, maximum: 100 },
              retryAttempts: { type: 'number', minimum: 0, maximum: 10 },
              maxProcesses: { type: 'number', minimum: 1, maximum: 100 },
              processTimeout: { type: 'number', minimum: 10000, maximum: 300000 }
            }
          },
          logging: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
              maxFileSize: { type: 'number', minimum: 1024 * 1024, maximum: 100 * 1024 * 1024 },
              maxFiles: { type: 'number', minimum: 1, maximum: 20 }
            }
          },
          ui: {
            type: 'object',
            properties: {
              theme: { type: 'string', enum: ['light', 'dark', 'auto'] },
              language: { type: 'string', enum: ['zh-CN', 'en-US'] },
              autoUpdate: { type: 'boolean' }
            }
          },
          sellStrategy: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              toolFee: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' }
                }
              },
              strategies: {
                type: 'object',
                properties: {
                  initial: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      conditions: {
                        type: 'object',
                        properties: {
                          profitRatio: { type: 'number', minimum: 0.01, maximum: 1000 },
                          lossRatio: { type: 'number', minimum: 0.01, maximum: 10 },
                          lossTimeMinutes: { type: 'number', minimum: 1, maximum: 12000 },
                          pullbackRatio: { type: 'number', minimum: 0.01, maximum: 1 },
                          pullbackTimeMinutes: { type: 'number', minimum: 1, maximum: 12000 }
                        }
                      },
                      sellRatio: { type: 'number', minimum: 0.01, maximum: 1 }
                    }
                  },
                  second: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      conditions: {
                        type: 'object',
                        properties: {
                          profitRatio: { type: 'number', minimum: 0.01, maximum: 1000 },
                          lossRatio: { type: 'number', minimum: 0.01, maximum: 10 },
                          lossTimeMinutes: { type: 'number', minimum: 1, maximum: 12000 },
                          pullbackRatio: { type: 'number', minimum: 0.01, maximum: 1 },
                          pullbackTimeMinutes: { type: 'number', minimum: 1, maximum: 12000 }
                        }
                      },
                      sellRatio: { type: 'number', minimum: 0.01, maximum: 1 }
                    }
                  },
                  third: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      conditions: {
                        type: 'object',
                        properties: {
                          profitRatio: { type: 'number', minimum: 0.01, maximum: 1000 },
                          lossRatio: { type: 'number', minimum: 0.01, maximum: 10 },
                          lossTimeMinutes: { type: 'number', minimum: 1, maximum: 12000 },
                          pullbackRatio: { type: 'number', minimum: 0.01, maximum: 1 },
                          pullbackTimeMinutes: { type: 'number', minimum: 1, maximum: 12000 }
                        }
                      },
                      sellRatio: { type: 'number', minimum: 0.01, maximum: 1 }
                    }
                  }
                }
              }
            }
          }
        }
      });


      // 监听配置变化
      (this.store as any).onDidAnyChange?.((newValue: any, oldValue: any) => {
        this.config = this.loadConfig();
        this.emit('configChanged', this.config, oldValue);
      });

    } catch (error) {
      this.isTestMode = true;
      appLogger.info('使用测试模式配置管理器');
    }
  }

  private loadConfig(): AppConfig {
    if (this.isTestMode) {
      return JSON.parse(JSON.stringify(defaultConfig));
    }
    return (this.store as any)?.store || defaultConfig;
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  getNested<T = any>(path: string): T {
    const keys = path.split('.');
    let current: any = this.config;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined as T;
      }
    }

    return current;
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    const oldValue = this.config[key];
    this.config[key] = value;

    if (!this.isTestMode) {
      this.store?.set(key, value);
    }

    this.emit('keyChanged', key, value, oldValue);
    appLogger.info(`配置项 ${key} 已更新`);
  }

  setNested(path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop();

    if (!lastKey) return;

    let current: any = this.config;
    for (const key of keys) {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;

    if (!this.isTestMode) {
      this.store?.set(path, value);
    }

    appLogger.info(`嵌套配置项 ${path} 已更新`);
  }

  replaceAll(newConfig: AppConfig): void {
    const oldConfig = { ...this.config };
    this.config = { ...newConfig };

    if (!this.isTestMode) {
      // 直接替换整个store，避免多次触发change事件
      (this.store as any).store = newConfig;
    }

    this.emit('configChanged', this.config, oldConfig);
    appLogger.info('配置已完全替换');
  }

  onConfigChange(callback: (newConfig: AppConfig, oldConfig: AppConfig) => void): void {
    this.on('configChanged', callback);
  }

  onKeyChange<K extends keyof AppConfig>(
    key: K,
    callback: (newValue: AppConfig[K], oldValue: AppConfig[K]) => void
  ): void {
    this.on('keyChanged', (changedKey: K, newValue: AppConfig[K], oldValue: AppConfig[K]) => {
      if (changedKey === key) {
        callback(newValue, oldValue);
      }
    });
  }

  getConfigPath(): string {
    if (this.isTestMode) {
      return path.join(os.tmpdir(), 'my-app-test-config.json');
    }
    return this.store?.path || '';
  }
  getSKPath(): string {
    return path.join(os.tmpdir(), 'sk')
  }
}

export const configManager = new ConfigManager();
export default configManager; 