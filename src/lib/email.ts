import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://shtudio-portal.vercel.app';

interface ReportCompletedEmailParams {
  clientName: string;
  reportTitle: string;
  reportId: string;
}

export async function sendReportCompletedEmail({
  clientName,
  reportTitle,
  reportId,
}: ReportCompletedEmailParams) {
  const adminUrl = `${BASE_URL}/admin/reports/${reportId}`;
  const shareUrl = `${BASE_URL}/share/${reportId}`;

  await resend.emails.send({
    from: 'Shtudio Portal <notifications@shtudio.com.au>',
    to: 'alex@shtud.io',
    subject: `Report ready: ${reportTitle} – ${clientName}`,
    html: `
      <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 24px;">
          <img src="${BASE_URL}/logo.png" alt="Shtudio" style="height: 28px;" />
        </div>
        <h1 style="font-size: 22px; font-weight: 600; color: #1A1A2E; margin-bottom: 8px;">
          Report Ready
        </h1>
        <p style="font-size: 14px; color: #6B7280; line-height: 1.6; margin-bottom: 24px;">
          A new report has been processed and is ready for review.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #6B7280; width: 110px;">Client</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-size: 14px; font-weight: 600; color: #2D2D2D;">${clientName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #6B7280;">Report</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-size: 14px; font-weight: 600; color: #2D2D2D;">${reportTitle}</td>
          </tr>
        </table>
        <div style="display: flex; gap: 12px; margin-bottom: 32px;">
          <a href="${adminUrl}" style="display: inline-block; padding: 10px 20px; background: #F26522; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
            View in Admin
          </a>
          <a href="${shareUrl}" style="display: inline-block; padding: 10px 20px; background: #E2E8F0; color: #2D2D2D; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; margin-left: 12px;">
            Public Share Link
          </a>
        </div>
        <p style="font-size: 12px; color: #9CA3AF; margin-top: 32px; border-top: 1px solid #E2E8F0; padding-top: 16px;">
          This is an automated notification from Shtudio Portal.
        </p>
      </div>
    `,
  });
}
