import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
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

// Light theme (email-safe + matches the X/marketing look; the emails.html
// data-theme="light" palette). Light renders far more consistently across email
// clients than a dark background.
export const colors = {
  page: "#f1f0ee",
  ebg: "#ffffff",
  ebd: "#eaeaea",
  fg: "#0A0A0A",
  mut: "#5b5b5b",
  faint: "#8a8a8a",
  dim: "#9b9b9b",
  sig: "#0A9683",
  eb: "#efefef",
  btnbg: "#0A0A0A",
  btnfg: "#ffffff",
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
            <Row>
              <Column style={{ width: 34, verticalAlign: "middle" }}>
                {/* Brand mark — transparent PNG (black mark on the light email
                    card; no tile, no gray box). 1024px source, rendered 26px. */}
                <Img
                  alt=""
                  height={26}
                  src="https://audric.ai/audric-mark.png"
                  style={{ display: "block" }}
                  width={26}
                />
              </Column>
              <Column style={{ verticalAlign: "middle" }}>
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
              </Column>
            </Row>
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
