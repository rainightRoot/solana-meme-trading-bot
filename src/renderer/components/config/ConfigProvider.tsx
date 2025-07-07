import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Form, message } from 'antd';
import _ from 'lodash';
import { ConfigData, ConfigContextType } from './types';

const ConfigContext = createContext<ConfigContextType | null>(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

interface ConfigProviderProps {
  children: React.ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 防抖的保存函数
  const debouncedSave = useCallback(_.debounce(async (newConfig: ConfigData) => {
    setIsLoading(true);
    try {
      await window.electronAPI.updateConfig('', newConfig);
      message.success('配置已自动保存');
    } catch (error) {
      message.error('配置保存失败');
    } finally {
      setIsLoading(false);
    }
  }, 1500), []);

  const updateConfig = useCallback((newConfig: ConfigData) => {
    setConfig(newConfig);
    debouncedSave(newConfig);
  }, [debouncedSave]);

  const loadConfig = async () => {
    try {
      const configData = await window.electronAPI.getConfig();
      setConfig(configData);
      form.setFieldsValue({
        solana: {
          ...configData.solana,
          monitoredWallets: configData.solana.monitoredWallets?.join('\n') || '',
          proxies: configData.solana.proxies?.join('\n') || '',
          slippageBps: configData.solana.slippageBps || 50,
        },
        queue: configData.queue,
        logging: {
          ...configData.logging,
          maxFileSize: Math.round(configData.logging.maxFileSize / (1024 * 1024)),
        },
        ui: configData.ui,
        sellStrategy: configData.sellStrategy,
      });
    } catch (error) {
      message.error('配置加载失败');
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <ConfigContext.Provider value={{ config, isLoading, updateConfig, form }}>
      {children}
    </ConfigContext.Provider>
  );
}; 