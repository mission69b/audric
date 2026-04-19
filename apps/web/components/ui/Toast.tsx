'use client';

import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
}

interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
  actions?: ToastAction[];
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
  richToast: (opts: {
    title?: string;
    message: string;
    variant?: ToastVariant;
    duration?: number;
    actions?: ToastAction[];
  }) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  richToast: () => {},
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

  const richToast = useCallback((opts: {
    title?: string;
    message: string;
    variant?: ToastVariant;
    duration?: number;
    actions?: ToastAction[];
  }) => {
    const id = `toast-${++globalId}`;
    setToasts((prev) => [...prev, {
      id,
      title: opts.title,
      message: opts.message,
      variant: opts.variant ?? 'info',
      duration: opts.actions ? 0 : (opts.duration ?? 3000),
      actions: opts.actions,
    }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, richToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none max-w-[380px]" aria-live="polite">
        {toasts.map((t) => (
          <ToastNotification key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const BADGE_STYLES: Record<ToastVariant, string> = {
  success: 'bg-success-solid text-fg-inverse',
  error: 'bg-error-solid text-fg-inverse',
  warning: 'bg-warning-solid text-fg-inverse',
  info: 'bg-info-solid text-fg-inverse',
};

const BORDER_STYLES: Record<ToastVariant, string> = {
  success: 'border-success-solid/30',
  error: 'border-error-solid/30',
  warning: 'border-warning-solid/30',
  info: 'border-border-subtle',
};

const ICON_MAP: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

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

  const title = item.title ?? item.variant.toUpperCase();

  return (
    <div
      className={`
        pointer-events-auto rounded-lg border bg-surface-card shadow-[var(--shadow-dropdown)]
        transition-all duration-200
        ${BORDER_STYLES[item.variant]}
        ${exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-[fadeSlideIn_0.2s_ease-out]'}
      `}
      role="alert"
    >
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <span className={`inline-flex items-center gap-1 shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded ${BADGE_STYLES[item.variant]}`}>
          <span className="text-[10px]">{ICON_MAP[item.variant]}</span>
          {title}
        </span>
        <div className="flex-1" />
        <button
          onClick={startExit}
          className="shrink-0 text-fg-muted hover:text-fg-primary transition -mt-0.5"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="px-4 pb-3">
        <p className="text-sm text-fg-primary leading-relaxed">{item.message}</p>
      </div>

      {item.actions && item.actions.length > 0 && (
        <div className="flex gap-2 px-4 pb-3 pt-1">
          {item.actions.map((action, i) => (
            <button
              key={i}
              onClick={() => {
                action.onClick();
                startExit();
              }}
              className={`flex-1 rounded-md py-2 font-mono text-[10px] tracking-[0.1em] uppercase transition ${
                action.variant === 'destructive'
                  ? 'bg-error-solid text-fg-inverse hover:opacity-90'
                  : action.variant === 'primary'
                    ? 'bg-fg-primary text-fg-inverse hover:opacity-90'
                    : 'border border-border-subtle text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
