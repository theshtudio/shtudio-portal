export type UserRole = 'admin' | 'client';
export type ReportAiStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
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
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
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
