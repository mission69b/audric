'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

type ModalStep = 'input' | 'waiting' | 'verified';

interface EmailCaptureModalProps {
  open: boolean;
  onClose: () => void;
  address: string;
  jwt: string;
  initialEmail?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCaptureModal({ open, onClose, address, jwt, initialEmail }: EmailCaptureModalProps) {
  const [step, setStep] = useState<ModalStep>('input');
  const [email, setEmail] = useState(initialEmail ?? '');
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
        const res = await fetch(`/api/user/email?address=${address}`, {
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
        className="fixed inset-0 bg-fg-primary/30 backdrop-blur-[2px] z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="bg-surface-card border border-border-subtle rounded-lg shadow-[var(--shadow-modal)] max-w-md w-full p-7 space-y-5"
        >
          {step === 'input' && (
            <>
              <div className="space-y-2">
                <h2 className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
                  Verify your email to chat more.
                </h2>
                <p className="text-[13px] text-fg-secondary leading-relaxed">
                  Verified accounts get 20 chat sessions per day instead of 5. We use it to send you the verification link plus critical health-factor alerts only — no marketing, no daily emails.
                </p>
              </div>
              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Email address"
                  className="w-full rounded-sm border border-border-subtle bg-surface-page px-3.5 py-3 text-sm text-fg-primary placeholder:text-fg-muted outline-none focus:border-border-focus transition-colors"
                />
                {error && (
                  <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-error-solid">
                    {error}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSubmit}
                  loading={submitting}
                  className="w-full"
                >
                  {submitting ? 'Sending…' : 'Continue'}
                </Button>
                <button
                  onClick={onClose}
                  className="w-full font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition-colors py-2"
                >
                  Skip — I&apos;ll add this later
                </button>
              </div>
            </>
          )}

          {step === 'waiting' && (
            <>
              <div className="space-y-2">
                <h2 className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
                  Check your inbox.
                </h2>
                <p className="text-[13px] text-fg-secondary leading-relaxed">
                  We sent a verification link to{' '}
                  <span className="text-fg-primary font-medium">{email}</span>
                </p>
              </div>
              <div className="flex items-center justify-center gap-1.5 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-fg-secondary animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-fg-secondary animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-fg-secondary animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted text-center">
                Waiting for verification…
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary hover:text-fg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend email'}
                </button>
                <span className="text-fg-muted">·</span>
                <button
                  onClick={() => { setStep('input'); setEmail(''); }}
                  className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary hover:text-fg-primary transition-colors"
                >
                  Change email
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition-colors py-1"
              >
                Skip — I&apos;ll verify later
              </button>
            </>
          )}

          {step === 'verified' && (
            <>
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-success-bg flex items-center justify-center text-success-solid">
                  <Icon name="check" size={24} />
                </div>
                <h2 className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
                  Email verified.
                </h2>
                <p className="text-[13px] text-fg-secondary text-center leading-relaxed">
                  You now get 20 chat sessions per day. We&apos;ll only email you for critical health-factor alerts.
                </p>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={onClose}
                className="w-full"
              >
                Continue to dashboard
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
