import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { applyBlocksToHtml } from '@/lib/reportBlocks';
import type { BlocksConfig } from '@/lib/types';

// Puppeteer needs the Node runtime (not Edge) and headless Chromium cold
// starts are slow — give the function room to boot the browser and render.
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type ReportRow = {
  id: string;
  title: string;
  ai_enhanced_html: string | null;
  blocks: BlocksConfig | null;
  ai_status: string;
  is_published: boolean;
  clients: { name: string | null } | null;
};

const REPORT_COLUMNS =
  'id, title, ai_enhanced_html, blocks, ai_status, is_published, clients(name)';

// Authorize + fetch. If the requester is logged in, the `reports_select` RLS
// policy scopes what they can read (admin → any report; client → published
// reports for a client they belong to). For anonymous visitors we fall back to
// the service client but only serve *published* reports — matching the public
// /share/[id] page, which already exposes published reports to anyone with the
// link. Drafts therefore stay admin/owner-only.
async function fetchAuthorizedReport(id: string): Promise<ReportRow | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase
      .from('reports')
      .select(REPORT_COLUMNS)
      .eq('id', id)
      .single<ReportRow>();
    if (data) return data;
  }

  const service = createServiceSupabase();
  const { data } = await service
    .from('reports')
    .select(REPORT_COLUMNS)
    .eq('id', id)
    .eq('is_published', true)
    .single<ReportRow>();

  return data ?? null;
}

// Turn a client/report title into a safe filename segment.
function slugifyForFilename(input: string, fallback: string): string {
  const cleaned = (input || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return cleaned || fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function launchBrowser(): Promise<any> {
  if (process.env.VERCEL) {
    // Production (Vercel Functions): the sparticuz Chromium build driven by
    // the lightweight puppeteer-core.
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 980, height: 1400, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // Local dev (Windows/macOS): the full `puppeteer` package (a devDependency)
  // with its bundled Chrome. The import is routed through `new Function` so the
  // specifier survives SWC minification (a plain variable gets constant-folded
  // back to a literal and then traced) and stays invisible to Next's
  // file-tracer — `puppeteer` therefore never lands in the deployed function.
  // The env check above already makes this branch unreachable on Vercel.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const importDynamic = new Function('m', 'return import(m)');
  const puppeteer = await importDynamic('puppeteer');
  return (puppeteer.default ?? puppeteer).launch({
    defaultViewport: { width: 980, height: 1400, deviceScaleFactor: 2 },
    headless: true,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const report = await fetchAuthorizedReport(id);
  if (!report) {
    // Not found, or hidden by RLS from this requester — don't distinguish.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (report.ai_status !== 'completed' || !report.ai_enhanced_html) {
    return NextResponse.json(
      { error: 'Report is not ready for download' },
      { status: 409 },
    );
  }

  // Apply the exact same block customisation the client sees on the share
  // page, so the PDF matches the on-screen report.
  const html = applyBlocksToHtml(report.ai_enhanced_html, report.blocks ?? null, {
    respectDefaultHidden: true,
  });

  const clientName = report.clients?.name ?? 'report';
  const fileName = `${slugifyForFilename(clientName, 'client')}-${slugifyForFilename(
    report.title,
    'report',
  )}.pdf`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // The reports are styled for the screen, not the browser's default print
    // stylesheet — page.pdf() would otherwise emulate print media.
    await page.emulateMediaType('screen');
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Reports pull DM Serif Display / DM Sans from Google Fonts. Block on the
    // font set being ready so the PDF never falls back to system fonts.
    await page.evaluateHandle('document.fonts.ready');

    // Force backgrounds/colors to render and discourage awkward mid-element
    // page breaks. Browsers ignore break-inside:avoid on boxes taller than a
    // page, so this can't clip large sections.
    await page.addStyleTag({
      content: `
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        section, .card, .metric-card, .hero-kpi, .hero-summary,
        table, tr, .chart-container {
          break-inside: avoid;
        }
      `,
    });

    const pdf: Uint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    });

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[reports/pdf] generation failed:', err);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
