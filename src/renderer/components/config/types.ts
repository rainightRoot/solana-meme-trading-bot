export interface ConfigData {
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
      initial: SellStrategyData;
      second: SellStrategyData;
      third: SellStrategyData;
    };
  };
}

export interface SellStrategyData {
  enabled: boolean;
  conditions: {
    profitRatio: number;
    lossRatio: number;
    lossTimeMinutes: number;
    pullbackRatio: number;
    pullbackTimeMinutes: number;
  };
  sellRatio: number;
}

export interface ConfigContextType {
  config: ConfigData | null;
  isLoading: boolean;
  updateConfig: (newConfig: ConfigData) => void;
  form: any;
} 