import React, { useCallback } from 'react';
import {
  Card,
  Tabs,
  Form,
  Space,
} from 'antd';
import {
  SettingOutlined,
  ApiOutlined,
  MenuOutlined,
  FileTextOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { 
  ConfigProvider,
  useConfig,
  SolanaConfig,
  SellStrategyConfig,
  QueueConfig,
  LoggingConfig,
  ConfigData
} from './config';

const { TabPane } = Tabs;

const ConfigContent: React.FC = () => {
  const { config, isLoading, updateConfig, form } = useConfig();

  const handleFormChange = useCallback((changedValues: any, allValues: any) => {
    if (!config) return;
    
    // 处理特殊字段格式
    const processedValues = { ...allValues };

    if (processedValues.solana) {
      if (processedValues.solana.monitoredWallets) {
        processedValues.solana.monitoredWallets = processedValues.solana.monitoredWallets
          .split('\n')
          .filter((wallet: string) => wallet.trim() !== '');
      } else {
        processedValues.solana.monitoredWallets = [];
      }

      if (processedValues.solana.proxies) {
        processedValues.solana.proxies = processedValues.solana.proxies
          .split('\n')
          .filter((proxy: string) => proxy.trim() !== '');
      } else {
        processedValues.solana.proxies = [];
      }
    }

    if (processedValues.logging?.maxFileSize) {
      processedValues.logging.maxFileSize = processedValues.logging.maxFileSize * 1024 * 1024;
    }

    const newConfig = { ...config, ...processedValues } as ConfigData;
    updateConfig(newConfig);
  }, [config, updateConfig]);

  if (!config) return null;

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          <span>配置管理</span>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleFormChange}
        disabled={isLoading}
      >
        <Tabs defaultActiveKey="solana" type="card">
          <TabPane
            tab={
              <Space>
                <ApiOutlined />
                <span>Solana配置</span>
              </Space>
            }
            key="solana"
          >
            <SolanaConfig />
          </TabPane>
          
          <TabPane
            tab={
              <Space>
                <DollarOutlined />
                <span>卖出策略</span>
              </Space>
            }
            key="sellStrategy"
          >
            <SellStrategyConfig />
          </TabPane>
          
          <TabPane
            tab={
              <Space>
                <MenuOutlined />
                <span>队列配置</span>
              </Space>
            }
            key="queue"
          >
            <QueueConfig />
          </TabPane>

          <TabPane
            tab={
              <Space>
                <FileTextOutlined />
                <span>日志配置</span>
              </Space>
            }
            key="logging"
          >
            <LoggingConfig />
          </TabPane>
        </Tabs>
      </Form>
    </Card>
  );
};

export default function ConfigPanel() {
  return (
    <ConfigProvider>
      <ConfigContent />
    </ConfigProvider>
  );
} 