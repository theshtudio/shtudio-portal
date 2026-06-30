import type { SupabaseClient } from '@supabase/supabase-js';
import { createClickUpTask } from '@/lib/clickup';

// The columns the push needs: the guard fields plus everything that feeds the
// ClickUp task body (description composition, assignee, priority, due date).
const PUSH_SELECT =
  'id, status, clickup_task_id, title, description, source_quote, tg_permalink, resolved_user_id, proposed_due_date, priority';

// One discriminated outcome per branch the push can take, so every caller maps
// the same set of cases (the portal route → HTTP status, the webhook → in-chat
// reply) without re-deriving the rules.
export type PushOutcome =
  | { kind: 'pushed'; clickupTaskId: string }
  | { kind: 'already_pushed'; clickupTaskId: string }
  | { kind: 'not_found' }
  | { kind: 'bad_status'; status: string }
  | { kind: 'writeback_failed'; clickupTaskId: string; error: string }
  | { kind: 'clickup_failed'; error: string };

/**
 * Push one approved action_item to ClickUp and record the result on the row.
 *
 * This is the single irreversible external write, shared by the portal's
 * "Approve & push" button and the Telegram webhook's auto-push. It enforces the
 * same guards in both places:
 *   - idempotency on clickup_task_id (a row that already reached ClickUp is
 *     never re-pushed),
 *   - status gate (only 'approved' or a prior 'failed' retry may be written),
 *   - description composition with source_quote + Telegram link (via
 *     createClickUpTask).
 *
 * On a ClickUp API error the row is flipped to 'failed' with push_error set, so
 * it stays in the approval queue for a manual retry — never lost.
 *
 * Takes a service-role client (RLS-bypassing); the caller owns authorization.
 */
export async function pushActionItem(
  admin: SupabaseClient,
  id: string,
): Promise<PushOutcome> {
  const { data: item } = await admin
    .from('action_items')
    .select(PUSH_SELECT)
    .eq('id', id)
    .single();

  if (!item) return { kind: 'not_found' };

  // Idempotency: a row that already reached ClickUp is never re-pushed.
  if (item.clickup_task_id) {
    return { kind: 'already_pushed', clickupTaskId: item.clickup_task_id };
  }

  // Only approved items (or a retry of a previously failed push) may be written.
  if (item.status !== 'approved' && item.status !== 'failed') {
    return { kind: 'bad_status', status: item.status };
  }

  try {
    const task = await createClickUpTask({
      name: item.title,
      description: item.description,
      sourceQuote: item.source_quote,
      tgPermalink: item.tg_permalink,
      assigneeId: item.resolved_user_id,
      priority: item.priority,
      dueDate: item.proposed_due_date,
    });

    const { error } = await admin
      .from('action_items')
      .update({ clickup_task_id: task.id, status: 'pushed', push_error: null })
      .eq('id', id);

    if (error) {
      // Task exists in ClickUp but we failed to record it — surface loudly so the
      // operator doesn't blindly retry and create a duplicate.
      console.error('[push] write-back failed after ClickUp create', error.message);
      return { kind: 'writeback_failed', clickupTaskId: task.id, error: error.message };
    }

    return { kind: 'pushed', clickupTaskId: task.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[push] ClickUp create failed', message);
    await admin
      .from('action_items')
      .update({ status: 'failed', push_error: message })
      .eq('id', id);
    return { kind: 'clickup_failed', error: message };
  }
}
