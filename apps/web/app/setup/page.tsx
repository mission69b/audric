'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { useAllowanceStatus } from '@/hooks/useAllowanceStatus';
import { useBalance } from '@/hooks/useBalance';
import { Spinner } from '@/components/ui/Spinner';

const FEATURES = [
  {
    icon: '☀️',
    label: 'Morning briefing',
    cost: '$0.005/day',
    description: 'Your balance, yield, and one action item — every morning.',
    free: false,
    dailyCost: 0.005,
  },
  {
    icon: '📈',
    label: 'USDC rate alerts',
    cost: '$0.002/ea',
    description: 'Know when USDC savings rate moves.',
    free: false,
    dailyCost: 0.002,
  },
  {
    icon: '💸',
    label: 'Payment alerts',
    cost: '$0.001/ea',
    description: 'Instant notification when USDC arrives in your wallet.',
    free: false,
    dailyCost: 0.001,
  },
  {
    icon: '🛡️',
    label: 'Health factor alerts',
    cost: 'FREE',
    description: 'Always on. Liquidation warnings are a safety feature, not premium.',
    free: true,
    dailyCost: 0,
  },
];

const ESTIMATED_DAILY_COST = 0.008;

const BUDGET_PRESETS = [0.25, 0.5, 1.0];
const DEFAULT_BUDGET = 0.5;
const MIN_BUDGET = 0.1;

function estimateDuration(budget: number): number {
  return Math.floor(budget / ESTIMATED_DAILY_COST);
}

function estimateMonthlyCost(): string {
  return (ESTIMATED_DAILY_COST * 30).toFixed(2);
}

function yieldCoverageMultiple(savings: number, rate: number): number | null {
  if (savings <= 0 || rate <= 0) return null;
  const annualYield = savings * rate;
  const annualCost = ESTIMATED_DAILY_COST * 365;
  return Math.floor(annualYield / annualCost);
}

type ObjectChange = {
  type: string;
  objectType?: string;
  objectId?: string;
};

function extractAllowanceId(objectChanges: ObjectChange[]): string | null {
  const created = objectChanges.find(
    (c) => c.type === 'created' && c.objectType?.includes('::allowance::Allowance'),
  );
  return created?.objectId ?? null;
}

function ProgressBar({ step, totalSteps = 4 }: { step: number; totalSteps?: number }) {
  const progress = (step / totalSteps) * 100;
  return (
    <div className="h-1 w-full bg-border rounded-full overflow-hidden">
      <div
        className="h-full bg-foreground rounded-full transition-all duration-500 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function SetupContent() {
  const router = useRouter();
  const { address, session } = useZkLogin();
  const balanceQuery = useBalance(address);
  const allowanceStatus = useAllowanceStatus(address);

  const [flowType, setFlowType] = useState<'setup' | 'topup' | null>(null);
  const isTopUp = flowType === 'topup';

  const [step, setStep] = useState(1);

  useEffect(() => {
    if (allowanceStatus.loading || flowType !== null) return;
    if (allowanceStatus.allowanceId) {
      setFlowType('topup');
      setStep(3);
    } else {
      setFlowType('setup');
    }
  }, [allowanceStatus.loading, allowanceStatus.allowanceId, flowType]);

  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [customInput, setCustomInput] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileStyle, setProfileStyle] = useState<'conservative' | 'balanced' | 'growth' | null>(null);
  const [profileNotes, setProfileNotes] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const walletUsdc = balanceQuery.data?.usdc ?? 0;
  const savings = balanceQuery.data?.savings ?? 0;
  const savingsRate = balanceQuery.data?.savingsRate ?? 0;
  const coverage = yieldCoverageMultiple(savings, savingsRate);
  const duration = estimateDuration(budget);
  const insufficientBalance = walletUsdc < budget;

  const handleSkip = useCallback(() => {
    allowanceStatus.markSkipped();
    router.replace('/new');
  }, [allowanceStatus, router]);

  const handlePreset = useCallback((amount: number) => {
    setBudget(amount);
    setIsCustom(false);
    setCustomInput('');
    setError(null);
  }, []);

  const handleCustom = useCallback(() => {
    setIsCustom(true);
    setCustomInput(budget.toString());
  }, [budget]);

  const handleCustomChange = useCallback((value: string) => {
    setCustomInput(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num >= MIN_BUDGET) {
      setBudget(num);
      setError(null);
    }
  }, []);

  const handleApprove = useCallback(async () => {
    if (!address || !session) return;
    setExecuting(true);
    setError(null);

    try {
      const jwt = session.jwt;

      const prepareHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (jwt) prepareHeaders['x-zklogin-jwt'] = jwt;

      const { ZkLoginSigner } = await import('@t2000/sdk/browser');
      const { deserializeKeypair } = await import('@/lib/zklogin');
      const ephemeralKeypair = deserializeKeypair(session.ephemeralKeyPair);
      const signer = new ZkLoginSigner(
        ephemeralKeypair,
        session.proof,
        session.address,
        session.maxEpoch,
      );

      let targetAllowanceId = allowanceStatus.allowanceId;

      if (!targetAllowanceId) {
        // Create the allowance (first-time setup only)
        const createPrepare = await fetch('/api/transactions/prepare', {
          method: 'POST',
          headers: prepareHeaders,
          body: JSON.stringify({ type: 'allowance-create', address, amount: 0 }),
        });
        if (!createPrepare.ok) {
          const err = await createPrepare.json().catch(() => ({}));
          throw new Error((err as Record<string, string>).error ?? 'Failed to prepare allowance');
        }
        const { bytes: createBytes, digest: createDigest } = await createPrepare.json();

        const createTxBytes = Uint8Array.from(atob(createBytes), c => c.charCodeAt(0));
        const createSig = await signer.signTransaction(createTxBytes);

        const createExec = await fetch('/api/transactions/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digest: createDigest, signature: createSig.signature }),
        });
        if (!createExec.ok) {
          const err = await createExec.json().catch(() => ({}));
          throw new Error((err as Record<string, string>).error ?? 'Allowance creation failed');
        }
        const createResult = await createExec.json();
        targetAllowanceId = extractAllowanceId(createResult.objectChanges ?? []);
        if (!targetAllowanceId) {
          throw new Error('Could not find created allowance — please try again');
        }
      }

      // Deposit USDC into the allowance
      const depositPrepare = await fetch('/api/transactions/prepare', {
        method: 'POST',
        headers: prepareHeaders,
        body: JSON.stringify({
          type: 'allowance-deposit',
          address,
          amount: budget,
          allowanceId: targetAllowanceId,
        }),
      });
      if (!depositPrepare.ok) {
        const err = await depositPrepare.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).error ?? 'Failed to prepare deposit');
      }
      const { bytes: depositBytes, digest: depositDigest } = await depositPrepare.json();

      const depositTxBytes = Uint8Array.from(atob(depositBytes), c => c.charCodeAt(0));
      const depositSig = await signer.signTransaction(depositTxBytes);

      const depositExec = await fetch('/api/transactions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digest: depositDigest, signature: depositSig.signature }),
      });
      if (!depositExec.ok) {
        const err = await depositExec.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).error ?? 'Deposit failed');
      }

      // Save allowance ID to preferences
      allowanceStatus.setAllowanceId(targetAllowanceId);
      await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          limits: { allowanceId: targetAllowanceId, agentBudget: budget },
        }),
      }).catch(() => {});

      // Stamp ToS acceptance (first-time setup only, fire-and-forget)
      if (!isTopUp && tosAccepted) {
        fetch('/api/user/tos-accept', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session.jwt ? { 'x-zklogin-jwt': session.jwt } : {}),
          },
          body: JSON.stringify({ address }),
        }).catch(() => {});
      }

      // Both flows land on step 4 after approve.
      // Topup:    step 4 renders success  (condition: step === 4 && isTopUp)
      // Setup:    step 4 renders profile  (condition: step === 4 && !isTopUp)
      //           step 5 renders success  (condition: step === 5 && !isTopUp)
      setStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setExecuting(false);
    }
  }, [address, session, budget, allowanceStatus, isTopUp, tosAccepted]);

  const handleFinish = useCallback(() => {
    router.replace('/new');
  }, [router]);

  const handleSaveProfile = useCallback(async () => {
    if (!address || !profileStyle) { setStep(5); return; }
    setSavingProfile(true);
    await fetch('/api/user/financial-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, style: profileStyle, notes: profileNotes }),
    }).catch(() => {});
    setSavingProfile(false);
    setStep(5);
  }, [address, profileStyle, profileNotes]);

  const totalSteps = isTopUp ? 4 : 5;

  return (
    <main className="flex flex-col min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-lg px-6 pt-8 pb-12 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
            Step {step} of {totalSteps}
          </span>
          {step === 1 && (
            <button
              onClick={handleSkip}
              className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition"
            >
              Skip
            </button>
          )}
          {step === 2 && !executing && (
            <button
              onClick={() => { setStep(1); setError(null); }}
              className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition"
            >
              Back
            </button>
          )}
          {step === 3 && !executing && (
            <button
              onClick={() => {
                if (isTopUp) { router.replace('/settings'); }
                else { setStep(2); setError(null); }
              }}
              className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition"
            >
              {isTopUp ? 'Cancel' : 'Back'}
            </button>
          )}
          {step === 4 && !isTopUp && !savingProfile && (
            <button
              onClick={() => setStep(5)}
              className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition"
            >
              Skip
            </button>
          )}
        </div>

        <ProgressBar step={step} totalSteps={totalSteps} />

        <div className="flex-1 flex flex-col justify-center mt-8">
          {/* Step 1 — Value prop */}
          {step === 1 && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl text-foreground leading-tight">
                  Audric can watch your money while you sleep.
                </h1>
              </div>

              <div className="space-y-1">
                {FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-start justify-between py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-start gap-3 flex-1 mr-4">
                      <span className="text-lg leading-none mt-0.5">{f.icon}</span>
                      <div>
                        <span className="text-sm text-foreground font-medium">{f.label}</span>
                        <p className="text-xs text-muted mt-0.5 leading-relaxed">{f.description}</p>
                      </div>
                    </div>
                    <span className={`font-mono text-[10px] tracking-wider uppercase whitespace-nowrap mt-1 ${
                      f.free ? 'text-success' : 'text-muted'
                    }`}>
                      {f.cost}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full rounded-lg bg-foreground py-3.5 text-sm font-medium text-background tracking-[0.05em] uppercase transition hover:opacity-90 active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2 — Education */}
          {step === 2 && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl text-foreground leading-tight">
                  You set a spending cap.
                </h1>
                <h2 className="font-display text-2xl text-muted leading-tight">
                  Audric never exceeds it.
                </h2>
              </div>

              <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
                <p className="text-sm text-foreground leading-relaxed">
                  Your USDC sits in a spending cap you control. Audric deducts tiny amounts only
                  for features you turn on. Withdraw the rest any time — it never leaves your control.
                </p>

                <div className="space-y-2.5">
                  {[
                    'Not a subscription',
                    'Withdraw remaining balance any time in Settings',
                    'Toggle features on/off instantly',
                    coverage
                      ? `Yield on $${Math.floor(savings).toLocaleString()} savings covers costs ${coverage}x over`
                      : 'Yield on savings covers costs many times over',
                  ].map((text) => (
                    <div key={text} className="flex items-start gap-2.5">
                      <span className="text-success text-xs mt-0.5">✓</span>
                      <span className="text-sm text-muted leading-relaxed">{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep(3)}
                className="w-full rounded-lg bg-foreground py-3.5 text-sm font-medium text-background tracking-[0.05em] uppercase transition hover:opacity-90 active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 3 — Budget */}
          {step === 3 && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl text-foreground leading-tight">
                  {isTopUp ? 'Top up your budget.' : 'Set your features budget.'}
                </h1>
              </div>

              {/* Amount display */}
              <div className="flex justify-center">
                {isCustom ? (
                  <div className="flex items-center gap-1">
                    <span className="text-3xl font-display text-foreground">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min={MIN_BUDGET}
                      value={customInput}
                      onChange={(e) => handleCustomChange(e.target.value)}
                      autoFocus
                      className="text-3xl font-display text-foreground bg-transparent border-b-2 border-foreground outline-none w-24 text-center"
                    />
                  </div>
                ) : (
                  <span className="text-4xl font-display text-foreground">
                    ${budget.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Preset chips */}
              <div className="flex justify-center gap-2">
                {BUDGET_PRESETS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => handlePreset(amount)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      !isCustom && budget === amount
                        ? 'bg-foreground text-background'
                        : 'border border-border text-muted hover:text-foreground hover:border-border-bright'
                    }`}
                  >
                    ${amount.toFixed(2)}
                  </button>
                ))}
                <button
                  onClick={handleCustom}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isCustom
                      ? 'bg-foreground text-background'
                      : 'border border-border text-muted hover:text-foreground hover:border-border-bright'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Estimates */}
              <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                <EstimateRow label="Daily cost" value={`~$${ESTIMATED_DAILY_COST.toFixed(3)}`} />
                <EstimateRow label="Monthly cost" value={`~$${estimateMonthlyCost()}`} />
                <EstimateRow label="Lasts" value={`~${duration} days`} />
                {coverage && coverage > 1 && (
                  <p className="text-xs text-muted pt-1 leading-relaxed">
                    Your yield on ${Math.floor(savings).toLocaleString()} savings covers this {coverage}x over.
                  </p>
                )}
              </div>

              {/* Insufficient balance warning */}
              {insufficientBalance && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
                  <p className="text-sm text-foreground leading-relaxed">
                    Your wallet has <span className="font-medium">${walletUsdc.toFixed(2)} USDC</span>.
                    {walletUsdc < MIN_BUDGET
                      ? ' Send at least $0.10 USDC to get started.'
                      : ` Choose a smaller budget or add more USDC.`}
                  </p>
                  {address && (
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] text-muted font-mono bg-surface-bright rounded px-2 py-1 truncate flex-1">
                        {address}
                      </code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(address); }}
                        className="text-[10px] text-muted hover:text-foreground font-mono uppercase tracking-wider shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Error message */}
              {error && (
                <p className="text-sm text-error text-center">{error}</p>
              )}

              {/* ToS consent (first-time setup only) */}
              {!isTopUp && (
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={tosAccepted}
                    onChange={(e) => setTosAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-foreground cursor-pointer"
                  />
                  <span className="text-xs text-muted leading-relaxed group-hover:text-foreground transition">
                    I agree to the{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline underline-offset-2 hover:opacity-70"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Terms of Service
                    </a>
                    , including fees and the allowance model.
                  </span>
                </label>
              )}

              {/* Approve button */}
              <div className="space-y-3">
                <button
                  onClick={handleApprove}
                  disabled={executing || budget < MIN_BUDGET || insufficientBalance || (!isTopUp && !tosAccepted)}
                  className="w-full rounded-lg bg-foreground py-3.5 text-sm font-medium text-background tracking-[0.05em] uppercase transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {executing ? (
                    <>
                      <Spinner size="sm" className="border-background border-t-background/30" />
                      {isTopUp ? 'Depositing...' : 'Approving...'}
                    </>
                  ) : (
                    isTopUp ? `Top up $${budget.toFixed(2)}` : `Approve $${budget.toFixed(2)}`
                  )}
                </button>
                <p className="text-xs text-muted text-center leading-relaxed">
                  {insufficientBalance
                    ? 'Send USDC to your wallet address above, then refresh.'
                    : 'This approves a one-time transfer from your wallet. You can withdraw the remaining balance at any time.'}
                </p>
                {insufficientBalance && !isTopUp && (
                  <button
                    onClick={handleSkip}
                    className="w-full text-center font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition py-2"
                  >
                    Skip for now
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 4 — Optional financial profile (first-time setup only) */}
          {step === 4 && !isTopUp && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl text-foreground leading-tight">
                  How do you think about money?
                </h1>
                <p className="text-sm text-muted mt-2 leading-relaxed">
                  Helps Audric tailor advice from day one. You can skip and update this later in Settings.
                </p>
              </div>

              {/* Style picker */}
              <div className="space-y-2">
                {(
                  [
                    {
                      value: 'conservative' as const,
                      label: 'Conservative',
                      description: 'Stability first — low risk, steady yield, no surprises.',
                    },
                    {
                      value: 'balanced' as const,
                      label: 'Balanced',
                      description: 'Mix of yield optimisation and measured risk.',
                    },
                    {
                      value: 'growth' as const,
                      label: 'Growth',
                      description: 'Maximise returns — comfortable with DeFi volatility.',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setProfileStyle(opt.value)}
                    className={`w-full rounded-lg border p-4 text-left transition ${
                      profileStyle === opt.value
                        ? 'border-foreground bg-surface'
                        : 'border-border bg-surface hover:border-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 transition ${
                          profileStyle === opt.value
                            ? 'border-foreground bg-foreground'
                            : 'border-muted bg-transparent'
                        }`}
                      />
                      <div>
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                        <p className="text-xs text-muted mt-0.5 leading-relaxed">{opt.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Notes field */}
              <div className="space-y-2">
                <label className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
                  Anything else? <span className="text-dim normal-case tracking-normal font-sans">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. saving for a house, building a 6-month emergency fund, exploring DeFi for the first time..."
                  value={profileNotes}
                  onChange={(e) => setProfileNotes(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-dim resize-none outline-none focus:border-foreground/30 transition leading-relaxed"
                />
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile || !profileStyle}
                  className="w-full rounded-lg bg-foreground py-3.5 text-sm font-medium text-background tracking-[0.05em] uppercase transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save & Continue'}
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="w-full text-center font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition py-2"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Step 5 — Success (non-topup) / Step 4 — Success (topup) */}
          {((step === 5 && !isTopUp) || (step === 4 && isTopUp)) && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl text-foreground leading-tight">
                  {isTopUp ? 'Budget topped up.' : 'You\u2019re all set.'}
                </h1>
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                <EstimateRow label="Features budget" value={`$${budget.toFixed(2)}`} />
                <EstimateRow label="Features enabled" value="3" />
                <EstimateRow label="First briefing" value="Tomorrow 8am" />
                <EstimateRow label="Estimated duration" value={`~${duration} days`} />
              </div>

              {/* Feature toggles */}
              <div className="space-y-1">
                {FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{f.icon}</span>
                      <span className="text-sm text-foreground font-medium">{f.label}</span>
                    </div>
                    <span className={`font-mono text-[10px] tracking-wider uppercase ${
                      f.free ? 'text-muted' : 'text-foreground'
                    }`}>
                      {f.free ? 'Always on' : 'ON'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleFinish}
                  className="w-full rounded-lg bg-foreground py-3.5 text-sm font-medium text-background tracking-[0.05em] uppercase transition hover:opacity-90 active:scale-[0.98]"
                >
                  Start using Audric
                </button>
                <p className="text-xs text-muted text-center">
                  Manage anytime in Settings &gt; Features.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function EstimateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  );
}

export default function SetupPage() {
  return (
    <AuthGuard>
      <SetupContent />
    </AuthGuard>
  );
}
