import React from 'react';
import { Form, Card, Switch } from 'antd';
import { SellStrategyCard } from './SellStrategyCard';

export const SellStrategyConfig: React.FC = () => {
  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form.Item
          name={['sellStrategy', 'enabled']}
          label="启用卖出策略"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Card>

      {/* 工具使用费设置 */}
      <Card 
        size="small" 
        title="💰 工具使用费设置" 
        style={{ marginBottom: 16, border: '2px solid #ff7875' }}
      >
        <div style={{ backgroundColor: '#fff2f0', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
          <p style={{ margin: 0, color: '#cf1322', fontWeight: 'bold' }}>
            🔔 重要提示: 获利卖出时，将从获利部分收取 1% 作为工具使用费
          </p>
          <p style={{ margin: '8px 0 0 0', color: '#8c8c8c', fontSize: '12px' }}>
            使用费用于支持工具开发和维护，您可以选择关闭此功能
          </p>
          <p style={{ margin: '8px 0 0 0', color: '#8c8c8c', fontSize: '12px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            收费地址: DbiaahpvRpkm9c22JTRDvbmGW1jjGk8rTo8cRGwZPbfr
          </p>
        </div>
        
        <Form.Item
          name={['sellStrategy', 'toolFee', 'enabled']}
          label="启用工具使用费"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Card>

      {/* 三个层级的卖出策略 */}
      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        <SellStrategyCard 
          title="第一次卖出策略" 
          pathPrefix={['sellStrategy', 'strategies', 'initial']}
        />
        
        <SellStrategyCard 
          title="第二次卖出策略" 
          pathPrefix={['sellStrategy', 'strategies', 'second']}
        />
        
        <SellStrategyCard 
          title="第三次卖出策略" 
          pathPrefix={['sellStrategy', 'strategies', 'third']}
        />
      </div>
     
    </>
  );
}; 