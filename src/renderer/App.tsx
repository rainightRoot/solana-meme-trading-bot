import React, { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Card,
  Button,
  Badge,
  Row,
  Col,
  Space,
  Typography,
  Form,
  Input,
  Statistic,
  Drawer,
  Tag,
  Divider,
  Alert,
  Dropdown,
  Modal
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  FileTextOutlined,
  DashboardOutlined,
  WalletOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ExclamationCircleOutlined,
  CopyOutlined,
  DownOutlined
} from '@ant-design/icons';
import ConfigPanel from './components/ConfigPanel';
import PositionPanel from './components/PositionPanel';
import MonitoringPanel from './components/MonitoringPanel';
import { formatSOLPrice } from './utils/priceFormatter';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
}

export default function App() {
  const [version, setVersion] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  let config: any = {}
  const [watcherStatus, setWatcherStatus] = useState<any>(null);
  const [consumersRunning, setConsumersRunning] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorLogs, setErrorLogs] = useState<LogEntry[]>([]);
  const [walletInfo, setWalletInfo] = useState<{ address: string; balance: number } | null>(null);
  const [startWatcherLoading, setStartWatcherLoading] = useState(false);
  const [stopWatcherLoading, setStopWatcherLoading] = useState(false);
  const [startScanLoading, setStartScanLoading] = useState(false);

  const [clearQueueLoading, setClearQueueLoading] = useState(false);
  const [showMonitoringPanel, setShowMonitoringPanel] = useState(false);
  const logContentRef = useRef<HTMLDivElement>(null);
  const errorLogContentRef = useRef<HTMLDivElement>(null);
  const [form] = Form.useForm();
  // 日志级别层次 (数字越小级别越高)
  const logLevels = {
    'error': 0,
    'warn': 1,
    'info': 2,
    'debug': 3
  };

  // 获取筛选后的日志
  const getFilteredLogs = () => {
    return logs
  };

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await window.electronAPI.getAppVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error('Failed to get version:', error);
      }
    };

    const loadConfig = async () => {
      try {
        const configData = await window.electronAPI.getConfig();
        config = { ...configData }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    fetchVersion();
    loadConfig();
    getWalletInfo();

    // 监听配置变化
    window.electronAPI.onConfigChange((newConfig: any) => {
      console.log('配置已更新，新的日志级别:', newConfig.logging?.level);
      config = { ...newConfig }
    });

    // 设置日志接收监听器
    window.electronAPI.onMainLog((logEntry: LogEntry) => {
      const configLevel = config?.logging?.level?.toLowerCase();
      const currentLogLevel = logEntry.level.toLowerCase();
      if (configLevel && logLevels[currentLogLevel as keyof typeof logLevels] <= logLevels[configLevel as keyof typeof logLevels]) {

        setLogs(prevLogs => {
          // 新日志添加到数组开头（倒序显示）
          const newLogs = [logEntry, ...prevLogs];
          if (logEntry.level.toLowerCase() === 'error') {
            setErrorLogs(prevErrorLogs => {
              const newErrorLogs = [logEntry, ...prevErrorLogs];
              return newErrorLogs;
            });
          }

          return newLogs.slice(0, 400);
        });
      }

    });

    // 定期更新状态
    const statusInterval = setInterval(() => {
      getWatcherStatus();
      getWalletInfo();
    }, 2000);

    return () => {
      clearInterval(statusInterval);
    };
  }, []);

  const startScan = async (values: any) => {
    try {
      setStartScanLoading(true);
      await window.electronAPI.scanBlock(form.getFieldValue('block') as number || 1);
    } catch (error) {
      console.error('Failed to start scan:', error);
    } finally {
      setStartScanLoading(false);
      form.setFieldsValue({ block: null });
    }
  }
  // 自动滚动到顶部（倒序显示，最新日志在顶部）
  // useEffect(() => {
  //   if (logContentRef.current) {
  //     logContentRef.current.scrollTop = 0;
  //   }
  // }, [logs]);

  const getWatcherStatus = async () => {
    try {
      const status = await window.electronAPI.getWatcherStatus();
      // console.log('watcherStatus', status);
      setWatcherStatus(status);
    } catch (error) {
      console.error('Failed to get watcher status:', error);
    }
  };
  const getWalletInfo = async () => {
    try {
      const walletData = await window.electronAPI.getWalletInfo();
      setWalletInfo(walletData);
    } catch (error) {
      console.error('Failed to get wallet info:', error);
    }
  };

  const startWatcher = async () => {
    try {
      setStartWatcherLoading(true);
      await window.electronAPI.clearQueue('SlotUpdate');
      await window.electronAPI.startConsumers();
      await window.electronAPI.startWatcher();
      setConsumersRunning(true);
      getWatcherStatus();
    } catch (error) {
      console.error('Failed to start watcher:', error);
    } finally {
      setStartWatcherLoading(false);
    }
  };

  const stopWatcher = async () => {
    try {
      setStopWatcherLoading(true);
      await window.electronAPI.stopWatcher();
      await window.electronAPI.stopConsumers()
      getWatcherStatus();
      setConsumersRunning(false);
    } catch (error) {
      console.error('Failed to stop watcher:', error);
    } finally {
      setStopWatcherLoading(false);
    }
  };



  // 清空队列
  const clearQueue = async () => {
    try {
      setClearQueueLoading(true);
      await window.electronAPI.clearQueue('SlotUpdate');
      getWatcherStatus(); // 刷新状态以更新队列长度
    } catch (error) {
      console.error('Failed to clear queue:', error);
    } finally {
      setClearQueueLoading(false);
    }
  };

  // 清空所有日志
  const clearAllLogs = () => {
    setLogs([]);
  };

  // 清空非错误日志（保留错误日志）
  const clearNonErrorLogs = () => {
    setLogs(prevLogs => prevLogs.filter(log => log.level.toLowerCase() === 'error'));
  };


  // 清空错误日志
  const clearErrorLogs = () => {
    setErrorLogs([]);
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };



  // 获取日志级别的颜色
  const getLogLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'red';
      case 'warn':
        return 'orange';
      case 'info':
        return 'green';
      case 'debug':
        return 'purple';
      default:
        return 'default';
    }
  };

  // 计算日志统计（基于筛选后的日志）
  const getLogStats = () => {
    const filteredLogs = getFilteredLogs();
    const stats = { error: 0, warn: 0, info: 0, debug: 0, total: filteredLogs.length };
    filteredLogs.forEach(log => {
      const level = log.level.toLowerCase();
      if (level in stats) {
        stats[level as keyof typeof stats]++;
      }
    });
    return stats;
  };

  const logStats = getLogStats();

  return (
    <Layout className="app-layout" style={{ minHeight: '100vh' }}>
      <Header className="app-header" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 24px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Space align="center">
            <DashboardOutlined style={{ fontSize: '24px', color: '#fff' }} />
            <Title level={3} style={{ color: '#fff', margin: 0 }}>
              memeSOL - Solana 监控工具
            </Title>
          </Space>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* 错误日志数量显示 */}
          {errorLogs.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                padding: '4px 12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={() => setShowErrorModal(true)}
            >
              <ExclamationCircleOutlined
                style={{
                  color: '#ff4d4f',
                  fontSize: '16px',
                  marginRight: '8px',
                  animation: errorLogs.length > 0 ? 'pulse 2s infinite' : 'none'
                }}
              />
              <Badge
                count={errorLogs.length}
                style={{
                  backgroundColor: '#ff4d4f',
                  color: '#fff'
                }}
              />
              <Text style={{ color: '#fff', marginLeft: '8px', fontSize: '12px' }}>
                错误
              </Text>
            </div>
          )}

          {/* 当前日志级别显示 */}
          {config?.logging?.level && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                padding: '4px 12px',
              }}
            >
              <FileTextOutlined
                style={{
                  color: '#52c41a',
                  fontSize: '16px',
                  marginRight: '8px'
                }}
              />
              <Text style={{ color: '#fff', fontSize: '12px' }}>
                日志级别: {config.logging.level.toUpperCase()}
              </Text>
            </div>
          )}

          {/* 监控面板按钮 */}
          <div
            onClick={() => setShowMonitoringPanel(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%)',
              borderRadius: '25px',
              height: '27px',
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.15) 100%)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <DashboardOutlined
              style={{
                color: '#ffffff',
                fontSize: '16px',
                marginRight: '8px'
              }}
            />
            <span style={{
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: '500',
              letterSpacing: '0.3px'
            }}>
              系统监控
            </span>
          </div>

        </div>
      </Header>

      <Content style={{ padding: '24px', paddingTop: '88px', background: '#f0f2f5' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} lg={16}>
            {/* 系统状态区域 */}
            <Card
              title={
                <Space>
                  <DashboardOutlined />
                  <span>系统状态</span>
                  <Badge
                    status={watcherStatus?.isRunning ? 'processing' : 'default'}
                    text={watcherStatus?.isRunning ? '运行中' : '已停止'}
                  />
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                  <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                    <Statistic
                      title={<Space><ApiOutlined />应用信息</Space>}
                      value={version}
                      valueStyle={{ fontSize: '16px' }}
                    />
                    <Divider style={{ margin: '8px 0' }} />
                    <Space>
                      <Text type="secondary">连接状态:</Text>
                      <Tag color={watcherStatus?.connection === 'connected' ? 'green' : 'red'}>
                        {watcherStatus?.connection === 'connected' ? '已连接' : '未连接'}
                      </Tag>
                    </Space>
                  </Card>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                    <Statistic
                      title={<Space><ThunderboltOutlined />网络信息</Space>}
                      value={watcherStatus?.latestSlot || 'N/A'}
                      valueStyle={{ fontSize: '16px' }}
                    />
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={watcherStatus?.config?.rpcUrl || 'N/A'}>
                      RPC: {watcherStatus?.config?.rpcUrl ?
                        watcherStatus.config.rpcUrl :
                        'N/A'
                      }
                    </div>
                  </Card>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                    <Statistic
                      title={<Space><FileTextOutlined />处理状态</Space>}
                      value={watcherStatus?.queueLength ?? 'N/A'}
                      suffix="队列"
                      valueStyle={{ fontSize: '16px' }}
                    />
                    <Divider style={{ margin: '8px 0' }} />
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Space>
                        <Text type="secondary"></Text>
                        <Tag color={consumersRunning ? 'green' : 'red'}>
                          {consumersRunning ? '运行中' : '已停止'}
                        </Tag>
                        {watcherStatus?.queueLength > 0 && (
                          <Button
                            size="small"
                            type="text"
                            danger
                            loading={clearQueueLoading}
                            onClick={clearQueue}
                            style={{ fontSize: '12px', height: '24px', padding: '0 8px' }}
                          >
                            清空队列
                          </Button>
                        )}
                      </Space>

                    </Space>
                  </Card>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                    <div>
                      <div style={{ marginBottom: '8px', color: '#666', fontSize: '14px' }}>
                        <Space><WalletOutlined />钱包信息</Space>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#52c41a' }}>
                        {formatSOLPrice(walletInfo?.balance || 0)}
                      </div>
                    </div>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Text type="secondary">地址:</Text>
                      <Text code style={{ fontSize: '11px' }}>
                        {walletInfo?.address ?
                          `${walletInfo.address.slice(0, 4)}...${walletInfo.address.slice(-4)}` :
                          'N/A'
                        }
                      </Text>
                      {walletInfo?.address && (
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(walletInfo.address)}
                          style={{ padding: '0 4px', height: '16px' }}
                        />
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>

              <Divider />

              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card size="small" title="扫链控制" bordered={false} style={{ background: '#fafafa' }}>
                    <Space size="middle">
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={startWatcher}
                        disabled={watcherStatus?.isRunning || startWatcherLoading || stopWatcherLoading}
                        loading={startWatcherLoading}
                        size="large"
                      >
                        开始监控
                      </Button>
                      <Button
                        danger
                        icon={<PauseCircleOutlined />}
                        onClick={stopWatcher}
                        disabled={!watcherStatus?.isRunning || startWatcherLoading || stopWatcherLoading}
                        loading={stopWatcherLoading}
                        size="large"
                      >
                        停止监控
                      </Button>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="扫描区块" bordered={false} style={{ background: '#fafafa' }}>
                    <Form form={form} onFinish={startScan}>
                      <Space size="small" style={{ height: '40px' }}>
                        <Form.Item
                          name={'block'}
                          rules={[{ required: true, message: '请输入slot' }]}
                          style={{ height: '40px', marginBottom: 0 }}
                        >
                          <Input placeholder="1" style={{ marginTop: '4px' }} />
                        </Form.Item>
                        <Button
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          htmlType='submit'
                          loading={startScanLoading}
                          disabled={startScanLoading}
                          size="middle"
                        >
                          开始扫描
                        </Button>
                      </Space>
                    </Form>
                  </Card>
                </Col>


              </Row>
            </Card>

            {/* 持仓管理区域 */}
            <Card
              title={
                <Space>
                  <WalletOutlined />
                  <span>持仓管理</span>
                </Space>
              }
              extra={
                <Button
                  type={showLogs ? "primary" : "default"}
                  icon={showLogs ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => setShowLogs(!showLogs)}
                >
                  {showLogs ? '隐藏日志' : '显示日志'}
                  {getFilteredLogs().length > 0 && (
                    <Badge count={getFilteredLogs().length} size="small" style={{ marginLeft: 8 }} />
                  )}
                </Button>
              }
              style={{ marginBottom: 16 }}
            >
              <PositionPanel />
            </Card>
          </Col>
          <Col xs={24} sm={24} lg={8}>
            <ConfigPanel />
          </Col>
        </Row>


        {/* 日志抽屉 */}
        <Drawer
          title={
            <Space>
              <FileTextOutlined />
              <span>实时日志</span>
              <Space size="small">
                <Badge count={logStats.total} color="blue" />
                <Badge count={logStats.error} color="red" />
                <Badge count={logStats.warn} color="orange" />
                <Badge count={logStats.info} color="green" />
                <Badge count={logStats.debug} color="purple" />
              </Space>
            </Space>
          }
          placement="bottom"
          closable={true}
          onClose={() => setShowLogs(false)}
          open={showLogs}
          height="50vh"
          extra={
            <Space>
              <Button
                size="small"
                danger
                icon={<ExclamationCircleOutlined />}
                onClick={() => setShowErrorModal(true)}
                disabled={errorLogs.length === 0}
              >
                错误日志 ({errorLogs.length})
              </Button>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: '1',
                      label: '清空非错误日志',
                      onClick: clearNonErrorLogs,
                    },
                    {
                      key: '2',
                      label: '清空所有日志',
                      onClick: clearAllLogs,
                      danger: true,
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button size="small" icon={<DownOutlined />}>
                  清空日志
                </Button>
              </Dropdown>
            </Space>
          }
        >
          <div
            className="log-content"
            ref={logContentRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              padding: '8px 0'
            }}
          >
            {getFilteredLogs().length === 0 ? (
              <Alert

                description={
                  config?.logging?.level
                    ? `当前日志级别: ${config.logging.level.toUpperCase()}，只显示该级别及以上的日志`
                    : "系统日志将在这里显示，最新日志在顶部，错误日志会自动保留"
                }
                type="info"
                showIcon
              />
            ) : (
              <>
                <Alert
                  description={
                    config?.logging?.level
                      ? `当前显示级别: ${config.logging.level.toUpperCase()} 及以上 (共 ${getFilteredLogs().length} 条)`
                      : "日志按时间倒序显示（最新在顶部），错误日志会自动保留不被清理"
                  }
                  type="info"
                  showIcon
                  style={{ marginBottom: '12px' }}
                  closable
                />
                {getFilteredLogs().map((log, index) => {
                  const isError = log.level.toLowerCase() === 'error';
                  return (
                    <div
                      key={index}
                      style={{
                        marginBottom: '8px',
                        padding: '12px',
                        background: isError ? '#fff2f0' : '#fafafa',
                        borderRadius: '6px',
                        border: isError ? '1px solid #ffccc7' : 'none',
                        boxShadow: isError ? '0 2px 4px rgba(255, 77, 79, 0.1)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                        {isError && (
                          <ExclamationCircleOutlined
                            style={{
                              color: '#ff4d4f',
                              fontSize: '14px',
                              marginTop: '2px'
                            }}
                          />
                        )}
                        <Tag color="blue" style={{ marginBottom: 0 }}>
                          {new Date(String(log.timestamp)).toLocaleTimeString()}
                        </Tag>
                        <Tag color={getLogLevelColor(log.level)} style={{ marginBottom: 0 }}>
                          {String(log.level).toUpperCase()}
                        </Tag>
                        <Tag style={{ marginBottom: 0 }}>
                          {String(log.context)}
                        </Tag>
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        <Text
                          style={{
                            color: isError ? '#ff4d4f' : '#666',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            display: 'block',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: isError ? 'monospace' : 'inherit'
                          }}
                        >
                          {String(log.message)}
                        </Text>
                      </div>

                      {isError && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #ffccc7' }}>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            🔒 错误日志已保留 | 错误时间: {new Date(String(log.timestamp)).toLocaleString()}
                          </Text>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </Drawer>

        {/* 错误日志弹框 */}
        <Modal
          title={
            <Space>
              <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
              <span>错误日志详情</span>
              <Badge count={errorLogs.length} style={{ backgroundColor: '#ff4d4f' }} />
            </Space>
          }
          open={showErrorModal}
          onCancel={() => setShowErrorModal(false)}
          width={900}
          footer={[
            <Button key="clear" danger onClick={clearErrorLogs}>
              清空错误日志
            </Button>,
            <Button key="close" onClick={() => setShowErrorModal(false)}>
              关闭
            </Button>,
          ]}
          style={{ top: 20 }}
        >
          <div
            className="error-log-content"
            ref={errorLogContentRef}
            style={{
              height: '60vh',
              overflowY: 'auto',
              padding: '8px 0'
            }}
          >
            {errorLogs.length === 0 ? (
              <Alert
                description="系统运行正常，没有发现错误"
                type="success"
                showIcon
                style={{ textAlign: 'center' }}
              />
            ) : (
              <>
                <Alert
                  message={`共发现 ${errorLogs.length} 条错误日志`}
                  type="error"
                  showIcon
                  style={{ marginBottom: '16px' }}
                />
                {errorLogs.map((log, index) => (
                  <div
                    key={`error-${index}`}
                    style={{
                      marginBottom: '16px',
                      padding: '16px',
                      background: '#fff2f0',
                      borderRadius: '8px',
                      border: '2px solid #ffccc7',
                      boxShadow: '0 4px 8px rgba(255, 77, 79, 0.15)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <ExclamationCircleOutlined
                        style={{
                          color: '#ff4d4f',
                          fontSize: '18px'
                        }}
                      />
                      <Tag color="red" style={{ marginBottom: 0, fontSize: '13px', fontWeight: 'bold' }}>
                        错误 #{errorLogs.length - index}
                      </Tag>
                      <Tag color="blue" style={{ marginBottom: 0, fontSize: '12px' }}>
                        {new Date(String(log.timestamp)).toLocaleString()}
                      </Tag>
                      <Tag style={{ marginBottom: 0, fontSize: '12px' }}>
                        {String(log.context)}
                      </Tag>
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(`[${log.timestamp}] [${log.level}] [${log.context}] ${log.message}`)}
                        style={{ marginLeft: 'auto' }}
                      >
                        复制
                      </Button>
                    </div>

                    <div style={{
                      background: '#fff',
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid #ffd6cc'
                    }}>
                      <Text
                        style={{
                          color: '#ff4d4f',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          display: 'block',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'monospace'
                        }}
                      >
                        {String(log.message)}
                      </Text>
                    </div>

                    <div style={{
                      marginTop: '12px',
                      paddingTop: '8px',
                      borderTop: '1px dashed #ffccc7',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        🔒 此错误日志已永久保留
                      </Text>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        发生时间: {new Date(String(log.timestamp)).toLocaleString()}
                      </Text>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </Modal>

        {/* 监控面板 */}
        {showMonitoringPanel && (
          <MonitoringPanel onClose={() => setShowMonitoringPanel(false)} />
        )}
      </Content>


    </Layout>
  );
}