import React from 'react';
import { Form, InputNumber, Card } from 'antd';

export const QueueConfig: React.FC = () => {
  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Form.Item
        name={['queue', 'maxSize']}
        label="最大队列大小"
      >
        <InputNumber
          min={10}
          max={10000}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        name={['queue', 'consumerCount']}
        label="消费者数量"
      >
        <InputNumber
          min={1}
          max={20}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        name={['queue', 'maxProcesses']}
        label="消费者最大进程数量"
      >
        <InputNumber
          min={1}
          max={20}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        name={['queue', 'retryAttempts']}
        label="重试次数"
      >
        <InputNumber
          min={0}
          max={10}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        name={['queue', 'processTimeout']}
        label="进程超时时间 (ms)"
      >
        <InputNumber
          min={10000}
          max={300000}
          step={1000}
          style={{ width: '100%' }}
        />
      </Form.Item>
    </Card>
  );
}; 