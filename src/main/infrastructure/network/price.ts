import { solanaLogger } from '../logging';
import { getProxyAgent } from './fetch';
import { withRetry, RETRY_CONFIGS } from '../retry';
import fetch from 'cross-fetch';



// 模拟获取价格，后期接 BirdEye/Jupiter API
export async function getTokenPriceUSD(tokenMint: string): Promise<number> {
  return withRetry(async () => {
    const agent = getProxyAgent();
    const customFetch = (url: any, options: any) => {
      return fetch(url, { ...options, agent: agent as any });
    };

    // 尝试从 Jupiter 获取价格
    try {
      const response = await customFetch(`https://lite-api.jup.ag/price/v2?ids=${tokenMint}`, {});
      const text = await response.text();
      solanaLogger.info(`getTokenPriceUSD Jupiter response: ${text}`);
      const data = JSON.parse(text);

      if (data.data && data.data[tokenMint]) {
        return Number(data.data[tokenMint].price);
      }
    } catch (jupiterError) {
      solanaLogger.warn(`Jupiter price fetch failed for ${tokenMint}:`, jupiterError);
    }

    // Fallback to BirdEye if Jupiter fails
    const birdeyeResponse = await customFetch(`https://public-api.birdeye.so/public/price?address=${tokenMint}`, {
      headers: { 'x-api-key': process.env.BIRDEYE_API_KEY || '' }
    });
    const birdeyeData: any = await birdeyeResponse.json();

    if (birdeyeData.success && birdeyeData.data && birdeyeData.data.value) {
      return birdeyeData.data.value;
    }

    throw new Error(`Unable to fetch price for token ${tokenMint} from any source`);
  }, RETRY_CONFIGS.NETWORK, `getTokenPriceUSD(${tokenMint})`);
}

// 模拟获取价格，后期接 BirdEye/Jupiter API
export async function getMultiTokensPriceUSD(tokenMints: string): Promise<any> {
  return withRetry(async () => {
    const agent = getProxyAgent();
    const customFetch = (url: any, options: any) => {
      return fetch(url, { ...options, agent: agent as any });
    };
    
    const response = await customFetch(`https://lite-api.jup.ag/price/v2?ids=${tokenMints}`, {});
    const text = await response.text();
    solanaLogger.info(`getMultiTokensPriceUSD response: ${text}`);
    const data = JSON.parse(text);

    if (data.data) {
      return data.data;
    }

    throw new Error(`Unable to fetch prices for tokens: ${tokenMints}`);
  }, RETRY_CONFIGS.NETWORK, `getMultiTokensPriceUSD(${tokenMints})`);
}