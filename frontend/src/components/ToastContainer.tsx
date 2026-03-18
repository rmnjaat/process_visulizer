import { useToastStore } from '../stores/toastStore';
import type { Toast } from '../stores/toastStore';
import { useEffect, useState } from 'react';

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const bgColor =
    toast.type === 'success'
      ? 'var(--color-success)'
      : 'var(--color-warning)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '6px',
        backgroundColor: 'var(--bg-surface)',
        borderLeft: `3px solid ${bgColor}`,
        color: 'var(--text-primary)',
        fontSize: '12px',
        lineHeight: '1.4',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(40px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        maxWidth: '320px',
        wordBreak: 'break-word',
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '14px',
          lineHeight: 1,
          padding: '0 2px',
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={t} onClose={() => removeToast(t.id)} />
        </div>
      ))}
    </div>
  );
}
