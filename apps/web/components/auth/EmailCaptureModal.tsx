'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ModalStep = 'input' | 'waiting' | 'verified';

interface EmailCaptureModalProps {
  open: boolean;
  onClose: () => void;
  address: string;
  jwt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCaptureModal({ open, onClose, address, jwt }: EmailCaptureModalProps) {
  const [step, setStep] = useState<ModalStep>('input');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && step === 'input') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, step]);

  useEffect(() => {
    if (step !== 'waiting') return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/user/email-status?address=${address}`, {
          headers: { 'x-zklogin-jwt': jwt },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.emailVerified) {
            setStep('verified');
            clearInterval(pollRef.current);
          }
        }
      } catch {
        // keep polling
      }
    }, 3000);

    return () => clearInterval(pollRef.current);
  }, [step, address, jwt]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSubmit = useCallback(async () => {
    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/user/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-zklogin-jwt': jwt },
        body: JSON.stringify({ address, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Something went wrong');
        return;
      }
      setStep('waiting');
      setResendCooldown(60);
    } catch {
      setError('Network error — try again');
    } finally {
      setSubmitting(false);
    }
  }, [email, address, jwt]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(60);
    try {
      await fetch('/api/user/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-zklogin-jwt': jwt },
        body: JSON.stringify({ address, email }),
      });
    } catch {
      // best effort
    }
  }, [resendCooldown, address, email, jwt]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="bg-background border border-border rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4"
        >
          {step === 'input' && (
            <>
              <h2 className="text-lg font-semibold">
                Get a morning briefing of your finances.
              </h2>
              <p className="text-sm text-muted leading-relaxed">
                Audric sends a daily summary of your balance, yield earned, and one action
                item — straight to your inbox.
              </p>
              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Email address"
                  className="w-full rounded-lg border border-border bg-surface/50 px-4 py-3 text-sm text-foreground placeholder:text-dim outline-none focus:border-foreground transition"
                />
                {error && <p className="text-xs text-error">{error}</p>}
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-lg bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-80 disabled:opacity-50"
              >
                {submitting ? 'Sending...' : 'Continue'}
              </button>
              <button
                onClick={onClose}
                className="w-full text-sm text-muted hover:text-foreground transition py-1"
              >
                Skip — I&apos;ll add this later
              </button>
            </>
          )}

          {step === 'waiting' && (
            <>
              <h2 className="text-lg font-semibold">Check your inbox.</h2>
              <p className="text-sm text-muted leading-relaxed">
                We sent a verification link to{' '}
                <span className="text-foreground font-medium">{email}</span>
              </p>
              <div className="flex items-center justify-center gap-1 py-4">
                <span className="h-2 w-2 rounded-full bg-foreground animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-foreground animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-foreground animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="text-xs text-dim text-center">Waiting for verification...</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-sm text-muted hover:text-foreground transition disabled:opacity-40"
                >
                  {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend email'}
                </button>
                <span className="text-dim">·</span>
                <button
                  onClick={() => { setStep('input'); setEmail(''); }}
                  className="text-sm text-muted hover:text-foreground transition"
                >
                  Change email
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full text-sm text-muted hover:text-foreground transition py-1 pt-2"
              >
                Skip — I&apos;ll verify later
              </button>
            </>
          )}

          {step === 'verified' && (
            <>
              <div className="text-center">
                <div className="text-3xl mb-2">✓</div>
                <h2 className="text-lg font-semibold">Email verified.</h2>
              </div>
              <p className="text-sm text-muted text-center leading-relaxed">
                You&apos;ll receive your first morning briefing tomorrow at 8am.
              </p>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-80"
              >
                Continue to dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
