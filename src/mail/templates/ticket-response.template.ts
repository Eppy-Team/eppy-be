export function ticketResponseTemplate(data: {
  userName: string;
  ticketTitle: string;
  ticketStatus: string;
  adminResponse: string;
  ticketId: string;
}): string {
  const statusColor: Record<string, string> = {
    RESOLVED: '#16a34a',
    ON_PROGRESS: '#d97706',
    OPEN: '#2563eb',
  };

  const statusLabel: Record<string, string> = {
    RESOLVED: 'Resolved',
    ON_PROGRESS: 'On Progress',
    OPEN: 'Open',
  };

  const color = statusColor[data.ticketStatus] ?? '#6b7280';
  const label = statusLabel[data.ticketStatus] ?? data.ticketStatus;

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Respons Tiket Eppy</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1d4ed8;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">
                Eppy Helpdesk
              </h1>
              <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">
                Smart Helpdesk Chatbot — PT Epson Indonesia
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;color:#374151;font-size:16px;">
                Halo, <strong>${data.userName}</strong>
              </p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
                Tim support kami telah memberikan respons terhadap tiket Anda. Berikut detailnya:
              </p>

              <!-- Ticket Info Card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">
                      Judul Tiket
                    </p>
                    <p style="margin:0 0 16px;color:#111827;font-size:15px;font-weight:600;">
                      ${data.ticketTitle}
                    </p>

                    <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">
                      Status
                    </p>
                    <span style="display:inline-block;background-color:${color};color:#ffffff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;margin-bottom:16px;">
                      ${label}
                    </span>

                    <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">
                      ID Tiket
                    </p>
                    <p style="margin:0;color:#6b7280;font-size:13px;font-family:monospace;">
                      ${data.ticketId}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Admin Response -->
              <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600;">
                Respons dari Tim Support:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#eff6ff;border-left:4px solid #1d4ed8;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#1e3a8a;font-size:14px;line-height:1.7;">
                      ${data.adminResponse}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                Email ini dikirim otomatis oleh sistem Eppy
              </p>
              <p style="margin:6px 0 0;color:#d1d5db;font-size:11px;">
                © 2026 Eppy — PT Epson Indonesia
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
