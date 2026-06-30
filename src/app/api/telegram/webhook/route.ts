import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { pushActionItem } from '@/lib/clickup-push';

// Telegram delivers updates by POST; never cache this route.
export const dynamic = 'force-dynamic';

// ── Telegram update shapes (only the fields we read) ─────────────────────────
interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TgMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TgUser;
  chat?: { id: number; type?: string };
  text?: string;
  caption?: string; // a /task sent with a photo carries the command here, not in text
  reply_to_message?: { text?: string; caption?: string };
}

interface TgUpdate {
  message?: TgMessage;
}

// Always 200 for handled-but-ignored cases so Telegram doesn't retry the update.
const OK = NextResponse.json({ ok: true });

// Outcome → reaction emoji. setMessageReaction only accepts emoji from
// Telegram's fixed ReactionTypeEmoji set; ✅ / 📝 / ⚠️ are NOT in it and were
// rejected as REACTION_INVALID. These three are valid. The queued one is the
// bare writing-hand code point '✍' — sending the ✍️ variation-selector
// form (U+270D U+FE0F) would also be rejected.
const REACTION = {
  pushed: '🎉',
  queued: '✍', // ✍ — explicit bare code point, no U+FE0F variation selector
  failed: '🤬',
} as const;

/**
 * Best-effort permalink to the flagged message. Supergroup/forum chat ids are
 * prefixed with -100; t.me/c/<internal>/<message> expects that prefix stripped.
 * Returns null for non-supergroup chats (no public permalink form).
 */
function buildPermalink(chatId: number, messageId: number, topicId?: number): string | null {
  const s = String(chatId);
  if (!s.startsWith('-100')) return null;
  const internal = s.slice(4);
  return topicId
    ? `https://t.me/c/${internal}/${topicId}/${messageId}`
    : `https://t.me/c/${internal}/${messageId}`;
}

/**
 * Acknowledge the outcome by reacting to the original /task message with a
 * single emoji (see REACTION), so the result is visible inline without a chat
 * reply.
 *
 * Reacts to the command message itself (message.message_id), not the replied-to
 * source. Best-effort: the row is already saved, so a failed reaction must
 * never 500 the webhook (Telegram would then redeliver and duplicate the row).
 */
async function reactInChat(message: TgMessage, emoji: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !message.chat) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        message_id: message.message_id,
        reaction: [{ type: 'emoji', emoji }],
      }),
    });
    // fetch only rejects on network errors; a Telegram 4xx (e.g. an emoji not in
    // the supported set → REACTION_INVALID) resolves normally, so surface it
    // explicitly rather than failing silently. Still best-effort.
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[telegram webhook] setMessageReaction failed', res.status, body.slice(0, 300));
    }
  } catch (err) {
    // Network-level failure only. Best-effort: never 500 the webhook.
    console.error('[telegram webhook] reaction failed', err);
  }
}

export async function POST(request: Request) {
  // 1. Verify the secret token Telegram echoes back on every call.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const header = request.headers.get('x-telegram-bot-api-secret-token');
  if (!secret || header !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse the update. Anything unexpected → 200, no work.
  let update: TgUpdate;
  try {
    update = await request.json();
  } catch {
    return OK;
  }

  const message = update.message;
  // On a photo (or other media) message the command rides in caption, not text;
  // fall back so a /task with an attachment isn't dropped at the entry gate. We
  // ignore the attachment itself — only the command text is processed.
  const text = (message?.text ?? message?.caption)?.trim();
  if (!message || !text || !message.from || !message.chat) return OK;

  // 3. Only act on /task commands (also tolerate /task@botname).
  const firstToken = text.split(/\s+/, 1)[0].toLowerCase();
  if (firstToken !== '/task' && !firstToken.startsWith('/task@')) return OK;

  const supabase = createServiceSupabase();

  // 4. Sender gate — must be a seeded team member (matched by @username).
  const senderHandle = message.from.username ? `@${message.from.username}` : null;
  if (!senderHandle) return OK;

  const { data: senderAlias } = await supabase
    .from('team_aliases')
    .select('canonical_name')
    .eq('alias_kind', 'telegram')
    .ilike('alias', senderHandle)
    .maybeSingle();

  if (!senderAlias) return OK; // not one of the trial members — silently ignore

  // 5. Parse the command body: optional leading assignee, then the title.
  const body = text.slice(firstToken.length).trim();
  const tokens = body.length ? body.split(/\s+/) : [];

  let proposedOwner: string | null = null;
  let resolvedUserId: number | null = null;
  let titleTokens = tokens;

  if (tokens.length) {
    const lead = tokens[0];
    if (lead.startsWith('@')) {
      // @mention → telegram alias lookup
      const { data } = await supabase
        .from('team_aliases')
        .select('clickup_user_id')
        .eq('alias_kind', 'telegram')
        .ilike('alias', lead)
        .maybeSingle();
      proposedOwner = lead;
      resolvedUserId = data?.clickup_user_id ?? null;
      titleTokens = tokens.slice(1);
    } else {
      // bare first name → spoken alias lookup (only consumed if it resolves)
      const { data } = await supabase
        .from('team_aliases')
        .select('clickup_user_id')
        .eq('alias_kind', 'spoken')
        .ilike('alias', lead)
        .maybeSingle();
      if (data) {
        proposedOwner = lead;
        resolvedUserId = data.clickup_user_id;
        titleTokens = tokens.slice(1);
      }
    }
  }

  // 6. Source quote = the replied-to message if present, else the command text.
  const repliedText = message.reply_to_message?.text || message.reply_to_message?.caption || null;
  const sourceQuote = repliedText ?? text;

  // Title: the command remainder; fall back to the quoted line if the command
  // was just "/task @someone" with no inline text.
  let title = titleTokens.join(' ').trim();
  if (!title && repliedText) title = repliedText.trim();
  const hasTitle = title.length > 0; // a real title, before the placeholder kicks in
  if (!title) title = '(untitled task)';
  if (title.length > 500) title = title.slice(0, 500);

  // 7. Shared row fields, regardless of which path the row takes.
  const row = {
    source: 'telegram' as const,
    title,
    source_quote: sourceQuote,
    proposed_owner: proposedOwner,
    resolved_user_id: resolvedUserId,
    tg_chat_id: message.chat.id,
    tg_topic_id: message.message_thread_id ?? null,
    tg_message_id: message.message_id,
    tg_permalink: buildPermalink(message.chat.id, message.message_id, message.message_thread_id),
    tg_sender: senderHandle,
  };

  // 8. Decide at insert time: auto-push a cleanly-resolved task straight to
  // ClickUp, or queue it for manual review. A row resolves cleanly when it has
  // both a real assignee and a real (non-placeholder) title.
  const autoPushEnabled = process.env.TELEGRAM_AUTO_PUSH !== 'false'; // default on
  const resolvesCleanly = resolvedUserId != null && hasTitle;

  if (autoPushEnabled && resolvesCleanly) {
    // Insert as 'approved' so the shared push helper's status gate accepts it,
    // then push through the exact same path the portal button uses. The row is
    // never left dangling: a ClickUp failure flips it to 'failed' (still in the
    // queue) inside pushActionItem.
    const { data: inserted, error: insertError } = await supabase
      .from('action_items')
      .insert({ ...row, status: 'approved', approved_at: new Date().toISOString() })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('[telegram webhook] auto-push insert failed', insertError?.message);
      // 200 anyway: a 500 makes Telegram redeliver, which would duplicate the row.
      return OK;
    }

    const outcome = await pushActionItem(supabase, inserted.id);
    if (outcome.kind === 'pushed') {
      await reactInChat(message, REACTION.pushed);
    } else {
      // ClickUp API error (or write-back failure): the row stays in the queue as
      // 'failed' for a manual retry — react honestly rather than claiming success.
      await reactInChat(message, REACTION.failed);
    }
    return OK;
  }

  // 9. Otherwise queue it as 'proposed' for the approval gate, as before.
  const { error } = await supabase.from('action_items').insert({ ...row, status: 'proposed' });

  if (error) {
    console.error('[telegram webhook] insert failed', error.message);
    // 200 anyway: a 500 makes Telegram redeliver, which would duplicate the row.
    return OK;
  }

  // Queued for the approval gate (auto-push off, or didn't resolve cleanly).
  await reactInChat(message, REACTION.queued);

  return OK;
}
