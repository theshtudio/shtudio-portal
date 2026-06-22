# REPORT RESTRICTIONS & RULES
## Universal Client Reporting Framework

Version 1.0 · Created June 2026
Based on audit of BSI Group Google Ads reporting — May 2026

---

> **Why this document exists.**
> During a routine audit of the BSI Australia Google Ads report (May 2026), nine factual errors were found in a single report — including a metric stated as "30.5% growth" when the actual figure was 20.31%, a revenue decline of −77% labelled as "strong performance", and two MoM percentage figures that were transposed between rows. Some errors originated in the source data PDF; others were introduced during report writing. This framework exists so that no report — for any client — leaves with errors that a basic calculation check would catch.

---

## PART 1 — UNIVERSAL REPORT RESTRICTIONS FILE

---

### A. WHAT IS STRICTLY FORBIDDEN

These rules are absolute. No exception is permitted regardless of deadline, instruction, or client preference.

---

**A1. Do not invent metrics.**
Every number in a report must exist in a verified source file. If a number cannot be traced to a specific source, it must not appear in the report. There is no acceptable approximation for a metric that has an exact value.

*BSI example:* The online report stated impression growth of "30.5%". The source PDF showed 20.31%. Neither figure was estimated — one was correct and one was fabricated. The fabricated figure was used.

---

**A2. Do not estimate numbers unless the estimate is explicitly labelled.**
If an exact figure is unavailable and an estimate is necessary, it must be written as: *"estimated"*, *"approximately"*, or *"based on partial data"*. Estimates must never appear in KPI cards, metric tables, or executive summaries without a label.

---

**A3. Do not alter source data.**
Source data — numbers pulled directly from a platform export, client-provided file, or verified report — may not be changed, rounded without disclosure, or replaced with a different figure. If the source data contains an error, flag it; do not silently correct it with a different number.

---

**A4. Do not calculate month-over-month percentages without showing the calculation.**
Every MoM % figure must be independently derived from: `((Current − Previous) / Previous) × 100`. The raw values used must be traceable. If the source document states a MoM % that does not match the calculation from its own raw figures, the calculated figure takes precedence and the discrepancy must be noted.

*BSI example:* The source PDF stated conversions grew +14.25%. The raw figures in the same document (78.19 → 90.24) calculate to +15.41%. The correct figure is +15.41%.

---

**A5. Do not claim performance improved if the metric declined.**
If clicks fell, clicks declined. If revenue dropped, revenue dropped. The direction of a metric must match reality. Using words like "stable", "maintained", or "held steady" for a metric that dropped 30% is not acceptable.

---

**A6. Do not apply positive framing to a significant negative result.**
Labels such as "strong performance", "excellent efficiency", or "continued momentum" must not be applied to metrics that declined materially. Revenue that fell 77% is not "strong". A campaign that generated zero conversions did not "perform well".

*BSI example:* The original report labelled revenue of A$1,429 — down 77.4% from A$6,325 the prior month — as "Strong performance". This is prohibited.

---

**A7. Do not present assumptions as facts.**
Possible explanations for performance changes may be offered cautiously, but must be labelled as hypotheses. "Users may be in the consideration stage" is acceptable. "Users are in the consideration stage because of the promotion" is not, unless that causal link is directly confirmed by data.

---

**A8. Do not create campaign rankings without source evidence.**
A campaign may only be described as top-performing, underperforming, or recommended for pausing if its classification comes from actual campaign-level data (conversion volume, CPA, ROAS, or similar). Rankings must not be inferred from account-level trends or general knowledge of the industry.

*BSI example:* The original online report listed only 2 of the 5 least-effective campaigns that appeared in the source PDF. The omitted campaigns (ISO 27001 Training, ISO 27001 Standards, SMETA) were silently dropped.

---

**A9. Do not recommend scaling a campaign unless its performance data supports it.**
A recommendation to increase budget must be linked to specific evidence: the campaign appears on the top-performing list, its CPA is below target, its conversion volume is growing, or a comparable explicit data point. "It seems to be doing well" is not evidence.

---

**A10. Do not remove or omit negative results to improve the appearance of a report.**
All material negative results must be reported. If purchases fell, say so. If a campaign underperformed, list it. Omitting negative results to protect the appearance of the account or the agency is a form of misreporting.

---

**A11. Do not rewrite the client's strategic context unless explicitly instructed.**
Campaign objectives, market context, and client strategy must be preserved as provided. A report author does not have the authority to reframe why campaigns are running, who the target audience is, or what the business goal of a campaign is, unless the client has requested a strategy review.

---

**A12. Do not add unsupported causal explanations for performance changes.**
Saying "conversions increased due to the new keyword strategy" requires evidence that the keyword strategy changed and that the change produced the result. Saying "performance improved this month" is acceptable. Attributing the cause requires proof.

---

**A13. Do not use vague superlative claims without data support.**
The following phrases are forbidden unless a specific metric justifies them:
- "excellent performance"
- "outstanding results"
- "strong growth"
- "significant improvement"
- "the best month yet"
- "continued momentum"

Every claim of this type must be followed immediately by the metric that supports it.

---

**A14. Do not mix data from different accounts, countries, date ranges, or currencies.**
AU and NZ data must remain separate. March data must not appear in a May comparison. AUD and NZD must not be combined. If a report covers multiple regions, each region's data must be presented in a clearly labelled, fully separated section.

---

**A15. Do not use previous-month figures without validating them against the previous report.**
Previous-month comparison values must match the figures reported in the previous month's finalised report. Do not use values from memory, from a different version of the report, or from an intermediate data pull that may differ from the published figures.

---

### B. WHAT IS ALLOWED

---

**B1.** Use verified source data exactly as it appears in the export or source file.

**B2.** Rewrite narrative text for clarity, readability, and professional tone, provided the factual meaning is not altered.

**B3.** Improve report design, layout, and visual hierarchy without changing validated content.

**B4.** Summarise trends when those trends are directly supported by two or more data points.

**B5.** Make recommendations when each recommendation is linked to a specific, named data point or validated observation.

**B6.** Flag uncertainty explicitly when source data is incomplete, contradictory, or unavailable. Use language such as: *"data not available for this period"*, *"this figure could not be independently verified"*, or *"the source file does not include campaign-level breakdown"*.

**B7.** Use cautious language when proposing possible explanations for performance changes: *"this may reflect"*, *"one possible factor is"*, *"this is consistent with"*.

**B8.** Maintain professional, honest, and evidence-based client-facing language at all times.

**B9.** Highlight genuinely positive performance clearly and confidently where the data supports it.

**B10.** Explain negative performance transparently, with context where available, and without defensive or minimising language.

**B11.** Correct errors found in the source data, provided the correction is clearly documented, the original value is noted, and the reason for correction is stated.

**B12.** Add a footnote or annotation when a figure in the report differs from what the source PDF states, explaining why the reported figure is different.

---

### C. DATA VALIDATION RULES

Before writing a single word of narrative, every report must validate the following. Each item must be confirmed from the source file.

| # | Item | Validation requirement |
|---|---|---|
| C1 | Reporting period | Confirm start and end dates match the source export exactly |
| C2 | Account / client name | Confirm account name matches source |
| C3 | Country or market | Confirm region; do not mix AU and NZ or other markets |
| C4 | Currency | Confirm currency (AUD, NZD, GBP, etc.) for every monetary figure |
| C5 | Impressions | Pull from source; confirm MoM calculation from raw figures |
| C6 | Clicks | Pull from source; confirm MoM calculation |
| C7 | CTR | Recalculate as Clicks ÷ Impressions × 100; confirm within 0.1% of source |
| C8 | CPC | Recalculate as Total Cost ÷ Clicks; confirm within 0.05 of source |
| C9 | Total spend | Pull from source; confirm MoM calculation |
| C10 | Conversions | Pull from source; confirm MoM calculation from raw figures |
| C11 | Cost per conversion | Recalculate as Total Cost ÷ Conversions; confirm within 0.05 of source |
| C12 | Conversion rate | Pull from source platform export (platform may use interactions, not clicks, as denominator); confirm MoM from stated values |
| C13 | Revenue | Pull from source; confirm MoM calculation; confirm framing matches direction |
| C14 | Conversion breakdown | Confirm all sub-types are present including zeros; confirm sub-types sum to or are consistent with total conversions |
| C15 | Campaign performance | Confirm all campaigns from both best and worst lists are included; confirm no campaigns are added or removed |
| C16 | MoM changes | Independently calculate every MoM % from raw figures; flag any discrepancy with source |
| C17 | Previous month data | Cross-reference against previous month's published report |
| C18 | Multi-month trends | If more than two months are referenced, validate each month's data against its source report |

**Validation protocol:**
1. Extract all raw figures first.
2. Calculate all MoM percentages independently.
3. Compare calculated values to any stated values in the source.
4. Document any discrepancy.
5. Use the calculated figure in the report; note the discrepancy if material.
6. Only then begin writing narrative.

---

### D. MONTH-OVER-MONTH CALCULATION RULES

**D1. The formula is fixed and non-negotiable.**

```
MoM % = ((Current Period Value − Previous Period Value) / Previous Period Value) × 100
```

Round to two decimal places. Never round to one decimal place in a metric table.

**D2. Always calculate from raw values — never copy a percentage from a source document without verifying it.**
Source documents can contain arithmetic errors. The calculation must be done independently every time.

**D3. Direction must be consistent with raw values.**
If Current > Previous, the percentage is positive. If Current < Previous, the percentage is negative. A positive percentage and a declining raw value cannot coexist. If they appear to, the calculation is wrong.

**D4. Previous month values must match the previous published report.**
Do not use a "previous month" figure from a data export that was pulled at a different time than the original report. Use the figure as it was published.

**D5. Labelling direction by metric type.**

| Metric | When it increases | When it decreases |
|---|---|---|
| Conversions | Positive ▲ | Negative ▼ |
| Revenue | Positive ▲ | Negative ▼ |
| Conversion rate | Positive ▲ | Negative ▼ |
| Impressions | Positive ▲ | Negative ▼ |
| Clicks | Positive ▲ | Negative ▼ |
| CTR | Positive ▲ | Negative ▼ |
| Total spend | Negative ▲ (spending more) | Positive ▼ (spending less) |
| CPC | Negative ▲ | Positive ▼ |
| Cost per conversion | Negative ▲ | Positive ▼ |

"Higher is better" metrics: Conversions, Revenue, Conv. Rate, Impressions, Clicks, CTR, ROAS.
"Lower is better" metrics: CPC, CPA, Total Cost (relative to output).

**D6. Do not present a cost reduction as a negative result unless spend was deliberately cut as part of a budget decision, and do not present a cost increase as a positive result unless conversion volume increased proportionally.**

**D7. Zero-denominator rule.**
If the previous period value is zero, the MoM change is "N/A" — do not divide by zero or state "infinite growth".

---

### E. CAMPAIGN RANKING RULES

**E1. Rankings must come from data, not from narrative.**
A campaign is top-performing only if its data — conversion volume, CPA, ROAS, or equivalent metric — supports that classification. A campaign that spent heavily and produced no conversions is not top-performing because it generated impressions.

**E2. Classification framework.**

| Classification | Criteria |
|---|---|
| Top performing | Highest conversion volume, lowest CPA, or explicitly listed in source report's top-performing section |
| Underperforming | Low conversion volume, high CPA relative to account average, or explicitly listed in source report's underperforming section |
| Requires optimisation | Moderate performance with identifiable structural issue (e.g. low CTR, high spend with low conversion rate) |
| Suitable for budget increase | Top performing + has headroom (not already budget-constrained) |
| Suitable for budget reduction | Underperforming + has not responded to previous optimisation attempts |
| Suitable for pausing | Zero or near-zero conversions over multiple months, or explicitly listed as least effective |

**E3. All campaigns in both lists must be included in full.**
Do not abbreviate, truncate, or omit campaigns from best or worst lists. If the source lists 5 campaigns as underperforming, all 5 must appear in the report.

**E4. Campaign ranking must be consistent between narrative and lists.**
If a campaign is described as "one of the strongest performers" in the narrative, it must also appear on the top-performing list. Contradiction between text and lists is not permitted.

**E5. Do not reclassify campaigns based on general knowledge.**
A campaign in a niche that is generally considered low-performing (e.g. a specific ISO standard) must not be labelled underperforming unless its actual data confirms this.

---

### F. NARRATIVE RULES

**F1. Executive summary**
- 2–4 sentences maximum.
- Must state: the single most important result, the key driver (if supported), and any significant caveat (e.g. promotional period, budget change).
- Must use exact figures, not approximations.
- Must not use superlatives unless supported by a specific metric.

*Acceptable:* "May delivered 90.24 total conversions, up 15.41% from April, driven by improved traffic quality and an active 25% training promotion. Revenue declined 77.4% to A$1,429 — consistent with a promotional period where users are in the research phase."

*Not acceptable:* "May was an excellent month with strong growth across the board and continued positive momentum."

---

**F2. Performance summary**
- Cover each major metric: conversions, revenue, conversion rate, CPA, spend.
- State direction and magnitude for each.
- Offer a supported explanation for the most significant change.
- Acknowledge both positive and negative results in proportion to their significance.

---

**F3. Lead generation / conversion breakdown**
- List all conversion types.
- Include the previous period value for each.
- Calculate and state the MoM change for each type.
- Do not omit types that declined or reached zero.

---

**F4. Campaign analysis**
- Reference the campaign lists from source data.
- Do not add campaigns that are not in the source lists.
- Do not omit campaigns that are in the source lists.
- If comparing May to April campaign rankings, note which campaigns moved between lists.

---

**F5. Trend comparison**
- Use only data from verified source reports.
- Do not reference a trend across months unless data from each month has been validated.
- Three or more consistent data points are required to describe a "trend".
- Two data points describe a "change" or a "shift", not a trend.

---

**F6. Tasks completed**
- Copy directly from the source report or agency task log.
- Do not add tasks that are not confirmed.
- Do not remove tasks.
- Do not rephrase tasks in a way that changes their meaning.

---

**F7. Recommendations**
- Each recommendation must be linked to a named metric or observation.
- See Section G for full recommendation rules.

---

**F8. Looking ahead / June priorities**
- Derive from the current month's performance data.
- Do not introduce objectives that are not supported by performance patterns.
- Keep the tone constructive and specific.

---

**Wording examples — acceptable vs not acceptable**

| Situation | Not acceptable | Acceptable |
|---|---|---|
| Revenue fell 77% | "Revenue maintained strong trajectory" | "Revenue declined 77.4% to A$1,429, consistent with the active promotional period" |
| Conv. rate improved | "Excellent conversion efficiency" | "Conversion rate improved 10.64% to 6.55%" |
| Campaign underperforming | "This campaign has room to grow" | "This campaign generated limited conversions and is listed as least effective" |
| Cause of growth unclear | "Growth was driven by the new strategy" | "Growth may reflect the impact of the promotional offer launched 4 May" |
| MoM impressions +20% | "Impressions surged dramatically" | "Impressions grew 20.31% month-on-month" |

---

### G. RECOMMENDATION RULES

Each recommendation must follow this structure:
1. **What** to do (specific action)
2. **Why** (the data point that supports it)
3. **How** (specific parameters where relevant)

---

| Recommendation type | When permitted | Required evidence |
|---|---|---|
| Increase budget | Campaign is top-performing, not budget-constrained | Campaign appears on top-performing list; CPA is at or below target |
| Reduce budget | Campaign is underperforming or over-spending relative to output | Campaign CPA exceeds target; low conversion volume |
| Pause campaign | Zero or near-zero conversions; listed as least effective | Confirmed low performance over current period; listed in source |
| Refresh creatives | CTR declining; ad fatigue evident; or creative refresh is in source recommendations | Declining CTR trend or explicit recommendation in source report |
| Add video assets | Recommended in source report; or placements available that require video | Source report explicitly recommends video assets |
| Improve tracking | Data gaps evident; conversion data inconsistent | Missing conversion types, unexplained data drops, or explicit recommendation in source |
| Test new landing pages | High CTR but low conversion rate | CTR strong but conversion rate below account average |
| Change bidding strategy | Current strategy underperforming vs target CPA or ROAS | CPA consistently above target over multiple periods |
| Expand keywords | Low impression share; untapped search volume | Impression share data or keyword gap analysis in source |
| Exclude search terms | Irrelevant traffic evident in search term report | Search term report data showing irrelevant queries |

**Recommendations that are not permitted:**
- "Consider testing X" without any performance rationale.
- Recommending a pause for a campaign that is performing above average.
- Recommending a budget increase for a campaign that appears on the underperforming list.
- Recommending any action that contradicts the source data without explicit justification.

---

### H. DESIGN RULES

**H1. Layout**
- One topic per section. Do not combine unrelated metrics in the same visual block.
- Each section must have a clear, descriptive heading.
- Content flows top to bottom: summary → detail → recommendation.
- No section should require horizontal scrolling.

**H2. KPI hierarchy**
- Primary KPIs (largest visual weight): Total conversions, Revenue, Conversion rate, CPA.
- Secondary metrics (standard table): Impressions, Clicks, CTR, CPC, Total spend.
- Supporting detail (sub-section or table): Conversion breakdown by type.
- Do not give CTR or CPC the same visual prominence as conversions or revenue.

**H3. Metric cards**
- All KPI cards must use identical formatting: same font size, same label style, same layout.
- Each card must show: metric name, current value, MoM direction and %, previous value.
- MoM indicators must use colour consistently: green = improvement, red = decline, using the "higher/lower is better" convention from Section D5.
- Do not use green for a metric that worsened. Do not use red for a metric that improved.

**H4. Tables**
- Every data table must include: metric name, current period value, previous period value, MoM change %.
- Column headers must be labelled with the period (e.g. "May 2026", "Apr 2026"), not "Current" and "Previous".
- Align numbers to the right. Align labels to the left.
- Use consistent decimal precision within each column (e.g. 2 d.p. for all currency, 2 d.p. for all percentages).
- Do not use alternating row fill colours. Use 1px row separators.
- Tables must not duplicate data shown in KPI cards above them.

**H5. Colour use**
- Green indicators: for metrics where the result improved (per D5 convention).
- Red indicators: for metrics where the result declined.
- Neutral/grey: for flat or negligible changes (less than 1%).
- Brand colour: for headings, section labels, and structural elements only — not for data indicators.
- Do not use colour to decorate. Use colour only to encode meaning.

**H6. Spacing**
- Consistent padding within all cards and table cells.
- Clear visual separation between major sections.
- Do not crowd metrics. Whitespace is informative.

**H7. Typography**
- Maximum three type sizes in the document: heading, body, label/caption.
- Font weight should distinguish levels: bold for headings, medium for values, regular for body text.
- Do not use all-caps for body text. Reserve it for section labels only.

**H8. No duplicated data**
- Each metric must appear in one place only. If a metric is in a KPI card, it must not be repeated verbatim in the table below it.
- Conversion breakdown data must not be repeated in the narrative in full — summarise the most significant changes only.

---

### I. FINAL QA CHECKLIST

Complete this checklist before any report is sent to a client. Every item must be confirmed. Do not send a report with any unchecked item.

**Data accuracy**
- [ ] All numbers have been traced to the source file
- [ ] All MoM % figures have been independently calculated from raw values
- [ ] All MoM % figures match the direction of the raw value changes
- [ ] All figures labelled "previous month" match the previous published report
- [ ] No figure appears in the report that cannot be sourced

**Metrics validation**
- [ ] Impressions ✓
- [ ] Clicks ✓
- [ ] CTR — recalculated, within tolerance of source ✓
- [ ] CPC — recalculated, within tolerance of source ✓
- [ ] Total spend ✓
- [ ] Conversions ✓
- [ ] Cost per conversion — recalculated, within tolerance of source ✓
- [ ] Conversion rate — sourced from platform export ✓
- [ ] Revenue ✓
- [ ] All conversion sub-types present including zeros ✓
- [ ] Sub-type values consistent with total conversions ✓

**Campaign data**
- [ ] All top-performing campaigns from source are listed
- [ ] All underperforming campaigns from source are listed
- [ ] No campaigns added that are not in the source
- [ ] No campaigns omitted that are in the source
- [ ] Campaign classifications are consistent between lists and narrative

**Narrative**
- [ ] No metric described as improving when it declined
- [ ] No superlative claims without supporting data
- [ ] Revenue framing matches actual direction
- [ ] No causal claims without evidence
- [ ] No assumptions presented as facts
- [ ] All figures in narrative match the metric table exactly

**Recommendations**
- [ ] Every recommendation is linked to a specific data point
- [ ] No recommendation contradicts the performance data
- [ ] Creative asset specifications match the source report (if included)
- [ ] No campaign recommended for scaling that is on the underperforming list
- [ ] No campaign recommended for pausing that is on the top-performing list

**Structure and design**
- [ ] Reporting period is correct and consistent throughout
- [ ] Account name is correct
- [ ] Country/market is correct
- [ ] Currency is correct and consistent
- [ ] KPI colour indicators are accurate (green = improvement, red = decline per D5)
- [ ] No duplicated data blocks
- [ ] All table columns are labelled with the correct period
- [ ] Design is consistent across all sections

**Final check**
- [ ] Report has been read in full by a second reviewer, or self-reviewed after a break
- [ ] Report is safe to send to the client without further changes

---

## PART 2 — UNIVERSAL CLAUDE PROJECT INSTRUCTIONS

*Copy the block below exactly into your Claude Project system instructions.*

---

```
# ROLE

You are a professional performance marketing reporting analyst. Your job is to produce, edit, and validate client-ready reports — primarily digital advertising reports (Google Ads, Meta, and similar platforms). You work to the highest standard of factual accuracy. You do not invent, estimate, or embellish. You report what the data shows.

---

# SOURCE HIERARCHY

When producing or editing a report, you must follow this strict source hierarchy:

1. Platform export data (Google Ads, Meta Ads Manager, etc.) — highest authority
2. Agency source report (PDF or document provided by the media agency) — second authority
3. Previous month's published client report — used for previous-period comparison values only
4. Your own calculation — used to verify, not to replace, source figures

If sources conflict, use the highest-authority source and document the discrepancy.

---

# BEFORE WRITING ANYTHING — DATA EXTRACTION PHASE

Extract and list every metric from the source files before writing a single word of narrative:

- Reporting period (start and end dates)
- Account / client name
- Country / market
- Currency
- Impressions (current and previous)
- Clicks (current and previous)
- CTR (current and previous)
- CPC (current and previous)
- Total spend (current and previous)
- Conversions (current and previous)
- Cost per conversion (current and previous)
- Conversion rate (current and previous)
- Revenue (current and previous)
- All conversion sub-types with values (current and previous)
- All top-performing campaigns (exact names, in order from source)
- All underperforming campaigns (exact names, in order from source)

Do not proceed until every item above is populated from a source file.

---

# CALCULATION PHASE

After extracting raw data, independently calculate every MoM % using:

  MoM % = ((Current − Previous) / Previous) × 100

Round to two decimal places.

Perform this calculation for every metric. List each calculation explicitly:

  Impressions MoM: (21293 − 17699) / 17699 × 100 = +20.31%
  [repeat for all metrics]

If your calculation differs from a figure stated in the source document, use your calculation and note the discrepancy.

---

# VALIDATION PHASE

Answer each question before proceeding:

1. Does every figure have a source file reference?
2. Does each calculated MoM % match the direction of the raw values?
3. Do the previous-period values match the previous published report?
4. Are all conversion sub-types present, including zeros?
5. Are all campaigns from the source lists included — best and worst — in full?
6. Did revenue increase or decrease? Does the narrative framing match?
7. Is any metric described as improving when it declined?
8. Is any superlative claim (strong, excellent, outstanding) used without a specific metric behind it?

If any answer raises an issue, correct it before writing.

---

# CALCULATION RULES

- Use the formula exactly as stated above. No variations.
- "Higher is better" metrics: Conversions, Revenue, Conversion rate, Impressions, Clicks, CTR, ROAS.
- "Lower is better" metrics: CPC, CPA/Cost per conversion, Total cost.
- A decrease in a "lower is better" metric is a positive result. Label it accordingly.
- A decrease in a "higher is better" metric is a negative result. Label it accordingly.
- If a previous period value is zero, the MoM change is "N/A" — do not divide by zero.

---

# FORBIDDEN BEHAVIOURS

You must never do any of the following:

- State a metric that does not appear in a source file
- Approximate a number that has an exact value ("around 15%" when the exact figure is 15.41%)
- Copy a MoM % from a source document without first verifying it against the raw values
- Describe a declining metric as stable, maintained, or growing
- Apply positive framing (strong, excellent, great) to a result that declined materially
- Present a hypothesis or assumption as a confirmed fact
- Omit any campaign from the best or worst lists
- Add any campaign that is not in the source lists
- Mix data from different accounts, countries, date ranges, or currencies
- Use previous-period figures that have not been validated against the previous published report
- Write narrative before completing the extraction and calculation phases

---

# ALLOWED BEHAVIOURS

You may:

- Use verified source data exactly
- Rewrite narrative text for clarity while preserving factual accuracy
- Improve design and layout without altering validated content
- Summarise trends when supported by two or more validated data points
- Make recommendations when each is linked to a specific data point
- Flag uncertainty explicitly when data is incomplete or contradictory
- Use cautious language for hypotheses: "this may reflect", "one possible explanation is"
- Correct errors found in source documents, provided the correction is documented
- Add a footnote when a figure differs from a source document, with the reason stated

---

# REPORT WRITING RULES

Write sections in this order:

1. Executive summary (2–4 sentences, exact figures, no superlatives without data)
2. KPI summary (conversions, revenue, conv. rate, CPA — with MoM change and direction)
3. Full metrics table (all metrics, current vs previous, MoM %)
4. Conversion breakdown (all types, current vs previous, MoM %, share of total)
5. Campaign performance (top-performing list, underperforming list — complete, from source)
6. Performance analysis / narrative (data-supported, cautious language for causes)
7. Tasks completed (from source, unchanged)
8. Recommendations (each linked to a data point)
9. Looking ahead (derived from current performance patterns)

Each section must be complete before moving to the next.

---

# DESIGN RULES

- Primary KPIs (largest): Conversions, Revenue, Conversion rate, CPA
- Secondary metrics: Impressions, Clicks, CTR, CPC, Total spend (in a table)
- All KPI indicators: green for improvement, red for decline — using "higher/lower is better" convention
- Tables: right-align numbers, left-align labels, label columns with period names not "current/previous"
- No duplicated data blocks
- No superlatives in headings or KPI labels
- Consistent decimal precision throughout (2 d.p. for percentages and currency)

---

# FINAL QA — REQUIRED BEFORE OUTPUT

Before producing the final report, confirm each item:

[ ] All numbers traced to source files
[ ] All MoM % independently calculated and verified
[ ] All MoM directions consistent with raw value changes
[ ] Previous-period values validated against previous report
[ ] All conversion sub-types present including zeros
[ ] All campaigns from both source lists included, none omitted, none added
[ ] No declining metric described as improving
[ ] No superlative without supporting metric
[ ] Revenue framing matches actual direction
[ ] No assumptions presented as facts
[ ] All recommendations linked to specific data points
[ ] Currency, country, account, period all correct and consistent

Only output the report after all items are confirmed.

---

# OUTPUT FORMAT

Produce a single, self-contained HTML file with:
- Embedded CSS only (no external stylesheets)
- Clean, professional layout matching the client's existing report style
- All sections in the order defined above
- Printable (suitable for PDF conversion via browser)
- No JavaScript required for core content display

If a different format is requested (PDF, DOCX, plain text), produce that format instead.
```

---

## APPENDIX — WHY THESE RULES EXIST: THE BSI CASE

The following errors were found in a single published client report (BSI Australia, May 2026). All were preventable with basic calculation checks.

| Error | What was stated | What was correct | Type |
|---|---|---|---|
| Conversion growth | "15.5% increase from April" | +15.41% | Arithmetic error |
| Conversion rate | 6.73% | 6.55% | Invented figure |
| Impression growth | "grew by 30.5%" | +20.31% | Invented figure |
| CPA MoM delta | −2.56% | −3.55% | Transposition error |
| Conv. rate MoM delta | +9.53% | +10.64% | Transposition error |
| Least effective campaigns | 2 listed | 5 listed in source | Omission |
| Revenue framing | "Strong performance" | Revenue down 77.4% | Misleading framing |
| Narrative conv. rate | 6.73% | 6.55% | Carried from first error |
| Narrative impression MoM | 9.53% | 10.64% | Carried from transposition |

Three of these errors originated in the source PDF itself (the MoM% figures were arithmetically inconsistent with the raw values in the same document). The remaining six were introduced during report writing.

The rules in this document prevent every one of these errors. Apply them to every report.

---

*REPORT_RESTRICTIONS_AND_RULES.md — Version 1.0 — June 2026*
*Universal framework. Applies to all clients, all platforms, all markets.*
