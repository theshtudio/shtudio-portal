'use client';

interface ValidationWarning {
  id: string;
  warning_type: string;
  details: {
    unmatched_count?: number;
    unmatched_numbers?: string[];
    source_number_count?: number;
    html_number_count?: number;
  };
  created_at: string;
}

interface ValidationWarningsProps {
  warnings: ValidationWarning[];
}

export function ValidationWarnings({ warnings }: ValidationWarningsProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div style={{
      background: '#FFFBEB',
      border: '1px solid #F59E0B',
      borderLeft: '4px solid #F59E0B',
      borderRadius: '8px',
      padding: '16px 20px',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '18px' }}>⚠️</span>
        <strong style={{ color: '#92400E', fontSize: '14px' }}>
          Data Validation Warning — {warnings.length} issue{warnings.length > 1 ? 's' : ''} found
        </strong>
      </div>
      <p style={{ fontSize: '13px', color: '#78350F', marginBottom: '12px', lineHeight: '1.5' }}>
        Some numbers in this report could not be verified against the source PDF.
        This may indicate invented numbers, calculation errors, or legitimately derived values (computed deltas, rounded figures).
        Review before publishing.
      </p>
      {warnings.map((w) => (
        <div key={w.id} style={{ background: '#FEF3C7', borderRadius: '6px', padding: '12px 16px', marginTop: '8px' }}>
          {w.warning_type === 'unmatched_numbers' && w.details && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', marginBottom: '6px' }}>
                {w.details.unmatched_count} number{(w.details.unmatched_count ?? 0) > 1 ? 's' : ''} in report not found in source
                {w.details.source_number_count !== undefined && (
                  <span style={{ fontWeight: 400, color: '#B45309', marginLeft: '8px' }}>
                    (source had {w.details.source_number_count} numbers; report had {w.details.html_number_count})
                  </span>
                )}
              </div>
              {w.details.unmatched_numbers && w.details.unmatched_numbers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {w.details.unmatched_numbers.slice(0, 30).map((n, i) => (
                    <span key={i} style={{
                      background: '#FDE68A',
                      color: '#92400E',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                    }}>{n}</span>
                  ))}
                  {w.details.unmatched_numbers.length > 30 && (
                    <span style={{ fontSize: '12px', color: '#B45309' }}>
                      +{w.details.unmatched_numbers.length - 30} more
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
