import { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

interface CardHeaderProps {
  title: string;
  action?: ReactNode;
}

export function Card({ children, className, noPadding }: CardProps) {
  return (
    <div className={`${styles.card} ${noPadding ? styles.noPadding : ''} ${className || ''}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <h3 className={styles.title}>{title}</h3>
      {action}
    </div>
  );
}
