import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️'
};

/**
 * Single toast notification. Auto-dismisses after `duration` ms.
 * Renders a progress bar that animates to 0 to communicate remaining time.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  const duration = toast.type === 'error' ? 5000 : 3000;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast toast-${toast.type}`}
    >
      <span className="toast-icon" aria-hidden="true">{ICONS[toast.type]}</span>
      <span>{toast.message}</span>
      <button
        type="button"
        className="toast-close"
        aria-label="Fermer la notification"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
      <div className="toast-progress" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

/**
 * Stacked toast container. Fixed top-right so it never overlaps
 * page titles, headers, or content (fixes a long-standing overlap bug).
 */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
