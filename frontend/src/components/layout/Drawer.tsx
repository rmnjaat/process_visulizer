import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}

export function Drawer({ isOpen, onClose, title, badge, children }: DrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onClose}
          />

          <motion.aside
            className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden max-md:!w-full"
            style={{
              width: 480,
              maxWidth: '100vw',
              backgroundColor: 'var(--bg-surface)',
              borderLeft: '1px solid var(--bg-elevated)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div
              className="flex items-center justify-between px-6 h-14 border-b shrink-0"
              style={{ borderColor: 'var(--bg-elevated)' }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <h2 className="text-base font-semibold m-0 truncate" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </h2>
                <div className="shrink-0">{badge}</div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg border-none cursor-pointer text-lg"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                &#x2715;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {children}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
