'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import styles from './page.module.css';

const STATUS_MESSAGES = [
  'Reading your PDF...',
  'Extracting campaign data...',
  'Analysing performance trends...',
  'Writing insights and recommendations...',
  'Building your report...',
  'Almost there...',
];

interface ProcessingProgressProps {
  reportId: string;
}

export function ProcessingProgress({ reportId }: ProcessingProgressProps) {
  const router = useRouter();
  const supabase = createClient();
  const [messageIndex, setMessageIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rotate status messages every 8 seconds
  useEffect(() => {
    messageRef.current = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 8000);

    return () => {
      if (messageRef.current) clearInterval(messageRef.current);
    };
  }, []);

  // Poll for completion every 5 seconds
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('reports')
        .select('ai_status')
        .eq('id', reportId)
        .single();

      if (data?.ai_status === 'completed') {
        // Stop polling and messages
        if (pollRef.current) clearInterval(pollRef.current);
        if (messageRef.current) clearInterval(messageRef.current);

        // Show completion state, then reload
        setCompleted(true);
        setTimeout(() => {
          router.refresh();
        }, 1500);
      } else if (data?.ai_status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        if (messageRef.current) clearInterval(messageRef.current);
        router.refresh();
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [reportId, supabase, router]);

  return (
    <div className={styles.processingState}>
      <div className={styles.progressWrapper}>
        <div className={styles.progressTrack}>
          <div
            className={`${styles.progressBar} ${completed ? styles.progressComplete : styles.progressAnimating}`}
          />
        </div>

        <div className={styles.progressMessage}>
          {completed ? (
            <span className={styles.progressDone}>Report ready!</span>
          ) : (
            <span className={styles.progressStatus}>{STATUS_MESSAGES[messageIndex]}</span>
          )}
        </div>
      </div>

      {!completed && (
        <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
          Refresh Status
        </Button>
      )}
    </div>
  );
}
