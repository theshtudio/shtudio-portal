import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import type { BlocksConfig } from '@/lib/types';
import { BlockEditor } from './BlockEditor';

export default async function ReportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') redirect('/dashboard');

  const { data: report } = await supabase
    .from('reports')
    .select('id, title, ai_status, ai_enhanced_html, blocks, blocks_draft')
    .eq('id', id)
    .single();

  if (!report) {
    return (
      <div style={{ padding: '40px' }}>
        <p>Report not found.</p>
      </div>
    );
  }
  if (report.ai_status !== 'completed' || !report.ai_enhanced_html) {
    return (
      <div style={{ padding: '40px' }}>
        <p>This report isn&apos;t ready to edit yet — wait for AI processing to complete.</p>
      </div>
    );
  }

  const draft = (report.blocks_draft ?? null) as BlocksConfig | null;
  const published = (report.blocks ?? null) as BlocksConfig | null;
  const hasUnpublishedChanges =
    draft != null && JSON.stringify(draft) !== JSON.stringify(published);

  return (
    <BlockEditor
      reportId={report.id}
      reportTitle={report.title}
      html={report.ai_enhanced_html}
      initialDraft={draft}
      initialPublished={published}
      hasUnpublishedChanges={hasUnpublishedChanges}
    />
  );
}
