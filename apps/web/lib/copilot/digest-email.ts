// Email template for the Audric Copilot daily digest.
// Plain HTML string, no React/MJML — keeps the cron lightweight and avoids
// an extra build step. Style mirrors apps/web/app/api/internal/hf-alert
// so emails feel consistent across the product.

export interface DigestSuggestionRow {
  kind: "scheduled_action" | "copilot_suggestion";
  id: string;
  type: string;            // e.g. "swap", "save", "compound", "idle_action"
  title: string;           // headline shown in the row
  subtitle?: string;       // optional one-line context
  actionLabel: string;     // CTA button text — defaults to "Review →"
}

export interface DigestEmailContext {
  rows: DigestSuggestionRow[];
  totalPending: number;
  baseUrl: string;         // e.g. https://audric.ai
  unsubscribeUrl: string;
}

const COLORS = {
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  accent: "#111827",
  accentText: "#ffffff",
  card: "#ffffff",
  bg: "#fafafa",
};

function rowHtml(row: DigestSuggestionRow, baseUrl: string): string {
  const href = `${baseUrl}/copilot/confirm/${row.kind}/${row.id}`;
  const subtitle = row.subtitle
    ? `<div style="color:${COLORS.muted};font-size:13px;line-height:1.5;margin-top:4px;">${escapeHtml(row.subtitle)}</div>`
    : "";

  return `
    <tr>
      <td style="padding:16px;border-bottom:1px solid ${COLORS.border};">
        <div style="font-weight:600;color:${COLORS.text};font-size:15px;line-height:1.4;">
          ${escapeHtml(row.title)}
        </div>
        ${subtitle}
        <div style="margin-top:12px;">
          <a href="${href}" style="display:inline-block;background:${COLORS.accent};color:${COLORS.accentText};padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
            ${escapeHtml(row.actionLabel)}
          </a>
        </div>
      </td>
    </tr>
  `;
}

export function buildDigestSubject(totalPending: number): string {
  if (totalPending === 1) {
    return "1 suggestion from Audric Copilot";
  }
  return `${totalPending} suggestions from Audric Copilot`;
}

export function buildDigestHtml(ctx: DigestEmailContext): string {
  const rowsHtml = ctx.rows.map((r) => rowHtml(r, ctx.baseUrl)).join("");
  const headline =
    ctx.totalPending === 1
      ? "1 suggestion is waiting for your review."
      : `${ctx.totalPending} suggestions are waiting for your review.`;

  return `
    <div style="background:${COLORS.bg};padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:520px;width:100%;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:24px 24px 8px;">
            <div style="font-size:13px;color:${COLORS.muted};letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">
              Audric Copilot
            </div>
            <div style="margin-top:8px;font-size:18px;line-height:1.4;color:${COLORS.text};font-weight:600;">
              ${escapeHtml(headline)}
            </div>
            <div style="margin-top:6px;font-size:13px;color:${COLORS.muted};line-height:1.5;">
              Each one is a one-tap confirm — nothing happens without you.
            </div>
          </td>
        </tr>
        <tr><td style="padding:0 8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rowsHtml}</table></td></tr>
        <tr>
          <td style="padding:16px 24px 24px;">
            <a href="${ctx.baseUrl}/new" style="display:inline-block;font-size:13px;color:${COLORS.muted};text-decoration:underline;">
              View all in Audric →
            </a>
          </td>
        </tr>
      </table>
      <div style="text-align:center;margin-top:16px;font-size:12px;color:${COLORS.muted};line-height:1.5;">
        You're receiving this because Copilot digests are on.
        <br />
        <a href="${ctx.unsubscribeUrl}" style="color:${COLORS.muted};">Manage notifications</a>
      </div>
    </div>
  `;
}

// Minimal HTML-escape for user-facing strings (titles/subtitles).
// We never accept HTML from external sources here, but defense-in-depth.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
