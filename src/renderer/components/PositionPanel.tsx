import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Statistic, 
  Row, 
  Col, 
  Card, 
  Tag, 
  Button, 
  Space, 
  Typography, 
  Spin, 
  Empty,
  Tabs,
  Tooltip,
  Badge,
  Progress,
  Modal,
  Slider,
  message,
  Popconfirm,
  InputNumber
} from 'antd';
import {
  ReloadOutlined,
  TrophyOutlined,
  DollarOutlined,
  LineChartOutlined,
  RiseOutlined,
  FallOutlined,
  CopyOutlined,
  EyeOutlined,
  ShoppingCartOutlined,
  ThunderboltOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { formatNumberSmart } from '../utils/priceFormatter';

const { Text, Title } = Typography;
const { TabPane } = Tabs;

// 本地类型定义（避免全局类型引用问题）
interface Position {
  id?: number;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  wallet_address: string;
  status: 'open' | 'closed';
  total_buy_amount: number;
  total_buy_cost_sol: number;
  total_buy_cost_usd: number;
  total_sell_amount: number;
  total_sell_value_sol: number;
  total_sell_value_usd: number;
  avg_buy_price_sol: number;
  avg_buy_price_usd: number;
  current_amount: number;
  realized_pnl_sol: number;
  realized_pnl_usd: number;
  unrealized_pnl_sol: number;
  unrealized_pnl_usd: number;
  current_price_sol: number;
  current_price_usd: number;
  first_buy_at?: string;
  last_trade_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface PositionStats {
  total_positions: number;
  open_positions: number;
  closed_positions: number;
  total_invested_sol: number;
  total_invested_usd: number;
  total_realized_pnl_sol: number;
  total_realized_pnl_usd: number;
  total_unrealized_pnl_sol: number;
  total_unrealized_pnl_usd: number;
  total_pnl_sol: number;
  total_pnl_usd: number;
  win_rate: number;
  best_trade_pnl_sol: number;
  worst_trade_pnl_sol: number;
}

interface PositionQuery {
  wallet_address?: string;
  status?: 'open' | 'closed';
  token_mint?: string;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at' | 'total_buy_cost_sol' | 'unrealized_pnl_sol';
  order_dir?: 'ASC' | 'DESC';
}

interface PositionPanelProps {
  walletAddress?: string;
}

export default function PositionPanel({ walletAddress }: PositionPanelProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<PositionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'open' | 'closed' | 'all'>('open');
  
  // 卖出功能相关状态
  const [sellModalVisible, setSellModalVisible] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [sellRatio, setSellRatio] = useState(0.5); // 默认卖出50%
  const [sellLoading, setSellLoading] = useState(false);

  // 获取持仓数据
  const fetchPositions = async () => {
    try {
      setLoading(true);
      const query: PositionQuery = {
        wallet_address: walletAddress,
        status: activeTab === 'all' ? undefined : activeTab,
        order_by: 'updated_at',
        order_dir: 'DESC',
        limit: 50
      };
      
      const [positionsData, statsData] = await Promise.all([
        window.electronAPI.getPositions(query),
        window.electronAPI.getPositionStats(walletAddress)
      ]);
      
      setPositions(positionsData);
      setStats(statsData);
    } catch (error) {
      console.error('获取持仓数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [walletAddress, activeTab]);



  // 格式化Token地址显示
  const formatTokenMint = (mint: string) => {
    return `${mint.slice(0, 6)}...${mint.slice(-6)}`;
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 打开卖出模态框
  const openSellModal = (position: Position) => {
    setSelectedPosition(position);
    setSellRatio(0.5); // 重置为50%
    setSellModalVisible(true);
  };

  // 一键全部卖出
  const sellAll = async (position: Position) => {
    try {
      setSellLoading(true);
      const result = await window.electronAPI.sellPosition(position.token_mint, position.wallet_address, 1.0);
      message.success(`卖出成功！交易签名: ${result.txSignature}`);
      fetchPositions(); // 刷新持仓数据
    } catch (error) {
      message.error(`卖出失败: ${error instanceof Error ? error.message : '未知错误'}`);
      console.error('Sell all failed:', error);
    } finally {
      setSellLoading(false);
    }
  };

  // 按比例卖出
  const sellByRatio = async () => {
    if (!selectedPosition) return;
    
    try {
      setSellLoading(true);
      const result = await window.electronAPI.sellPosition(
        selectedPosition.token_mint, 
        selectedPosition.wallet_address, 
        sellRatio
      );
      message.success(`卖出成功！交易签名: ${result.txSignature}`);
      setSellModalVisible(false);
      fetchPositions(); // 刷新持仓数据
    } catch (error) {
      message.error(`卖出失败: ${error instanceof Error ? error.message : '未知错误'}`);
      console.error('Sell by ratio failed:', error);
    } finally {
      setSellLoading(false);
    }
  };

  // 获取盈亏显示组件
  const getPnLDisplay = (pnlSol: number, pnlUsd: number, isSmall = false) => {
    const isPositive = pnlSol > 0;
    const isNegative = pnlSol < 0;
    const color = isPositive ? '#52c41a' : isNegative ? '#ff4d4f' : '#666';
    const icon = isPositive ? <RiseOutlined /> : isNegative ? <FallOutlined /> : null;
    
    return (
      <div style={{ textAlign: isSmall ? 'left' : 'center' }}>
        <div style={{ color, fontWeight: '600', fontSize: isSmall ? '14px' : '16px' }}>
          {icon && <span style={{ marginRight: '4px' }}>{icon}</span>}
          {formatNumberSmart(pnlSol)}
        </div>
        <div style={{ color: '#999', fontSize: '12px' }}>
          {formatNumberSmart(pnlUsd)}
        </div>
      </div>
    );
  };

  // 定义表格列
  const columns: ColumnsType<Position> = [
    {
      title: 'Token',
      dataIndex: 'token_mint',
      key: 'token_mint',
      width: 200,
      render: (mint: string, record: Position) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tooltip title={mint}>
              <Text code style={{ fontSize: '12px' }}>
                {formatTokenMint(mint)}
              </Text>
            </Tooltip>
            <Button 
              type="text" 
              size="small" 
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(mint)}
            />
          </div>
          {record.token_symbol && (
            <Tag color="blue" style={{ marginTop: '4px', fontSize: '12px' }}>
              {record.token_symbol}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '持有数量',
      dataIndex: 'current_amount',
      key: 'current_amount',
      width: 120,
      align: 'right',
      render: (amount: number) => (
        <div>
          <Text strong>{formatNumberSmart(amount)}</Text>
        </div>
      ),
    },
    {
      title: '平均成本',
      key: 'avg_cost',
      width: 150,
      align: 'right',
      render: (record: Position) => (
        <div>
          <div><Text strong>{formatNumberSmart(record.avg_buy_price_sol)}</Text></div>
          <div><Text type="secondary" style={{ fontSize: '12px' }}>
            {formatNumberSmart(record.avg_buy_price_usd)}
          </Text></div>
        </div>
      ),
    },
    {
      title: '当前价格',
      key: 'current_price',
      width: 150,
      align: 'right',
      render: (record: Position) => (
        <div>
          <div><Text strong>{formatNumberSmart(record.current_price_sol)}</Text></div>
          <div><Text type="secondary" style={{ fontSize: '12px' }}>
            {formatNumberSmart(record.current_price_usd)}
          </Text></div>
        </div>
      ),
    },
    {
      title: '未实现盈亏',
      key: 'unrealized_pnl',
      width: 150,
      align: 'center',
      render: (record: Position) => 
        getPnLDisplay(record.unrealized_pnl_sol, record.unrealized_pnl_usd, true),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status: string) => (
        <Tag color={status === 'open' ? 'green' : 'red'}>
          {status === 'open' ? '开仓' : '已平仓'}
        </Tag>
      ),
    },
    {
      title: '最后交易',
      dataIndex: 'last_trade_at',
      key: 'last_trade_at',
      width: 150,
      render: (time: string) => (
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {time ? new Date(time).toLocaleString() : 'N/A'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      align: 'center',
      render: (_, record: Position) => {
        // 只对开仓持仓显示卖出按钮
        if (record.status !== 'open' || record.current_amount <= 0) {
          return <Text type="secondary">-</Text>;
        }
        
        return (
          <Space size="small">
            <Tooltip title="按比例卖出">
              <Button
                type="primary"
                size="small"
                icon={<ShoppingCartOutlined />}
                onClick={() => openSellModal(record)}
                disabled={sellLoading}
              >
                卖出
              </Button>
            </Tooltip>
            <Tooltip title="一键全部卖出">
              <Popconfirm
                title="确认卖出"
                description={`确定要全部卖出 ${formatNumberSmart(record.current_amount)} 个代币吗？`}
                onConfirm={() => sellAll(record)}
                okText="确认"
                cancelText="取消"
              >
                <Button
                  danger
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={sellLoading}
                >
                  全卖
                </Button>
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const tabItems = [
    {
      key: 'open',
      label: (
        <Space>
          <LineChartOutlined />
          <span>开仓持仓</span>
          <Badge count={stats?.open_positions || 0} size="small" />
        </Space>
      ),
    },
    {
      key: 'closed',
      label: (
        <Space>
          <TrophyOutlined />
          <span>已平仓</span>
          <Badge count={stats?.closed_positions || 0} size="small" />
        </Space>
      ),
    },
    {
      key: 'all',
      label: (
        <Space>
          <EyeOutlined />
          <span>全部</span>
          <Badge count={stats?.total_positions || 0} size="small" />
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>
          <Text type="secondary">加载持仓数据中...</Text>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="总投资"
                value={stats.total_invested_sol}
                precision={4}
                suffix="SOL"
                prefix={<DollarOutlined />}
                valueStyle={{ color: '#1890ff',fontSize:'16px' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {formatNumberSmart(stats.total_invested_usd)}
              </Text>
            </Card>
          </Col>
          
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="已实现盈亏"
                value={stats.total_realized_pnl_sol}
                precision={4}
                suffix="SOL"
                prefix={stats.total_realized_pnl_sol >= 0 ? <RiseOutlined /> : <FallOutlined />}
                valueStyle={{ 
                  color: stats.total_realized_pnl_sol >= 0 ? '#52c41a' : '#ff4d4f' ,fontSize:'16px'
                }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {formatNumberSmart(stats.total_realized_pnl_usd)}
              </Text>
            </Card>
          </Col>
          
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="未实现盈亏"
                value={formatNumberSmart(stats.total_unrealized_pnl_sol)}
                precision={4}
                suffix="SOL"
                prefix={stats.total_unrealized_pnl_sol >= 0 ? <RiseOutlined /> : <FallOutlined />}
                valueStyle={{ 
                  color: stats.total_unrealized_pnl_sol >= 0 ? '#52c41a' : '#ff4d4f' ,fontSize:'16px'
                }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {formatNumberSmart(stats.total_unrealized_pnl_usd)}
              </Text>
            </Card>
          </Col>
          
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="胜率"
                value={stats.win_rate * 100}
                precision={1}
                suffix="%"
                prefix={<TrophyOutlined />}
                valueStyle={{ 
                  color: stats.win_rate >= 0.5 ? '#52c41a' : '#ff4d4f' ,fontSize:'16px'
                }}
              />
              <Progress 
                percent={stats.win_rate * 100} 
                size="small" 
                showInfo={false}
                strokeColor={stats.win_rate >= 0.5 ? '#52c41a' : '#ff4d4f'}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 持仓表格 */}
      <Card
        title={
          <Space>
            <LineChartOutlined />
            <span>持仓详情</span>
          </Space>
        }
        extra={
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={fetchPositions}
            loading={loading}
          >
            刷新
          </Button>
        }
      >
        <Tabs 
          activeKey={activeTab} 
          onChange={(key) => setActiveTab(key as 'open' | 'closed' | 'all')}
          items={tabItems}
          style={{ marginBottom: '16px' }}
        />
        
        <Table
          dataSource={positions}
          columns={columns}
          rowKey={(record) => `${record.token_mint}-${record.wallet_address}`}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无持仓数据"
              />
            )
          }}
          scroll={{ x: 1000 }}
          size="small"
        />
      </Card>
      
      {/* 卖出模态框 */}
      <Modal
        title="按比例卖出"
        open={sellModalVisible}
        onCancel={() => setSellModalVisible(false)}
        onOk={sellByRatio}
        confirmLoading={sellLoading}
        okText="确认卖出"
        cancelText="取消"
        width={500}
      >
        {selectedPosition && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: '16px' }}>
              <Text strong>Token: </Text>
              <Text code>{formatTokenMint(selectedPosition.token_mint)}</Text>
              {selectedPosition.token_symbol && (
                <Tag color="blue" style={{ marginLeft: '8px' }}>
                  {selectedPosition.token_symbol}
                </Tag>
              )}
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <Text strong>当前持有: </Text>
              <Text>{formatNumberSmart(selectedPosition.current_amount)}</Text>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <Text strong>当前价格: </Text>
              <Text>{formatNumberSmart(selectedPosition.current_price_sol)}</Text>
              <Text type="secondary" style={{ marginLeft: '8px' }}>
                ({formatNumberSmart(selectedPosition.current_price_usd)})
              </Text>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <Text strong>卖出比例: </Text>
              <Text style={{ fontSize: '16px', color: '#1890ff' }}>
                {(sellRatio * 100).toFixed(0)}%
              </Text>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <Slider
                min={0.01}
                max={1}
                step={0.01}
                value={sellRatio}
                onChange={setSellRatio}
                tooltip={{
                  formatter: (value) => `${((value || 0) * 100).toFixed(0)}%`
                }}
                marks={{
                  0.25: '25%',
                  0.5: '50%',
                  0.75: '75%',
                  1: '100%'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <Row gutter={8}>
                <Col span={12}>
                  <Text strong>卖出数量: </Text>
                  <Text style={{ color: '#52c41a' }}>
                    {formatNumberSmart(selectedPosition.current_amount * sellRatio)}
                  </Text>
                </Col>
                <Col span={12}>
                  <Text strong>预计收入: </Text>
                  <Text style={{ color: '#52c41a' }}>
                    {formatNumberSmart(selectedPosition.current_amount * sellRatio * selectedPosition.current_price_sol)} Sol
                  </Text>
                </Col>
              </Row>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <Space size="small">
                <Button size="small" onClick={() => setSellRatio(0.25)}>25%</Button>
                <Button size="small" onClick={() => setSellRatio(0.5)}>50%</Button>
                <Button size="small" onClick={() => setSellRatio(0.75)}>75%</Button>
                <Button size="small" onClick={() => setSellRatio(1)}>100%</Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
} 