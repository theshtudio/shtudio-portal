'use client';

import { useState } from 'react';
import styles from './page.module.css';

interface AccordionItem {
  title: string;
  content: React.ReactNode;
}

function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className={styles.accordion}>
      {items.map((item, i) => (
        <div key={i} className={`${styles.accordionItem} ${openIndex === i ? styles.accordionOpen : ''}`}>
          <button
            className={styles.accordionTrigger}
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <span>{item.title}</span>
            <span className={styles.accordionChevron}>{openIndex === i ? '−' : '+'}</span>
          </button>
          {openIndex === i && (
            <div className={styles.accordionContent}>
              {item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HelpPage() {
  return (
    <>
      <div className={styles.hero}>
        <h1 className={styles.heading}>Help & Best Practices</h1>
        <p className={styles.heroSub}>
          Everything you need to get the best results from Shtudio Portal.
        </p>
      </div>

      {/* Section 1: Getting the best results from AI */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>AI Reports</div>
        <h2 className={styles.sectionTitle}>Getting the Best Results from AI</h2>
        <Accordion items={[
          {
            title: 'How does Claude read your reports?',
            content: (
              <div className={styles.prose}>
                <p>
                  When you upload a report, Claude receives the raw PDF (or Word/Excel file) and reads every page.
                  It extracts metrics, tables, charts, and text — then restructures everything into a branded HTML report.
                </p>
                <p>
                  Claude works best when the source data is <strong>clean and clearly labelled</strong>. Column headers,
                  date ranges, and metric labels help it understand what each number represents.
                </p>
              </div>
            ),
          },
          {
            title: 'What helps Claude produce better reports?',
            content: (
              <div className={styles.prose}>
                <ul>
                  <li><strong>Clear file names</strong> — include the client name and month (e.g. &ldquo;Kennedy&apos;s Pharmacy - March 2026.pdf&rdquo;). This helps auto-fill the title and period.</li>
                  <li><strong>Multiple files</strong> — upload Google Ads + GA4 exports together for a more comprehensive report.</li>
                  <li><strong>Custom instructions</strong> — tell Claude what to focus on. Even a short note like &ldquo;emphasise ROAS&rdquo; makes a noticeable difference.</li>
                  <li><strong>Client files</strong> — upload brand guidelines or previous manual reports. Claude uses these for tone, context, and comparison data.</li>
                  <li><strong>Historical reports</strong> — the more completed reports a client has, the better the month-on-month and trend analysis becomes. Claude automatically uses the last 6 reports.</li>
                </ul>
              </div>
            ),
          },
          {
            title: 'What if the AI report isn\'t quite right?',
            content: (
              <div className={styles.prose}>
                <p>
                  You can always re-process a report. Go to the report detail page, update the Custom Instructions
                  with more specific guidance, and click <strong>&ldquo;Save & Re-process&rdquo;</strong>.
                </p>
                <p>
                  Common fixes:
                </p>
                <ul>
                  <li>&ldquo;The revenue figure on page 2 is total revenue, not ad revenue — use the ad-attributed revenue from the conversions table instead.&rdquo;</li>
                  <li>&ldquo;Ignore the Shopping campaign data, this client only runs Search.&rdquo;</li>
                  <li>&ldquo;Add a section about lead quality — mention that phone calls are their primary conversion.&rdquo;</li>
                </ul>
              </div>
            ),
          },
        ]} />
      </section>

      {/* Section 2: Custom Instructions Guide */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>Instructions</div>
        <h2 className={styles.sectionTitle}>Custom Instructions Guide</h2>
        <p className={styles.sectionIntro}>
          Custom instructions are the single most effective way to improve report quality. Here are real examples for common scenarios:
        </p>
        <Accordion items={[
          {
            title: 'Google Ads — E-commerce client focused on ROAS',
            content: (
              <div className={styles.prose}>
                <div className={styles.exampleBox}>
                  <div className={styles.exampleLabel}>Example instruction</div>
                  <p className={styles.exampleText}>
                    &ldquo;This client is e-commerce, focused on ROAS and revenue. Emphasise return on ad spend, cost per purchase, and revenue growth.
                    Compare campaign-level ROAS and recommend budget shifts from low-performing to high-performing campaigns.
                    Keep language simple — the client owner is not technical.&rdquo;
                  </p>
                </div>
              </div>
            ),
          },
          {
            title: 'Google Ads — Lead generation client',
            content: (
              <div className={styles.prose}>
                <div className={styles.exampleBox}>
                  <div className={styles.exampleLabel}>Example instruction</div>
                  <p className={styles.exampleText}>
                    &ldquo;This is a lead gen client. Primary conversions are phone calls and form submissions.
                    Don&apos;t focus on revenue or ROAS — instead emphasise cost per lead, lead volume, and conversion rate.
                    Mention that we&apos;re optimising for quality leads, not just volume.
                    Include a recommendation about which ad groups are driving the most leads.&rdquo;
                  </p>
                </div>
              </div>
            ),
          },
          {
            title: 'SEO monthly report',
            content: (
              <div className={styles.prose}>
                <div className={styles.exampleBox}>
                  <div className={styles.exampleLabel}>Example instruction</div>
                  <p className={styles.exampleText}>
                    &ldquo;This is an SEO report. Focus on organic traffic growth, keyword ranking improvements,
                    and top landing pages. Highlight any new keywords entering the top 10.
                    Include a section on technical SEO wins if mentioned in the data.
                    The client cares most about lead generation from organic search.&rdquo;
                  </p>
                </div>
              </div>
            ),
          },
          {
            title: 'Google Business Profile (GBP)',
            content: (
              <div className={styles.prose}>
                <div className={styles.exampleBox}>
                  <div className={styles.exampleLabel}>Example instruction</div>
                  <p className={styles.exampleText}>
                    &ldquo;This is a Google Business Profile report for a multi-location business.
                    Focus on profile views, direction requests, phone calls, and website clicks.
                    Compare performance across locations if data is available.
                    Recommend posting frequency and review response strategies.&rdquo;
                  </p>
                </div>
              </div>
            ),
          },
          {
            title: 'New client — first report',
            content: (
              <div className={styles.prose}>
                <div className={styles.exampleBox}>
                  <div className={styles.exampleLabel}>Example instruction</div>
                  <p className={styles.exampleText}>
                    &ldquo;This is the first report for a new client. There is no historical data to compare against.
                    Focus on establishing benchmarks and explaining what each metric means.
                    Set the tone as educational — help the client understand what they&apos;re looking at.
                    Highlight quick wins and areas of opportunity rather than trends.&rdquo;
                  </p>
                </div>
              </div>
            ),
          },
          {
            title: 'Underperforming month — managing expectations',
            content: (
              <div className={styles.prose}>
                <div className={styles.exampleBox}>
                  <div className={styles.exampleLabel}>Example instruction</div>
                  <p className={styles.exampleText}>
                    &ldquo;This was a tough month — performance dipped due to seasonality and a reduced budget.
                    Be honest about the decline but frame it constructively. Mention that December is typically
                    slow for this industry. Focus on what we&apos;re doing to recover in January:
                    new ad copy tests, audience expansion, and landing page improvements.
                    Don&apos;t sugarcoat the numbers but keep the tone confident and forward-looking.&rdquo;
                  </p>
                </div>
              </div>
            ),
          },
        ]} />
      </section>

      {/* Section 3: Client Files Guide */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>Client Library</div>
        <h2 className={styles.sectionTitle}>Client Files Guide</h2>
        <Accordion items={[
          {
            title: 'What should I upload to the client file library?',
            content: (
              <div className={styles.prose}>
                <ul>
                  <li><strong>Brand guidelines</strong> — helps Claude match tone and language</li>
                  <li><strong>Strategy documents</strong> — so Claude understands campaign goals and KPIs</li>
                  <li><strong>Historical data exports</strong> — spreadsheets with past performance data for deeper trend analysis</li>
                  <li><strong>Competitor research</strong> — for contextual recommendations</li>
                  <li><strong>Previous manual reports</strong> — so Claude can match your preferred format and level of detail</li>
                </ul>
              </div>
            ),
          },
          {
            title: 'How to prepare spreadsheets',
            content: (
              <div className={styles.prose}>
                <p>For best results with Excel/CSV files:</p>
                <ul>
                  <li>Use <strong>clear column headers</strong> in the first row (e.g. &ldquo;Date&rdquo;, &ldquo;Impressions&rdquo;, &ldquo;Clicks&rdquo;, &ldquo;Cost&rdquo;)</li>
                  <li>Remove empty rows and formatting-only rows (merged cells, logos, etc.)</li>
                  <li>Keep one data table per sheet — avoid multiple tables on the same sheet</li>
                  <li>Include date ranges in the data or file name</li>
                  <li>Use <strong>.xlsx</strong> format rather than .xls (better compatibility)</li>
                </ul>
              </div>
            ),
          },
          {
            title: 'Supported file formats',
            content: (
              <div className={styles.prose}>
                <div className={styles.formatGrid}>
                  <div className={styles.formatItem}>
                    <span className={styles.formatIcon}>📕</span>
                    <div>
                      <strong>PDF</strong>
                      <p>Google Ads exports, GA4 reports, any print-ready documents</p>
                    </div>
                  </div>
                  <div className={styles.formatItem}>
                    <span className={styles.formatIcon}>📘</span>
                    <div>
                      <strong>Word (.docx)</strong>
                      <p>Strategy docs, brand guidelines, briefs</p>
                    </div>
                  </div>
                  <div className={styles.formatItem}>
                    <span className={styles.formatIcon}>📗</span>
                    <div>
                      <strong>Excel (.xlsx)</strong>
                      <p>Data exports, performance spreadsheets, budget trackers</p>
                    </div>
                  </div>
                  <div className={styles.formatItem}>
                    <span className={styles.formatIcon}>📄</span>
                    <div>
                      <strong>CSV</strong>
                      <p>Raw data exports from ad platforms and analytics tools</p>
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
        ]} />
      </section>

      {/* Section 4: Report Workflow */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>Workflow</div>
        <h2 className={styles.sectionTitle}>Report Workflow</h2>
        <Accordion items={[
          {
            title: 'Step-by-step: from upload to sharing',
            content: (
              <div className={styles.prose}>
                <div className={styles.steps}>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>1</div>
                    <div>
                      <strong>Export your data</strong>
                      <p>Download the PDF/Excel report from Google Ads, GA4, or your ad platform.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>2</div>
                    <div>
                      <strong>Upload & configure</strong>
                      <p>Go to Upload Report, select the client, upload your file(s), add any custom instructions, and optionally select client files for additional context.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>3</div>
                    <div>
                      <strong>AI processing</strong>
                      <p>Claude analyses the data and generates a branded HTML report. This takes 30-60 seconds.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>4</div>
                    <div>
                      <strong>Review</strong>
                      <p>Check the generated report. If anything needs adjusting, update the custom instructions and re-process.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>5</div>
                    <div>
                      <strong>Publish</strong>
                      <p>Toggle the report to &ldquo;Published&rdquo; to make it available via the client&apos;s share link.</p>
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
          {
            title: 'Tips for faster workflows',
            content: (
              <div className={styles.prose}>
                <ul>
                  <li><strong>Use the client page shortcut</strong> — click &ldquo;Upload Report&rdquo; from a client&apos;s detail page to auto-select that client.</li>
                  <li><strong>Name files consistently</strong> — include client name and month for auto-filled titles and dates.</li>
                  <li><strong>Save good custom instructions</strong> — once you find instructions that work well for a client, reuse them each month.</li>
                  <li><strong>Upload client files once</strong> — brand guidelines and strategy docs only need to be uploaded once to the client library. They&apos;re reusable across all reports.</li>
                </ul>
              </div>
            ),
          },
        ]} />
      </section>

      {/* Section 5: Publishing & Sharing */}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>Sharing</div>
        <h2 className={styles.sectionTitle}>Publishing & Sharing</h2>
        <Accordion items={[
          {
            title: 'How do share links work?',
            content: (
              <div className={styles.prose}>
                <p>
                  Each client has a unique portal URL based on their slug (e.g. <code>/portal/kennedys-pharmacy</code>).
                  When a report is published, it appears on the client&apos;s portal page.
                </p>
                <p>
                  Client users log in with their own credentials and can only see reports that have been published for their client.
                  Draft and processing reports are never visible to clients.
                </p>
              </div>
            ),
          },
          {
            title: 'When should I publish a report?',
            content: (
              <div className={styles.prose}>
                <ul>
                  <li><strong>After review</strong> — always check the AI output before publishing. Look for incorrect metrics or awkward phrasing.</li>
                  <li><strong>After re-processing</strong> — if you tweaked the custom instructions and re-processed, make sure the new version looks good before publishing.</li>
                  <li><strong>On a schedule</strong> — if you send reports monthly, try to publish around the same time each month so clients know when to expect them.</li>
                </ul>
              </div>
            ),
          },
          {
            title: 'Can I unpublish a report?',
            content: (
              <div className={styles.prose}>
                <p>
                  Yes. Toggle the publish switch off on the report detail page and the report immediately becomes a draft again.
                  It will no longer be visible to the client. You can re-publish it at any time.
                </p>
              </div>
            ),
          },
        ]} />
      </section>
    </>
  );
}
