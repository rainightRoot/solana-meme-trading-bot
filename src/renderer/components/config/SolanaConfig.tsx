import React from 'react';
import { Form, Input, Select, InputNumber, Card } from 'antd';
import { useConfig } from './ConfigProvider';

const { Option } = Select;
const { TextArea } = Input;

export const SolanaConfig: React.FC = () => {
  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Form.Item
        name={['solana', 'rpcUrl']}
        label="RPC URL"
        rules={[{ required: true, message: '请输入RPC URL' }]}
      >
        <Input placeholder="https://api.mainnet-beta.solana.com" />
      </Form.Item>
      
      <Form.Item
        name={['solana', 'followAmount']}
        label="跟单金额 (SOL)"
        rules={[{ required: true, message: '请输入跟单金额' }]}
      >
        <InputNumber
          min={0.001}
          max={100}
          step={0.001 as any}
          precision={3}
          style={{ width: '100%' }}
          placeholder="输入每次跟单的SOL数量"
        />
      </Form.Item>
      <Form.Item
        name={['solana', 'slippageBps']}
        label="滑点设置 (bps)"
        tooltip="基点为单位，100bps = 1%。例如：50bps = 0.5%"
        rules={[{ required: true, message: '请设置滑点' }]}
      >
        <InputNumber
          min={1}
          max={10000}
          style={{ width: '100%' }}
          placeholder="50"
          formatter={(value) => `${value} bps`}
          parser={(value) => value?.replace(' bps', '') as any}
        />
      </Form.Item>
      <Form.Item
        name={['solana', 'commitment']}
        label="确认级别"
      >
        <Select>
          <Option value="processed">processed</Option>
          <Option value="confirmed">confirmed</Option>
          <Option value="finalized">finalized</Option>
        </Select>
      </Form.Item>

      <Form.Item
        name={['solana', 'timeout']}
        label="超时时间 (ms)"
      >
        <InputNumber
          min={1000}
          max={120000}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        name={['solana', 'monitoredWallets']}
        label="监控钱包地址 (每行一个)"
      >
        <TextArea
          rows={4}
          placeholder="在此输入要监控的钱包地址，每行一个"
        />
      </Form.Item>

      <Form.Item
        name={['solana', 'proxies']}
        label="代理地址 (每行一个)"
      >
        <TextArea
          rows={4}
          placeholder="http://user:pass@host:port，每行一个"
        />
      </Form.Item>

      <Form.Item
        name={['solana', 'privateKey']}
        label="交易私钥"
      >
        <Input.Password placeholder="在此输入你的交易钱包私钥" />
      </Form.Item>

      
    </Card>
  );
}; 