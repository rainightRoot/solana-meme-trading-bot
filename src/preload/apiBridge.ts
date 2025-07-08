import {contextBridge,ipcRenderer} from 'electron'

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
}

contextBridge.exposeInMainWorld('electronAPI',{
  // 记录渲染进程日志
  logMessage:(msg:string)=>ipcRenderer.send('log-message',msg),


  // 获取版本
  getAppVersion:()=>{
    return ipcRenderer.invoke('get-app-version')
  },
  // 监听主进程日志
  onMainLog:(cb:(logEntry: LogEntry) => void) => {
    ipcRenderer.on('main-log', (_, logEntry) => cb(logEntry))
  },
    // 场景 4: 双向异步
  sendPing: () => ipcRenderer.send('ping'),
  onPong: (cb: (msg: string) => void) => {
    ipcRenderer.on('pong', (_, msg) => cb(msg));
  },
  // 通过主进程实现设置信息不同窗口通信
  sendToSet:(data:any)=>ipcRenderer.send('send-to-set',data),
  onSetFromMain:(cb:(data:any)=>void)=>{
    ipcRenderer.on('set-from-main',(_,data)=>cb(data))
  },

  showNotification: (title: string, body: string) => {
    new Notification(title, { body });
  },

  //  文件选择
  selectFiles: () => ipcRenderer.invoke('dialog:select-files'),
  // 打开网页
  openLink: (url: string) => ipcRenderer.send('shell:open-link', url),
  // 触发更新检查
  checkUpdate: () => ipcRenderer.send('update:check'),

  // 监听更新下载进度
  onUpdateDownloadProgress: (cb: (progress: any) => void) => {
    ipcRenderer.on('update-download-progress', (_, progress) => cb(progress));
  },

  // 配置管理 API
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (path: string, value: any) => ipcRenderer.invoke('config:update', path, value),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: (configJson: string) => ipcRenderer.invoke('config:import', configJson),
  
  // 监听配置变化
  onConfigChange: (cb: (newConfig: any, oldConfig: any) => void) => {
    ipcRenderer.on('config:changed', (_, newConfig, oldConfig) => cb(newConfig, oldConfig));
  },

  // 监控器控制 API
  getWatcherStatus: () => ipcRenderer.invoke('watcher:status'),
  startWatcher: () => ipcRenderer.invoke('watcher:start'),
  stopWatcher: () => ipcRenderer.invoke('watcher:stop'),

  // 消费者控制 API
  startConsumers: () => ipcRenderer.invoke('consumers:start'),
  stopConsumers: () => ipcRenderer.invoke('consumers:stop'),

  // 监控状态 API
  getMonitoringStatus: () => ipcRenderer.invoke('monitoring:status'),

  // 重试统计 API
  getRetryStats: (context?: string) => ipcRenderer.invoke('retry:stats', context),
  clearRetryStats: (context?: string) => ipcRenderer.invoke('retry:clear-stats', context),

  // 持仓管理 API
  getPositions: (query?: any) => ipcRenderer.invoke('positions:list', query),
  getPosition: (tokenMint: string, walletAddress: string) => ipcRenderer.invoke('positions:get', tokenMint, walletAddress),
  getTrades: (positionId?: number, walletAddress?: string, limit?: number, offset?: number) => 
    ipcRenderer.invoke('positions:trades', positionId, walletAddress, limit, offset),
  getPositionStats: (walletAddress?: string) => ipcRenderer.invoke('positions:stats', walletAddress),
  updatePositionPrice: (tokenMint: string, walletAddress: string, priceSol: number, priceUsd: number) =>
    ipcRenderer.invoke('positions:update-price', tokenMint, walletAddress, priceSol, priceUsd),
  deletePosition: (tokenMint: string, walletAddress: string) => 
    ipcRenderer.invoke('positions:delete', tokenMint, walletAddress),
  
  // 持仓卖出 API
  sellPosition: (tokenMint: string, walletAddress: string, sellRatio: number) =>
    ipcRenderer.invoke('positions:sell', tokenMint, walletAddress, sellRatio),

  // 队列管理 API
  clearQueue: (channel?: string) => ipcRenderer.invoke('queue:clear', channel),
  // 队列管理 API
  scanBlock: (block?: number) => ipcRenderer.invoke('scan:block', block),

  // 钱包信息 API
  getWalletInfo: () => ipcRenderer.invoke('wallet:info')
})