// ── Period date extraction from report PDFs ──
//
// Two layers:
//   1. extractPeriodFromText() — a pure, deterministic regex parser that pulls a
//      reporting period out of header text. Exported separately so it can be unit
//      tested without a PDF.
//   2. extractPeriodFromPdf()  — downloads-agnostic wrapper that reads the first
//      two pages of a PDF buffer (period dates almost always live in the header)
//      and runs the text parser over them.
//
// The parser tries several formats in descending confidence and returns ISO
// YYYY-MM-DD strings. Callers decide what to do with a 'none' result (we surface
// a "please enter manually" hint in the admin UI).

export type PeriodConfidence = 'high' | 'medium' | 'none';

export interface ExtractedPeriod {
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null; // YYYY-MM-DD
  confidence: PeriodConfidence;
}

const NONE: ExtractedPeriod = { periodStart: null, periodEnd: null, confidence: 'none' };

// Month name → 1-based month number. Covers 3-letter abbreviations and full names.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthNumber(name: string): number | null {
  return MONTHS[name.toLowerCase()] ?? null;
}

function lastDayOfMonth(year: number, month1: number): number {
  // new Date(year, month, 0) → last day of `month` when month is 1-based.
  return new Date(year, month1, 0).getDate();
}

// Build a YYYY-MM-DD string, validating ranges. Returns null if out of bounds.
function isoDate(year: number, month1: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) return null;
  if (!Number.isInteger(month1) || month1 < 1 || month1 > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (day > lastDayOfMonth(year, month1)) return null;
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

// A high-confidence match found in the text, tagged with its position so we can
// pick the earliest one when several ranges appear on the page.
interface RangeHit {
  index: number;
  periodStart: string;
  periodEnd: string;
}

// Run a global regex and map each match to a RangeHit (or null to skip).
function collectRange(
  text: string,
  re: RegExp,
  build: (m: RegExpExecArray) => { start: string | null; end: string | null },
  hits: RangeHit[],
): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const { start, end } = build(m);
    if (start && end) hits.push({ index: m.index, periodStart: start, periodEnd: end });
    // Guard against zero-width matches looping forever.
    if (m.index === re.lastIndex) re.lastIndex++;
  }
}

const DASH = '[-–—]'; // hyphen, en dash, em dash

/**
 * Parse a reporting period out of arbitrary header text.
 *
 * Tries, in order of confidence:
 *   high   — explicit DD.MM.YYYY / D MMM YYYY / Month D, YYYY / ISO ranges
 *   medium — a bare "Month YYYY" (falls back to first/last day of that month)
 *
 * When several high-confidence ranges are present, the earliest one in the text
 * wins (typically the report's primary period in the header).
 */
export function extractPeriodFromText(text: string): ExtractedPeriod {
  if (!text) return NONE;

  const hits: RangeHit[] = [];

  // DD.MM.YYYY - DD.MM.YYYY  (e.g. 1.05.2026 - 31.05.2026)
  collectRange(
    text,
    new RegExp(`(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})\\s*${DASH}\\s*(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})`, 'g'),
    (m) => ({
      start: isoDate(+m[3], +m[2], +m[1]),
      end: isoDate(+m[6], +m[5], +m[4]),
    }),
    hits,
  );

  // ISO  YYYY-MM-DD - YYYY-MM-DD
  collectRange(
    text,
    new RegExp(`(\\d{4})-(\\d{2})-(\\d{2})\\s*${DASH}\\s*(\\d{4})-(\\d{2})-(\\d{2})`, 'g'),
    (m) => ({
      start: isoDate(+m[1], +m[2], +m[3]),
      end: isoDate(+m[4], +m[5], +m[6]),
    }),
    hits,
  );

  // D MMM YYYY - D MMM YYYY  (e.g. 1 Apr 2026 - 30 Apr 2026, 1 May 2026 - 31 May 2026)
  collectRange(
    text,
    new RegExp(`(\\d{1,2})\\s+([A-Za-z]{3,9})\\s+(\\d{4})\\s*${DASH}\\s*(\\d{1,2})\\s+([A-Za-z]{3,9})\\s+(\\d{4})`, 'g'),
    (m) => {
      const m1 = monthNumber(m[2]);
      const m2 = monthNumber(m[5]);
      if (m1 === null || m2 === null) return { start: null, end: null };
      return { start: isoDate(+m[3], m1, +m[1]), end: isoDate(+m[6], m2, +m[4]) };
    },
    hits,
  );

  // Month D, YYYY - Month D, YYYY  (e.g. May 1, 2026 - May 31, 2026)
  collectRange(
    text,
    new RegExp(`([A-Za-z]{3,9})\\s+(\\d{1,2}),?\\s+(\\d{4})\\s*${DASH}\\s*([A-Za-z]{3,9})\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'g'),
    (m) => {
      const m1 = monthNumber(m[1]);
      const m2 = monthNumber(m[4]);
      if (m1 === null || m2 === null) return { start: null, end: null };
      return { start: isoDate(+m[3], m1, +m[2]), end: isoDate(+m[6], m2, +m[5]) };
    },
    hits,
  );

  if (hits.length > 0) {
    // Earliest occurrence in the text is the primary period.
    hits.sort((a, b) => a.index - b.index);
    return { periodStart: hits[0].periodStart, periodEnd: hits[0].periodEnd, confidence: 'high' };
  }

  // Medium confidence: a bare "Month YYYY" → first/last day of that month.
  const monthOnly = new RegExp(`([A-Za-z]{3,9})\\s+(\\d{4})`, 'g');
  let mm: RegExpExecArray | null;
  while ((mm = monthOnly.exec(text)) !== null) {
    const month1 = monthNumber(mm[1]);
    const year = +mm[2];
    if (month1 !== null) {
      const start = isoDate(year, month1, 1);
      const end = isoDate(year, month1, lastDayOfMonth(year, month1));
      if (start && end) {
        return { periodStart: start, periodEnd: end, confidence: 'medium' };
      }
    }
    if (mm.index === monthOnly.lastIndex) monthOnly.lastIndex++;
  }

  return NONE;
}

/**
 * Extract the reporting period from the first two pages of a PDF.
 * Non-throwing: returns a 'none' result if the PDF can't be read.
 */
export async function extractPeriodFromPdf(buffer: Buffer): Promise<ExtractedPeriod> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    // Period dates live in the header — only the first two pages are needed.
    const result = await parser.getText({ first: 2 });
    return extractPeriodFromText(result.text || '');
  } finally {
    await parser.destroy().catch(() => {});
  }
}
