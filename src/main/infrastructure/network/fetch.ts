import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { configManager } from '../config';
import { appLogger } from '../logging';

/**
 * 从配置中获取一个随机的代理并返回一个 ProxyAgent 实例
 * @returns {ProxyAgent | undefined}
 */
export function getProxyAgent(): any {
  const proxies = configManager.getNested<string[]>('solana.proxies') || [];
  
  if (proxies.length === 0) {
    return null;
  }
  
  // 随机选择一个代理
  const proxyUrl = proxies[Math.floor(Math.random() * proxies.length)];
  appLogger.debug('Using proxy:', proxyUrl);
  
  if (proxyUrl.startsWith('socks5://')) {
    return new SocksProxyAgent(proxyUrl);
  } else if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
    return new HttpsProxyAgent(proxyUrl);
  }
  
  appLogger.warn('Invalid proxy URL format:', proxyUrl);
  return null;
} 