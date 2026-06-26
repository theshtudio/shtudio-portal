import { createServiceSupabase } from '@/lib/supabase/server';
import type { ActionItem, AssigneeOption } from '@/lib/types';
import { ApprovalsClient } from './ApprovalsClient';
import styles from './page.module.css';

// Queue rows are mutated through this page; always render fresh.
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = createServiceSupabase();

  // Show items still in the human-gate window: pending review, approved-but-not-
  // yet-pushed, and failed pushes (retryable). Pushed/discarded drop off the list.
  const { data: items } = await supabase
    .from('action_items')
    .select('*')
    .in('status', ['proposed', 'approved', 'failed'])
    .order('created_at', { ascending: false });

  // Build the assignee dropdown from team_aliases (dedupe to one row per person).
  const { data: aliases } = await supabase
    .from('team_aliases')
    .select('clickup_user_id, canonical_name')
    .order('canonical_name', { ascending: true });

  const byId = new Map<number, string>();
  for (const a of aliases ?? []) {
    if (!byId.has(a.clickup_user_id)) byId.set(a.clickup_user_id, a.canonical_name);
  }
  const assignees: AssigneeOption[] = Array.from(byId, ([clickup_user_id, canonical_name]) => ({
    clickup_user_id,
    canonical_name,
  }));

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Approvals</h1>
        <p className={styles.subheading}>
          Tasks flagged from Telegram. Review, assign, and approve before pushing to ClickUp.
        </p>
      </div>

      <ApprovalsClient
        initialItems={(items ?? []) as ActionItem[]}
        assignees={assignees}
      />
    </>
  );
}
