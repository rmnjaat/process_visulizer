import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAlertStore } from '../stores/alertStore';

export function AlertSettings() {
  const alertsEnabled = useAlertStore((s) => s.alertsEnabled);
  const cpuThreshold = useAlertStore((s) => s.cpuThreshold);
  const memoryThreshold = useAlertStore((s) => s.memoryThreshold);
  const setCpuThreshold = useAlertStore((s) => s.setCpuThreshold);
  const setMemoryThreshold = useAlertStore((s) => s.setMemoryThreshold);
  const toggleAlerts = useAlertStore((s) => s.toggleAlerts);

  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const permissionLabel =
    permission === 'granted'
      ? 'Granted'
      : permission === 'denied'
        ? 'Denied'
        : 'Not requested';

  const permissionColor =
    permission === 'granted'
      ? 'var(--color-success)'
      : permission === 'denied'
        ? 'var(--color-danger)'
        : 'var(--color-warning)';

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell icon trigger */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Alert settings"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: alertsEnabled ? 'var(--color-warning)' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '6px',
          transition: 'color 0.2s ease',
          position: 'relative',
        }}
      >
        <Bell size={18} />
        {alertsEnabled && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-warning)',
            }}
          />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Click-away backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
            }}
          />

          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '300px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--bg-elevated)',
              borderRadius: '10px',
              padding: '16px',
              zIndex: 1000,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
          >
            <h3
              style={{
                margin: '0 0 14px 0',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '0.02em',
              }}
            >
              Alert Settings
            </h3>

            {/* Enable / disable toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Enable alerts
              </span>
              <button
                onClick={toggleAlerts}
                style={{
                  width: '40px',
                  height: '22px',
                  borderRadius: '11px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: alertsEnabled ? 'var(--color-primary)' : 'var(--bg-elevated)',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
                aria-label={alertsEnabled ? 'Disable alerts' : 'Enable alerts'}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: alertsEnabled ? '20px' : '3px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    transition: 'left 0.2s ease',
                  }}
                />
              </button>
            </div>

            {/* CPU threshold slider */}
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  CPU threshold
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {cpuThreshold}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                value={cpuThreshold}
                onChange={(e) => setCpuThreshold(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--color-primary)',
                  cursor: 'pointer',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Memory threshold slider */}
            <div style={{ marginBottom: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Memory threshold
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-info)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {memoryThreshold}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                value={memoryThreshold}
                onChange={(e) => setMemoryThreshold(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--color-info)',
                  cursor: 'pointer',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Notification permission */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Permission:
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: permissionColor,
                  }}
                >
                  {permissionLabel}
                </span>
              </div>
              {permission !== 'granted' && (
                <button
                  onClick={requestPermission}
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: 'var(--color-primary)',
                    color: '#fff',
                    fontWeight: 500,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  Request Permission
                </button>
              )}
            </div>

            {/* Status summary */}
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                borderTop: '1px solid var(--bg-elevated)',
                paddingTop: '10px',
                lineHeight: '1.5',
              }}
            >
              Alerts are{' '}
              <span
                style={{
                  fontWeight: 600,
                  color: alertsEnabled ? 'var(--color-success)' : 'var(--color-danger)',
                }}
              >
                {alertsEnabled ? 'ON' : 'OFF'}
              </span>
              {alertsEnabled && permission !== 'granted' && (
                <span style={{ color: 'var(--color-warning)', display: 'block', marginTop: '4px' }}>
                  Browser notification permission is required for alerts to work.
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
