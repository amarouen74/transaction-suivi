import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; primary?: boolean };
  children?: ReactNode;
}

/**
 * Reusable empty state used by every list/table in the app. Provides
 * a consistent visual treatment instead of ad-hoc one-off markup.
 */
export function EmptyState({ icon = '📭', title, description, action, children }: EmptyStateProps) {
  return (
    <div className="empty-state-block" role="status">
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-desc">{description}</div>}
      {action && (
        <button
          type="button"
          className={action.primary ? '' : 'secondary'}
          onClick={action.onClick}
          style={{ marginTop: 14 }}
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}
