import React from 'react';
import { Form, Select, InputNumber, Card } from 'antd';

const { Option } = Select;

export const LoggingConfig: React.FC = () => {
  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Form.Item
        name={['logging', 'level']}
        label="日志级别"
      >
        <Select>
          <Option value="error">ERROR</Option>
          <Option value="warn">WARN</Option>
          <Option value="info">INFO</Option>
          <Option value="debug">DEBUG</Option>
        </Select>
      </Form.Item>

      <Form.Item
        name={['logging', 'maxFileSize']}
        label="最大文件大小 (MB)"
      >
        <InputNumber
          min={1}
          max={100}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        name={['logging', 'maxFiles']}
        label="最大文件数量"
      >
        <InputNumber
          min={1}
          max={20}
          style={{ width: '100%' }}
        />
      </Form.Item>
    </Card>
  );
}; 