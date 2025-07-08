export { };

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
}

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      logMessage: (msg: string) => void;
      onMainLog: (cb: (logEntry: LogEntry) => void) => void;
      sendToSet: (data: any) => void;
      sendPing: () => void;
      onPong: (cb: (msg: string) => void) => void;
      onSetFromMain: (cb: (data: any) => void) => void;
      showNotification: (title: string, body: string) => void;
      selectFiles: () => Promise<string[]>;
      openLink: (url: string) => void;
      checkUpdate: () => void;
      onUpdateDownloadProgress: (cb: (progress: any) => void) => void;
      getConfig: () => Promise<any>;
      updateConfig: (path: string, value: any) => Promise<void>;
      resetConfig: () => Promise<void>;
      exportConfig: () => Promise<string>;
      importConfig: (configJson: string) => Promise<any>;
      onConfigChange: (cb: (newConfig: any, oldConfig: any) => void) => void;
      getWatcherStatus: () => Promise<any>;
      startWatcher: () => Promise<void>;
      stopWatcher: () => Promise<void>;
      startConsumers: () => Promise<any>;
      stopConsumers: () => Promise<any>;

      // 监控状态 API
      getMonitoringStatus: () => Promise<MonitoringStatusResponse>;

      // 重试统计 API
      getRetryStats: (context?: string) => Promise<RetryStatsResponse>;
      clearRetryStats: (context?: string) => Promise<{ success: boolean; error?: string }>;

      // 持仓管理 API
      getPositions: (query?: PositionQuery) => Promise<Position[]>;
      getPosition: (tokenMint: string, walletAddress: string) => Promise<Position | null>;
      getTrades: (positionId?: number, walletAddress?: string, limit?: number, offset?: number) => Promise<TradeRecord[]>;
      getPositionStats: (walletAddress?: string) => Promise<PositionStats>;
      updatePositionPrice: (tokenMint: string, walletAddress: string, priceSol: number, priceUsd: number) => Promise<boolean>;
      deletePosition: (tokenMint: string, walletAddress: string) => Promise<boolean>;

      // 钱包 API
      getWalletInfo: () => Promise<{ address: string; balance: number }>;

      // 队列管理 API
      clearQueue: (channel?: string) => Promise<{ success: boolean }>;
      scanBlock: (block: number | string) => Promise<{ success: boolean; block: number; duration: number; message: string }>;

      // 持仓卖出 API
      sellPosition: (tokenMint: string, walletAddress: string, sellRatio: number) => Promise<{ success: boolean; txSignature: string; sellAmount: number }>;
    };
  }
}

// 旧的WatcherStatus类型已被新的定义替换

// 持仓相关类型定义
interface Position {
  id?: number;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  wallet_address: string;
  status: 'open' | 'closed';
  total_buy_amount: number;
  total_buy_cost_sol: number;
  total_buy_cost_usd: number;
  total_sell_amount: number;
  total_sell_value_sol: number;
  total_sell_value_usd: number;
  avg_buy_price_sol: number;
  avg_buy_price_usd: number;
  current_amount: number;
  realized_pnl_sol: number;
  realized_pnl_usd: number;
  unrealized_pnl_sol: number;
  unrealized_pnl_usd: number;
  current_price_sol: number;
  current_price_usd: number;
  first_buy_at?: string;
  last_trade_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface TradeRecord {
  id?: number;
  position_id?: number;
  transaction_signature: string;
  trade_type: 'buy' | 'sell';
  token_mint: string;
  wallet_address: string;
  amount: number;
  price_sol: number;
  price_usd: number;
  value_sol: number;
  value_usd: number;
  slippage_bps?: number;
  gas_fee_sol: number;
  block_time?: string;
  created_at?: string;
}

interface PositionStats {
  total_positions: number;
  open_positions: number;
  closed_positions: number;
  total_invested_sol: number;
  total_invested_usd: number;
  total_realized_pnl_sol: number;
  total_realized_pnl_usd: number;
  total_unrealized_pnl_sol: number;
  total_unrealized_pnl_usd: number;
  total_pnl_sol: number;
  total_pnl_usd: number;
  win_rate: number;
  best_trade_pnl_sol: number;
  worst_trade_pnl_sol: number;
}

interface PositionQuery {
  wallet_address?: string;
  status?: 'open' | 'closed';
  token_mint?: string;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at' | 'total_buy_cost_sol' | 'unrealized_pnl_sol';
  order_dir?: 'ASC' | 'DESC';
}

// 工具使用费配置
interface ToolFeeConfig {
  enabled: boolean;
}

// 卖出策略配置
interface SellStrategyConfig {
  enabled: boolean;
  toolFee: ToolFeeConfig;
  strategies: {
    initial: StrategyPhaseConfig;
    second: StrategyPhaseConfig;
    third: StrategyPhaseConfig;
  };
}

// 策略阶段配置
interface StrategyPhaseConfig {
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

// 监控状态相关类型定义
interface MonitoringStatusResponse {
  success: boolean;
  data?: {
    watcher: WatcherStatus;
    performance: PerformanceStats;
  };
  error?: string;
}

// 重试统计相关类型定义
interface RetryStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
  totalDelay: number;
}

interface RetryStatsResponse {
  success: boolean;
  data?: RetryStats | Map<string, RetryStats>;
  error?: string;
}

interface WatcherStatus {
  isRunning: boolean;
  connection: 'connected' | 'disconnected';
  latestSlot: number;
  queueLength: number;
  queueStats: QueueStats;
  consumerStatus: ConsumerStatus;
  config: {
    rpcUrl: string;
    commitment: string;
    timeout: number;
  };
}

interface QueueStats {
  totalEnqueued: number;
  totalDequeued: number;
  currentSize: number;
  maxSize: number;
  createdAt: string;
  lastActivity: string;
}

interface ConsumerStatus {
  targetCount: number;
  activeCount: number;
  consumers: ConsumerInfo[];
}

interface ConsumerInfo {
  id: string;
  active: boolean;
  processing: boolean;
}

interface PerformanceStats {
  totalProcessed: number;
  totalErrors: number;
  avgProcessingTime: number;
  processTasks: number;
  processErrors: number;
  avgNetworkTime: string;
  avgProcessTime: string;
  errorRate: string;
  processStatus: ProcessStatus | null;
}

interface ProcessStatus {
  totalProcesses: number;
  maxProcesses: number;
  busyProcesses: number;
  queuedTasks: number;
  pendingTasks: number;
  processes: ProcessInfo[];
  isShuttingDown: boolean;
}

interface ProcessInfo {
  id: string;
  pid: number;
  busy: boolean;
  tasksProcessed: number;
  errors: number;
  uptime: number;
  lastActivity: number;
}