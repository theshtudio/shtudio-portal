import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { pushActionItem } from '@/lib/clickup-push';

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

  // ── Load, guard, write to ClickUp (shared with the Telegram auto-push) ───────
  const outcome = await pushActionItem(admin, id);

  switch (outcome.kind) {
    case 'pushed':
      return NextResponse.json({ success: true, clickup_task_id: outcome.clickupTaskId });
    case 'already_pushed':
      return NextResponse.json(
        { error: 'Already pushed', clickup_task_id: outcome.clickupTaskId },
        { status: 409 },
      );
    case 'not_found':
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    case 'bad_status':
      return NextResponse.json(
        { error: `Cannot push from status '${outcome.status}'` },
        { status: 409 },
      );
    case 'writeback_failed':
      return NextResponse.json(
        {
          error: `Task created in ClickUp (${outcome.clickupTaskId}) but write-back failed: ${outcome.error}`,
        },
        { status: 500 },
      );
    case 'clickup_failed':
      return NextResponse.json({ error: outcome.error }, { status: 502 });
  }
}
