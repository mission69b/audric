// ───────────────────────────────────────────────────────────────────────────
// F7 / SPEC 12 — Contact + SuiNS resolution inside multi-write Payment Stream
//
// Single-write `send_transfer` resolves contact names (and SuiNS) to on-chain
// addresses before invoking the SDK. Pre-fix, bundles silently skipped this
// step — the literal contact name (e.g. "funkii") flowed all the way to the
// PTB build and Enoki rejected the dry-run with a non-obvious
// `CommandArgumentError { arg_idx: 1, kind: ArgumentWithoutValue }`.
//
// These tests pin the symmetry: `executeBundleAction` MUST run the same
// resolution order as `executeToolAction`'s send_transfer branch — contact
// hashmap → SuiNS lookup → pass-through — and apply it to every send_transfer
// leg before composing the bundle.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { executeBundleAction } from '../executeToolAction';
import type { AgentActions, BundleStep } from '../useAgent';
import type { PendingAction } from '@t2000/engine';

function fakeAction(
  steps: Array<{ toolName: string; input: Record<string, unknown> }>,
): PendingAction {
  return {
    toolName: steps[0].toolName,
    toolUseId: 'tool-use-0',
    input: steps[0].input,
    description: 'Bundle',
    assistantContent: [],
    turnIndex: 0,
    attemptId: 'attempt-0',
    steps: steps.map((s, i) => ({
      toolName: s.toolName,
      toolUseId: `tool-use-${i + 1}`,
      attemptId: `attempt-${i + 1}`,
      input: s.input,
      description: `step ${i + 1}`,
    })),
  } as unknown as PendingAction;
}

function makeSdkSpy(): { sdk: AgentActions; calls: BundleStep[][] } {
  const calls: BundleStep[][] = [];
  const sdk = {
    executeBundle: vi.fn(async (steps: BundleStep[]) => {
      calls.push(steps);
      return { tx: '0xdeadbeef', balanceChanges: [] };
    }),
  } as unknown as AgentActions;
  return { sdk, calls };
}

describe('executeBundleAction — F7 contact + SuiNS resolution', () => {
  it('resolves a contact name in send_transfer.to before composing the bundle', async () => {
    const { sdk, calls } = makeSdkSpy();
    const action = fakeAction([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 2 } },
      { toolName: 'send_transfer', input: { to: 'funkii', amount: 1, asset: 'USDC' } },
    ]);

    const resolveContact = vi.fn((raw: string) =>
      raw === 'funkii' ? '0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62' : null,
    );

    const result = await executeBundleAction(sdk, action, { resolveContact });

    expect(result.success).toBe(true);
    expect(resolveContact).toHaveBeenCalledWith('funkii');
    expect(calls).toHaveLength(1);
    const sendStep = calls[0].find((s) => s.toolName === 'send_transfer');
    expect(sendStep?.input).toMatchObject({
      to: '0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62',
      amount: 1,
      asset: 'USDC',
    });
  });

  it('echoes the resolved address in stepResults (parity with single-write receipts)', async () => {
    const { sdk } = makeSdkSpy();
    const action = fakeAction([
      { toolName: 'send_transfer', input: { to: 'funkii', amount: 1, asset: 'USDC' } },
    ]);
    const resolveContact = (raw: string) =>
      raw === 'funkii' ? '0xfeedfeed' : null;

    const result = await executeBundleAction(sdk, action, { resolveContact });

    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].result).toMatchObject({
      success: true,
      tx: '0xdeadbeef',
      to: '0xfeedfeed',
      amount: 1,
      asset: 'USDC',
    });
  });

  it('passes through a literal 0x address unchanged when no contact matches', async () => {
    const { sdk, calls } = makeSdkSpy();
    const literalAddr = '0x' + '1'.repeat(64);
    const action = fakeAction([
      { toolName: 'send_transfer', input: { to: literalAddr, amount: 1, asset: 'USDC' } },
    ]);

    await executeBundleAction(sdk, action, {
      resolveContact: () => null,
    });

    const sendStep = calls[0][0];
    expect(sendStep.input).toMatchObject({ to: literalAddr });
  });

  it('calls resolveSuiNs for a *.sui name when no contact matches', async () => {
    const { sdk, calls } = makeSdkSpy();
    const action = fakeAction([
      { toolName: 'send_transfer', input: { to: 'alex.sui', amount: 1 } },
    ]);
    const resolveSuiNs = vi.fn(async (raw: string) =>
      raw === 'alex.sui' ? '0xabc123' : raw,
    );

    await executeBundleAction(sdk, action, {
      resolveContact: () => null,
      resolveSuiNs,
    });

    expect(resolveSuiNs).toHaveBeenCalledWith('alex.sui');
    expect(calls[0][0].input).toMatchObject({ to: '0xabc123' });
  });

  it('prefers contact match over SuiNS when both could apply', async () => {
    const { sdk, calls } = makeSdkSpy();
    const action = fakeAction([
      { toolName: 'send_transfer', input: { to: 'alex.sui', amount: 1 } },
    ]);
    const resolveContact = vi.fn(() => '0xcontactaddr');
    const resolveSuiNs = vi.fn(async () => '0xsuinsaddr');

    await executeBundleAction(sdk, action, { resolveContact, resolveSuiNs });

    expect(resolveContact).toHaveBeenCalled();
    expect(resolveSuiNs).not.toHaveBeenCalled();
    expect(calls[0][0].input).toMatchObject({ to: '0xcontactaddr' });
  });

  it('does not resolve `to` for non-send_transfer steps (swap_execute.to is a token symbol)', async () => {
    const { sdk, calls } = makeSdkSpy();
    const action = fakeAction([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 2 } },
      { toolName: 'save_deposit', input: { amount: 10, asset: 'USDC' } },
    ]);
    const resolveContact = vi.fn(() => '0xWRONG');

    await executeBundleAction(sdk, action, { resolveContact });

    expect(resolveContact).not.toHaveBeenCalled();
    expect(calls[0][0].input).toMatchObject({ to: 'SUI' });
  });

  it('propagates SuiNS resolution errors as a reverted bundle (mirrors single-write throw behavior)', async () => {
    const { sdk } = makeSdkSpy();
    const action = fakeAction([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 2 } },
      { toolName: 'send_transfer', input: { to: 'ghost.sui', amount: 1 } },
    ]);
    const resolveSuiNs = vi.fn(async () => {
      throw new Error('SuiNS name not registered: ghost.sui');
    });

    const result = await executeBundleAction(sdk, action, {
      resolveContact: () => null,
      resolveSuiNs,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ghost\.sui/);
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0].result).toMatchObject({
      success: false,
      _bundleReverted: true,
    });
  });

  it('works when no effects are passed (back-compat: pass-through behavior)', async () => {
    const { sdk, calls } = makeSdkSpy();
    const literalAddr = '0x' + 'a'.repeat(64);
    const action = fakeAction([
      { toolName: 'send_transfer', input: { to: literalAddr, amount: 1 } },
    ]);

    const result = await executeBundleAction(sdk, action);

    expect(result.success).toBe(true);
    expect(calls[0][0].input).toMatchObject({ to: literalAddr });
  });
});
