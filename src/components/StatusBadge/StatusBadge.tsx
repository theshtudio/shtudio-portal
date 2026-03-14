import styles from './StatusBadge.module.css';

type BadgeStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'published' | 'draft' | 'active' | 'inactive';

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
}

const defaultLabels: Record<BadgeStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  published: 'Published',
  draft: 'Draft',
  active: 'Active',
  inactive: 'Inactive',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      <span className={styles.dot} />
      {label || defaultLabels[status]}
    </span>
  );
}
