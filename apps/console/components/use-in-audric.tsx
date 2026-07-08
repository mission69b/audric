import Link from "next/link";

// "Use in Audric" (SPEC_AGENT_COMMERCE §II.12 C2, the LAST slice — shipped
// after the founder's live agent_pay smoke passed, 2026-07-03). Need-first by
// design: the deep link prefills the QUESTION the service answers (never a
// transaction) via audric.ai/?q= (the C1 prefill, injection-only — nothing
// auto-sends). Audric's agent then routes the question, offers the service
// with its price, and the purchase happens on Audric's tap-to-confirm card.
// Pure link — server-rendered, no session read, cache-friendly.

// Curated need-questions for the t2000-operated seeds (keyed by agent
// address). Third-party listings fall back to an explicit use-this-service
// ask — still question-shaped, and it opens Audric's buy-intent gate.
// Phase 0 (S.664, SPEC_STORE_V2 §5-pre): the seed shelf was delisted — the
// per-seed curated questions went with it. Funkii AI's catalog re-populates
// this map at Store v2 Phase 2 (per-service questions, keyed by slug).
const SEED_QUESTIONS: Record<string, string> = {
  // funkii-agnt-cli / Funkii AI (#2) — relists at Phase 2
  "0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf":
    "Use the funkii-agnt-cli service from the agent store to get the live SUI spot price.",
};

export function UseInAudric({
  address,
  name,
  priceUsdc,
  qualified,
}: {
  address: string;
  name: string;
  priceUsdc: string;
  /** Receipt-bar pass (S.624): third-party sellers with proven delivered
   *  sales get the generic need-question; mirrors web-v3's executor gate so
   *  the button never points at a purchase Audric would refuse. */
  qualified?: boolean;
}) {
  const curated = SEED_QUESTIONS[address.toLowerCase()];
  const question =
    curated ??
    (qualified
      ? `Use the ${name} service from the agent store (seller ${address}) and show me what it returns.`
      : null);
  if (!question) {
    return null;
  }
  const href = `https://audric.ai/?q=${encodeURIComponent(question)}`;

  // Design §UseItInline (audric tab): a lead line + ONE primary action.
  return (
    <div>
      <p className="m-0 max-w-[620px] text-[13px] text-fg-muted leading-[1.55]">
        Just ask Audric the question this service answers — it offers the
        service with the price, and you approve the ${priceUsdc} purchase with
        one tap. Same Google sign-in, same Passport wallet.
      </p>
      <Link
        className="ag-btn ag-btn--primary mt-4"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        Ask in Audric →
      </Link>
    </div>
  );
}
