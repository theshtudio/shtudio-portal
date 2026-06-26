import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { ActionItemPriority } from '@/lib/types';

const PRIORITIES: ActionItemPriority[] = ['urgent', 'high', 'normal', 'low'];

interface PatchBody {
  action?: 'save' | 'approve' | 'discard';
  title?: string;
  description?: string | null;
  resolved_user_id?: number | null;
  proposed_due_date?: string | null;
  priority?: ActionItemPriority | null;
}

// Collect the editable fields from the body, validating as we go.
function editableFields(body: PatchBody): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return { error: 'Title cannot be empty' };
    out.title = t.slice(0, 500);
  }
  if (body.description !== undefined) {
    out.description = body.description ? String(body.description).trim() : null;
  }
  if (body.resolved_user_id !== undefined) {
    out.resolved_user_id =
      body.resolved_user_id == null ? null : Number(body.resolved_user_id);
  }
  if (body.proposed_due_date !== undefined) {
    out.proposed_due_date = body.proposed_due_date || null;
  }
  if (body.priority !== undefined) {
    if (body.priority != null && !PRIORITIES.includes(body.priority)) {
      return { error: 'Invalid priority' };
    }
    out.priority = body.priority ?? null;
  }

  return out;
}

export async function PATCH(
  request: Request,
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

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action ?? 'save';
  const admin = createServiceSupabase();

  // Current status guards the allowed transitions — a pushed row is frozen.
  const { data: row } = await admin
    .from('action_items')
    .select('status, clickup_task_id')
    .eq('id', id)
    .single();

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.status === 'pushed' || row.clickup_task_id) {
    return NextResponse.json({ error: 'Already pushed to ClickUp — frozen' }, { status: 409 });
  }

  // ── Build the update ───────────────────────────────────────────────────────
  let update: Record<string, unknown> = {};

  if (action === 'discard') {
    update = { status: 'discarded' };
  } else {
    // save + approve both carry editable fields
    const fields = editableFields(body);
    if ('error' in fields) {
      return NextResponse.json({ error: fields.error }, { status: 400 });
    }
    update = fields;

    if (action === 'approve') {
      if (row.status !== 'proposed') {
        return NextResponse.json(
          { error: `Cannot approve from status '${row.status}'` },
          { status: 409 },
        );
      }
      update.status = 'approved';
      update.approved_by = user.id;
      update.approved_at = new Date().toISOString();
    } else if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
  }

  const { error } = await admin.from('action_items').update(update).eq('id', id);
  if (error) {
    console.error('[PATCH /api/admin/approvals/[id]]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
