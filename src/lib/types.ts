export type UserRole = 'admin' | 'client';
export type ReportAiStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BlocksOverride {
  html: string;
}

// Per-report layout customisation. Populated from reports.blocks (JSONB,
// nullable). Null means "render AI output in document order, no overrides".
//
// `shown` is the opt-in marker for blocks emitted with
// data-default-hidden="true" (e.g. internal-only notes). Without an entry
// in `shown`, default-hidden blocks are stripped from client views; with
// one, they render through. `hidden` always wins over `shown`.
export interface BlocksConfig {
  order?: string[];
  hidden?: string[];
  shown?: string[];
  overrides?: Record<string, BlocksOverride>;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  can_delete_files: boolean;
  invited_by: string | null;
  invited_at: string | null;
  status: 'pending' | 'active';
  signin_method: 'google' | 'password';
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  industry: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  integrations: Record<string, unknown>;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientUser {
  id: string;
  user_id: string;
  client_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface Report {
  id: string;
  client_id: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  pdf_storage_path: string | null;
  pdf_storage_paths: string[] | null;
  ai_enhanced_html: string | null;
  ai_status: ReportAiStatus;
  ai_error: string | null;
  custom_instructions: string | null;
  report_type: string | null;
  report_options: Record<string, unknown> | null;
  client_mismatch: boolean;
  detected_client_name: string | null;
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
  blocks: BlocksConfig | null;
  blocks_draft: BlocksConfig | null;
  created_at: string;
  updated_at: string;
}

export interface ReportSection {
  id: string;
  report_id: string;
  title: string;
  content_html: string | null;
  source_type: string | null;
  source_data: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface ReportComment {
  id: string;
  report_id: string;
  user_id: string;
  comment: string;
  created_at: string;
}

export interface ClientFile {
  id: string;
  client_id: string;
  file_name: string;
  file_label: string | null;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

// ── Task intake / approval spine ──────────────────────────────────────────
export type ActionItemSource = 'telegram' | 'fathom' | 'manual';
export type ActionItemStatus =
  | 'proposed'
  | 'approved'
  | 'edited'
  | 'discarded'
  | 'pushed'
  | 'failed';
export type ActionItemPriority = 'urgent' | 'high' | 'normal' | 'low';
export type AliasKind = 'telegram' | 'transcript' | 'spoken';

export interface ActionItem {
  id: string;
  source: ActionItemSource;

  title: string;
  description: string | null;
  source_quote: string | null;

  proposed_owner: string | null;
  resolved_user_id: number | null;

  due_hint: string | null;
  proposed_due_date: string | null;

  priority: ActionItemPriority | null;
  confidence: number | null;

  status: ActionItemStatus;
  approved_by: string | null;
  approved_at: string | null;

  clickup_task_id: string | null;
  push_error: string | null;

  tg_chat_id: number | null;
  tg_topic_id: number | null;
  tg_message_id: number | null;
  tg_permalink: string | null;
  tg_sender: string | null;

  meeting_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface TeamAlias {
  id: string;
  clickup_user_id: number;
  canonical_name: string;
  alias: string;
  alias_kind: AliasKind;
  created_at: string;
}

// One assignable team member, distilled from team_aliases for the gate dropdown.
export interface AssigneeOption {
  clickup_user_id: number;
  canonical_name: string;
}

// Joined types for queries
export interface ReportWithClient extends Report {
  clients: Pick<Client, 'id' | 'name' | 'slug'>;
}

export interface ReportCommentWithAuthor extends ReportComment {
  profiles: Pick<Profile, 'full_name' | 'email'>;
}

export interface ClientWithReportCount extends Client {
  report_count: number;
}
