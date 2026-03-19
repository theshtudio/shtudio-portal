'use client';

import styles from './Tooltip.module.css';

interface TooltipProps {
  text: string;
}

export function HelpTooltip({ text }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      <span className={styles.icon} aria-label="Help">?</span>
      <span className={styles.bubble}>{text}</span>
    </span>
  );
}
