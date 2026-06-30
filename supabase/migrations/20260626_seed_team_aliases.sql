-- ============================================================================
-- Seed: team_aliases for the Telegram trial (3 members)
--
-- Resolves typed references in /task commands to numeric ClickUp user ids.
--   - 'telegram' alias  = the @username as it appears in a group mention
--   - 'spoken'   alias  = bare first name, so "/task julius ..." also resolves
--
-- Lookups are case-insensitive (unique index on lower(alias)), so casing here
-- doesn't matter. Re-running is safe (on conflict do nothing).
-- ============================================================================

insert into team_aliases (clickup_user_id, canonical_name, alias, alias_kind) values
  -- Alex Vlassov
  (60762485,  'Alex Vlassov',   '@vlass0v',        'telegram'),
  (60762485,  'Alex Vlassov',   'Alex',            'spoken'),

  -- Pavlo Terekhov
  (101028308, 'Pavlo Terekhov', '@Pavlo_Terekhov', 'telegram'),
  (101028308, 'Pavlo Terekhov', 'Pavlo',           'spoken'),

  -- Julius Edlagan — @handle still TODO (he gave a phone number, which Telegram
  -- mentions can't use). Seeded by name + ClickUp id so he's assignable at the
  -- gate now; add his real @username as a 'telegram' alias once he sets one:
  --   (66611896, 'Julius Edlagan', '@his_handle', 'telegram'),
  (66611896,  'Julius Edlagan', 'Julius',          'spoken')

on conflict (lower(alias)) do nothing;
