// [PHASE 13] Marketing — "Three steps to your money." section.
// 3-up bordered grid of numbered steps.

import { BorderedGrid } from './BorderedGrid';

const STEPS = [
  {
    num: '01',
    title: 'Sign in with Google',
    body:
      'No seed phrase. No wallet download. Your Audric Passport is ready in 3 seconds via zkLogin.',
  },
  {
    num: '02',
    title: 'Just say what you want',
    body:
      "Save $50, send to alice, what's my health factor? — Audric understands plain English. No menus, no forms.",
  },
  {
    num: '03',
    title: "Confirm, and it's done",
    body:
      "You see the action, amount, and impact. One tap to confirm — Audric pays the gas, signs the transaction, and shows the result.",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="how"
      className="px-8 py-20 border-t border-border-subtle bg-surface-card"
    >
      <div className="mx-auto max-w-[1120px]">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary mb-4">
          How it works
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-fg-primary max-w-[760px] mb-10">
          Three steps to your money.
        </h2>

        <BorderedGrid cols={3}>
          {STEPS.map((step) => (
            <div key={step.num} className="bg-surface-page p-7">
              <div className="font-serif font-medium text-[22px] text-fg-muted mb-16 tracking-[-0.02em]">
                {step.num}
              </div>
              <div className="text-[17px] font-semibold text-fg-primary mb-2">{step.title}</div>
              <p className="text-[14px] text-fg-secondary leading-relaxed">{step.body}</p>
            </div>
          ))}
        </BorderedGrid>
      </div>
    </section>
  );
}
