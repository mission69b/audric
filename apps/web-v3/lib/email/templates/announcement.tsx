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

/** One-off launch announcement to existing users — founder-from. Points at the
 * "Introducing Audric" post and recaps what's shipped lately. Deliberately
 * shorter than the welcome (these users already have the product). */
const WHATS_NEW: [string, string][] = [
  [
    "Recipes",
    "pay-per-run flows over live data — markets, tickers, company deep-dives — from your own USDC",
  ],
  [
    "Private memory",
    "opt-in and encrypted; recalled only when relevant, yours to wipe anytime",
  ],
  [
    "Pro & Max plans",
    "every premium and frontier model, plus monthly credit that rolls over",
  ],
  ["USDC + USDsui sends", "free, instant, and gasless"],
];

export function AnnouncementEmail({ name }: { name?: string }) {
  return (
    <EmailLayout preview="The story behind Audric — plus what we've shipped lately.">
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
          Why we built Audric
        </Text>
        <Text
          style={{
            color: c.mut,
            fontSize: 15,
            lineHeight: 1.62,
            margin: "14px 0 0",
          }}
        >
          {name ? `${name}, we` : "We"} just published the story behind Audric —
          a private, multi-model AI with a wallet built in, where your data,
          your memory, and your money stay yours. It's a quick read on what
          we're building and how the privacy actually works.
        </Text>
        <Text
          style={{
            color: c.mut,
            fontSize: 14,
            lineHeight: 1.55,
            margin: "12px 0 0",
          }}
        >
          <Link
            href="https://audric.ai/blog/introducing-audric"
            style={{ color: c.sig, textDecoration: "none" }}
          >
            Read “Introducing Audric” →
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
          What's new since you joined
        </Text>
        {WHATS_NEW.map(([title, desc]) => (
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
          Open Audric
        </Button>
      </Section>

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
            href="https://cal.com/funkii/15min"
            style={{ color: c.sig, textDecoration: "none" }}
          >
            cal.com/funkii/15min
          </Link>
        </Text>
      </Section>
    </EmailLayout>
  );
}
