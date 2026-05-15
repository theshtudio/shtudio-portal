import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { validateOverrideHtmlServer } from '@/lib/sanitiseHtml';
import type { BlocksConfig } from '@/lib/types';

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const, status: 401 as const };

  const adminSupabase = createServiceSupabase();
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') {
    return { error: 'Forbidden' as const, status: 403 as const };
  }
  return { user, adminSupabase };
}

function isValidBlocksConfig(value: unknown): value is BlocksConfig {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  if (v.order !== undefined) {
    if (!Array.isArray(v.order)) return false;
    if (!v.order.every((id) => typeof id === 'string')) return false;
  }
  if (v.hidden !== undefined) {
    if (!Array.isArray(v.hidden)) return false;
    if (!v.hidden.every((id) => typeof id === 'string')) return false;
  }
  if (v.shown !== undefined) {
    if (!Array.isArray(v.shown)) return false;
    if (!v.shown.every((id) => typeof id === 'string')) return false;
  }
  if (v.overrides !== undefined) {
    if (typeof v.overrides !== 'object' || v.overrides === null) return false;
    for (const [key, override] of Object.entries(v.overrides)) {
      if (typeof key !== 'string') return false;
      if (typeof override !== 'object' || override === null) return false;
      const o = override as Record<string, unknown>;
      if (typeof o.html !== 'string') return false;
    }
  }
  return true;
}

// PATCH — save the editor's working state to blocks_draft (debounced from
// the client every ~500ms). Does NOT touch the live `blocks` column —
// clients keep seeing the previously-published version until POST is hit.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { adminSupabase } = auth;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!isValidBlocksConfig(body)) {
    return NextResponse.json(
      { error: 'Invalid blocks payload — expected { order?, hidden?, overrides? }' },
      { status: 400 },
    );
  }

  // Server-side last-line sanitisation check on every override html.
  // Primary sanitisation already happened client-side via DOMPurify.
  if (body && body.overrides) {
    for (const [blockId, override] of Object.entries(body.overrides)) {
      const result = validateOverrideHtmlServer(override.html);
      if (!result.ok) {
        return NextResponse.json(
          { error: `Override for ${blockId} rejected: ${result.reason}` },
          { status: 400 },
        );
      }
    }
  }

  const { data, error } = await adminSupabase
    .from('reports')
    .update({ blocks_draft: body })
    .eq('id', id)
    .select('id, blocks_draft')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, blocks_draft: data.blocks_draft });
}

// POST — promote blocks_draft → blocks. After this call, /share/[id] and
// /dashboard/reports/[id] reflect the changes. blocks_draft is left in
// place so the editor keeps its working state.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { adminSupabase } = auth;
  const { id } = await params;

  // Read the current draft, then write it into blocks. Two-step is fine —
  // the editor is single-user-per-report in practice and contention isn't
  // an issue.
  const { data: row, error: readError } = await adminSupabase
    .from('reports')
    .select('blocks_draft')
    .eq('id', id)
    .single();

  if (readError || !row) {
    return NextResponse.json({ error: readError?.message ?? 'Not found' }, { status: 404 });
  }

  const { data: updated, error: updateError } = await adminSupabase
    .from('reports')
    .update({ blocks: row.blocks_draft })
    .eq('id', id)
    .select('id, blocks, blocks_draft')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, blocks: updated.blocks });
}

// DELETE — wipe both blocks and blocks_draft back to null. Reset escape
// hatch: report renders as the original AI output everywhere.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { adminSupabase } = auth;
  const { id } = await params;

  const { error } = await adminSupabase
    .from('reports')
    .update({ blocks: null, blocks_draft: null })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
