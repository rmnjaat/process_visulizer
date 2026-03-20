import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Tooltip({ text, children, className, style }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, above: true });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const above = rect.top > 120;
    setCoords({
      x: centerX,
      y: above ? rect.top - 8 : rect.bottom + 8,
      above,
    });
  }, []);

  useEffect(() => {
    if (visible) updatePosition();
  }, [visible, updatePosition]);

  // Clamp tooltip so it doesn't go off-screen
  useEffect(() => {
    if (visible && tooltipRef.current) {
      const el = tooltipRef.current;
      const r = el.getBoundingClientRect();
      if (r.left < 8) {
        el.style.left = '8px';
        el.style.transform = coords.above ? 'translateY(-100%)' : 'none';
      } else if (r.right > window.innerWidth - 8) {
        el.style.left = `${window.innerWidth - r.width - 8}px`;
        el.style.transform = coords.above ? 'translateY(-100%)' : 'none';
      }
    }
  }, [visible, coords]);

  return (
    <div
      ref={wrapperRef}
      className={className || "relative inline-flex"}
      style={style}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: 'fixed',
              left: coords.x,
              top: coords.y,
              transform: coords.above
                ? 'translate(-50%, -100%)'
                : 'translateX(-50%)',
              zIndex: 99999,
              padding: '8px 12px',
              fontSize: '12px',
              lineHeight: '1.5',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--bg-surface)',
              maxWidth: '360px',
              minWidth: '180px',
              width: 'max-content',
              whiteSpace: 'pre-line',
              wordWrap: 'break-word',
              pointerEvents: 'none',
              opacity: 1,
            }}
          >
            {text}
            {/* Arrow */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                ...(coords.above
                  ? {
                      top: '100%',
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid var(--bg-elevated)',
                    }
                  : {
                      bottom: '100%',
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '6px solid var(--bg-elevated)',
                    }),
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
