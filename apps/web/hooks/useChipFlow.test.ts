import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChipFlow } from './useChipFlow';

// Requires @testing-library/react — skip gracefully if not installed
describe.skipIf(!renderHook)('useChipFlow', () => {
  it('starts in idle phase', () => {
    const { result } = renderHook(() => useChipFlow());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.flow).toBeNull();
  });

  it('transitions to l2-chips on startFlow', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.flow).toBe('save');
    expect(result.current.state.message).toBeTruthy();
  });

  it('transitions to confirming on selectAmount', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    act(() => result.current.selectAmount(500));
    expect(result.current.state.phase).toBe('confirming');
    expect(result.current.state.amount).toBe(500);
  });

  it('transitions to executing on confirm', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('withdraw'));
    act(() => result.current.selectAmount(200));
    act(() => result.current.confirm());
    expect(result.current.state.phase).toBe('executing');
  });

  it('transitions to result on setResult', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('borrow'));
    act(() => result.current.selectAmount(100));
    act(() => result.current.confirm());
    act(() => result.current.setResult({ success: true, title: 'Borrowed $100', details: 'Done' }));
    expect(result.current.state.phase).toBe('result');
    expect(result.current.state.result?.success).toBe(true);
    expect(result.current.state.result?.title).toBe('Borrowed $100');
  });

  it('transitions to result on setError', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('repay'));
    act(() => result.current.selectAmount(50));
    act(() => result.current.confirm());
    act(() => result.current.setError('Insufficient funds'));
    expect(result.current.state.phase).toBe('result');
    expect(result.current.state.result?.success).toBe(false);
    expect(result.current.state.error).toBe('Insufficient funds');
  });

  it('resets to idle on reset', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    act(() => result.current.selectAmount(100));
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.flow).toBeNull();
    expect(result.current.state.amount).toBeNull();
  });

  it('handles send flow with recipient', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('send'));
    expect(result.current.state.flow).toBe('send');
    act(() => result.current.selectRecipient('0x1234abcd', 'Alice'));
    expect(result.current.state.recipient).toBe('0x1234abcd');
    expect(result.current.state.subFlow).toBe('Alice');
    act(() => result.current.selectAmount(25));
    expect(result.current.state.phase).toBe('confirming');
    expect(result.current.state.amount).toBe(25);
  });

  // [B1 polish F3] clearRecipient steps back from "send → amount" to
  // "send → recipient" — flow + phase stay intact (l2-chips), but
  // recipient + amount + subFlow are reset to null. The render layer
  // gates the recipient picker on `(phase === 'l2-chips' && flow ===
  // 'send' && !recipient)`, so this is enough to flip the visible
  // surface back. Without clearRecipient the user had to Cancel +
  // restart from idle to fix a typo on the recipient.
  it('clearRecipient steps back to recipient picker without dropping the flow', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('send'));
    act(() => result.current.selectRecipient('0x1234abcd', 'Alice'));
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.recipient).toBe('0x1234abcd');
    expect(result.current.state.subFlow).toBe('Alice');
    act(() => result.current.clearRecipient());
    expect(result.current.state.flow).toBe('send'); // flow preserved
    expect(result.current.state.phase).toBe('l2-chips'); // phase preserved
    expect(result.current.state.recipient).toBeNull();
    expect(result.current.state.amount).toBeNull();
    expect(result.current.state.subFlow).toBeNull();
    // After clearRecipient, the user can pick a fresh recipient and
    // proceed through the flow normally — verified by re-running the
    // sequence.
    act(() => result.current.selectRecipient('0xdeadbeef', 'Bob'));
    expect(result.current.state.recipient).toBe('0xdeadbeef');
    expect(result.current.state.subFlow).toBe('Bob');
  });

  it('can cancel at l2-chips and return to idle', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    expect(result.current.state.phase).toBe('l2-chips');
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
  });

  it('can cancel at confirming and return to idle', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    act(() => result.current.selectAmount(100));
    expect(result.current.state.phase).toBe('confirming');
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
  });

  it('startFlow with context generates message with balance info', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save', { cash: 500, savingsRate: 0.065 }));
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.message).toBeTruthy();
  });

  it('startFlow with protocol context sets protocol on state', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('borrow', { protocol: 'navi', maxBorrow: 500, savingsRate: 0.072 }));
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.flow).toBe('borrow');
    expect(result.current.state.protocol).toBe('navi');
    expect(result.current.state.message).toContain('borrow');
  });

  it('protocol field resets to null on reset', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save', { protocol: 'navi' }));
    expect(result.current.state.protocol).toBe('navi');
    act(() => result.current.reset());
    expect(result.current.state.protocol).toBeNull();
  });

  it('swap flow starts in l2-chips with swap message', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.flow).toBe('swap');
    expect(result.current.state.message).toContain('swap');
    expect(result.current.state.asset).toBeNull();
    expect(result.current.state.toAsset).toBeNull();
  });

  it('selectFromAsset sets asset and auto-target', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectFromAsset('SUI', 'USDC'));
    expect(result.current.state.asset).toBe('SUI');
    expect(result.current.state.toAsset).toBe('USDC');
    expect(result.current.state.message).toContain('SUI');
    expect(result.current.state.message).toContain('USDC');
  });

  it('selectFromAsset without auto-target leaves toAsset null', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectFromAsset('USDC'));
    expect(result.current.state.asset).toBe('USDC');
    expect(result.current.state.toAsset).toBeNull();
    expect(result.current.state.message).toContain('USDC');
  });

  it('selectToAsset sets target and updates message', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectFromAsset('USDC'));
    act(() => result.current.selectToAsset('ETH'));
    expect(result.current.state.toAsset).toBe('ETH');
    expect(result.current.state.message).toContain('ETH');
  });

  it('clearToAsset resets target and updates message', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectFromAsset('SUI', 'USDC'));
    expect(result.current.state.toAsset).toBe('USDC');
    act(() => result.current.clearToAsset());
    expect(result.current.state.toAsset).toBeNull();
    expect(result.current.state.message).toContain('SUI');
  });

  it('swap full flow: from -> to -> amount -> quote -> confirm -> result', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectFromAsset('USDT', 'USDC'));
    act(() => result.current.selectAmount(100));
    expect(result.current.state.phase).toBe('confirming');
    expect(result.current.state.amount).toBe(100);
    act(() => result.current.setQuote({ toAmount: 99.95, priceImpact: 0.0001, rate: '1 USDT = 0.9995 USDC' }));
    expect(result.current.state.quote).toBeTruthy();
    expect(result.current.state.quote!.toAmount).toBe(99.95);
    act(() => result.current.confirm());
    expect(result.current.state.phase).toBe('executing');
    act(() => result.current.setResult({ success: true, title: 'Swapped 100 USDT for 99.95 USDC', details: 'Done' }));
    expect(result.current.state.phase).toBe('result');
    expect(result.current.state.result?.success).toBe(true);
  });

  it('swap state resets fully on reset', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectFromAsset('ETH', 'USDC'));
    act(() => result.current.selectAmount(0.5));
    act(() => result.current.setQuote({ toAmount: 1700, priceImpact: 0.002, rate: '1 ETH = 3400 USDC' }));
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.asset).toBeNull();
    expect(result.current.state.toAsset).toBeNull();
    expect(result.current.state.quote).toBeNull();
    expect(result.current.state.amount).toBeNull();
  });

});
