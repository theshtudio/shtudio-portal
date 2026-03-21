export type ReportType =
  | 'google_ads'
  | 'gbp'
  | 'seo'
  | 'meta_ads'
  | 'microsoft_ads'
  | 'linkedin_ads'
  | 'combined';

export interface ReportOption {
  label: string;
  checked: boolean;
  adminOnly?: boolean;
}

export interface ReportTypeInfo {
  key: ReportType;
  displayName: string;
  options: ReportOption[];
}

export const REPORT_TYPES: ReportTypeInfo[] = [
  {
    key: 'google_ads',
    displayName: 'Google Ads',
    options: [
      { label: 'Revenue & ROAS', checked: false },
      { label: 'Shopping funnel — impressions to purchase', checked: false },
      { label: 'Leads breakdown — calls, forms, clicks', checked: false },
      { label: 'Campaign breakdown table', checked: true },
      { label: 'Top keywords table', checked: true },
      { label: 'Tasks completed', checked: true },
      { label: 'Month-on-month comparison', checked: false },
      { label: 'Budget recommendations', checked: false },
    ],
  },
  {
    key: 'gbp',
    displayName: 'Google Business Profile',
    options: [
      { label: 'Total interactions overview', checked: true },
      { label: 'Breakdown by action — calls, directions, website clicks', checked: true },
      { label: 'Search terms section', checked: true },
      { label: 'Platform & device breakdown', checked: true },
      { label: 'Publications section', checked: true },
      { label: 'Work completed & catalogue links', checked: true },
      { label: 'Recommendations — reviews, keywords, photos', checked: true },
      { label: 'Month-on-month comparison', checked: false },
    ],
  },
  {
    key: 'seo',
    displayName: 'SEO',
    options: [
      { label: 'Highlights — domains, backlinks, users, positions', checked: true },
      { label: 'Work completed', checked: true },
      { label: 'Internal optimisation — GA4 traffic analysis', checked: true },
      { label: 'External optimisation — SEMrush metrics', checked: true },
      { label: 'Keyword rankings section', checked: true },
      { label: 'External articles placed', checked: true },
      { label: 'Plan for next month', checked: true },
      { label: 'Recommendations', checked: true },
      { label: 'Month-on-month traffic comparison', checked: false },
      { label: 'Year-on-year traffic comparison', checked: false },
      { label: 'Search Console section', checked: false },
      { label: 'Backlinks & directories list', checked: true, adminOnly: true },
    ],
  },
  {
    key: 'meta_ads',
    displayName: 'Meta Ads',
    options: [
      { label: 'Campaign performance overview', checked: true },
      { label: 'Ad set breakdown', checked: true },
      { label: 'Creative performance', checked: true },
      { label: 'Audience insights', checked: true },
      { label: 'Tasks completed', checked: true },
      { label: 'Month-on-month comparison', checked: false },
      { label: 'Budget recommendations', checked: false },
    ],
  },
  {
    key: 'microsoft_ads',
    displayName: 'Microsoft Ads',
    options: [
      { label: 'Metrics table with month-on-month change %', checked: true },
      { label: 'Campaign performance breakdown', checked: true },
      { label: 'Recommendations', checked: true },
      { label: 'Tasks completed', checked: false, adminOnly: true },
      { label: 'Creative & remarketing brief', checked: false, adminOnly: true },
    ],
  },
  {
    key: 'linkedin_ads',
    displayName: 'LinkedIn Ads',
    options: [
      { label: 'Campaign highlights & metrics', checked: true },
      { label: 'Recommendations', checked: true },
      { label: 'Month-on-month or year-on-year cost comparison', checked: false },
      { label: 'Audience breakdown — industry, job title, geography', checked: false },
      { label: 'Creative format testing results', checked: false },
      { label: 'Benchmark targets — CTR and CPC', checked: false },
      { label: 'Landing page engagement analysis', checked: false },
      { label: 'Multi-market breakdown', checked: false },
    ],
  },
];

export const GLOBAL_OPTIONS: ReportOption[] = [
  { label: 'Include executive summary at top', checked: true },
  { label: 'Include next month recommendations', checked: true },
  { label: 'Use simple language — non-technical client', checked: false },
];

// Get all options for "Combined Report" (all types merged, grouped by platform)
export function getCombinedOptions(): { platform: string; options: ReportOption[] }[] {
  return REPORT_TYPES.map((rt) => ({
    platform: rt.displayName,
    options: rt.options.map((o) => ({ ...o })),
  }));
}

// Get options for a specific type
export function getOptionsForType(type: ReportType): ReportOption[] {
  if (type === 'combined') {
    return REPORT_TYPES.flatMap((rt) => rt.options.map((o) => ({ ...o })));
  }
  const found = REPORT_TYPES.find((rt) => rt.key === type);
  return found ? found.options.map((o) => ({ ...o })) : [];
}
