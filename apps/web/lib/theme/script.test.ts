import { describe, it, expect } from 'vitest';
import { getThemeScript } from './script';

describe('getThemeScript — script-tag-safety (SPEC 30 Phase 1B fix for js/bad-code-sanitization)', () => {
  const script = getThemeScript();

  it('produces a valid IIFE that wraps the body', () => {
    expect(script).toMatch(/^\(function\(\)\{/);
    expect(script).toMatch(/\}\)\(\);$/);
  });

  it('does NOT contain a literal `</script>` token (would close the wrapping script tag)', () => {
    // Even if a future PUBLIC_PATH contained `</script>` literally, the
    // escapeForScript helper rewrites `<` to `\u003c` so the byte sequence
    // never appears in the rendered output. This is the structural CodeQL
    // fix for `js/bad-code-sanitization`.
    expect(script.includes('</script>')).toBe(false);
  });

  it('does NOT contain U+2028 / U+2029 (JS line terminators that break inline scripts in legacy browsers)', () => {
    expect(script.includes('\u2028')).toBe(false);
    expect(script.includes('\u2029')).toBe(false);
  });

  it('contains the escaped sequences for paths the runtime will JSON.parse back at execute time', () => {
    // Spot-check that at least one PUBLIC_PATH made it into the output
    // through the escape transform — the array isn't empty, so absence
    // would indicate the escape broke serialisation entirely.
    expect(script).toMatch(/"\/(litepaper|privacy|terms|disclaimer|security)"/);
  });
});
