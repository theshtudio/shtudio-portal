-- ============================================================================
-- Meeting & Chat Actions — approval-queue spine
-- Migration: action_items, team_aliases, approval_queue view
--
-- Internal ops module. Server routes use the service role only.
-- Nothing here writes to ClickUp — this is the holding/approval layer that
-- sits IN FRONT of the single ClickUp list. The write service comes later.
-- ============================================================================


-- ── team_aliases ────────────────────────────────────────────────────────────
-- Resolves any reference to one numeric ClickUp user id.
-- Handles Telegram @usernames, transcript aliases (e.g. Xavier -> Dima,
-- Zhenya -> Eugene), and first-name-only mentions — all to one id.
-- This is the single source of truth for "who does '@dima' actually mean".
create table if not exists team_aliases (
  id              uuid primary key default gen_random_uuid(),
  clickup_user_id bigint not null,                 -- numeric ClickUp assignee id
  canonical_name  text   not null,                 -- "Eugene Starukhin"
  alias           text   not null,                 -- "@eugene_tg" / "Zhenya" / "Eugene"
  alias_kind      text   not null default 'telegram'
                  check (alias_kind in ('telegram','transcript','spoken')),
  created_at      timestamptz default now()
);

-- One alias maps to exactly one person; lookups are case-insensitive.
create unique index if not exists team_aliases_alias_uniq
  on team_aliases (lower(alias));


-- ── action_items ────────────────────────────────────────────────────────────
-- Every candidate task, from any source, lands here as status='proposed'
-- and only leaves for ClickUp after a human approves at the gate.
create table if not exists action_items (
  id                uuid primary key default gen_random_uuid(),

  source            text not null default 'telegram'
                    check (source in ('telegram','fathom','manual')),

  -- task content
  title             text not null,
  description       text,
  source_quote      text,            -- the flagged / verbatim line; traceability

  -- assignee resolution
  proposed_owner    text,            -- raw "@dima" / "Xavier" as captured
  resolved_user_id  bigint,          -- numeric ClickUp id after alias lookup
                                     -- (null = leave blank, pick at the gate)

  -- scheduling
  due_hint          text,            -- raw "friday" as typed
  proposed_due_date date,            -- resolved to a real date at the gate

  priority          text check (priority in ('urgent','high','normal','low')),
  confidence        numeric(3,2),    -- null for human-flagged telegram items

  -- approval lifecycle
  status            text not null default 'proposed'
                    check (status in ('proposed','approved','edited','discarded','pushed','failed')),
  approved_by       uuid,            -- -> your existing users/profiles table (wire FK to match)
  approved_at       timestamptz,

  -- clickup write-back
  clickup_task_id   text,            -- set once pushed; idempotency guard (never double-push)
  push_error        text,

  -- telegram provenance (null for non-telegram sources)
  tg_chat_id        bigint,
  tg_topic_id       bigint,          -- message_thread_id (forum topic the flag came from)
  tg_message_id     bigint,
  tg_permalink      text,
  tg_sender         text,            -- who flagged it (must be a team member)

  -- fathom link (meetings table arrives when Fathom plugs in; nullable, no FK yet)
  meeting_id        uuid,

  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists action_items_status_idx on action_items (status);
create index if not exists action_items_source_idx on action_items (source);


-- ── approval_queue ──────────────────────────────────────────────────────────
-- What the review screen reads. For now just pending action_items.
-- Later this UNIONs the ops-hub invoice drafts so one screen reviews both.
create or replace view approval_queue as
  select
    'task'           as kind,
    id,
    source,
    title            as label,
    proposed_owner,
    resolved_user_id,
    confidence,
    status,
    created_at
  from action_items
  where status = 'proposed';


-- ── updated_at touch ────────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists action_items_touch on action_items;
create trigger action_items_touch
  before update on action_items
  for each row execute function touch_updated_at();


-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Internal ops data. Server routes use the service role (bypasses RLS), so
-- enabling RLS with no anon/authenticated policy locks these to server-only —
-- matching the existing ops/KB tables. Add policies here only if these are
-- ever read directly from the client.
alter table action_items enable row level security;
alter table team_aliases enable row level security;
