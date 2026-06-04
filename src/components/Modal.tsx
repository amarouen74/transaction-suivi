import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Optional element rendered in the top-right (e.g. a close button). */
  topRight?: React.ReactNode;
}

/**
 * Centralized modal used by every dialog in the app (auth, delete confirm,
 * upgrade, email template preview, etc.). Adds:
 *  - ESC to close
 *  - Click-outside to close
 *  - Body scroll lock
 *  - Focus trap (basic — focus first focusable element on open)
 *  - aria-modal + role="dialog" for screen readers
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth,
  closeOnBackdrop = true,
  closeOnEscape = true,
  topRight
}: ModalProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  // ESC key handler
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEscape, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Move focus into the modal when it opens
  useEffect(() => {
    if (!open) return;
    const focusable = boxRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => closeOnBackdrop && onClose()}
    >
      <div
        ref={boxRef}
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {topRight}
        {title && <h3 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
