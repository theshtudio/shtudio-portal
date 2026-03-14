import { createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PDFParse } from 'pdf-parse';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: Request) {
  try {
    const { reportId } = await request.json();

    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    // Get the report
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('*, clients(name, logo_url)')
      .eq('id', reportId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    if (!report.pdf_storage_path) {
      return NextResponse.json({ error: 'No PDF attached to this report' }, { status: 400 });
    }

    // Update status to processing
    await supabase
      .from('reports')
      .update({ ai_status: 'processing', ai_error: null })
      .eq('id', reportId);

    // Download PDF from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('report-pdfs')
      .download(report.pdf_storage_path);

    if (downloadError || !fileData) {
      await supabase
        .from('reports')
        .update({ ai_status: 'failed', ai_error: 'Failed to download PDF from storage' })
        .eq('id', reportId);
      return NextResponse.json({ error: 'Failed to download PDF' }, { status: 500 });
    }

    // Extract text from PDF
    const buffer = Buffer.from(await fileData.arrayBuffer());
    let pdfText: string;

    try {
      const pdf = new PDFParse({ data: buffer });
      const result = await pdf.getText();
      pdfText = result.text;
      await pdf.destroy();
    } catch {
      await supabase
        .from('reports')
        .update({ ai_status: 'failed', ai_error: 'Failed to parse PDF content' })
        .eq('id', reportId);
      return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 });
    }

    if (!pdfText.trim()) {
      await supabase
        .from('reports')
        .update({ ai_status: 'failed', ai_error: 'PDF appears to be empty or image-only (no extractable text)' })
        .eq('id', reportId);
      return NextResponse.json({ error: 'No text extracted from PDF' }, { status: 400 });
    }

    // Send to Claude for enhancement
    const clientName = (report.clients as any)?.name || 'the client';
    const clientLogoUrl = (report.clients as any)?.logo_url || '';
    const periodInfo = report.period_start && report.period_end
      ? ` for the period ${report.period_start} to ${report.period_end}`
      : '';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: `You are a digital marketing report specialist for Shtudio, a Sydney digital agency.

Your task is to produce a complete, self-contained HTML file for ${clientName}${periodInfo} that matches the exact design standard of the reference template below.

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
    --brand: #2B6CB8;
    --brand-light: #4A90D9;
    --shtudio-orange: #F26522;
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

  /* ── HEADER ── */
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
    color: var(--shtudio-orange);
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
    background: linear-gradient(90deg, var(--shtudio-orange) 0%, var(--charcoal) 100%);
  }

  /* ── MAIN ── */
  .main {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 40px 60px;
  }

  /* ── SECTION TITLES ── */
  .section-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--shtudio-orange);
    margin-bottom: 6px;
  }
  .section-title {
    font-family: 'DM Serif Display', serif;
    font-size: 28px;
    font-weight: 400;
    color: var(--charcoal);
    margin-bottom: 24px;
  }

  /* ── HERO SUMMARY ── */
  .hero-summary {
    background: var(--brand);
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
  .hero-summary p strong { opacity: 1; font-weight: 700; }
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
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1;
  }
  .hero-kpi .kpi-sub {
    font-size: 12px;
    opacity: 0.65;
    margin-top: 4px;
  }

  /* ── METRICS GRID ── */
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
    font-weight: 700;
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

  /* ── BAR CHART ── */
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

  /* ── FUNNEL ── */
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
  .funnel-step .f-count { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
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

  /* ── CAMPAIGNS TABLE ── */
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
    font-weight: 700;
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
    font-weight: 700;
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
    font-weight: 700;
    font-size: 12px;
  }
  .roas-high { background: #DCFCE7; color: var(--green); }
  .roas-low { background: #FEF9C3; color: #92400E; }

  /* ── TASKS ── */
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
    background: var(--brand);
    color: white;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .task-text {
    font-size: 13px;
    color: var(--charcoal);
    line-height: 1.5;
    font-weight: 500;
  }

  /* ── FOOTER ── */
  footer {
    background: var(--charcoal);
    color: rgba(255,255,255,0.6);
    text-align: center;
    padding: 28px 20px;
    font-size: 12px;
  }
  footer a { color: var(--shtudio-orange); text-decoration: none; }
  footer .footer-logo {
    font-family: 'DM Sans', sans-serif;
    font-weight: 800;
    font-size: 16px;
    color: white;
    letter-spacing: -0.3px;
    margin-bottom: 6px;
  }
  footer .footer-logo span { color: var(--shtudio-orange); }

  /* ── DIVIDER ── */
  .section-divider {
    height: 1px;
    background: var(--border);
    margin: 40px 0;
  }

  /* ── ROAS HIGHLIGHT ── */
  .roas-highlight {
    background: linear-gradient(135deg, #1A3A5C 0%, #2B6CB8 100%);
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
      <div class="period">February 2026 &middot; 01.02.2026 – 28.02.2026</div>
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
      <strong>$28,762 in revenue</strong> from a spend of just $3,012 — meaning for every dollar spent on ads,
      you earned back roughly <strong>$9.55 in sales</strong>. Traffic, clicks, and purchases were all up
      compared to last month, and your cost per sale actually went down slightly.
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

  <!-- ROAS CALLOUT -->
  <div class="roas-highlight">
    <div>
      <div class="rh-label">Return on Ad Spend (ROAS)</div>
      <div class="rh-value">9.55\u00d7</div>
    </div>
    <div class="rh-desc">
      For every <strong>$1</strong> spent on Google Ads in February, Kennedy's Pharmacy generated
      <strong>$9.55 in revenue</strong>. A healthy benchmark for e-commerce is 4\u00d7, so your campaigns
      are performing well above average.
    </div>
  </div>

  <!-- METRICS -->
  <div class="section-label">Performance metrics</div>
  <div class="section-title">Key numbers this month</div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="m-label">Impressions</div>
      <div class="m-value">314,559</div>
      <span class="m-change up">\u25b2 +4.96%</span>
    </div>
    <div class="metric-card">
      <div class="m-label">Clicks</div>
      <div class="m-value">5,029</div>
      <span class="m-change up">\u25b2 +4.99%</span>
    </div>
    <div class="metric-card">
      <div class="m-label">Click-Through Rate</div>
      <div class="m-value">1.60%</div>
      <span class="m-change up">\u25b2 +0.03%</span>
    </div>
    <div class="metric-card">
      <div class="m-label">Cost Per Click</div>
      <div class="m-value">$0.60</div>
      <span class="m-change up">\u25b2 +4.98%</span>
    </div>
    <div class="metric-card">
      <div class="m-label">Total Conversions</div>
      <div class="m-value">336</div>
      <span class="m-change up">\u25b2 +10.55%</span>
    </div>
    <div class="metric-card">
      <div class="m-label">Cost Per Sale</div>
      <div class="m-value">$8.96</div>
      <span class="m-change good-down">\u25bc \u20130.31%</span>
    </div>
    <div class="metric-card">
      <div class="m-label">Conversion Rate</div>
      <div class="m-value">6.52%</div>
      <span class="m-change up">\u25b2 +3.12%</span>
    </div>
    <div class="metric-card">
      <div class="m-label">Total Ad Spend</div>
      <div class="m-value">$3,012</div>
      <span class="m-change up">\u25b2 +10.22%</span>
    </div>
  </div>

  <!-- SHOPPING FUNNEL -->
  <div class="funnel-section">
    <h3>Your customer shopping journey</h3>
    <p class="chart-sub">How shoppers moved from ad click to purchase this month</p>
    <div class="funnel">
      <div class="funnel-step" style="background: var(--brand); width: 100%;">
        <div class="f-icon">\ud83d\udc41</div>
        <div class="f-text">
          <div class="f-name">Saw your ad</div>
          <div class="f-count">314,559 impressions</div>
        </div>
      </div>
      <div class="funnel-arrow">\u2193</div>
      <div class="funnel-step" style="background: #2563EB; width: 88%;">
        <div class="f-icon">\ud83d\uddb1</div>
        <div class="f-text">
          <div class="f-name">Clicked through to site</div>
          <div class="f-count">5,029 clicks</div>
        </div>
        <div class="f-rate">1.60% CTR</div>
      </div>
      <div class="funnel-arrow">\u2193</div>
      <div class="funnel-step" style="background: #1D4ED8; width: 72%;">
        <div class="f-icon">\ud83d\uded2</div>
        <div class="f-text">
          <div class="f-name">Added to cart</div>
          <div class="f-count">1,470 shoppers</div>
        </div>
        <div class="f-rate">29.2% of clicks</div>
      </div>
      <div class="funnel-arrow">\u2193</div>
      <div class="funnel-step" style="background: #1E40AF; width: 55%;">
        <div class="f-icon">\ud83d\udcb3</div>
        <div class="f-text">
          <div class="f-name">Reached checkout</div>
          <div class="f-count">1,522 shoppers</div>
        </div>
        <div class="f-rate">30.3% of clicks</div>
      </div>
      <div class="funnel-arrow">\u2193</div>
      <div class="funnel-step" style="background: var(--green); width: 40%;">
        <div class="f-icon">\u2705</div>
        <div class="f-text">
          <div class="f-name">Completed purchase</div>
          <div class="f-count">297 sales</div>
        </div>
        <div class="f-rate">5.9% of clicks</div>
      </div>
    </div>
  </div>

  <!-- CAMPAIGNS -->
  <div class="section-label">Campaigns</div>
  <div class="section-title">Top performing campaigns</div>

  <div class="campaigns-section">
    <div class="table-header">
      <h3>Campaign breakdown — February 2026</h3>
      <p>Performance data for your two active campaigns</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>Campaign</th>
          <th>Clicks</th>
          <th>Spend</th>
          <th>Revenue</th>
          <th>Conversions</th>
          <th>ROAS</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="campaign-name">
              Sales – PMax SmartShop
              <span class="campaign-badge badge-top">Top</span>
            </div>
            <div style="font-size:11px;color:var(--mid);margin-top:2px;">Performance Max \u00b7 All products</div>
          </td>
          <td>4,410</td>
          <td>$2,410.77</td>
          <td>$27,514.06</td>
          <td>319.56</td>
          <td><span class="roas-pill roas-high">11.41\u00d7</span></td>
        </tr>
        <tr>
          <td>
            <div class="campaign-name">Sales – Performance Max \u00b7 Homeopathy</div>
            <div style="font-size:11px;color:var(--mid);margin-top:2px;">Performance Max \u00b7 Homeopathy range \u00b7 AU\u2013Sydney</div>
          </td>
          <td>619</td>
          <td>$601.20</td>
          <td>$1,248.14</td>
          <td>16.50</td>
          <td><span class="roas-pill roas-low">2.08\u00d7</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- MONTHLY SPEND BAR -->
  <div class="chart-section">
    <h3>How your budget was allocated</h3>
    <p class="chart-sub">Spend distribution across campaigns</p>
    <div class="bar-chart">
      <div class="bar-row">
        <div class="bar-label">SmartShop</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: 80%; background: var(--brand);"></div>
        </div>
        <div class="bar-value">$2,410.77</div>
      </div>
      <div class="bar-row">
        <div class="bar-label">Homeopathy</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: 20%; background: var(--brand-light);"></div>
        </div>
        <div class="bar-value">$601.20</div>
      </div>
    </div>
    <div style="margin-top:14px; font-size:12px; color:var(--mid);">
      The SmartShop campaign drives the majority of revenue and is performing at 11.41\u00d7 ROAS — well above the homeopathy campaign which may benefit from review.
    </div>
  </div>

  <!-- TASKS COMPLETED -->
  <div class="tasks-section">
    <div class="section-label">Work completed</div>
    <div class="section-title">What we did this month</div>
    <div class="tasks-grid">
      <div class="task-card">
        <div class="task-num">1</div>
        <div class="task-text">Set up and optimised your product feed for Google Shopping</div>
      </div>
      <div class="task-card">
        <div class="task-num">2</div>
        <div class="task-text">Launched Performance Max campaigns for broader reach</div>
      </div>
      <div class="task-card">
        <div class="task-num">3</div>
        <div class="task-text">Monitored search terms and blocked irrelevant traffic with negative keywords</div>
      </div>
      <div class="task-card">
        <div class="task-num">4</div>
        <div class="task-text">Maintained ads in efficient positions to keep costs low</div>
      </div>
      <div class="task-card">
        <div class="task-num">5</div>
        <div class="task-text">Reviewed and updated ad creative assets and copy</div>
      </div>
      <div class="task-card">
        <div class="task-num">6</div>
        <div class="task-text">Corrected conversion tracking settings for accurate reporting</div>
      </div>
      <div class="task-card">
        <div class="task-num">7</div>
        <div class="task-text">Adjusted bids and budgets to improve performance</div>
      </div>
      <div class="task-card">
        <div class="task-num">8</div>
        <div class="task-text">Prepared this monthly performance report</div>
      </div>
    </div>
  </div>

</div>

<!-- FOOTER -->
<footer>
  <div class="footer-logo">SH<span>T</span>UDIO</div>
  <div>Prepared by <a href="https://www.shtudio.com.au">www.shtudio.com.au</a> &nbsp;\u00b7&nbsp; \u00a9 Shtudio 2026</div>
</footer>

</body>
</html>

Use this as your design template. Preserve all CSS exactly. Replace the content, data, client name, brand colours, and metrics with the data extracted from the PDF. Output only raw HTML with no markdown, no code fences, nothing else.

BRAND COLOUR INSTRUCTIONS:
- The template uses --brand and --brand-light CSS variables (default #2B6CB8 / #4A90D9). Change these to match the client's brand colours if you can infer them from context, otherwise keep the defaults.
- The ROAS highlight gradient and accent colours should also be adapted to the client's brand.

HEADER INSTRUCTIONS:
- The header uses a light background (#F7F9FC), NOT dark.
- Left side: client logo area. ${clientLogoUrl ? `The client has a logo — render it as: <img src="${clientLogoUrl}" alt="${clientName}" style="max-height:60px;max-width:200px;object-fit:contain;">` : `No logo URL is available — render the client name "${clientName}" as styled text using the .header-logo-text class (Anton font, charcoal, uppercase).`}
- Right side: report type label (e.g. "Google Ads Report"), report title, and period date range.
- Below the header-inner: a 1px border line (.header-border) then a 4px gradient accent bar from #F26522 (orange) to #2D2D2D (charcoal).

The client name is: ${clientName}
The client logo URL is: ${clientLogoUrl || 'NONE — use text fallback'}
The report period is: ${periodInfo || 'as indicated in the PDF data'}

Raw PDF content:
${pdfText}`,
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

    // Save enhanced HTML
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
        pdf_text_length: pdfText.length,
        html_length: enhancedHtml.length,
      },
    });

    return NextResponse.json({ success: true, reportId });
  } catch (error: any) {
    console.error('Report enhancement error:', error);

    // Try to update the report status
    try {
      const { reportId } = await request.clone().json();
      if (reportId) {
        const supabase = createServiceSupabase();
        await supabase
          .from('reports')
          .update({
            ai_status: 'failed',
            ai_error: error.message || 'An unexpected error occurred',
          })
          .eq('id', reportId);
      }
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.json(
      { error: error.message || 'Enhancement failed' },
      { status: 500 }
    );
  }
}
