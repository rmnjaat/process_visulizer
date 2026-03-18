import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [above, setAbove] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setAbove(rect.top > 60);
    }
  }, [visible]);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <div
        className="absolute left-1/2 z-50 px-2 py-1 text-xs rounded shadow-lg whitespace-normal max-w-[240px] pointer-events-none"
        style={{
          transform: 'translateX(-50%)',
          ...(above
            ? { bottom: '100%', marginBottom: 6 }
            : { top: '100%', marginTop: 6 }),
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          visibility: visible ? 'visible' : 'hidden',
          opacity: visible ? 1 : 0,
          transition: 'opacity 150ms ease-in-out',
        }}
      >
        {text}
        {/* Arrow/caret */}
        <div
          className="absolute left-1/2"
          style={{
            transform: 'translateX(-50%)',
            ...(above
              ? {
                  top: '100%',
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '5px solid var(--bg-elevated)',
                }
              : {
                  bottom: '100%',
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderBottom: '5px solid var(--bg-elevated)',
                }),
            width: 0,
            height: 0,
          }}
        />
      </div>
    </div>
  );
}
