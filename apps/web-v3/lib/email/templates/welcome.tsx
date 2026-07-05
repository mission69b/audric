import {
  Button,
  Column,
  Hr,
  Img,
  Link,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { colors as c, EmailLayout } from "../components/layout";

/** Welcome email (L2) — sent once on first sign-in. Founder-from, faithful to the
 * emails.html L2 design: greeting → privacy framing → "everything you have today"
 * checklist → CTA → quiet Pro/Max upsell. */
const FEATURES: [string, string][] = [
  ["Free daily chat", "open, uncensored models that won't refuse you"],
  ["Web search, images + video", "built into every chat"],
  ["A non-custodial wallet", "send USDC anywhere, instant and gasless"],
  [
    "Private memory & chats",
    "encrypted on decentralized storage, yours to delete anytime",
  ],
  ["Live crypto + stock research", "real-time market data, right in chat"],
];

export function WelcomeEmail({ name }: { name?: string }) {
  return (
    <EmailLayout preview="Welcome to Audric — private, uncensored AI with a wallet built in.">
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
          {name ? `Welcome to Audric, ${name}.` : "Welcome to Audric."}
        </Text>
        <Text
          style={{
            color: c.mut,
            fontSize: 15,
            lineHeight: 1.62,
            margin: "14px 0 0",
          }}
        >
          Audric is privacy-first, uncensored AI with a wallet built in. Your
          chats are never training data, there are no ID checks, and your keys
          are always yours.
        </Text>
        <Text
          style={{
            color: c.mut,
            fontSize: 14,
            lineHeight: 1.55,
            margin: "12px 0 0",
          }}
        >
          New here?{" "}
          <Link
            href="https://audric.ai/blog/introducing-audric"
            style={{ color: c.sig, textDecoration: "none" }}
          >
            Read why we built Audric →
          </Link>
        </Text>
      </Section>

      <Section style={{ padding: "24px 32px 0" }}>
        <Text
          style={{
            color: c.fg,
            fontSize: 13,
            fontWeight: 600,
            margin: "0 0 4px",
          }}
        >
          Here's everything you have today
        </Text>
        {FEATURES.map(([title, desc]) => (
          <Text
            key={title}
            style={{
              color: c.fg,
              fontSize: 14,
              lineHeight: 1.45,
              margin: "12px 0 0",
            }}
          >
            <span style={{ color: c.sig, fontWeight: 700 }}>✓ </span>
            <strong style={{ fontWeight: 600 }}>{title}</strong>{" "}
            <span style={{ color: c.mut, fontWeight: 400 }}>— {desc}</span>
          </Text>
        ))}
      </Section>

      <Section style={{ padding: "28px 32px 0" }}>
        <Button
          href="https://audric.ai"
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
          Start chatting privately
        </Button>
      </Section>

      <Section style={{ padding: "20px 32px 0" }}>
        <Text
          style={{ color: c.dim, fontSize: 12, lineHeight: 1.55, margin: 0 }}
        >
          Ready for more? <strong style={{ color: c.mut }}>Pro $18/mo</strong> ·{" "}
          <strong style={{ color: c.mut }}>Max $100/mo</strong> unlock every
          frontier model, Confidential mode (runs in a secure enclave — provably
          private), and a monthly credit that rolls over.
        </Text>
      </Section>

      {/* Founder sign-off — pfp + name; "reply anytime" leverages the founder
          reply-to inbox (funkii@audric.ai). */}
      <Section style={{ padding: "28px 32px 0" }}>
        <Hr style={{ borderColor: c.eb, margin: "0 0 20px" }} />
        <Row>
          <Column style={{ width: 52, verticalAlign: "middle" }}>
            <Img
              alt="funkii"
              height={40}
              src="https://audric.ai/founder.png"
              style={{ borderRadius: 999, display: "block" }}
              width={40}
            />
          </Column>
          <Column style={{ verticalAlign: "middle" }}>
            <Text
              style={{ color: c.fg, fontSize: 14, fontWeight: 600, margin: 0 }}
            >
              funkii
            </Text>
            <Text style={{ color: c.mut, fontSize: 12, margin: "2px 0 0" }}>
              Founder, Audric
            </Text>
          </Column>
        </Row>
        <Text
          style={{
            color: c.mut,
            fontSize: 13,
            lineHeight: 1.55,
            margin: "14px 0 0",
          }}
        >
          Reply anytime — I read every email. Or grab 15 minutes:{" "}
          <Link
            href="https://audric.ai/call"
            style={{ color: c.sig, textDecoration: "none" }}
          >
            audric.ai/call
          </Link>
        </Text>
      </Section>
    </EmailLayout>
  );
}
