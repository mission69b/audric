/**
 * SPEC 23B-W1 — BalanceCard variant tests.
 *
 * Covers:
 *   - default variant (the always-on standalone card the user gets when
 *     they ask "what's my balance?"): unchanged 3-5 col + holdings footer.
 *   - post-write variant (rendered by `<PostWriteRefreshSurface>` below a
 *     save / withdraw / swap+save receipt): 2-3 cols, no Total / Debt /
 *     DeFi-unavailable column, no holdings footer, no "Balance" title bar,
 *     tighter cell padding.
 *
 * Convention: per `ConfirmationChip.test.tsx`, this codebase does NOT
 * extend `@testing-library/jest-dom` matchers in `vitest.setup.ts`. Tests
 * use raw DOM API (`textContent`, `querySelector`) instead of
 * `toHaveTextContent` / `toBeInTheDocument`.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from './BalanceCard';

const baseData = {
  total: 100.26,
  available: 77.44,
  savings: 22.75,
  defi: 0,
  defiSource: 'blockvision' as const,
  debt: 0,
  holdings: [
    { symbol: 'SUI', balance: 19.8073, usdValue: 25.97 },
    { symbol: 'USDsui', balance: 22.8633, usdValue: 22.88 },
    { symbol: 'USDC', balance: 13.721, usdValue: 13.71 },
    { symbol: 'MANIFEST', balance: 3842.6252, usdValue: 4.89 },
  ],
};

describe('BalanceCard — default variant (standalone)', () => {
  it('renders Total + Wallet + Savings columns', () => {
    render(<BalanceCard data={baseData} />);
    const screenText = document.body.textContent ?? '';
    expect(screenText).toContain('Total');
    expect(screenText).toContain('Wallet');
    expect(screenText).toContain('Savings');
    expect(screenText).toContain('$100.26');
  });

  it('renders the "Balance" title bar', () => {
    render(<BalanceCard data={baseData} />);
    expect(document.body.textContent).toContain('Balance');
  });

  it('renders the holdings footer for tokens with usdValue >= $0.01', () => {
    render(<BalanceCard data={baseData} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('SUI');
    expect(text).toContain('USDsui');
    expect(text).toContain('USDC');
  });

  it('renders Debt column when debt > 0', () => {
    render(<BalanceCard data={{ ...baseData, debt: 12.5 }} />);
    expect(document.body.textContent).toContain('Debt');
    expect(document.body.textContent).toContain('$12.50');
  });

  it('renders DeFi "—" placeholder when source is degraded', () => {
    render(
      <BalanceCard
        data={{ ...baseData, defi: 0, defiSource: 'degraded' }}
      />,
    );
    expect(document.body.textContent).toContain('DeFi');
    expect(document.body.textContent).toContain('—');
  });

  it('renders the watched-address badge when isSelfQuery === false', () => {
    render(
      <BalanceCard
        data={{
          ...baseData,
          isSelfQuery: false,
          address:
            '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          suinsName: 'alex.sui',
        }}
      />,
    );
    // AddressBadge renders the SuiNS name when present. Confirms badge slot
    // is wired through CardShell's header chrome.
    expect(document.body.textContent).toContain('alex.sui');
  });

  it('renders DeFi cached suffix for partial-stale source with positive value', () => {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    render(
      <BalanceCard
        data={{
          ...baseData,
          defi: 18.5,
          defiSource: 'partial-stale',
          defiPricedAt: fiveMinAgo,
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('DeFi');
    expect(text).toContain('$18.50');
    // "5m" cached suffix — Math.round((Date.now() - fiveMinAgo) / 60_000)
    expect(text).toMatch(/\$18\.50\s·\s5m/);
  });
});

describe('BalanceCard — post-write variant', () => {
  it('omits the "Balance" title bar', () => {
    const { container } = render(
      <BalanceCard data={baseData} variant="post-write" />,
    );
    // The title chrome is the only element with `bg-surface-sunken` inside
    // the card; its absence proves CardShell skipped the header.
    expect(container.querySelector('.bg-surface-sunken')).toBeNull();
  });

  it('omits the Total column (the receipt above already shows the delta)', () => {
    const { container } = render(
      <BalanceCard data={baseData} variant="post-write" />,
    );
    // Look at column labels only — "Total" cannot appear inside the
    // value cells (the values are dollar-formatted), so any "Total" text
    // would be a leftover label.
    const cellLabels = Array.from(
      container.querySelectorAll('.text-fg-muted'),
    )
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    expect(cellLabels).not.toContain('Total');
  });

  it('omits the holdings footer', () => {
    render(<BalanceCard data={baseData} variant="post-write" />);
    // The holdings footer is the only place "MANIFEST" / "USDsui" etc.
    // appear in the DOM (the columns above show only USD values, not symbols).
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('MANIFEST');
    expect(text).not.toContain('USDsui');
  });

  it('omits the DeFi "—" placeholder for degraded source (post-write skips)', () => {
    const { container } = render(
      <BalanceCard
        data={{ ...baseData, defi: 0, defiSource: 'degraded' }}
        variant="post-write"
      />,
    );
    // No "DeFi" label cell when the value would be unknown.
    const cellLabels = Array.from(
      container.querySelectorAll('.text-fg-muted'),
    )
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    expect(cellLabels).not.toContain('DeFi');
  });

  it('renders the DeFi column when defi > 0 (real value, not placeholder)', () => {
    render(
      <BalanceCard
        data={{ ...baseData, defi: 18.5, defiSource: 'blockvision' }}
        variant="post-write"
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('DeFi');
    expect(text).toContain('$18.50');
  });

  it('renders Wallet + Savings columns with the actual values', () => {
    render(<BalanceCard data={baseData} variant="post-write" />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Wallet');
    expect(text).toContain('Savings');
    expect(text).toContain('$77.44');
    expect(text).toContain('$22.75');
  });

  it('uses tighter cell padding in post-write (px-2.5 py-1.5)', () => {
    const { container } = render(
      <BalanceCard data={baseData} variant="post-write" />,
    );
    expect(container.querySelector('.px-2\\.5')).not.toBeNull();
    expect(container.querySelector('.py-1\\.5')).not.toBeNull();
  });

  it('uses smaller value typography in post-write (text-[13px] vs text-[15px])', () => {
    const { container } = render(
      <BalanceCard data={baseData} variant="post-write" />,
    );
    // The value cells are the only `font-mono font-medium` elements inside
    // the card; verify they got the smaller size class.
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBeGreaterThan(0);
    valueCells.forEach((cell) => {
      expect(cell.className).toContain('text-[13px]');
      expect(cell.className).not.toContain('text-[15px]');
    });
  });

  it('still renders Debt when debt > 0 (preserves the warning signal even post-write)', () => {
    render(
      <BalanceCard
        data={{ ...baseData, debt: 50 }}
        variant="post-write"
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('Debt');
    expect(text).toContain('$50.00');
  });

  it('renders gracefully when the data is sparse (only available + savings)', () => {
    const sparse = { available: 100, savings: 50 };
    const { container } = render(
      <BalanceCard data={sparse} variant="post-write" />,
    );
    // Card still renders — at least 2 cells in the grid
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBe(2);
  });

  it('returns nothing weird when data has no priced columns (all undefined)', () => {
    const { container } = render(
      <BalanceCard data={{}} variant="post-write" />,
    );
    // Grid still renders (CardShell wrapper) but with 0 columns — this is
    // acceptable; the parent surface header already tells the user something
    // happened, and an empty card is preferable to a runtime crash.
    expect(container.firstChild).not.toBeNull();
  });

  it('still renders DeFi cached suffix for partial-stale source with positive value', () => {
    // post-write should NOT skip a real cached value — the partial-stale
    // suffix communicates real provenance, not a placeholder. Only the
    // `defi: 0 + non-blockvision` placeholder branch is skipped.
    const fiveMinAgo = Date.now() - 5 * 60_000;
    render(
      <BalanceCard
        data={{
          ...baseData,
          defi: 18.5,
          defiSource: 'partial-stale',
          defiPricedAt: fiveMinAgo,
        }}
        variant="post-write"
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('DeFi');
    expect(text).toContain('$18.50');
    expect(text).toMatch(/\$18\.50\s·\s5m/);
  });

  it('intentionally drops watched-address badge in post-write (documented limitation)', () => {
    // See CardShell `noHeader` JSDoc + the comment in BalanceCard above the
    // `badge` declaration. Production never hits this path (PWR clusters
    // only fire on the signed-in user's own wallet), but the test pins the
    // current behavior so a future change that wires watched-address PWR
    // doesn't silently lose the badge.
    render(
      <BalanceCard
        data={{
          ...baseData,
          isSelfQuery: false,
          address:
            '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          suinsName: 'alex.sui',
        }}
        variant="post-write"
      />,
    );
    expect(document.body.textContent).not.toContain('alex.sui');
  });
});

describe('CardShell — noHeader extension', () => {
  it('renders the title chrome by default (backward-compat for all 22 existing consumers)', async () => {
    const { CardShell } = await import('./primitives');
    const { container } = render(
      <CardShell title="MY CARD">
        <div>body</div>
      </CardShell>,
    );
    expect(container.querySelector('.bg-surface-sunken')).not.toBeNull();
    expect(document.body.textContent).toContain('MY CARD');
  });

  it('skips the title chrome entirely when noHeader is true', async () => {
    const { CardShell } = await import('./primitives');
    const { container } = render(
      <CardShell title="MY CARD" noHeader>
        <div>body</div>
      </CardShell>,
    );
    expect(container.querySelector('.bg-surface-sunken')).toBeNull();
    expect(document.body.textContent).not.toContain('MY CARD');
    expect(document.body.textContent).toContain('body');
  });

  it('noPadding still works alongside noHeader', async () => {
    const { CardShell } = await import('./primitives');
    const { container } = render(
      <CardShell title="X" noHeader noPadding>
        <div className="custom-body">body</div>
      </CardShell>,
    );
    // Without noPadding the body is wrapped in `px-3.5 py-2.5 text-xs` —
    // verify that wrapper is absent.
    expect(container.querySelector('.px-3\\.5')).toBeNull();
    expect(container.querySelector('.custom-body')).not.toBeNull();
  });
});

// Avoid eslint warning: `screen` import is intentional for parity with
// other test files even though current cases use `document.body` /
// container queries directly.
void screen;
