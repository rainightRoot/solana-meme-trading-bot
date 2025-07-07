import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { appLogger } from '../../infrastructure/logging';
import { configManager } from '../../infrastructure/config';

class WalletManager {
  private signer: Keypair | null = null;

  constructor() {
    this.loadSignerFromConfig();
  }

  /**
   * 从配置中加载钱包私钥
   * 这个函数现在可以被重复调用来热重载钱包
   */
  public loadSignerFromConfig() {
    const privateKey = configManager.getNested<string>('solana.privateKey');
    if (!privateKey) {
      appLogger.error('在配置中未找到私钥 (solana.privateKey)');
      this.signer = null;
      return;
    }

    try {
      this.signer = Keypair.fromSecretKey(bs58.decode(privateKey));
      appLogger.info('交易钱包已成功加载');
    } catch (error) {
      appLogger.error('加载交易钱包失败，请检查私钥格式是否正确', error);
      this.signer = null;
    }
  }

  /**
   * 获取签名者 Keypair
   * @returns {Keypair | null}
   */
  public getSigner(): Keypair | null {
    if (!this.signer) {
      appLogger.error('签名者未加载，无法执行交易');
      return null;
    }
    return this.signer;
  }

  /**
   * 获取钱包公钥
   * @returns {string | null}
   */
  public getPublicKey(): string | null {
    return this.signer ? this.signer.publicKey.toBase58() : null;
  }
}

export const walletManager = new WalletManager(); 