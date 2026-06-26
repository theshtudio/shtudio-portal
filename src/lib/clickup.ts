import type { ActionItemPriority } from '@/lib/types';

// ClickUp numeric priority codes (NOT the string labels).
const PRIORITY_CODE: Record<ActionItemPriority, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

export interface CreateClickUpTaskInput {
  name: string;
  description?: string | null;
  assigneeId?: number | null; // numeric ClickUp user id, or null = unassigned
  priority?: ActionItemPriority | null;
  /** A real calendar date (proposed_due_date); converted to unix ms. */
  dueDate?: string | null;
}

export interface ClickUpTaskResult {
  id: string;
}

/**
 * Create one task in the configured ClickUp list.
 * Reads CLICKUP_TARGET_LIST_ID and CLICKUP_TOKEN from the environment.
 *
 * ClickUp specifics handled here:
 *   - assignees is an array of numeric ids; [] means unassigned (valid).
 *   - priority is 1..4, not a string; omitted when null.
 *   - due_date is unix milliseconds; omitted when null.
 *
 * Throws on missing config or a non-2xx response (the caller records push_error).
 */
export async function createClickUpTask(input: CreateClickUpTaskInput): Promise<ClickUpTaskResult> {
  const listId = process.env.CLICKUP_TARGET_LIST_ID;
  const token = process.env.CLICKUP_TOKEN;
  if (!listId) throw new Error('CLICKUP_TARGET_LIST_ID is not set');
  if (!token) throw new Error('CLICKUP_TOKEN is not set');

  const payload: Record<string, unknown> = {
    name: input.name,
    assignees: input.assigneeId != null ? [Number(input.assigneeId)] : [],
  };

  if (input.description) payload.description = input.description;
  if (input.priority) payload.priority = PRIORITY_CODE[input.priority];
  if (input.dueDate) {
    const ms = Date.parse(input.dueDate);
    if (!Number.isNaN(ms)) {
      payload.due_date = ms;
      payload.due_date_time = false; // date-only, no specific time
    }
  }

  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ClickUp ${res.status}: ${text.slice(0, 500) || res.statusText}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('ClickUp response missing task id');
  return { id: data.id };
}
