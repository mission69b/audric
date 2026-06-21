import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Shared Audric email shell (React Email — styles auto-inline for email clients;
 * the source HTML's CSS-vars + <style> block don't survive Gmail, so we inline
 * the resolved DARK-theme values here). Geist-dark palette to match the brand.
 * Footer carries the t2000 operating-entity line (CAN-SPAM/GDPR) — product brand
 * forward, parent entity in the fine print (Anthropic > Claude model).
 */

export const colors = {
  page: "#e6e6e6",
  ebg: "#0A0A0A",
  ebd: "#1f1f1f",
  fg: "#EDEDED",
  mut: "#9b9b9b",
  faint: "#777",
  dim: "#5f5f5f",
  sig: "#0AC7B4",
  eb: "#1f1f1f",
  btnbg: "#EDEDED",
  btnfg: "#0A0A0A",
} as const;

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          backgroundColor: colors.page,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          padding: "40px 16px",
        }}
      >
        <Container
          style={{
            maxWidth: 600,
            margin: "0 auto",
            backgroundColor: colors.ebg,
            borderRadius: 12,
            overflow: "hidden",
            border: `1px solid ${colors.ebd}`,
          }}
        >
          <Section style={{ padding: "28px 32px 0" }}>
            <Text
              style={{
                margin: 0,
                color: colors.fg,
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: "-0.022em",
              }}
            >
              audric
            </Text>
          </Section>

          {children}

          <Section
            style={{
              padding: "28px 32px 30px",
              marginTop: 28,
              borderTop: `1px solid ${colors.eb}`,
            }}
          >
            <Text
              style={{
                color: colors.dim,
                fontSize: 12,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Your keys stay on your device — Audric can never move your funds.
            </Text>
            <Text
              style={{
                color: colors.dim,
                fontSize: 12,
                lineHeight: 1.6,
                margin: "10px 0 0",
              }}
            >
              Audric is operated by T2000 AFI Inc.
            </Text>
            <Text style={{ margin: "12px 0 0", fontSize: 12 }}>
              <Link
                href="https://audric.ai"
                style={{ color: colors.mut, textDecoration: "none" }}
              >
                audric.ai
              </Link>
              {"   ·   "}
              <Link
                href="https://audric.ai/privacy"
                style={{ color: colors.mut, textDecoration: "none" }}
              >
                Privacy
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
