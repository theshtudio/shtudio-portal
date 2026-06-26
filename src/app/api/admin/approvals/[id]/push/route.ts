import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { createClickUpTask } from '@/lib/clickup';

// The single irreversible external write. Guarded by the human approval gate
// (status must be 'approved' or a prior 'failed') and idempotency on
// clickup_task_id (never push a row that already has one).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createServiceSupabase();

  // ── Load + guard ───────────────────────────────────────────────────────────
  const { data: item } = await admin
    .from('action_items')
    .select('id, status, clickup_task_id, title, description, resolved_user_id, proposed_due_date, priority')
    .eq('id', id)
    .single();

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Idempotency: a row that already reached ClickUp is never re-pushed.
  if (item.clickup_task_id) {
    return NextResponse.json(
      { error: 'Already pushed', clickup_task_id: item.clickup_task_id },
      { status: 409 },
    );
  }

  // Only approved items (or a retry of a previously failed push) may be written.
  if (item.status !== 'approved' && item.status !== 'failed') {
    return NextResponse.json(
      { error: `Cannot push from status '${item.status}'` },
      { status: 409 },
    );
  }

  // ── Write to ClickUp ───────────────────────────────────────────────────────
  try {
    const task = await createClickUpTask({
      name: item.title,
      description: item.description,
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
      return NextResponse.json(
        { error: `Task created in ClickUp (${task.id}) but write-back failed: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, clickup_task_id: task.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[push] ClickUp create failed', message);
    await admin
      .from('action_items')
      .update({ status: 'failed', push_error: message })
      .eq('id', id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
