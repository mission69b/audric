'use client';

import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let globalId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = 'info', duration = 3000) => {
    const id = `toast-${++globalId}`;
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <ToastNotification key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastNotification({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startExit = useCallback(() => {
    setExiting(true);
    const t = setTimeout(() => onDismiss(item.id), 200);
    timersRef.current.push(t);
  }, [item.id, onDismiss]);

  useEffect(() => {
    if (item.duration && item.duration > 0) {
      const t = setTimeout(startExit, item.duration);
      timersRef.current.push(t);
    }
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [item.id, item.duration, startExit]);

  const variantClasses: Record<ToastVariant, string> = {
    success: 'border-success/30 bg-success/10',
    error: 'border-error/30 bg-error/10',
    warning: 'border-warning/30 bg-warning/10',
    info: 'border-border bg-surface',
  };

  const iconMap: Record<ToastVariant, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  const textColorMap: Record<ToastVariant, string> = {
    success: 'text-success',
    error: 'text-error',
    warning: 'text-warning',
    info: 'text-foreground',
  };

  return (
    <div
      className={`
        pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-3 shadow-[var(--shadow-dropdown)]
        transition-all duration-200
        ${variantClasses[item.variant]}
        ${exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-[fadeSlideIn_0.2s_ease-out]'}
      `}
      role="alert"
    >
      <span className={`text-sm font-bold ${textColorMap[item.variant]}`}>{iconMap[item.variant]}</span>
      <span className="text-sm text-foreground">{item.message}</span>
      <button
        onClick={startExit}
        className="ml-2 text-dim hover:text-foreground transition shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
