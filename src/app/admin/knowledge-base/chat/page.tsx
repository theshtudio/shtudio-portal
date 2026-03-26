'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  hadResults?: boolean;
  queryId?: string | null;
}

type FlagStatus = 'idle' | 'open' | 'submitting' | 'submitted';
interface FlagState { status: FlagStatus; comment: string; }

// ── Component ──────────────────────────────────────────────────────────────────

export default function KbChatPage() {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [flagStates, setFlagStates] = useState<Record<string, FlagState>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Flag helpers ─────────────────────────────────────────────────────────────

  function getFlagState(msgId: string): FlagState {
    return flagStates[msgId] ?? { status: 'idle', comment: '' };
  }

  function patchFlagState(msgId: string, update: Partial<FlagState>) {
    setFlagStates((prev) => ({
      ...prev,
      [msgId]: { ...(prev[msgId] ?? { status: 'idle', comment: '' }), ...update },
    }));
  }

  async function handleFlagSubmit(msg: Message) {
    if (!msg.queryId) return;
    const state = getFlagState(msg.id);
    patchFlagState(msg.id, { status: 'submitting' });
    try {
      const res = await fetch(`/api/kb/queries/${msg.queryId}/flag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged: true, flag_comment: state.comment || null }),
      });
      if (!res.ok) throw new Error('Failed');
      patchFlagState(msg.id, { status: 'submitted' });
    } catch {
      patchFlagState(msg.id, { status: 'open' }); // revert on error
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res  = await fetch('/api/kb/query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      setMessages((prev) => [
        ...prev,
        {
          id:         `a-${Date.now()}`,
          role:       'assistant',
          text:       data.answer,
          hadResults: data.hadResults,
          queryId:    data.queryId ?? null,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id:         `e-${Date.now()}`,
          role:       'assistant',
          text:       'Something went wrong. Please try again.',
          hadResults: false,
          queryId:    null,
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <Link href="/admin/knowledge-base" className={styles.backLink}>
          ← Manage Documents
        </Link>
        <div className={styles.topBarCenter}>
          <span className={styles.topBarTitle}>Knowledge Base</span>
          <span className={styles.topBarDivider}>·</span>
          <span className={styles.topBarSub}>Ask a Question</span>
        </div>
        <div className={styles.topBarRight} />
      </div>

      {/* ── Messages ── */}
      <div className={styles.messages}>
        {messages.length === 0 && !loading && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>💬</div>
            <p className={styles.emptyTitle}>Ask anything from the knowledge base</p>
            <p className={styles.emptyHint}>
              Type a question below — the AI will search the documents and answer based on what it finds.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const fs = getFlagState(msg.id);
          const showFlag = msg.role === 'assistant' && msg.hadResults !== false && !!msg.queryId;

          return (
            <div
              key={msg.id}
              className={`${styles.row} ${msg.role === 'user' ? styles.rowUser : styles.rowAssistant}`}
            >
              {msg.role === 'assistant' && <div className={styles.avatar}>S</div>}

              <div
                className={`${styles.bubble} ${
                  msg.role === 'user'
                    ? styles.bubbleUser
                    : msg.hadResults === false
                    ? styles.bubbleNoResults
                    : styles.bubbleAssistant
                }`}
              >
                <p className={styles.bubbleText}>{msg.text}</p>

                {/* No-results note */}
                {msg.role === 'assistant' && msg.hadResults === false && (
                  <p className={styles.noResultsNote}>
                    No information found — speak to your Shtudio manager
                  </p>
                )}

                {/* Flag area — only on answered assistant messages */}
                {showFlag && (
                  <div className={styles.flagArea}>
                    {fs.status === 'idle' && (
                      <button
                        className={styles.flagBtn}
                        onClick={() => patchFlagState(msg.id, { status: 'open' })}
                        title="Flag this response as unhelpful"
                        aria-label="Flag response"
                      >
                        👎
                      </button>
                    )}

                    {(fs.status === 'open' || fs.status === 'submitting') && (
                      <div className={styles.flagForm}>
                        <p className={styles.flagPrompt}>What was wrong or missing?</p>
                        <textarea
                          className={styles.flagTextarea}
                          value={fs.comment}
                          onChange={(e) => patchFlagState(msg.id, { comment: e.target.value })}
                          placeholder="Optional — describe the issue"
                          rows={2}
                          disabled={fs.status === 'submitting'}
                        />
                        <div className={styles.flagActions}>
                          <button
                            className={styles.flagSubmitBtn}
                            onClick={() => handleFlagSubmit(msg)}
                            disabled={fs.status === 'submitting'}
                          >
                            {fs.status === 'submitting' ? 'Submitting…' : 'Submit'}
                          </button>
                          <button
                            className={styles.flagCancelBtn}
                            onClick={() => patchFlagState(msg.id, { status: 'idle', comment: '' })}
                            disabled={fs.status === 'submitting'}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {fs.status === 'submitted' && (
                      <p className={styles.flagThanks}>✓ Thanks, flagged for review</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <div className={`${styles.row} ${styles.rowAssistant}`}>
            <div className={styles.avatar}>S</div>
            <div className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.bubbleTyping}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the knowledge base..."
            rows={1}
            disabled={loading}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            {loading ? (
              <span className={styles.sendSpinner} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M2.5 10L17.5 2.5L13 10L17.5 17.5L2.5 10Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
        <p className={styles.inputHint}>Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
