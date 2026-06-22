import { Button, Section, Text } from "@react-email/components";
import { colors as c, EmailLayout } from "../components/layout";

/** Low-credit warning (transactional, from notifications@). Sent at most once per
 * window when the credit balance drops below the threshold (Stripe doesn't know
 * about the USDC credit ledger, so this is the one custom billing email). */
export function LowCreditEmail({ balanceUsd }: { balanceUsd: string }) {
  return (
    <EmailLayout
      preview={`You're running low on Audric credit — ${balanceUsd} left.`}
    >
      <Section style={{ padding: "22px 32px 0" }}>
        <Text
          style={{
            color: c.fg,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.18,
            margin: 0,
          }}
        >
          You're running low on credit.
        </Text>
        <Text
          style={{
            color: c.mut,
            fontSize: 15,
            lineHeight: 1.62,
            margin: "14px 0 0",
          }}
        >
          Your Audric credit is down to{" "}
          <strong style={{ color: c.fg }}>{balanceUsd}</strong>. Top up to keep
          using premium models — the free model (Kimi) always stays on, no
          credit needed.
        </Text>
      </Section>

      <Section style={{ padding: "28px 32px 0" }}>
        <Button
          href="https://audric.ai/settings/billing"
          style={{
            backgroundColor: c.btnbg,
            color: c.btnfg,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.011em",
            padding: "13px 24px",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Top up credit
        </Button>
      </Section>

      <Section style={{ padding: "20px 32px 0" }}>
        <Text
          style={{ color: c.dim, fontSize: 12, lineHeight: 1.55, margin: 0 }}
        >
          Prefer hands-off? Turn on auto-recharge in Billing and we'll top up
          automatically when you run low.
        </Text>
      </Section>
    </EmailLayout>
  );
}
