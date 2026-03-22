export const maxDuration = 300;

import { waitUntil } from '@vercel/functions';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendReportCompletedEmail } from '@/lib/email';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Map file extensions/types to Anthropic media types
function getMediaType(path: string, contentType?: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || contentType === 'application/pdf') return 'application/pdf';
  if (ext === 'docx' || contentType?.includes('wordprocessingml')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'doc' || contentType === 'application/msword') return 'application/msword';
  if (ext === 'xlsx' || contentType?.includes('spreadsheetml')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls' || contentType === 'application/vnd.ms-excel') return 'application/vnd.ms-excel';
  if (ext === 'csv') return 'text/csv';
  return 'application/pdf';
}

// Download a file from storage and return as a document content block
async function downloadAsDocBlock(
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
  const base64 = buffer.toString('base64');
  const mediaType = getMediaType(path);

  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: base64,
    },
  };
}

// ── Background processing function ──
async function processReport(reportId: string, report: any) {
  const supabase = createServiceSupabase();

  try {
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
      const block = await downloadAsDocBlock(supabase, 'report-pdfs', path);
      if (block) documentBlocks.push(block);
    }

    if (documentBlocks.length === 0) {
      await supabase
        .from('reports')
        .update({ ai_status: 'failed', ai_error: 'Failed to download report files from storage' })
        .eq('id', reportId);
      return;
    }

    // ── Client mismatch detection ──
    // Send the first document to Claude for client name extraction
    try {
      const clientName = (report.clients as any)?.name || '';
      const clientWebsite = (report.clients as any)?.website || '';
      const firstDoc = documentBlocks[0];

      const mismatchRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              firstDoc,
              {
                type: 'text',
                text: 'Extract the client name, company name, or website domain mentioned in this report. Return ONLY a JSON object with no other text: { "clientName": "string", "domain": "string" }. If not found, use empty strings.',
              },
            ],
          },
        ],
      });

      const mismatchText = mismatchRes.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');

      // Try to parse the JSON response
      const jsonMatch = mismatchText.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const detected = JSON.parse(jsonMatch[0]);
        const detectedName = (detected.clientName || '').trim();
        const detectedDomain = (detected.domain || '').trim();

        // Fuzzy compare: normalise both strings for comparison
        const normalise = (s: string) =>
          s.toLowerCase()
            .replace(/[''`]/g, '')
            .replace(/[^a-z0-9]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const nameMatch =
          !detectedName ||
          normalise(clientName).includes(normalise(detectedName)) ||
          normalise(detectedName).includes(normalise(clientName));

        const domainMatch =
          !detectedDomain ||
          !clientWebsite ||
          normalise(clientWebsite).includes(normalise(detectedDomain)) ||
          normalise(detectedDomain).includes(normalise(clientWebsite));

        const isMismatch = !nameMatch && !domainMatch;

        if (isMismatch && detectedName) {
          await supabase
            .from('reports')
            .update({
              client_mismatch: true,
              detected_client_name: detectedName,
            })
            .eq('id', reportId);
        }
      }
    } catch (mismatchError) {
      // Non-critical — don't block report processing
      console.error('Client mismatch detection failed (non-critical):', mismatchError);
    }

    // Download selected client files (if any)
    const clientFileBlocks: any[] = [];
    const clientFileIds: string[] = report.client_file_ids || [];

    if (clientFileIds.length > 0) {
      const { data: clientFiles } = await supabase
        .from('client_files')
        .select('*')
        .in('id', clientFileIds);

      if (clientFiles) {
        for (const cf of clientFiles) {
          const block = await downloadAsDocBlock(supabase, 'client-files', cf.file_path);
          if (block) {
            clientFileBlocks.push(block);
          }
        }
      }
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
    const clientName = (report.clients as any)?.name || 'the client';
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

Based on the historical data above, include a "Trends & Comparison" section showing:
1. Month-on-month changes from the most recent previous report
2. Longer-term trends across multiple reporting periods where data is available
Use the .m-change.up / .m-change.down pill styles for positive/negative changes.`;
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

      // SEO-specific instruction for backlinks
      if (report.report_type === 'seo' || report.report_type === 'combined') {
        reportTypeInstructions += `\n\nSEO BACKLINKS INSTRUCTION: For the backlinks and directories section, mention only the total number of new backlinks and directories built this month — do not list individual URLs. For example: 'This month we built 10 new backlinks across directories, forums and profile sites.' Never output the actual URLs in the client-facing report.`;
      }
    }

    const promptText = `You are a digital marketing report specialist for Shtudio, a Sydney digital agency.

Your task is to produce a complete, self-contained HTML file for ${clientName}${periodInfo} that matches the exact design standard of the reference template below. The attached document(s) contain all the raw data and metrics you need — extract everything from them.${reportTypeInstructions}${documentBlocks.length > 1 ? `

NOTE: Multiple report files have been attached. Use data from ALL of them to build a comprehensive report.` : ''}${clientFileBlocks.length > 0 ? `

ADDITIONAL CONTEXT FILES:
The following additional files from the client's file library have been included for context (e.g. brand guidelines, strategy docs, previous data). Use them to inform your analysis and recommendations where relevant.` : ''}

CHART GENERATION INSTRUCTIONS:
Where the data supports it, generate interactive Chart.js charts embedded directly in the HTML. Load Chart.js from https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js in a <script> tag in the <head>.

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

Only include charts where the underlying data actually exists in the PDF. If daily data is not available, skip the line charts. If device data is not available, skip the doughnut charts. Never fabricate data for charts.

Tables and charts can coexist — use charts for trend/visual data, tables for detailed breakdowns. Do not replace a data-rich table with a chart; show both when both add value.

Here is your design template:

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PPC Report – Kennedy's Pharmacy | February 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
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
    font-family: 'Anton', sans-serif;
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

  <!-- PLAIN ENGLISH SUMMARY -->
  <div style="margin-bottom: 10px;">
    <div class="section-label">At a glance</div>
    <div class="section-title">How did February go?</div>
  </div>

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

  <!-- (Continue with all other sections using the same design patterns) -->

</div>

<!-- FOOTER -->
<footer>
  <div class="footer-logo"><img src="https://shtudio-portal.vercel.app/logo-white.png" alt="Shtudio"></div>
  <div>Prepared by <a href="https://www.shtudio.com.au">www.shtudio.com.au</a></div>
</footer>

</body>
</html>

Use this as your design template. Preserve all CSS exactly. Replace the content, data, client name, brand colours, and metrics with the data extracted from the attached document(s). Output only raw HTML with no markdown, no code fences, nothing else.

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
- Left side: client logo area. ${clientLogoUrl ? `The client has a logo - render it as: <img src="${clientLogoUrl}" alt="${clientName}" style="max-height:60px;max-width:200px;object-fit:contain;">` : `No logo URL is available - render the client name "${clientName}" as styled text using the .header-logo-text class (Anton font, charcoal, uppercase).`}
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

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    });

    const enhancedHtml = message.content
      .filter((block) => block.type === 'text')
      .map((block) => {
        if (block.type === 'text') return block.text;
        return '';
      })
      .join('');

    // Save enhanced HTML and mark as completed
    await supabase
      .from('reports')
      .update({
        ai_enhanced_html: enhancedHtml,
        ai_status: 'completed',
        ai_error: null,
      })
      .eq('id', reportId);

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
    console.error('Background report processing error:', error);

    try {
      const supabase = createServiceSupabase();
      await supabase
        .from('reports')
        .update({
          ai_status: 'failed',
          ai_error: error.message || 'An unexpected error occurred during processing',
        })
        .eq('id', reportId);
    } catch {
      // Ignore cleanup errors
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
