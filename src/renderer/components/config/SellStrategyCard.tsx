import React from 'react';
import { Form, InputNumber, Card, Switch, Row, Col } from 'antd';

interface SellStrategyCardProps {
  title: string;
  pathPrefix: string[];
}

export const SellStrategyCard: React.FC<SellStrategyCardProps> = ({ title, pathPrefix }) => {
  return (
    <Card 
      size="small" 
      title={title}
      style={{ marginBottom: 16 }}
      extra={
        <Form.Item
          name={[...pathPrefix, 'enabled']}
          valuePropName="checked"
          style={{ margin: 0 }}
        >
          <Switch size="small" />
        </Form.Item>
      }
    >
      {/* 卖出比例区域 */}
      <Card 
        type="inner" 
        title="🎯 卖出比例" 
        size="small" 
        style={{ marginBottom: 12, backgroundColor: '#f8f9fa' }}
      >
        <Form.Item
          name={[...pathPrefix, 'sellRatio']}
          label="当触发条件时，卖出持仓的比例"
          style={{ marginBottom: 0 }}
        >
          <InputNumber
            min={0.01}
            max={1}
            step={0.1}
            precision={2}
            style={{ width: '100%' }}
            placeholder="0.50"
            formatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
            parser={(value) => Number((Number(value?.replace('%', '')) / 100).toFixed(2)) as any}
          />
        </Form.Item>
      </Card>

      {/* 触发条件区域 */}
      <Card 
        type="inner" 
        title="⚡ 触发条件（满足任一条件即卖出）" 
        size="small"
        style={{ backgroundColor: '#fff7e6' }}
      >
        <Row gutter={[16, 8]}>
          <Col span={24}>
            <strong>📈 获利条件</strong>
          </Col>
          <Col span={24}>
            <Form.Item
              name={[...pathPrefix, 'conditions', 'profitRatio']}
              label="当价格达到买入价的倍数时卖出"
              tooltip="如1.5表示价格上涨50%时触发卖出"
              style={{ marginBottom: 16 }}
            >
              <InputNumber
                min={1.01}
                max={10}
                step={0.1}
                precision={2}
                style={{ width: '100%' }}
                placeholder="1.5"
                formatter={(value) => `${Number(value)}x`}
                parser={(value) => Number(value?.replace('x', '')) as any}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 8]}>
          <Col span={24}>
            <strong>📉 止损条件</strong>
          </Col>
          <Col span={12}>
            <Form.Item
              name={[...pathPrefix, 'conditions', 'lossRatio']}
              label="亏损比例"
              tooltip="价格跌破买入价的比例"
            >
              <InputNumber
                min={0.01}
                max={0.99}
                precision={2}
                style={{ width: '100%' }}
                placeholder="0.20"
                formatter={(value) => `${((1 - Number(value)) * 100).toFixed(0)}%`}
                parser={(value) => (Number((1 - Number(value?.replace('%', '')) / 100).toFixed(2)) as any)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name={[...pathPrefix, 'conditions', 'lossTimeMinutes']}
              label="持续时间（分钟）"
              tooltip="亏损持续超过此时间才触发止损"
            >
              <InputNumber
                min={1}
                max={120}
                style={{ width: '100%' }}
                placeholder="10"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 8]}>
          <Col span={24}>
            <strong>🔻 回撤保护</strong>
          </Col>
          <Col span={12}>
            <Form.Item
              name={[...pathPrefix, 'conditions', 'pullbackRatio']}
              label="回撤比例"
              tooltip="从最高点回撤的比例"
            >
              <InputNumber
                min={0.01}
                max={0.99}
                precision={2}
                style={{ width: '100%' }}
                placeholder="0.60"
                formatter={(value) => `${((1 - Number(value)) * 100).toFixed(0)}%`}
                parser={(value) => (Number((1 - Number(value?.replace('%', '')) / 100).toFixed(2)) as any)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name={[...pathPrefix, 'conditions', 'pullbackTimeMinutes']}
              label="时间窗口（分钟）"
              tooltip="从创建最高点记录开始的时间限制"
            >
              <InputNumber
                min={1}
                max={120}
                style={{ width: '100%' }}
                placeholder="5"
              />
            </Form.Item>
          </Col>
        </Row>
      </Card>
    </Card>
  );
}; 