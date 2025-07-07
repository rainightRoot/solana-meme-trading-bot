import React, { useEffect, useState } from 'react';

interface MonitoringPanelProps {
  onClose: () => void;
}

const MonitoringPanel: React.FC<MonitoringPanelProps> = ({ onClose }) => {
  const [monitoringStatus, setMonitoringStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 朴素样式常量
  const styles = {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    },
    modal: {
      background: '#ffffff',
      borderRadius: '8px',
      maxWidth: '800px',
      width: '100%',
      maxHeight: '90vh',
      overflowY: 'auto' as const,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      border: '1px solid #d9d9d9',
      position: 'relative' as const,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px',
      borderBottom: '1px solid #f0f0f0',
      background: '#fafafa',
    },
    title: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#262626',
      margin: 0,
    },
    closeButton: {
      background: 'transparent',
      border: 'none',
      borderRadius: '4px',
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: '16px',
      color: '#8c8c8c',
      transition: 'all 0.2s ease',
    },
    content: {
      padding: '24px',
    },
    card: {
      background: '#ffffff',
      borderRadius: '6px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      border: '1px solid #f0f0f0',
      position: 'relative' as const,
    },
    cardHeader: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '16px',
      fontSize: '16px',
      fontWeight: '600',
      color: '#262626',
    },
    statusBadge: {
      marginLeft: '8px',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
    },
    statRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid #f5f5f5',
      fontSize: '14px',
    },
    statLabel: {
      color: '#8c8c8c',
      fontWeight: '400',
    },
    statValue: {
      color: '#262626',
      fontWeight: '600',
    },
    listContainer: {
      marginTop: '16px',
      maxHeight: '200px',
      overflowY: 'auto' as const,
      borderRadius: '4px',
      border: '1px solid #f0f0f0',
      background: '#fafafa',
    },
    listItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #f0f0f0',
      fontSize: '14px',
      transition: 'background-color 0.2s ease',
    },
    badge: {
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
    },
    buttonContainer: {
      display: 'flex',
      justifyContent: 'center',
      gap: '8px',
      paddingTop: '16px',
      borderTop: '1px solid #f0f0f0',
    },
    button: {
      padding: '8px 16px',
      borderRadius: '4px',
      border: '1px solid #d9d9d9',
      fontSize: '14px',
      fontWeight: '400',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      minWidth: '80px',
    },
    primaryButton: {
      background: '#1890ff',
      color: '#ffffff',
      border: '1px solid #1890ff',
    },
    secondaryButton: {
      background: '#ffffff',
      color: '#595959',
      border: '1px solid #d9d9d9',
    },
  };

  const getStatusColor = (status: string, isBackground = false) => {
    const colors = {
      active: isBackground ? '#f6ffed' : '#52c41a',
      inactive: isBackground ? '#fff2f0' : '#ff4d4f',
      processing: isBackground ? '#fffbe6' : '#faad14',
      idle: isBackground ? '#f5f5f5' : '#8c8c8c',
      connected: isBackground ? '#f6ffed' : '#52c41a',
      disconnected: isBackground ? '#fff2f0' : '#ff4d4f',
    };
    return colors[status as keyof typeof colors] || (isBackground ? '#f5f5f5' : '#8c8c8c');
  };

  const fetchMonitoringStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await window.electronAPI.getMonitoringStatus();
      setMonitoringStatus(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取监控状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringStatus();
    const interval = setInterval(fetchMonitoringStatus, 5000); // 每5秒刷新一次
    return () => clearInterval(interval);
  }, []);

  
  

  
    
  const { performance } = monitoringStatus?.data || {};

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>⚙️ 进程池监控</h2>
          <button
            onClick={onClose}
            style={styles.closeButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f0f0f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            ✕
          </button>
        </div>

        <div style={styles.content}>
          {/* 进程池状态 */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              ⚙️ 进程池状态
              {performance?.processStatus && (
                <span style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  color: '#8c8c8c',
                  fontWeight: '400',
                }}>
                  ({performance.processStatus.totalProcesses}/{performance.processStatus.maxProcesses})
                </span>
              )}
            </div>
            {performance?.processStatus ? (
              <div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>总进程数:</span>
                  <span style={styles.statValue}>{performance.processStatus.totalProcesses}</span>
                </div>
               
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>繁忙进程数:</span>
                  <span style={styles.statValue}>{performance.processStatus.busyProcesses}</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>队列任务数:</span>
                  <span style={styles.statValue}>{performance.processStatus.queuedTasks}</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>待处理任务数:</span>
                  <span style={styles.statValue}>{performance.processStatus.pendingTasks}</span>
                </div>
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#262626' }}>
                    进程列表:
                  </div>
                  <div style={styles.listContainer}>
                    {performance.processStatus.processes.map((process: any, index: number) => (
                      <div key={index} style={styles.listItem}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{process.id}</span>
                          <span style={{ color: '#8c8c8c', fontSize: '12px' }}>PID: {process.pid}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <span style={{
                            ...styles.badge,
                            backgroundColor: getStatusColor(process.busy ? 'processing' : 'idle', true),
                            color: getStatusColor(process.busy ? 'processing' : 'idle'),
                          }}>
                            {process.busy ? '繁忙' : '空闲'}
                          </span>
                          <span style={{
                            ...styles.badge,
                            backgroundColor: '#f5f5f5',
                            color: '#8c8c8c',
                          }}>
                            {process.tasksProcessed} 任务
                          </span>
                          <span style={{
                            ...styles.badge,
                            backgroundColor: '#f5f5f5',
                            color: '#8c8c8c',
                          }}>
                            {process.errors} 错误
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#8c8c8c', textAlign: 'center', padding: '20px' }}>
                进程池未初始化
              </div>
            )}
          </div>

          <div style={styles.buttonContainer}>
            <button
              onClick={fetchMonitoringStatus}
              style={{
                ...styles.button,
                ...styles.primaryButton,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#40a9ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1890ff';
              }}
            >
              🔄 刷新
            </button>
            <button
              onClick={onClose}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
              }}
            >
              关闭
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default MonitoringPanel; 