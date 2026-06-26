import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

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
  reply_to_message?: { text?: string; caption?: string };
}

interface TgUpdate {
  message?: TgMessage;
}

// Always 200 for handled-but-ignored cases so Telegram doesn't retry the update.
const OK = NextResponse.json({ ok: true });

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

async function confirmInChat(message: TgMessage) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !message.chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        reply_to_message_id: message.message_id,
        ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
        text: '✓ Queued for approval.',
      }),
    });
  } catch (err) {
    // The row is already saved; a failed confirmation must not 500 the webhook.
    console.error('[telegram webhook] confirm reply failed', err);
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
  const text = message?.text?.trim();
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
  if (!title) title = '(untitled task)';
  if (title.length > 500) title = title.slice(0, 500);

  // 7. Insert one proposed row with full Telegram provenance.
  const { error } = await supabase.from('action_items').insert({
    source: 'telegram',
    status: 'proposed',
    title,
    source_quote: sourceQuote,
    proposed_owner: proposedOwner,
    resolved_user_id: resolvedUserId,
    tg_chat_id: message.chat.id,
    tg_topic_id: message.message_thread_id ?? null,
    tg_message_id: message.message_id,
    tg_permalink: buildPermalink(message.chat.id, message.message_id, message.message_thread_id),
    tg_sender: senderHandle,
  });

  if (error) {
    console.error('[telegram webhook] insert failed', error.message);
    // 200 anyway: a 500 makes Telegram redeliver, which would duplicate the row.
    return OK;
  }

  // 8. Confirm in-chat (non-blocking on failure).
  await confirmInChat(message);

  return OK;
}
