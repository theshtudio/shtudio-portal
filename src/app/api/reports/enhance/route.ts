export const maxDuration = 300;

import { waitUntil } from '@vercel/functions';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendReportCompletedEmail } from '@/lib/email';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Classify a file by its path extension into the kind of Anthropic content
// block we should produce. Returns 'unsupported' for anything we don't have
// a routing for — callers MUST skip those rather than guess.
type FileKind =
  | { kind: 'pdf'; mediaType: 'application/pdf' }
  | { kind: 'image'; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' }
  | { kind: 'docx-text' }
  | { kind: 'unsupported'; reason: string };

function classifyByExtension(path: string): FileKind {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdf': return { kind: 'pdf', mediaType: 'application/pdf' };
    case 'docx': return { kind: 'docx-text' };
    case 'png': return { kind: 'image', mediaType: 'image/png' };
    case 'jpg':
    case 'jpeg': return { kind: 'image', mediaType: 'image/jpeg' };
    case 'gif': return { kind: 'image', mediaType: 'image/gif' };
    case 'webp': return { kind: 'image', mediaType: 'image/webp' };
    // Office formats other than .pdf/.docx and plain-text formats are not
    // accepted by the Anthropic document block (which is PDF-only) and we
    // don't have a text extractor wired up for them yet. Skip with a warn.
    case 'doc':
    case 'xls':
    case 'xlsx':
    case 'csv':
    case 'txt':
    case 'json':
      return { kind: 'unsupported', reason: `extractor not implemented for .${ext}` };
    default:
      return { kind: 'unsupported', reason: `no handler for ext='${ext}'` };
  }
}

// Verify that the buffer's leading bytes match the format we think it is.
// Returns true if the magic matches, false otherwise. Used to refuse
// shipping mislabelled bytes to Anthropic (which produces opaque 4xx).
function magicMatches(
  buffer: Buffer,
  kind: 'pdf' | 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
): boolean {
  switch (kind) {
    case 'pdf':
      return buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'image/png':
      return (
        buffer.length >= 8 &&
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    case 'image/jpeg':
      return (
        buffer.length >= 3 &&
        buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      );
    case 'image/gif': {
      if (buffer.length < 6) return false;
      const head = buffer.subarray(0, 6).toString('latin1');
      return head === 'GIF87a' || head === 'GIF89a';
    }
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
        buffer.subarray(8, 12).toString('latin1') === 'WEBP'
      );
  }
}

// ── Number extraction utilities for post-generation validation ──

// Extract all numeric values from a string (HTML or plain text).
// Returns an array of normalised numeric strings without formatting.
function extractNumbers(text: string): string[] {
  // Strip HTML tags first for HTML input
  const plain = text.replace(/<[^>]+>/g, ' ');
  const results: string[] = [];

  // Match: currency values (A$1,429 / NZ$3.65 / $164.87), percentages (52.4%),
  // delta arrows (▲12.3% / ▼0.45%), plain numbers with optional commas/decimals
  const pattern = /(?:[A-Z]{0,2}\$|NZD\s*|AUD\s*)?([\d]{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)%?/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(plain)) !== null) {
    const raw = m[1];
    if (!raw || raw === '') continue;
    // Normalise: remove commas, parse as float, convert back to string
    const normalised = parseFloat(raw.replace(/,/g, '')).toString();
    if (!isNaN(parseFloat(normalised)) && normalised !== 'NaN') {
      results.push(normalised);
    }
  }
  return results;
}

// Check whether a generated number can be found in the source number set,
// allowing for rounding tolerance (within 0.5% of value, min 0.05 absolute).
function isNumberInSource(value: number, sourceNumbers: Set<string>): boolean {
  for (const s of sourceNumbers) {
    const src = parseFloat(s);
    if (isNaN(src)) continue;
    if (src === value) return true;
    const tolerance = Math.max(0.05, Math.abs(src) * 0.005);
    if (Math.abs(src - value) <= tolerance) return true;
  }
  return false;
}

// Download a file from storage and return it as the right Anthropic content
// block kind for that file:
//   .pdf  → document block (only application/pdf is accepted in document blocks)
//   .docx → text block (extracted via mammoth)
//   .png/.jpg/.jpeg/.gif/.webp → image block
//   anything else → skip with a console.warn
// Returns null when the file is unsupported, fails to download, or its
// magic bytes don't match the claimed media_type — all skip cases.
async function downloadAsContentBlock(
  supabase: ReturnType<typeof createServiceSupabase>,
  bucket: string,
  path: string,
): Promise<any | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.error(`Failed to download ${bucket}/${path}:`, error?.message);
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const classified = classifyByExtension(path);

  // .docx → text via mammoth. media_type isn't used here because we send
  // the extracted plain text in a text block.
  if (classified.kind === 'docx-text') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;
      if (!text || text.trim().length === 0) {
        console.warn(`[enhance:doc-block] empty text from .docx: ${bucket}/${path}`);
        return null;
      }
      console.log('[enhance:doc-block] prepared', {
        bucket,
        path,
        resolvedType: 'text',
        byteLength: buffer.length,
        textLength: text.length,
      });
      return {
        type: 'text',
        text: `[Content extracted from ${path.split('/').pop()}]\n\n${text}`,
      };
    } catch (docxErr) {
      console.error(`[enhance:doc-block] failed to extract .docx ${path}:`, docxErr);
      return null;
    }
  }

  if (classified.kind === 'unsupported') {
    console.warn(
      `[enhance:doc-block] skipping ${bucket}/${path}: ${classified.reason}`,
    );
    return null;
  }

  const magicAscii = buffer
    .subarray(0, 8)
    .toString('latin1')
    .replace(/[^\x20-\x7E]/g, '?');

  // Magic-byte sanity check — refuse to ship mislabelled bytes to Anthropic.
  // The previous bug surfaced as opaque "Could not process PDF" 4xx; the
  // image-block equivalent would be "Input should be 'image/png'" etc.
  const magicKind = classified.kind === 'pdf' ? 'pdf' : classified.mediaType;
  if (!magicMatches(buffer, magicKind)) {
    console.warn(
      `[enhance:doc-block] skipping ${bucket}/${path}: declared ${classified.mediaType} but magic='${magicAscii}' (len=${buffer.length})`,
    );
    return null;
  }

  // arrayBuffer→Buffer.from→.toString('base64') is the canonical Node binary→base64 path.
  // Do NOT introduce any intermediate string conversion (e.g. .toString('utf-8'))
  // — that would corrupt non-UTF8 bytes irrecoverably.
  const base64 = buffer.toString('base64');
  const blockType = classified.kind === 'pdf' ? 'document' : 'image';

  console.log('[enhance:doc-block] prepared', {
    bucket,
    path,
    resolvedType: blockType,
    byteLength: buffer.length,
    magicBytes: magicAscii,
    base64Length: base64.length,
    base64Preview: base64.substring(0, 50),
    mediaType: classified.mediaType,
  });

  return {
    type: blockType,
    source: {
      type: 'base64',
      media_type: classified.mediaType,
      data: base64,
    },
  };
}

// ── Background processing function ──
async function processReport(reportId: string, report: any) {
  try {
    const supabase = createServiceSupabase();
    const clientName = (report.clients as any)?.name || 'the client';
    console.log('ENHANCE_ROUTE_STARTED', { reportId, clientName, reportType: report.report_type });

    // Collect all report document blocks
    const documentBlocks: any[] = [];

    // Use pdf_storage_paths (array) if available, otherwise fall back to single path
    const storagePaths: string[] = report.pdf_storage_paths?.length
      ? report.pdf_storage_paths
      : report.pdf_storage_path
        ? [report.pdf_storage_path]
        : [];

    if (storagePaths.length === 0) {
      await supabase
        .from('reports')
        .update({ ai_status: 'failed', ai_error: 'No files attached to this report' })
        .eq('id', reportId);
      return;
    }

    // Download all report files
    for (const path of storagePaths) {
      const block = await downloadAsContentBlock(supabase, 'report-pdfs', path);
      if (block) documentBlocks.push(block);
    }

    if (documentBlocks.length === 0) {
      await supabase
        .from('reports')
        .update({ ai_status: 'failed', ai_error: 'Failed to download report files from storage' })
        .eq('id', reportId);
      return;
    }

    // Download ALL client files for this client as context
    const clientFileBlocks: any[] = [];

    const { data: allClientFiles } = await supabase
      .from('client_files')
      .select('id, file_name, file_label, file_path, file_type')
      .eq('client_id', report.client_id)
      .order('created_at', { ascending: true });

    if (allClientFiles && allClientFiles.length > 0) {
      for (const cf of allClientFiles) {
        const block = await downloadAsContentBlock(supabase, 'client-files', cf.file_path);
        if (block) {
          const displayName = cf.file_label || cf.file_name;
          // Wrap the block with a label so Claude knows what each file is
          if (block.type === 'text') {
            clientFileBlocks.push({
              type: 'text',
              text: `[CLIENT FILE: ${displayName}]\n\n${block.text}`,
            });
          } else {
            // For document blocks (PDF, etc.), prepend a text label then the document
            clientFileBlocks.push({
              type: 'text',
              text: `[CLIENT FILE: ${displayName}]`,
            });
            clientFileBlocks.push(block);
          }
        }
      }
      console.log(`Loaded ${clientFileBlocks.length} content blocks from ${allClientFiles.length} client files`);
    }

    // Fetch last 6 completed reports for richer historical context
    const { data: previousReports } = await supabase
      .from('reports')
      .select('ai_enhanced_html, title, period_start, period_end')
      .eq('client_id', report.client_id)
      .eq('ai_status', 'completed')
      .neq('id', reportId)
      .order('created_at', { ascending: false })
      .limit(6);

    // Build prompt context
    const clientLogoUrl = (report.clients as any)?.logo_url || '';
    const periodInfo = report.period_start && report.period_end
      ? ` for the period ${report.period_start} to ${report.period_end}`
      : '';

    // Build historical context
    let historicalContext = '';
    if (previousReports && previousReports.length > 0) {
      // Reverse so they're in chronological order (oldest first)
      const chronological = [...previousReports].reverse();

      historicalContext = `

HISTORICAL REPORTS FOR COMPARISON:
The following are previous reports for this client in chronological order. Use them to identify trends and provide month-on-month and longer-term comparisons where relevant.

${chronological.map((r, i) => {
  const period = r.period_start && r.period_end ? `${r.period_start} to ${r.period_end}` : 'Unknown period';
  return `<previous_report index="${i + 1}" title="${r.title || 'Untitled'}" period="${period}">
${r.ai_enhanced_html}
</previous_report>`;
}).join('\n\n')}

You MAY reference historical data from those previous reports to provide month-on-month context in your narrative and comparison cards — but ONLY for metrics where you can read the exact figure from the historical HTML above. Do NOT derive, infer, or re-calculate historical numbers. If a metric value is not explicitly visible in the historical HTML for a given period, treat it as unavailable.

Apply the DELTA BADGE DIRECTION rules below when choosing pill colours — colour signals "good for the client" / "bad for the client", not raw numerical direction.`;
    }

    // Build report type + options instructions
    let reportTypeInstructions = '';
    if (report.report_type) {
      const typeDisplayNames: Record<string, string> = {
        google_ads: 'Google Ads',
        gbp: 'Google Business Profile',
        seo: 'SEO',
        meta_ads: 'Meta Ads',
        microsoft_ads: 'Microsoft Ads',
        linkedin_ads: 'LinkedIn Ads',
        combined: 'Combined Report',
      };
      const typeName = typeDisplayNames[report.report_type] || report.report_type;
      reportTypeInstructions += `\n\nREPORT TYPE: ${typeName}`;

      if (report.report_options) {
        const opts = report.report_options as {
          sections?: string[];
          adminOnlySections?: string[];
          globals?: string[];
        };

        if (opts.sections && opts.sections.length > 0) {
          reportTypeInstructions += `\n\nYou MUST include these sections: ${opts.sections.join('; ')}. Do not include sections that are not listed unless they contain data that clearly belongs in the report.`;
        }

        if (opts.adminOnlySections && opts.adminOnlySections.length > 0) {
          reportTypeInstructions += `\n\nAdminOnly sections (include these but label them as internal reference only with a discreet "Internal Note" label): ${opts.adminOnlySections.join('; ')}`;
        }

        if (opts.globals && opts.globals.length > 0) {
          reportTypeInstructions += `\n\nGlobal options: ${opts.globals.join('; ')}`;
        }
      }

      // Backlinks rule — applies to SEO, GBP, and combined (NOT paid-ad reports).
      // Paid-ad reports can contain legitimate client-facing URLs (landing pages,
      // tracking links) that must not be suppressed.
      const BACKLINKS_RULE = `
BACKLINKS — COUNT AND CATEGORY ONLY:
When the source content includes backlink-building activity (external links placed on third-party sites to support organic SEO or GBP visibility):
- Show the count of links built and the category description only. Example: "15 links built across directories, catalogues, and external services."
- NEVER list the actual URLs or domain names of placed backlinks.
- NEVER reproduce raw lists of sites where links were placed.
- If the source lists specific URLs or domains for placed backlinks, summarise by category — do not name individual sites.

This rule applies ONLY to backlink-building work listed as agency activity (typically in "Work Completed" sections). It does NOT apply to:
- The client's own website URLs (landing pages, product pages)
- Tracking links and UTM-tagged URLs
- Campaign destination URLs in paid ad sections
- Reference links to industry standards, documentation, or tools
Distinguishing factor: backlink-building entries are agency work performed FOR the client on external sites. Other URLs are operational details of the campaign or content itself.`;

      if (report.report_type === 'gbp') {
        reportTypeInstructions += BACKLINKS_RULE;
      }

      // SEO-specific instructions
      if (report.report_type === 'seo' || report.report_type === 'combined') {
        reportTypeInstructions += BACKLINKS_RULE + `

SEO BADGE / PILL COLOUR CONVENTION — CRITICAL:
Red and green pills (.m-change.down / .m-change.up) carry semantic meaning in analytics: red = negative outcome, green = positive outcome. They MUST only be used for genuine period-over-period deltas where you have actual comparison data (e.g. "↓ 12% vs last month", "↑ 8% YoY").

Never apply red or green styling to descriptive labels such as "All channels", "99% of traffic", "Overall average", "Across the period", "Top 10 pages", or any other neutral descriptor. These have no positive/negative signal and must use the neutral grey pill style:

   <span class="m-change neutral">All channels</span>

Default rule: if there is no comparison number behind the badge, use .m-change.neutral. Coloured pills require an arrow (↑/↓) and a percentage. If you don't have both, the pill is neutral.

SEO SECTION COMPLETENESS — CRITICAL:
Do NOT drop sections because they seem complex or detailed. Every section that exists in the source PDF must have a corresponding section in the HTML output, except raw link-dump lists (individual URLs for external articles, directories, ClickUp/Google Sheets internal links). The goal of simplification is cleaner layout and language — not fewer sections or less data.

Render ALL of the following sections if the underlying data exists in the PDF:

1. TRAFFIC BY CHANNEL TABLE
   Extract the full GA4 channel breakdown table. Render an HTML <table> with columns: Channel, Total Users, New Users, Returning Users, Avg Engagement Time, Engaged Sessions, Event Count. Include all rows (Direct, Organic Search, Referral, Organic Social, Unassigned, etc.). Do not summarise or collapse rows.

2. ORGANIC TRAFFIC PERFORMANCE (monthly time series — REQUIRED if monthly data present)
   The source PDF typically contains a "Organic Traffic Dynamics" or similar table with monthly breakdowns spanning 12-13 months (e.g. March 2025 → March 2026), with columns Total Users, New Users, Sessions per month. You MUST extract every month's row and render a Chart.js line chart titled "Organic Traffic Performance" with TWO lines — Sessions and New Users — across the full month range. Use canvas id="chart-organic-traffic". The chart container must be wrapped in <div class="chart-container">.

   Line colours — these two specific colours are required for clear contrast on a two-series chart:
   * Sessions:  #2B6CB8 (primary brand blue)
   * New Users: #F26522 (Shtudio orange)

   Do NOT also render a separate HTML monthly-data table beneath the chart — the chart is the canonical view and Chart.js tooltips already expose the exact value for each month on hover. A duplicate table is redundant and clutters the report.

   X-axis labels — compact format to prevent overlap on 12–13 month ranges:
   * Show the year ONLY on the first label and on January transitions
   * All other labels are bare month names
   * Use single-quote two-digit year, e.g. for Mar 2025 → Mar 2026 the labels are:
       ["Mar '25", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan '26", "Feb", "Mar"]
   * Inline this exact array shape (year-stamped first label + every January) into the labels: array.

   Concrete code template you MUST follow for this chart (replace LABELS_JSON, SESSIONS_JSON, NEW_USERS_JSON with real arrays extracted from the PDF; arrays must be the same length and be in chronological order; LABELS_JSON must follow the compact format above):

   <div class="chart-section">
     <h3>Organic Traffic Performance</h3>
     <p class="chart-sub">Monthly organic users and sessions across the available period.</p>
     <div class="chart-container"><canvas id="chart-organic-traffic"></canvas></div>
   </div>

   …then inside the single bottom-of-body DOMContentLoaded script:

   new Chart(document.getElementById('chart-organic-traffic').getContext('2d'), {
     type: 'line',
     data: {
       labels: LABELS_JSON,
       datasets: [
         { label: 'Sessions', data: SESSIONS_JSON, borderColor: '#2B6CB8', backgroundColor: 'rgba(43,108,184,0.08)', tension: 0.4, fill: true, borderWidth: 2, pointRadius: 3 },
         { label: 'New Users', data: NEW_USERS_JSON, borderColor: '#F26522', backgroundColor: 'rgba(242,101,34,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: 3 }
       ]
     },
     options: {
       responsive: true,
       maintainAspectRatio: true,
       plugins: { legend: { position: 'top', labels: { font: { family: 'DM Sans' }, usePointStyle: true } }, tooltip: { backgroundColor: '#1A1A2E', titleColor: '#fff', bodyColor: '#fff' } },
       scales: { x: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { family: 'DM Sans' }, autoSkip: false, maxRotation: 45, minRotation: 0 } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { family: 'DM Sans' } } } }
     }
   });

   You MUST inline the actual numeric arrays from the PDF — do not output placeholder strings, do not embed images of charts, and do not omit the chart. If the PDF only contains a chart image (no underlying table), read the values off the chart axes as accurately as you can.

3. MONTH-ON-MONTH COMPARISON (if data present)
   Render a table showing current period vs previous period with a % change column, for each channel. Follow it with a 2–3 sentence AI-written narrative interpreting the key changes (what improved, what declined, what to watch).

4. YEAR-ON-YEAR COMPARISON (if data present)
   Same structure as the MoM table but comparing to the same period last year. With narrative.

5. SEARCH CONSOLE SECTION (if data present)
   Show the 4 headline metrics as cards: Total Clicks, Total Impressions, Average CTR, Average Position — current period vs previous period with % change indicators. Add a short narrative paragraph. If click/impression trend data is available over the period, render a dual-axis Chart.js line chart (clicks on left axis, impressions on right axis) titled "Search Console: Clicks & Impressions". Use canvas id="chart-search-console".

6. AI SEARCH TRAFFIC (if data present)
   The source PDF may include a breakdown of users arriving from AI assistants (chatgpt.com, perplexity.ai, claude.ai, copilot.microsoft.com, gemini.google.com, etc.). Render an HTML table titled "AI Search Traffic" with columns: Source, Users, Sessions (or whatever metrics the PDF provides). Include every AI source listed.

7. MOST VISITED ORGANIC PAGES (if data present)
   The PDF often shows a long list (hundreds or thousands) of organic landing pages. Render an HTML <table> titled "Most Visited Organic Pages" with the TOP 15 rows by Users (or by whatever the source orders them). Columns should mirror the PDF — typically Page Path, Users, Sessions, Avg Engagement Time. Below the table add a small note: "Top 15 of [N] pages" using the total count from the source where visible. Do NOT include all 2000+ rows — the truncation is intentional for client-readability.

8. ORGANIC TOP QUERIES (if data present)
   From the Google Search Console "Organic Report Query" section, render a table of the TOP 15 queries by clicks, with columns: Query, Clicks, Impressions, CTR, Position. This is separate from the Search Console headline cards in section 5.

9. ORGANIC LANDING PAGES — SEARCH CONSOLE (if data present)
   From the Google Search Console "Organic Report Landing Pages" section, render a table of the TOP 15 landing pages by clicks, with columns: Page, Clicks, Impressions, CTR, Position.

10. EXTERNAL OPTIMISATION — SEMRUSH METRICS
    Render all available SEMrush metrics as cards in a responsive grid. Include: Authority Score (with label), Organic Traffic, Paid Traffic, Referring Domains, Traffic Share, Organic Keywords, Paid Keywords, Backlinks. Show % change / MoM change indicators where shown in the source. Do not drop metrics just because they are zero or unchanged. Descriptive labels on these cards (e.g. "Domain authority", "All channels") must use .m-change.neutral, not red.

11. KEYWORD POSITION DISTRIBUTION CHART (if data present)
    Render a Chart.js stacked bar or area chart showing keyword distribution across position brackets (Top 3, 4–10, 11–20, 21–50, 51–100) over the available time period (typically 6 months). Extract data values from the PDF as accurately as possible. Use canvas id="chart-keyword-positions". Title: "Keyword Position Distribution".

12. REFERRING DOMAINS & BACKLINKS GROWTH CHARTS (if trend data present)
    Render two Chart.js line charts side by side: one for Referring Domains growth over time, one for Total Backlinks growth over time. Extract values from the SEMrush trend charts in the PDF. Use canvas ids "chart-referring-domains" and "chart-backlinks-growth".

13. WORK COMPLETED
    Reproduce the full list verbatim from the PDF. Do not summarise, shorten, or omit any items. Render as a styled list or table.

14. RECOMMENDATIONS
    Reproduce in full, exactly as written in the PDF. Do not shorten.

15. PLAN FOR NEXT MONTH
    Reproduce in full, exactly as written in the PDF. Do not shorten.

CHART COLOURS FOR SEO LINE CHARTS:
For line / area charts in the SEO report:
* Primary series: #2B6CB8 (brand blue) — always.
* Two-series charts that share a single y-axis (e.g. Organic Traffic: Sessions + New Users): use #F26522 (Shtudio orange) for the second series so it's clearly distinguishable from the primary blue.
* Three-or-more series, or charts where series sit on separate y-axes (e.g. Search Console clicks vs impressions on a dual axis), use #4A90D9 and #1A4A8A as additional colours.
Do not use the wider 6-colour palette listed elsewhere — that's for Google Ads breakdown charts.

WHAT TO OMIT:
- Individual URL dumps for external articles placed / backlinks built (mention counts only)
- Internal document links (ClickUp tasks, Google Sheets links)
- Raw "Other links" URL lists
- Pagination of 2000+ row tables — show top 15 with a count footer instead`;
      }
    }

    const promptText = `BEFORE GENERATING THE REPORT, output these four lines first, then a blank line, then the HTML:
CLIENT_NAME: [exact client/business name as it appears in the PDF]
REPORT_TYPE: [one of: Google Ads, SEO, Meta Ads, Microsoft Ads, LinkedIn Ads, Google Business Profile]
PERIOD_START: [first day of the reporting period in YYYY-MM-DD format, e.g. 2026-03-01]
PERIOD_END: [last day of the reporting period in YYYY-MM-DD format, e.g. 2026-03-31]

Then output the complete HTML report starting with <!DOCTYPE html>. The four lines above will be stripped — they are for internal processing only. You MUST include all four lines.

You are a digital marketing report specialist for Shtudio, a Sydney digital agency.

Your task is to produce a complete, self-contained HTML file for ${clientName}${periodInfo} that matches the exact design standard of the reference template below. The attached document(s) contain all the raw data and metrics you need — extract everything from them.

ABSOLUTE RULES — VIOLATION OF ANY OF THESE INVALIDATES THE REPORT
═══════════════════════════════════════════════════════════════════

These rules take precedence over every other instruction in this prompt, including tone, structure, layout, and report-type instructions. If following a later rule would require violating any rule below, the rule below wins. Always.

§1. DATA FIDELITY — ZERO TOLERANCE
Every number, percentage, currency value, conversion count, date, period label, comparison delta, and named entity in the generated report MUST come directly from the source PDF or admin-provided content. No exceptions.

You may NOT:
- State a metric that does not appear in a source file
- Approximate a number that has an exact value ("around 15%" when the exact figure is 15.41%)
- Copy a MoM % from a source document without first verifying it against the raw values
- Fill gaps in historical data with calculated approximations
- Round numbers in ways that change their stated value (90.24 stays 90.24, not 90.2 unless shown that way in the source)
- Generate "example" or "placeholder" numbers that look like real data
- Average, sum, or aggregate numbers across periods unless the source explicitly provides the aggregate
- Convert between units, currencies, or formats unless the source provides the converted value

Every MoM % figure must be independently derivable from the source raw values using: ((Current − Previous) / Previous) × 100. If the source document states a MoM % that does not match the calculation from its own raw figures, use the calculated figure and note the discrepancy (per rule B12 in the reporting framework).

If you are tempted to generate a number because the report layout expects one, STOP. Omit the field, the row, or the entire block. A missing section is acceptable. A fabricated number is not.

§2. HISTORICAL DATA — NO INTERPOLATION
You may reference historical data from the previous reports provided in context ONLY for metrics where you can read the exact figure from the historical HTML. You may NOT derive, infer, re-calculate, or interpolate historical numbers. If a metric value is not explicitly visible in the historical HTML for a given period, treat it as unavailable and do not use it.

§3. MULTI-PERIOD SECTIONS — CONDITIONAL RENDERING
If a section template would normally show historical context (three-month trends, year-over-year comparisons, quarterly trajectories) but the source data only covers one or two periods, OMIT that section entirely.

The period-trend-cards block type is CONDITIONAL: only render it if you have explicitly verified numerical data for each period you would display. A source that shows only "current month vs previous month" does NOT provide enough data for a three-month trajectory — do not generate the third month's numbers by any form of calculation or estimation.

Do not partially fill a multi-period section with available data and invent the rest. Do not write "data not available" placeholders in number fields. The section either renders with fully verified data, or it does not render at all.

§4. INTERNAL CONSISTENCY — SAME VALUE EVERYWHERE
Every number that appears in the report must be identical wherever it appears. The same metric value cannot appear as 78.19 in one section and 78.2 or 95.2 in another. If you produce contradictory numbers between two sections of the same report, the report is broken — re-derive both from the single source figure before output.

§5. NARRATIVE FIDELITY — NO INVENTED CONTEXT
You may NOT:
- Describe a declining metric as stable, maintained, or growing
- Apply positive framing ("strong performance", "excellent efficiency", "continued momentum") to a result that declined materially
- Present a hypothesis or assumption as a confirmed fact
- Add unsupported causal explanations ("conversions increased due to the new keyword strategy" requires evidence that the keyword strategy changed and produced the result)
- Use vague superlative claims ("excellent performance", "outstanding results", "strong growth", "the best month yet") unless a specific metric in the source justifies the claim

Possible explanations for performance changes may be offered cautiously but must be labelled as hypotheses: "this may reflect", "one possible factor is", "this is consistent with".

§6. RECOMMENDATIONS — AGENCY VOICE ONLY
Recommendations carry agency authority; observations and analysis do not. Never blur that line.

If the source content contains explicit recommendations, action items, "next steps", or "plan for next month", reproduce them with their original meaning and intent fully preserved. You MAY lightly adjust wording for grammar and clarity but NEVER alter the substance or scope. You MAY NOT add recommendations of your own.

If no recommendations are present in the source, the Recommendations section must either be omitted entirely or contain ONLY data-driven observations framed as observations, not prescriptions — e.g. "Conversion rate dropped 22% this period, which warrants attention" rather than "We recommend optimising landing pages".

§7. COMPARISON PERIODS — ALWAYS LABELLED
Every delta badge (▲/▼ with a percentage) implicitly references a comparison baseline. The reader must always know what that baseline is. Every block displaying period-over-period numbers must have a <p class="comparison-note"> directly under its heading stating the comparison period. Never write a delta without a baseline.

If the source does not explicitly state the comparison period, infer the most likely period from the report's primary date range and label it with "estimated":
   <p class="comparison-note">vs. previous month (estimated: 1–31 Mar 2026)</p>

§8. SECTION OMISSION — DEFAULT BEHAVIOUR
If a section cannot be populated with fully verified source data, omit it. Do not:
- Render a section with blank or placeholder values
- Render a section with invented data to fill the layout
- Render a section that requires three periods of data when only two are available

A shorter report with accurate data is always better than a longer report with invented data.

═══════════════════════════════════════════════════════════════════
END OF ABSOLUTE RULES
═══════════════════════════════════════════════════════════════════

EXAMPLES OF CORRECT vs INCORRECT BEHAVIOUR
═══════════════════════════════════════════

Example 1 — Source data covers Apr/May only:
✗ INCORRECT: Renders Three-Month Trajectory with invented March numbers
✓ CORRECT: Omits Three-Month Trajectory (period-trend-cards) section entirely
✓ CORRECT: Renders Two-Month Comparison (comparison-grid) with verified Apr and May numbers

Example 2 — Source narrative says "conversions improved":
✗ INCORRECT: Output says "conversions improved by 12.4%" (percentage not in source)
✓ CORRECT: Output says "conversions improved" (matches source qualitative claim)
✓ CORRECT: Output says "conversions rose from 78.19 to 90.24" (both numbers verified in source)

Example 3 — Source mentions a campaign briefly:
✗ INCORRECT: Output speculates "the Brand campaign likely drove this due to seasonal demand"
✓ CORRECT: Output states only what the source says about the campaign

Example 4 — Source has no recommendations:
✗ INCORRECT: AI generates "We recommend optimising landing pages for better conversion"
✓ CORRECT: Recommendations section omitted, OR contains only observations: "Conversion rate declined 22% — this warrants attention in the next period"

Example 5 — Source states impression growth "grew by 30.5%" but raw figures calculate to +20.31%:
✗ INCORRECT: Report states "30.5%" (copied from source without verification)
✓ CORRECT: Report states "+20.31%" (independently calculated from raw figures); adds footnote noting discrepancy with source

Example 6 — Revenue fell 77% but campaign drove significant traffic:
✗ INCORRECT: "Revenue maintained strong trajectory" or "Strong performance across the account"
✓ CORRECT: "Revenue declined 77.4% to A$1,429, consistent with the active promotional period where users are in the research phase"

Example 7 — MoM % appears in source but raw values tell a different story:
✗ INCORRECT: Copy MoM % from source PDF without checking: "conversions grew +14.25%"
✓ CORRECT: Recalculate from raw figures (78.19 → 90.24 = +15.41%); use +15.41%

Example 8 — Source lists 5 underperforming campaigns:
✗ INCORRECT: Output lists only 2 of them (campaigns silently omitted)
✓ CORRECT: Output lists all 5, exactly as named in the source

═══════════════════════════════════════════════════════════════════
END OF EXAMPLES
═══════════════════════════════════════════════════════════════════

TONE & STRUCTURE — CRITICAL (applies to every report type):
Reports must always lead with positives where they exist, even small ones, before discussing what needs attention. A report that reads as a list of bad news erodes the client's confidence in the agency, even when the underlying nuance is real. Find the angle.

Examples of positives that are often present even in declining periods:
* A specific campaign / channel / ad set / page that performed well, even if overall performance dipped
* Quality metrics holding steady (e.g. CTR stable while volume dropped — audience targeting still working)
* Cost efficiency improvements (CPC down, cost-per-conversion down) even if total volume is also down
* New users or new audiences reached
* Year-over-year comparisons that paint a different picture than month-over-month
* Pipeline / leading indicators (impressions, reach, engaged sessions) even if conversions lagged

If genuinely no positives exist in the data, frame the period as a "recalibration month" and focus the narrative on the specific actions being taken to address what underperformed. Never write a report that reads as purely negative.

WHICH METRICS BELONG IN THE OPENER:
When leading with positives, prefer engagement and quality metrics over efficiency and cost metrics. Engagement metrics tell the client "your audience is still engaged", which is the morale-correct opening. Cost metrics, even when framed positively (e.g. "CPC came down"), read as defensive in the opener — they belong in the analysis that follows the cards / data tables, not in the lead.

Prefer in the opener:
* CTR
* Audience reach / impressions / new users
* Search Impression Share, brand-search volume
* Engagement Rate, engaged sessions, average engagement time
* Conversions or conversion rate when up
* A standout campaign or channel by name (e.g. "the Sale Event campaign drove 38% of total clicks")

Do NOT lead with in the opener:
* Avg CPC, Cost per Conversion, CPM, Cost per Lead, Cost / Spend / Budget — even when these moved in a favourable direction
* Bounce rate, even if down
* Avg Position movement on its own (a position shift only matters once paired with the click/impression context)

If only cost/efficiency metrics improved and no engagement metrics did, lead with the most relevant engagement metric staying steady — e.g. "CTR held above industry benchmark at 7.6% even as overall volume softened." A held-steady engagement metric is a stronger opener than a moved cost metric.

Required structure for the opening narrative:
1. The hero summary / "How did [month] go?" paragraph opens with 1–2 sentences highlighting a genuine bright spot from the data — even if overall performance declined. Acknowledge the broader picture honestly in the next sentence; don't pretend a bad month was good.
2. Then the cards / data tables — these contain both good and bad metrics, and that's fine, the data is what it is.
3. Then a forward-looking "Areas to Address" or "What we're focusing on next" section that's specific (which campaign / which metric / what's being changed) rather than just listing what went wrong.

Do NOT become saccharine or dishonest — clients can spot a report that's just spinning numbers. If a metric dropped 30%, say so clearly. If conversions halved, name it. The goal is professional context, not happy-talk. Every framing claim must be supportable by the data.

DELTA BADGE DIRECTION — CRITICAL:
Every change badge (<span class="m-change ...">▲ X% / ▼ X%</span>) carries a colour signal: green = good for the client, red = bad for the client, neutral grey = no clear good/bad direction. The arrow inside the span always reflects the actual numerical change (▲ for positive change, ▼ for negative change). Only the COLOUR reflects whether that change is good or bad, and that depends on the metric.

Available pill classes:
* .m-change.up         — green, ▲, used when a higher-is-better metric went up
* .m-change.down       — red,   ▼, used when a higher-is-better metric went down
* .m-change.good-down  — green, ▼, used when a lower-is-better metric went down (good)
* .m-change.bad-up     — red,   ▲, used when a lower-is-better metric went up (bad)
* .m-change.neutral    — grey, either arrow, used for descriptive labels and contextual metrics

For PAID-AD reports (Google Ads, Meta Ads, Microsoft Ads, LinkedIn Ads, Combined):

Higher is better — positive ▲ uses .m-change.up (green), negative ▼ uses .m-change.down (red):
* Clicks
* Impressions
* CTR
* Conversions
* Conversion Rate
* Conversion Value
* ROAS / Return on Ad Spend
* Reach
* Engagement Rate
* Video Views

Lower is better — positive ▲ uses .m-change.bad-up (red), negative ▼ uses .m-change.good-down (green):
* Average CPC (cost per click)
* Cost per Conversion / CPA
* CPM
* Cost per Lead
* Bounce Rate

Neutral / contextual — always .m-change.neutral (grey) regardless of direction. Show the % change but no green/red interpretation:
* Cost / Spend / Budget — going up isn't inherently bad if it's driving more conversions; going down isn't inherently good if it's because the campaign was paused
* Search Impression Share — usually higher is better but context matters
* Active Campaigns / Active Ad Sets / Active Ads — counts, not performance metrics

For SEO reports, the inversions are:

Lower is better (use .m-change.good-down for ▼, .m-change.bad-up for ▲):
* Bounce Rate
* Average Position — position 1 is the top of search results, so going from 8 → 5 is GOOD even though the number went down

Higher is better — default green ▲ / red ▼ (current behaviour):
* Sessions, Users, New Users, Engaged Sessions, Avg Engagement Time
* Clicks, Impressions, CTR (Search Console)
* Organic Keywords, Referring Domains, Backlinks, Authority Score
* Traffic Share

Always pair the colour class with the actual direction arrow — never write a green ▼ where the data shows a positive change, never write a red ▲ for 0% change. If the % change is exactly 0 or you don't have comparison data, use .m-change.neutral.

COMPARISON PERIOD LABELLING — CRITICAL:
Every delta badge (▲/▼ with a percentage) implicitly references a comparison baseline. The reader must always know what that baseline is — "▲ 8.40%" vs. previous month, vs. same month last year, and vs. previous 30 days tell completely different stories.

Extract the comparison period from the source PDF. Where to look:
* Looker Studio exports usually show the comparison range in the page header next to the primary date range.
* Google Ads UI exports show it as a "Compare to" period directly below the main date range at the top of the export.
* Search Console / SEMrush exports often note the comparison under each chart or in the table caption.

WHICH BLOCKS REQUIRE THE NOTE — every block displaying period-over-period numbers must have a <p class="comparison-note"> directly under its heading, not only the primary comparison-cards block. This explicitly includes:
* comparison-grid (period-over-period comparison cards)
* period-trend-cards (multi-period trend cards, e.g. 3-month efficiency)
* key-numbers-grid — but only when its cards show ▲/▼ deltas. A pure totals grid with no deltas does NOT need a note.
* Any narrative block that references "vs. previous period", "vs. last month", or similar
* Any chart block that overlays current vs. previous period data
* Any sub-section of a multi-region or multi-campaign report — e.g. AU breakdown, NZ breakdown, per-campaign cards, per-region trend tables. Each visually-separated sub-section is its OWN block from the reader's perspective and gets its OWN note, even when the parent overview block already has one.

Use the exact element:

   <p class="comparison-note">vs. previous period (1–31 Mar 2026)</p>

One note per section, not per card.

PER-BLOCK ONLY — NO SHARED-NOTE SHORTCUT. Every block listed above gets its OWN <p class="comparison-note"> directly under its heading. There is no "single note at the top covers the whole report" exception. If the same comparison period applies to every block (the common case), all the notes will say the same thing — that's intentional. Repetition is better than ambiguity, because visually-separated sections (AU vs NZ vs combined ANZ; campaign A vs campaign B; week 1 vs week 2) read as standalone sections and the reader needs the baseline restated next to each card grid.

INFERENCE FALLBACK when the source doesn't explicitly state the comparison period — never write a delta without a baseline. Apply this in order:

1. Try to extract the comparison period from the source PDF first (header date range, "Compare to" line, chart caption — see WHERE TO LOOK above).

2. If extraction fails, INFER the most likely period from the report's primary date range:
   * Single calendar month (e.g. "April 2026") → comparison is the immediately preceding month (March 2026). This is the default in Google Ads, Looker Studio, Meta Ads, etc.
   * Single quarter → preceding quarter
   * Single week → preceding week
   * Custom date range of N days → preceding N days
   State the inferred period with an "estimated" marker so the reader knows it's inferred:

      <p class="comparison-note">vs. previous month (estimated: 1–31 Mar 2026)</p>

   The literal word "estimated" inside the parens is the signal — it tells the reader (and the agency reviewer) that this baseline was inferred from context, not extracted from the source.

3. ONLY when even reasonable inference is impossible — e.g. the source spans an unusual custom range with no obvious "previous period" equivalent, or the primary date range itself isn't clear — fall back to:

      <p class="comparison-note">Comparison period not specified in source data.</p>

The goal: a client never reads a delta without knowing what it's compared to. An estimated baseline is much better than no baseline.

RECOMMENDATIONS — DO NOT INVENT:
Recommendations carry agency authority; observations and analysis don't. Never blur that line.

If the source content (PDF, admin notes, client files) contains explicit recommendations, action items, "next steps", or "plan for next month", these are authored by the agency for the client and must be treated as inviolable:
* Reproduce them with their original meaning and intent fully preserved.
* You MAY lightly adjust wording for grammar, consistency of tone with the rest of the report, and clarity — but NEVER alter the substance, scope, or specific actions recommended.
* You MAY NOT add additional recommendations of your own, even if the data analysis suggests obvious next steps. The agency decides what to recommend; the report just renders it well.
* You MAY add brief context, rationale, or expected outcomes around each agency-authored recommendation (e.g. "This action is expected to address the conversion rate decline observed in this period"). Frame these as explanations and supporting context, not as new recommendations.

If no recommendations are present in the source content, the Recommendations / Next Steps / Plan for Next Month section must either:
  (a) be omitted from the report entirely, or
  (b) contain ONLY data-driven observations framed as observations, not prescriptions — e.g. "Conversion rate dropped 22% this period, which warrants attention" rather than "We recommend optimising landing pages".

The line is between "here is what the data shows" (observation, allowed) and "here is what we propose to do about it" (recommendation, agency-only). If the agency hasn't proposed an action, the report must not propose one either.

INTERNAL CONTENT — HIDE FROM CLIENTS — CRITICAL:
Source content sometimes contains paragraphs, sections, or notes explicitly marked as INTERNAL — meant for the agency team, not the client. Watch for these markers:
* "Internal Reference Only"
* "Internal use"
* "Team notes" / "Agency notes"
* "For internal review"
* "Not for client"
* "Internal commentary"
* Any equivalent phrasing that signals "this is for us, not them"

Internal content MUST be isolated into its own block — never inlined into a narrative block, callout, recommendations section, or any other client-facing block type. The model emits internal content as a dedicated section of block type "internal-note" with the data-default-hidden attribute set so the renderer can strip it from client views automatically.

Required structure:

   <section data-block-id="internal-note-0" data-block-type="internal-note" data-block-title="Internal Notes" data-default-hidden="true">
     <div class="internal-note-block">
       <h3>Internal Reference — Hidden from Client</h3>
       <p>[content from source PDF, preserved as written]</p>
     </div>
   </section>

Attribute requirements:
* data-default-hidden="true" — non-negotiable. This is how the renderer knows to strip the block from /share and /dashboard. Without it, the content leaks to clients.
* The block's INNER heading should always include the literal text "Internal Reference — Hidden from Client" so admins viewing the editor / admin preview know what they're looking at without needing to inspect attributes.
* The data-block-title attribute is "Internal Notes" (or a more specific short label if the source distinguishes between multiple internal sections).

Use a fresh integer suffix for each internal block (internal-note-0, internal-note-1, …) the same way as any other repeatable block type.

If a single source paragraph mixes client-facing and internal content (e.g. a recommendations section that has a "internal-only follow-up" line at the end), split it: keep the client-facing portion in its original block, and move the internal portion into a separate internal-note block. Do not paraphrase internal content out of existence — preserve it for the admin team.

BLOCK STRUCTURE — CRITICAL (applies to every report type):
Every distinct visual section of the report MUST be wrapped in a <section> element with three data attributes:

  <section data-block-id="..." data-block-type="..." data-block-title="...">
    <!-- original section markup, unchanged -->
  </section>

These wrappers identify each section so per-report layout customisations (reorder, hide, override) can be applied downstream. Without them every report still renders correctly, but customisations cannot be saved against the report.

Attribute rules:
* data-block-id — STABLE, unique-within-document identifier. Format: {block-type}-{index} where index starts at 0 and increments per block type. Examples: key-numbers-0, narrative-0, narrative-1, chart-organic-trends-0, data-table-0, data-table-1. Always use the SAME id for the SAME logical section across regenerations of the same report type so saved customisations persist.
* data-block-type — semantic type, from the enumerated list below. DO NOT invent new types. If a section doesn't fit any canonical type, use "narrative" as the catch-all.
* data-block-title — short human-readable label (2-4 words) for an editor sidebar. Examples: "Key Numbers", "Top Queries", "Organic Traffic Chart", "Areas to Address". One short string, not a full heading.

Canonical block types — use ONLY these:
* intro              — opening "At a glance" + section title pairing (top of the report)
* hero-summary       — large coloured KPI banner with hero KPIs
* key-numbers-grid   — the .metrics-grid cards at the top of paid-ad reports
* comparison-grid    — period-over-period comparison cards
* period-trend-cards — three-period trend cards (e.g. efficiency over 3 months). CONDITIONAL: only render this block if you have explicitly verified numerical data for each period you would display (e.g. three separate months). A source that shows only "current month vs previous month" does NOT provide enough data for a three-month trajectory — do not generate the third month's numbers by any form of calculation or estimation. If data for fewer than three periods is available, omit this block entirely rather than inventing or approximating the missing period(s).
* narrative          — prose paragraphs of analysis (may appear multiple times)
* chart              — Chart.js canvas sections (e.g. Organic Traffic Performance)
* data-table         — tabular data (Top Pages, Top Queries, Landing Pages, AI Search Traffic, channel breakdown)
* insight-callout    — highlighted "Key insight" / "Spotlight" boxes
* funnel             — funnel visualisation (paid ads)
* campaigns-table    — campaign breakdown table (paid ads — kept distinct from generic data-table for editor convenience)
* tasks              — tasks-completed / work-completed list
* recommendations    — forward-looking action items / "Areas to Address" / "Plan for Next Month"
* internal-note      — agency-only commentary marked Internal in the source. MUST also carry data-default-hidden="true" so client views strip it automatically. See INTERNAL CONTENT rule above.

Default emission order — when nothing else dictates otherwise, emit blocks in this order per report type:

Google Ads / Meta Ads / Microsoft Ads / LinkedIn Ads / Combined:
  intro → hero-summary → key-numbers-grid → comparison-grid → period-trend-cards →
  narrative → chart → funnel → campaigns-table → insight-callout → tasks →
  recommendations

SEO:
  intro → hero-summary → key-numbers-grid → narrative → data-table (channel) →
  chart (organic-trends) → data-table (top pages) → data-table (top queries) →
  data-table (landing pages) → data-table (AI search traffic) → insight-callout →
  tasks → recommendations

Google Business Profile (GBP):
  intro → hero-summary → key-numbers-grid → narrative → data-table → insight-callout →
  recommendations

Structural constraints:
* Place ONLY <section data-block-id> blocks as direct children of <div class="main">. Free-floating dividers, intro divs, and any other scaffolding must be moved INSIDE a block (typically the most-relevant adjacent block). The block <section> IS the structural container — let its CSS margins / padding provide visual separation between blocks.
* Do NOT nest one <section data-block-id> inside another. Blocks are siblings.
* The Chart.js CDN tag in <head> and the bottom-of-body chart-init <script> stay OUTSIDE the blocks, exactly as they are today.
* The header, .header-accent, and footer stay OUTSIDE <div class="main"> and are NOT wrapped as blocks.
* Use a fresh integer suffix for each instance of a repeatable block type within one report. Across a report you might have data-table-0, data-table-1, data-table-2 (e.g. for top pages, top queries, landing pages); narrative-0, narrative-1; etc.

FINAL CHECK BEFORE OUTPUT (verify all §1–§8 rules):
Before emitting your response, confirm each item:
1. §1 DATA FIDELITY — every number traces to a source file; no MoM % was copied without recalculation
2. §2 HISTORICAL DATA — no historical figures were inferred or interpolated
3. §3 MULTI-PERIOD — no multi-period section was rendered without data for all periods
4. §4 INTERNAL CONSISTENCY — the same metric has the same value everywhere in the report
5. §5 NARRATIVE — no declining metric is described as improving; no superlatives without supporting data
6. §6 RECOMMENDATIONS — no recommendations were invented; only agency-authored content is present
7. §7 COMPARISON PERIODS — every delta badge has a <p class="comparison-note"> stating its baseline
8. §8 SECTION OMISSION — no section was populated with placeholder or invented data

If any item fails, remove the offending number or section. Removing data is always safe. Inventing data is never safe.

SOURCE NUMBERS — REQUIRED AFTER THE HTML:
After the complete HTML report, append a JSON extraction block listing every numeric value you read directly from the source PDF(s). This block is used for automated data-fidelity validation and will be stripped before the report is saved.

Format — output this exactly, on its own lines, after the closing </html> tag:

<!-- SOURCE_NUMBERS_START -->
{"numbers": [
  {"value": 90.24, "context": "Total Conversions May 2026"},
  {"value": 78.19, "context": "Total Conversions April 2026"}
]}
<!-- SOURCE_NUMBERS_END -->

Rules for the SOURCE_NUMBERS block:
- Include every distinct numeric value you extracted from the source (counts, percentages, currency amounts, rates, positions, dates-as-numbers)
- Use the raw numeric value only — no currency symbols, no % signs, no commas (e.g. 1429 not A$1,429, 20.31 not 20.31%)
- The "context" field is a short label identifying where the number came from — used for debugging only
- Do NOT include numbers you computed or derived yourself (e.g. a MoM % you calculated) — only numbers explicitly present in the source
- Do NOT include the same value twice with different contexts — pick the most descriptive context
- If no numeric data is present in the source (unusual), output: {"numbers": []}${reportTypeInstructions}${documentBlocks.length > 1 ? `

NOTE: Multiple report files have been attached. Use data from ALL of them to build a comprehensive report.` : ''}${clientFileBlocks.length > 0 ? `

CLIENT CONTEXT FILES:
The following client files contain historical data and background context for this client. Use them to provide comparisons and context in the report where relevant — for example, CSV exports of past SEO or GBP metrics, brand guidelines, or strategy documents. Cross-reference this data with the current report period data to highlight trends, changes, and insights.` : ''}

CHART GENERATION INSTRUCTIONS:
Where the data supports it, generate interactive Chart.js charts embedded directly in the HTML.

CRITICAL — Script loading order:
* Load Chart.js in the <head> as a BLOCKING script (no defer, no async):
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
* ALL chart initialisation code MUST be in a single <script> tag at the very bottom of <body> (just before </body>), wrapped like this:
  <script>
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof Chart === 'undefined') {
      document.querySelectorAll('.chart-container').forEach(function(el) { el.style.display = 'none'; });
      return;
    }
    // all new Chart(...) calls go here
  });
  </script>
* NEVER put chart initialisation in the <head> or inline in the HTML body. NEVER use defer or async on the Chart.js script tag.

CRITICAL — Do not output empty charts:
If you cannot extract actual data arrays with at least 7 data points for line charts, do NOT include the Performance Trends section or any chart containers at all. An empty chart card is worse than no chart. Only include charts when you have real, extracted data to populate them. If device data has fewer than 2 segments, skip the doughnut charts. If campaign data has fewer than 2 campaigns, skip the campaign bar chart.

Use the following chart patterns:

1. Daily performance line charts (dual-axis) — if daily/weekly data exists (clicks, impressions, cost, conversions, CTR, CPC etc.), render dual-axis line charts. Left Y-axis for volume metrics (clicks, conversions, cost), right Y-axis for rate metrics (CTR %, conversion rate %, CPC). Use smooth curves (tension: 0.4). Render 3 separate charts side by side in a responsive grid:
   (a) Clicks & CTR over time
   (b) Conversions & Conversion Rate over time
   (c) Cost & Avg CPC over time

2. Device breakdown doughnut charts — if device split data exists (desktop/mobile/tablet breakdown for cost, clicks, conversions), render 3 doughnut charts side by side: Cost by Device, Conversions by Device, Clicks by Device. Show percentage labels inside segments.

3. Campaign performance bar chart — if multiple campaigns exist, render a horizontal bar chart showing cost or clicks per campaign, sorted descending. This complements (not replaces) the campaign table.

Chart styling rules:
* Background: white, border-radius: 12px, padding: 24px, box-shadow: 0 2px 8px rgba(0,0,0,0.08)
* Color palette: ['#2B6CB8', '#38A169', '#D69E2E', '#C53030', '#805AD5', '#DD6B20'] — use these in order
* Grid lines: color: 'rgba(0,0,0,0.06)'
* Font: 'DM Sans' for all chart labels and tooltips
* Tooltip: dark background #1a1a2e, white text, show both datasets on hover
* Legend: positioned top, use dot indicators not box
* Charts sit in a section titled 'Performance Trends' with the same section header style as the rest of the report
* Each chart card has a subtle question mark tooltip icon next to the title (title attribute explaining what the chart shows)
* Charts must be fully responsive — use responsive: true, maintainAspectRatio: true
* Each <canvas> needs a unique id like chart-clicks-ctr, chart-conversions, etc.
* Wrap each canvas in a <div class="chart-container">

Only include charts where the underlying data actually exists in the PDF. If daily data is not available, skip the line charts. If device data is not available, skip the doughnut charts. Never fabricate data for charts.

Tables and charts can coexist — use charts for trend/visual data, tables for detailed breakdowns. Do not replace a data-rich table with a chart; show both when both add value.

Here is your design template:

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PPC Report – Kennedy's Pharmacy | February 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Space+Grotesk:wght@700&family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: #2B6CB8;
    --primary-light: #4A90D9;
    --primary-dark: #1A4A8A;
    --accent: #F26522;
    --dark: #1A1A2E;
    --charcoal: #2D2D2D;
    --mid: #6B7280;
    --light-bg: #F7F9FC;
    --white: #ffffff;
    --green: #16A34A;
    --red: #DC2626;
    --border: #E2E8F0;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--light-bg);
    color: var(--charcoal);
    line-height: 1.6;
  }

  h1, h2 { font-family: 'Dela Gothic One', sans-serif !important; }
  h3, h4, .section-label, .subsection-title { font-family: 'Space Grotesk', sans-serif !important; font-weight: 700; }

  /* -- HEADER -- */
  .header {
    background: var(--light-bg);
    color: var(--charcoal);
    padding: 0;
    position: relative;
  }
  .header-inner {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 40px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }
  .header-logo-area {
    flex-shrink: 0;
  }
  .header-logo-area img {
    max-height: 60px;
    max-width: 200px;
    object-fit: contain;
    display: block;
  }
  .header-logo-text {
    font-family: 'Dela Gothic One', sans-serif;
    font-size: 32px;
    font-weight: 400;
    color: var(--charcoal);
    line-height: 1.1;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .header-right {
    text-align: right;
  }
  .header-right .report-title {
    font-family: 'DM Serif Display', serif;
    font-size: 28px;
    font-weight: 400;
    color: var(--charcoal);
    letter-spacing: -0.3px;
    line-height: 1.2;
    margin-bottom: 4px;
  }
  .header-right .report-type {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 4px;
  }
  .header-right .period {
    font-size: 13px;
    color: var(--mid);
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  .header-border {
    border-bottom: 1px solid var(--border);
  }
  .header-accent {
    height: 4px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--charcoal) 100%);
  }

  /* -- MAIN -- */
  .main {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 40px 60px;
  }

  /* -- SECTION TITLES -- */
  .section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .section-title {
    font-family: 'DM Serif Display', serif;
    font-size: 28px;
    font-weight: 400;
    color: var(--charcoal);
    margin-bottom: 24px;
  }

  /* -- HERO SUMMARY -- */
  .hero-summary {
    background: var(--primary);
    border-radius: 16px;
    padding: 36px 40px;
    color: white;
    margin-bottom: 40px;
    position: relative;
    overflow: hidden;
  }
  .hero-summary::before {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 240px; height: 240px;
    background: rgba(255,255,255,0.05);
    border-radius: 50%;
  }
  .hero-summary::after {
    content: '';
    position: absolute;
    bottom: -80px; right: 80px;
    width: 180px; height: 180px;
    background: rgba(255,255,255,0.04);
    border-radius: 50%;
  }
  .hero-summary p {
    font-size: 16px;
    opacity: 0.9;
    max-width: 680px;
    line-height: 1.7;
    margin-bottom: 28px;
  }
  .hero-summary p strong { opacity: 1; font-weight: 600; }
  .hero-kpis {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .hero-kpi {
    background: rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 18px 20px;
    backdrop-filter: blur(4px);
  }
  .hero-kpi .kpi-label {
    font-size: 11px;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .hero-kpi .kpi-value {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.5px;
    line-height: 1;
  }
  .hero-kpi .kpi-sub {
    font-size: 12px;
    opacity: 0.65;
    margin-top: 4px;
  }

  /* -- METRICS GRID -- */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 40px;
  }
  .metric-card {
    background: white;
    border-radius: 12px;
    padding: 20px 18px;
    border: 1px solid var(--border);
    transition: box-shadow 0.2s;
  }
  .metric-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .metric-card .m-label {
    font-size: 11px;
    color: var(--mid);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .metric-card .m-value {
    font-size: 22px;
    font-weight: 600;
    color: var(--charcoal);
    letter-spacing: -0.3px;
    line-height: 1;
    margin-bottom: 8px;
  }
  .metric-card .m-change {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
  }
  .m-change.up { background: #DCFCE7; color: var(--green); }
  .m-change.down { background: #FEE2E2; color: var(--red); }
  .m-change.good-down { background: #DCFCE7; color: var(--green); }
  .m-change.bad-up { background: #FEE2E2; color: var(--red); }
  .m-change.neutral { background: #F1F5F9; color: var(--mid); }

  .comparison-note {
    font-size: 13px;
    color: var(--mid);
    margin: -8px 0 16px 0;
    font-style: italic;
  }

  .internal-note-block {
    background: #FFF8E1;
    border-left: 4px solid #F26522;
    padding: 16px 20px;
    border-radius: 4px;
    margin: 16px 0;
  }
  .internal-note-block h3 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #B8860B;
    margin: 0 0 8px 0;
  }

  /* -- CHART FALLBACKS -- */
  .chart-container:empty { display: none; }
  .chart-section:has(.chart-container:empty) { display: none; }

  /* -- BAR CHART -- */
  .chart-section {
    background: white;
    border-radius: 12px;
    padding: 28px 28px;
    border: 1px solid var(--border);
    margin-bottom: 40px;
  }
  .chart-section h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--charcoal);
    margin-bottom: 4px;
  }
  .chart-section .chart-sub {
    font-size: 12px;
    color: var(--mid);
    margin-bottom: 20px;
  }
  .bar-chart { display: flex; flex-direction: column; gap: 12px; }
  .bar-row { display: flex; align-items: center; gap: 12px; }
  .bar-row .bar-label {
    font-size: 12px;
    color: var(--mid);
    width: 60px;
    text-align: right;
    flex-shrink: 0;
  }
  .bar-track {
    flex: 1;
    background: var(--border);
    border-radius: 4px;
    height: 10px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 1s ease;
  }
  .bar-row .bar-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--charcoal);
    width: 60px;
    flex-shrink: 0;
  }

  /* -- FUNNEL -- */
  .funnel-section {
    background: white;
    border-radius: 12px;
    padding: 28px;
    border: 1px solid var(--border);
    margin-bottom: 40px;
  }
  .funnel-section h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--charcoal);
    margin-bottom: 4px;
  }
  .funnel-section .chart-sub {
    font-size: 12px;
    color: var(--mid);
    margin-bottom: 24px;
  }
  .funnel { display: flex; flex-direction: column; gap: 6px; align-items: center; }
  .funnel-step {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 24px;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    transition: transform 0.15s;
    position: relative;
  }
  .funnel-step:hover { transform: translateX(4px); }
  .funnel-step .f-icon { font-size: 18px; }
  .funnel-step .f-text { flex: 1; }
  .funnel-step .f-name { font-size: 13px; opacity: 0.85; font-weight: 500; }
  .funnel-step .f-count { font-size: 22px; font-weight: 600; letter-spacing: -0.3px; }
  .funnel-step .f-rate {
    font-size: 12px;
    opacity: 0.75;
    background: rgba(0,0,0,0.15);
    padding: 3px 10px;
    border-radius: 20px;
  }
  .funnel-arrow {
    color: var(--mid);
    font-size: 18px;
    text-align: center;
  }

  /* -- CAMPAIGNS TABLE -- */
  .campaigns-section {
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border);
    overflow: hidden;
    margin-bottom: 40px;
  }
  .campaigns-section .table-header {
    padding: 20px 24px 12px;
    border-bottom: 1px solid var(--border);
  }
  .campaigns-section .table-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--charcoal);
    margin-bottom: 2px;
  }
  .campaigns-section .table-header p {
    font-size: 12px;
    color: var(--mid);
  }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: var(--light-bg);
    font-size: 11px;
    font-weight: 600;
    color: var(--mid);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 10px 16px;
    text-align: left;
  }
  thead th:not(:first-child) { text-align: right; }
  tbody td {
    padding: 14px 16px;
    font-size: 13px;
    border-top: 1px solid var(--border);
    vertical-align: middle;
  }
  tbody td:not(:first-child) { text-align: right; }
  tbody tr:hover td { background: #FAFBFC; }
  .campaign-name { font-weight: 600; color: var(--charcoal); max-width: 240px; }
  .campaign-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-left: 6px;
    vertical-align: middle;
  }
  .badge-top { background: #FEF3C7; color: #92400E; }
  .roas-pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 12px;
  }
  .roas-high { background: #DCFCE7; color: var(--green); }
  .roas-low { background: #FEF9C3; color: #92400E; }

  /* -- TASKS -- */
  .tasks-section {
    margin-bottom: 40px;
  }
  .tasks-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .task-card {
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    transition: box-shadow 0.15s;
  }
  .task-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.07); }
  .task-num {
    width: 28px;
    height: 28px;
    background: var(--primary);
    color: white;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .task-text {
    font-size: 13px;
    color: var(--charcoal);
    line-height: 1.5;
    font-weight: 500;
  }

  /* -- FOOTER -- */
  footer {
    background: var(--charcoal);
    color: rgba(255,255,255,0.6);
    text-align: center;
    padding: 28px 20px;
    font-size: 12px;
  }
  footer a { color: var(--accent); text-decoration: none; }
  footer .footer-logo {
    margin-bottom: 8px;
  }
  footer .footer-logo img {
    height: 28px;
    width: auto;
    display: inline-block;
  }

  /* -- DIVIDER -- */
  .section-divider {
    height: 1px;
    background: var(--border);
    margin: 40px 0;
  }

  /* -- ROAS HIGHLIGHT -- */
  .roas-highlight {
    background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
    border-radius: 16px;
    padding: 32px 36px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 40px;
  }
  .roas-highlight .rh-label {
    font-size: 13px;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .roas-highlight .rh-value {
    font-size: 52px;
    font-weight: 800;
    letter-spacing: -2px;
    line-height: 1;
    color: #7DD3FC;
  }
  .roas-highlight .rh-desc {
    font-size: 14px;
    opacity: 0.75;
    max-width: 380px;
    line-height: 1.6;
  }
  .roas-highlight .rh-desc strong { opacity: 1; color: white; }

  @media (max-width: 680px) {
    .header-inner { flex-direction: column; align-items: flex-start; }
    .metrics-grid { grid-template-columns: repeat(2, 1fr); }
    .hero-kpis { grid-template-columns: repeat(1, 1fr); }
    .tasks-grid { grid-template-columns: 1fr; }
    .roas-highlight { flex-direction: column; }
    .main { padding: 24px 20px 40px; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-inner">
    <div class="header-logo-area">
      <!-- CLIENT LOGO: use <img> if logo URL provided, otherwise render client name as styled text -->
      <div class="header-logo-text">CLIENT NAME</div>
    </div>
    <div class="header-right">
      <div class="report-type">Google Ads Report</div>
      <div class="report-title">Monthly Report</div>
      <div class="period">February 2026 &middot; 01.02.2026 - 28.02.2026</div>
    </div>
  </div>
  <div class="header-border"></div>
  <div class="header-accent"></div>
</div>

<div class="main">

  <!-- Every top-level section inside .main must be wrapped in a
       <section data-block-id="..." data-block-type="..." data-block-title="...">
       per the BLOCK STRUCTURE rules above. -->

  <section data-block-id="intro-0" data-block-type="intro" data-block-title="At a glance">
    <div style="margin-bottom: 10px;">
      <div class="section-label">At a glance</div>
      <div class="section-title">How did February go?</div>
    </div>
  </section>

  <section data-block-id="hero-summary-0" data-block-type="hero-summary" data-block-title="Hero Summary">
    <div class="hero-summary">
      <p>
        February was a <strong>strong month</strong> for your Google Ads. Your campaigns generated
        <strong>$28,762 in revenue</strong> from a spend of just $3,012.
      </p>
      <div class="hero-kpis">
        <div class="hero-kpi">
          <div class="kpi-label">Total Revenue</div>
          <div class="kpi-value">$28,762</div>
          <div class="kpi-sub">From ad-driven sales</div>
        </div>
        <div class="hero-kpi">
          <div class="kpi-label">Ad Spend</div>
          <div class="kpi-value">$3,012</div>
          <div class="kpi-sub">Total cost for the month</div>
        </div>
        <div class="hero-kpi">
          <div class="kpi-label">Purchases</div>
          <div class="kpi-value">297</div>
          <div class="kpi-sub">Completed transactions</div>
        </div>
      </div>
    </div>
  </section>

  <!-- (Continue with all other sections, each wrapped in its own
       <section data-block-id=...> per the canonical block types and the
       default order for this report type.) -->

</div>

<!-- FOOTER -->
<footer>
  <div class="footer-logo"><img src="https://shtudio-portal.vercel.app/logo-white.png" alt="Shtudio"></div>
  <div>Prepared by <a href="https://www.shtudio.com.au">www.shtudio.com.au</a></div>
</footer>

</body>
</html>

Use this as your design template. Preserve all CSS exactly. Replace the content, data, client name, brand colours, and metrics with the data extracted from the attached document(s). Output only raw HTML with no markdown, no code fences, nothing else.

TYPOGRAPHY INSTRUCTIONS — CRITICAL:
The report uses three fonts loaded from Google Fonts. You MUST preserve these exactly:
- Dela Gothic One — used for h1 and h2 elements only. This is a bold display font for major headings.
- Space Grotesk 700 — used for h3, h4, .section-label, and .subsection-title. This is a bold sans-serif for subheadings and labels.
- DM Sans — used for all body text, paragraphs, table content, card values, and navigation.
- DM Serif Display — used only for the large decorative .section-title div text (e.g. "How did February go?").
Do NOT change the font-family values in any CSS you generate. Do NOT add new @import or @font-face rules. Do NOT set font-family on h1–h4 elements in your generated CSS — the global rules in the template already handle this. If you add new CSS classes, do not include font-family declarations on heading elements.

BRAND COLOUR INSTRUCTIONS:
- IMPORTANT: Use the FIXED blue colour scheme for ALL reports regardless of client. Do NOT change the CSS variables to match client brand colours. The variables are: --primary (#2B6CB8), --primary-light (#4A90D9), --primary-dark (#1A4A8A), --accent (#F26522 — Shtudio orange).
- The hero summary card, metric card accents, funnel steps, ROAS callout, campaign table highlights, and task number badges must all use shades of --primary and --primary-light.
- The Shtudio orange (--accent) must ONLY be used for: small section labels (e.g. "At a glance"), the header accent bar, the report-type label, and footer links. NEVER use --accent as a background colour for large sections, cards, or hero areas.
- Funnel steps should use varying opacities/shades of --primary (e.g. the widest step uses --primary, narrower steps use --primary-light or lighter shades).
- This ensures all reports look consistent regardless of client.

TECHNICAL ACCURACY INSTRUCTIONS:
- For any sections containing technical specifications, creative asset requirements, image sizes, character limits, video formats, or ad specs — reproduce these with 100% accuracy. Do not summarise, paraphrase, or omit any technical details. These sections must be complete and exact. Only reformat them visually — do not change the content.

HEADER INSTRUCTIONS:
- The header uses a light background (#F7F9FC), NOT dark.
- Left side: client logo area. ${clientLogoUrl ? `The client has a logo - render it as: <img src="${clientLogoUrl}" alt="${clientName}" style="max-height:60px;max-width:200px;object-fit:contain;">` : `No logo URL is available - render the client name "${clientName}" as styled text using the .header-logo-text class (Dela Gothic One font, charcoal, uppercase).`}
- Right side: report type label (e.g. "Google Ads Report"), report title, and period date range.
- Below the header-inner: a 1px border line (.header-border) then a 4px gradient accent bar from #F26522 (orange) to #2D2D2D (charcoal).

The client name is: ${clientName}
The client logo URL is: ${clientLogoUrl || 'NONE - use text fallback'}
The report period is: ${periodInfo || 'as indicated in the PDF data'}${report.custom_instructions ? `

ADDITIONAL INSTRUCTIONS FROM THE SHTUDIO TEAM FOR THIS SPECIFIC REPORT:
${report.custom_instructions}` : ''}${historicalContext}`;

    // Build content blocks: report documents + client file documents + prompt
    const contentBlocks: any[] = [
      ...documentBlocks,
      ...clientFileBlocks,
      {
        type: 'text',
        text: promptText,
      },
    ];

    // Pre-flight summary so we can correlate Anthropic 400s with the exact
    // payload shape (counts, sizes, media_types). Remove once the PDF-upload
    // failure is root-caused.
    const blockSummary = contentBlocks.map((b: any, i: number) => {
      if (b?.type === 'document' || b?.type === 'image') {
        return {
          index: i,
          type: b.type,
          mediaType: b.source?.media_type,
          base64Length: typeof b.source?.data === 'string' ? b.source.data.length : 0,
        };
      }
      if (b?.type === 'text') {
        return { index: i, type: 'text', textLength: typeof b.text === 'string' ? b.text.length : 0 };
      }
      return { index: i, type: b?.type ?? 'unknown' };
    });
    console.log('[enhance:pre-call]', {
      reportId,
      blockCount: contentBlocks.length,
      documentBlockCount: contentBlocks.filter((b: any) => b?.type === 'document').length,
      imageBlockCount: contentBlocks.filter((b: any) => b?.type === 'image').length,
      blocks: blockSummary,
    });

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    });

    let rawResponse = message.content
      .filter((block) => block.type === 'text')
      .map((block) => {
        if (block.type === 'text') return block.text;
        return '';
      })
      .join('');

    // ── Mismatch detection + date extraction (non-fatal — wrapped in try/catch) ──
    console.log('RAW_RESPONSE_START:', rawResponse.substring(0, 500));

    let mismatchDescription: string | null = null;
    let clientMismatch = false;
    let extractedPeriodStart: string | null = null;
    let extractedPeriodEnd: string | null = null;

    // Parse a Claude-returned date string to YYYY-MM-DD, returning null if unparseable
    function normalizeExtractedDate(raw: string): string | null {
      const s = raw.trim();
      // Exact YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // YYYY-MM → first of month
      if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
      // Try native Date parse as last resort
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return null;
    }

    try {
      let detectedClientName: string | null = null;
      let detectedReportType: string | null = null;

      const clientNameMatch = rawResponse.match(/CLIENT_NAME:\s*(.+)/i);
      console.log('CLIENT_NAME_MATCH:', clientNameMatch);
      if (clientNameMatch) {
        detectedClientName = clientNameMatch[1].trim();
        rawResponse = rawResponse.replace(/CLIENT_NAME:\s*.+[\r\n]*/i, '');
      }

      const reportTypeMatch = rawResponse.match(/REPORT_TYPE:\s*(.+)/i);
      console.log('REPORT_TYPE_MATCH:', reportTypeMatch);
      if (reportTypeMatch) {
        detectedReportType = reportTypeMatch[1].trim();
        rawResponse = rawResponse.replace(/REPORT_TYPE:\s*.+[\r\n]*/i, '');
      }

      const periodStartMatch = rawResponse.match(/PERIOD_START:\s*(.+)/i);
      if (periodStartMatch) {
        extractedPeriodStart = normalizeExtractedDate(periodStartMatch[1]);
        rawResponse = rawResponse.replace(/PERIOD_START:\s*.+[\r\n]*/i, '');
        console.log('PERIOD_START extracted:', extractedPeriodStart);
      }

      const periodEndMatch = rawResponse.match(/PERIOD_END:\s*(.+)/i);
      if (periodEndMatch) {
        extractedPeriodEnd = normalizeExtractedDate(periodEndMatch[1]);
        rawResponse = rawResponse.replace(/PERIOD_END:\s*.+[\r\n]*/i, '');
        console.log('PERIOD_END extracted:', extractedPeriodEnd);
      }

      // Fuzzy name comparison
      function namesMatch(detected: string, selected: string): boolean {
        const normalize = (s: string) => s.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const a = normalize(detected);
        const b = normalize(selected);
        return a.includes(b) || b.includes(a) || a === b;
      }

      // Map report_type keys to display names for comparison
      const typeDisplayNames: Record<string, string> = {
        google_ads: 'Google Ads',
        gbp: 'Google Business Profile',
        seo: 'SEO',
        meta_ads: 'Meta Ads',
        microsoft_ads: 'Microsoft Ads',
        linkedin_ads: 'LinkedIn Ads',
        combined: 'Combined Report',
      };
      const selectedTypeName = report.report_type ? (typeDisplayNames[report.report_type] || report.report_type) : null;

      // Check for client name mismatch
      const isClientMismatch = detectedClientName && clientName
        ? !namesMatch(detectedClientName, clientName)
        : false;

      // Check for report type mismatch
      const isTypeMismatch = detectedReportType && selectedTypeName && report.report_type !== 'combined'
        ? !namesMatch(detectedReportType, selectedTypeName)
        : false;

      clientMismatch = !!(isClientMismatch || isTypeMismatch);

      // Build detected_client_name to include both mismatch details
      if (isClientMismatch && isTypeMismatch) {
        mismatchDescription = `${detectedClientName} (report type: ${detectedReportType}, selected: ${selectedTypeName})`;
      } else if (isClientMismatch) {
        mismatchDescription = detectedClientName;
      } else if (isTypeMismatch) {
        mismatchDescription = `TYPE_MISMATCH:${detectedReportType}:${selectedTypeName}`;
      }

      // Debug logging
      console.log('[Mismatch Detection]', {
        clientNameLine: clientNameMatch?.[0] || 'NOT FOUND',
        detectedClientName,
        selectedClientName: clientName,
        namesMatchResult: detectedClientName ? namesMatch(detectedClientName, clientName) : 'N/A',
        reportTypeLine: reportTypeMatch?.[0] || 'NOT FOUND',
        detectedReportType,
        selectedReportType: selectedTypeName,
        typeMatchResult: detectedReportType && selectedTypeName ? namesMatch(detectedReportType, selectedTypeName) : 'N/A',
        finalMismatch: clientMismatch,
      });
    } catch (mismatchErr) {
      console.error('Mismatch detection failed (non-fatal):', mismatchErr);
      // Reset to safe defaults — report will still save
      mismatchDescription = null;
      clientMismatch = false;
    }

    // ── Extract and strip SOURCE_NUMBERS block from the response ──
    // Uses indexOf so truncated responses (no END marker) are handled safely.
    let sourceNumbers: Array<{ value: number; context: string }> = [];
    const START_MARKER = '<!-- SOURCE_NUMBERS_START -->';
    const END_MARKER = '<!-- SOURCE_NUMBERS_END -->';
    const startIdx = rawResponse.indexOf(START_MARKER);
    const endIdx = rawResponse.indexOf(END_MARKER);

    if (startIdx === -1) {
      console.warn('[enhance:source-numbers] no START marker in response', { reportId });
      // rawResponse is used as-is
    } else if (endIdx === -1) {
      // Truncated response — Claude hit max_tokens before closing the JSON block.
      // Strip everything from START to end of string so the HTML is clean.
      console.warn('[enhance:source-numbers] truncated response — no END marker; stripping from START', { reportId });
      rawResponse = rawResponse.slice(0, startIdx);
    } else {
      // Both markers present — parse JSON, then excise the block from the HTML.
      const jsonBlock = rawResponse.slice(startIdx + START_MARKER.length, endIdx).trim();
      try {
        const parsed = JSON.parse(jsonBlock);
        if (Array.isArray(parsed.numbers)) {
          sourceNumbers = parsed.numbers.filter(
            (n: any) => typeof n.value === 'number' && !isNaN(n.value),
          );
        }
      } catch (parseErr) {
        console.warn('[enhance:source-numbers] failed to parse JSON block:', parseErr);
      }
      rawResponse = (
        rawResponse.slice(0, startIdx) +
        rawResponse.slice(endIdx + END_MARKER.length)
      );
    }

    const enhancedHtml = rawResponse.trim();

    // Save enhanced HTML, mismatch info, extracted dates, and mark as completed
    await supabase
      .from('reports')
      .update({
        ai_enhanced_html: enhancedHtml,
        ai_status: 'completed',
        ai_error: null,
        detected_client_name: mismatchDescription,
        client_mismatch: clientMismatch,
        ...(extractedPeriodStart ? { period_start: extractedPeriodStart } : {}),
        ...(extractedPeriodEnd ? { period_end: extractedPeriodEnd } : {}),
      })
      .eq('id', reportId);

    // ── Post-generation number validation (non-blocking, non-fatal) ──
    // Claude extracted source numbers from the PDF as part of the same API
    // call. Compare those against numbers appearing in the generated HTML.
    // Flag any HTML number not traceable to the source list.
    try {
      if (sourceNumbers.length > 0) {
        const sourceNumberStrings = new Set(sourceNumbers.map((n) => String(n.value)));
        const htmlNumbers = extractNumbers(enhancedHtml);

        const unmatchedNumbers: string[] = [];
        for (const n of htmlNumbers) {
          const val = parseFloat(n);
          if (isNaN(val)) continue;
          // Skip trivially small numbers unlikely to be meaningful data points
          if (val < 2) continue;
          if (!isNumberInSource(val, sourceNumberStrings)) {
            unmatchedNumbers.push(n);
          }
        }

        const uniqueUnmatched = [...new Set(unmatchedNumbers)];

        if (uniqueUnmatched.length > 0) {
          console.warn('[validation] Unmatched numbers in report', {
            reportId,
            count: uniqueUnmatched.length,
            sample: uniqueUnmatched.slice(0, 20),
          });
          await supabase.from('report_validation_warnings').insert({
            report_id: reportId,
            warning_type: 'unmatched_numbers',
            details: {
              unmatched_count: uniqueUnmatched.length,
              unmatched_numbers: uniqueUnmatched.slice(0, 50),
              source_number_count: sourceNumbers.length,
              html_number_count: htmlNumbers.length,
            },
          });
        } else {
          console.log('[validation] All numbers verified against source', { reportId });
        }
      } else {
        console.warn('[validation] No source numbers from Claude — skipping validation', { reportId });
      }
    } catch (validationErr) {
      console.error('[validation] Non-fatal validation error:', validationErr);
    }

    // Log the action
    await supabase.from('audit_log').insert({
      action: 'report.ai_processed',
      resource_type: 'report',
      resource_id: reportId,
      metadata: {
        client_id: report.client_id,
        file_count: storagePaths.length,
        client_file_count: clientFileBlocks.length,
        historical_report_count: previousReports?.length || 0,
        html_length: enhancedHtml.length,
      },
    });

    // Send email notification (non-blocking)
    try {
      await sendReportCompletedEmail({
        clientName,
        reportTitle: report.title,
        reportId,
      });
    } catch (emailError) {
      console.error('Failed to send report completion email:', emailError);
    }
  } catch (error: any) {
    console.error('PROCESS_REPORT_FATAL_ERROR:', { reportId, error: error?.message, stack: error?.stack });

    try {
      const supabase = createServiceSupabase();
      await supabase
        .from('reports')
        .update({
          ai_status: 'failed',
          ai_error: error.message || 'An unexpected error occurred during processing',
        })
        .eq('id', reportId);
    } catch (cleanupErr) {
      console.error('CLEANUP_ERROR_AFTER_FATAL:', cleanupErr);
    }
  }
}

// ── HTTP handler ──
export async function POST(request: Request) {
  try {
    const { reportId } = await request.json();

    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    // Validate report exists and has files
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('*, clients(name, logo_url)')
      .eq('id', reportId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const hasPaths = report.pdf_storage_paths?.length > 0 || report.pdf_storage_path;
    if (!hasPaths) {
      return NextResponse.json({ error: 'No files attached to this report' }, { status: 400 });
    }

    // Set status to processing immediately
    await supabase
      .from('reports')
      .update({ ai_status: 'processing', ai_error: null })
      .eq('id', reportId);

    // Run the heavy processing in the background after the response is sent
    console.log('CALLING_WAIT_UNTIL', { reportId });
    waitUntil(processReport(reportId, report));

    // Return immediately
    return NextResponse.json({ success: true, reportId, status: 'processing' });
  } catch (error: any) {
    console.error('Report enhancement error:', error);
    return NextResponse.json(
      { error: error.message || 'Enhancement failed' },
      { status: 500 }
    );
  }
}
