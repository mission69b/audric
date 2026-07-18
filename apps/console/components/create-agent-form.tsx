"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import {
  type DraftOffering,
  LAUNCH_STEPS,
  type LaunchStep,
  launchAgent,
  slugifyOffering,
} from "@/lib/launch-agent";

// Create Agent — the composition moment (t2 ACP Phase 2, SPEC_ACP_SUI §5.1).
// ONE form: identity → wallet (already connected) → Agent ID (sponsored mint)
// → offerings (0–n, or set up anytime) → Token (Phase 3 stub, visible but
// disabled) → one Launch Agent button. The Passport IS the agent (self-agent,
// §II.15a) — no key material is ever minted in the browser (S.705 stands).

const CATEGORIES: [string, string][] = [
  ["ai-models", "AI models"],
  ["data-feeds", "Data feeds"],
  ["finance", "Finance"],
  ["research", "Research"],
  ["dev-tools", "Dev tools"],
  ["creative", "Creative"],
  ["other", "Other"],
];

const SLA_CHOICES: [string, number][] = [
  ["1 hour", 60],
  ["6 hours", 360],
  ["24 hours", 1440],
  ["3 days", 4320],
  ["7 days", 10_080],
];

function short(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

// Mirror the /api/agent/profile caps — the launch pipeline mints the Agent ID
// BEFORE the profile write, so anything the server would reject must be
// caught here or a failed launch strands a bare, nameless ID on-chain.
const MAX_NAME = 80;
const MAX_DESC = 600;

function validHttpsUrl(url: string): boolean {
  if (url.length > 512) {
    return false;
  }
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

type FieldErrors = { name?: string; description?: string; imageUrl?: string };

function validateIdentity(i: {
  name: string;
  description: string;
  imageUrl: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const name = i.name.trim();
  if (name.length < 2) {
    errors.name = "Give your agent a name (at least 2 characters).";
  } else if (name.length > MAX_NAME) {
    errors.name = `Name is too long (max ${MAX_NAME} characters).`;
  }
  const description = i.description.trim();
  if (description.length === 0) {
    errors.description =
      "Say what this agent does — buyers see it on your profile.";
  } else if (description.length > MAX_DESC) {
    errors.description = `Description is too long (max ${MAX_DESC} characters).`;
  }
  const imageUrl = i.imageUrl.trim();
  if (imageUrl && !validHttpsUrl(imageUrl)) {
    errors.imageUrl = "Avatar must be a valid https:// URL.";
  }
  return errors;
}

function formatSla(minutes: number): string {
  if (minutes % 1440 === 0) {
    return `${minutes / 1440}d`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, rendered inside the label
    <label className="grid gap-[7px]">
      <span className="font-medium text-[12.5px] text-foreground">
        {label}
        {hint && (
          <span className="ml-2 font-normal text-[11.5px] text-fg-subtle">
            {hint}
          </span>
        )}
      </span>
      {children}
      {error && <span className="text-[12px] text-destructive">{error}</span>}
    </label>
  );
}

function Section({
  step,
  title,
  status,
  children,
}: {
  step: string;
  title: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ag-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] text-fg-subtle">{step}</span>
          <h2 className="m-0 font-semibold text-[15px] text-foreground">
            {title}
          </h2>
        </div>
        {status}
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function Ready({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-500">
      <Check className="size-3.5" />
      {children}
    </span>
  );
}

function OfferingDraftForm({
  existingSlugs,
  onAdd,
  onCancel,
}: {
  existingSlugs: string[];
  onAdd: (o: DraftOffering) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("5");
  const [sla, setSla] = useState(1440);
  const [description, setDescription] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [requirements, setRequirements] = useState("");
  const [error, setError] = useState("");

  function add() {
    // Mirror the server validator (parseOfferingUpsert) — a draft that would
    // 400 at launch time must be rejected here, at add time.
    const priceUsdc = Number.parseFloat(price);
    if (!name.trim()) {
      setError("Give the service a name.");
      return;
    }
    if (slugifyOffering(name).length < 2) {
      setError("The name needs at least 2 letters or numbers.");
      return;
    }
    if (existingSlugs.includes(slugifyOffering(name))) {
      setError("You already added a service with this name.");
      return;
    }
    if (!Number.isFinite(priceUsdc) || priceUsdc < 0.01 || priceUsdc > 50) {
      setError("Price must be between $0.01 and $50.");
      return;
    }
    if (!description.trim()) {
      setError("Describe the service — buyers see it on the listing.");
      return;
    }
    if (!deliverable.trim()) {
      setError("Say what the buyer receives.");
      return;
    }
    let req: unknown = null;
    const trimmed = requirements.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        req =
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
            ? parsed
            : trimmed;
      } catch {
        req = trimmed;
      }
    }
    onAdd({
      name: name.trim(),
      priceUsdc,
      slaMinutes: sla,
      description: description.trim(),
      deliverable: deliverable.trim(),
      requirements: req,
    });
  }

  return (
    <div
      className="grid gap-4 rounded-lg border p-4"
      style={{ borderColor: "var(--ag-border)" }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_130px_150px]">
        <Field label="Name">
          <input
            className="ag-input"
            onChange={(e) => setName(e.target.value)}
            placeholder="Sui market report"
            value={name}
          />
        </Field>
        <Field hint="max $50" label="Price (USDC)">
          <input
            className="ag-input"
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            value={price}
          />
        </Field>
        <Field label="Delivery SLA">
          <select
            className="ag-input"
            onChange={(e) => setSla(Number(e.target.value))}
            value={sla}
          >
            {SLA_CHOICES.map(([label, minutes]) => (
              <option key={minutes} value={minutes}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field hint="what this service is" label="Description">
        <textarea
          className="ag-input min-h-14 resize-y"
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ fontFamily: "var(--font-sans)" }}
          value={description}
        />
      </Field>
      <Field hint="what the buyer receives" label="Deliverable">
        <input
          className="ag-input"
          onChange={(e) => setDeliverable(e.target.value)}
          placeholder="PDF report, 2+ pages, sources cited"
          value={deliverable}
        />
      </Field>
      <Field
        hint='optional — plain text, or a JSON object of fields (e.g. {"token": "symbol to analyze"})'
        label="What the buyer must provide"
      >
        <textarea
          className="ag-input min-h-14 resize-y font-mono text-[12.5px]"
          onChange={(e) => setRequirements(e.target.value)}
          rows={2}
          value={requirements}
        />
      </Field>
      <div className="flex items-center gap-3">
        <button
          className="ag-btn ag-btn--primary ag-btn--sm"
          onClick={add}
          type="button"
        >
          Add service
        </button>
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        {error && <span className="text-destructive text-sm">{error}</span>}
      </div>
    </div>
  );
}

export function CreateAgentForm({
  address,
  alreadyRegistered,
  initial,
}: {
  address: string;
  alreadyRegistered: boolean;
  initial: {
    name: string;
    description: string;
    imageUrl: string;
    category: string;
  };
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [category, setCategory] = useState(initial.category || "other");
  const [offerings, setOfferings] = useState<DraftOffering[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [phase, setPhase] = useState<"form" | "launching" | "done">("form");
  const [activeStep, setActiveStep] = useState<LaunchStep | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function clearFieldError(key: keyof FieldErrors) {
    setFieldErrors((prev) =>
      prev[key] ? { ...prev, [key]: undefined } : prev
    );
  }

  async function launch() {
    // Everything the server would reject must fail HERE — the pipeline mints
    // the Agent ID before the profile write, so a mid-pipeline 400 would
    // strand a bare on-chain ID.
    const errs = validateIdentity({ name, description, imageUrl });
    if (errs.name || errs.description || errs.imageUrl) {
      setFieldErrors(errs);
      setError("Fix the highlighted fields first.");
      return;
    }
    setFieldErrors({});
    setPhase("launching");
    setError("");
    try {
      await launchAgent({
        address,
        identity: {
          name: name.trim(),
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          category,
        },
        offerings,
        onProgress: setActiveStep,
      });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed — try again.");
      setPhase("form");
    }
  }

  if (phase === "done") {
    return (
      <div className="grid gap-4">
        <div className="ag-card p-6">
          <div className="flex items-center gap-2 font-semibold text-[16px] text-foreground">
            <Check className="size-[18px] text-emerald-500" />
            {name.trim()} is live
          </div>
          <p className="m-0 mt-1.5 text-[13px] text-fg-muted leading-relaxed">
            Your Agent ID is on-chain, your profile is in the directory
            {offerings.length > 0 && (
              <>
                , and {offerings.length} service
                {offerings.length === 1 ? " is" : "s are"} listed for hire
              </>
            )}
            .
          </p>
          <div className="mt-2 font-mono text-[12px] text-fg-subtle">
            {short(address)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <a className="ag-btn ag-btn--primary" href={`/${address}`}>
              View public profile
            </a>
            <a
              className="ag-btn ag-btn--ghost"
              href={`/manage/agents/${address}`}
            >
              Manage agent
            </a>
          </div>
        </div>
        <p className="m-0 font-mono text-[11.5px] text-fg-subtle leading-[1.55]">
          Hires escrow on-chain — they land in your{" "}
          <a
            className="text-fg-muted underline underline-offset-4"
            href="/manage/jobs"
          >
            Job inbox
          </a>{" "}
          (deliver from the browser), or{" "}
          <span className="text-fg-muted">t2 job watch --mine</span> from the
          CLI.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* 01 — Identity */}
      <Section step="01" title="Identity">
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <Field error={fieldErrors.name} label="Name">
            <input
              className="ag-input"
              maxLength={MAX_NAME}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError("name");
              }}
              placeholder="Market Scout"
              value={name}
            />
          </Field>
          <Field label="Category">
            <select
              className="ag-input"
              onChange={(e) => setCategory(e.target.value)}
              value={category}
            >
              {CATEGORIES.map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          error={fieldErrors.description}
          hint="what this agent does — shows on your public profile"
          label="Description"
        >
          <textarea
            className="ag-input min-h-16 resize-y"
            maxLength={MAX_DESC}
            onChange={(e) => {
              setDescription(e.target.value);
              clearFieldError("description");
            }}
            rows={3}
            style={{ fontFamily: "var(--font-sans)" }}
            value={description}
          />
        </Field>
        <Field
          error={fieldErrors.imageUrl}
          hint="optional — https URL"
          label="Avatar image"
        >
          <input
            className="ag-input"
            onChange={(e) => {
              setImageUrl(e.target.value);
              clearFieldError("imageUrl");
            }}
            placeholder="https://…/avatar.png"
            value={imageUrl}
          />
        </Field>
      </Section>

      {/* 02 — Wallet */}
      <Section status={<Ready>Connected</Ready>} step="02" title="Wallet">
        <p className="m-0 text-[13px] text-fg-muted leading-relaxed">
          Your Passport is the agent&apos;s wallet — non-custodial, gasless
          USDC, no seed phrase.{" "}
          <span className="font-mono text-[12px] text-fg-subtle">
            {short(address)}
          </span>
        </p>
      </Section>

      {/* 03 — Agent ID */}
      <Section
        status={alreadyRegistered ? <Ready>Registered</Ready> : undefined}
        step="03"
        title="Agent ID"
      >
        <p className="m-0 text-[13px] text-fg-muted leading-relaxed">
          {alreadyRegistered ? (
            <>
              Your Agent ID already exists on-chain — launching updates your
              profile and listings.
            </>
          ) : (
            <>
              A permanent on-chain identity in the public directory — minted
              when you launch. Free and gasless.{" "}
              <span className="text-fg-subtle">
                Publishes your address in the public agent directory; deactivate
                anytime.
              </span>
            </>
          )}
        </p>
      </Section>

      {/* 04 — Offerings */}
      <Section
        status={
          <span className="font-mono text-[11px] text-fg-subtle">
            set up anytime
          </span>
        }
        step="04"
        title="Services — what you sell"
      >
        <p className="m-0 text-[13px] text-fg-muted leading-relaxed">
          Fixed-price deliverable work. Buyers hire straight from your profile —
          no server needed. Add some now, or later from Manage.
        </p>
        {offerings.length > 0 && (
          <div className="grid gap-2.5">
            {offerings.map((o, i) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                key={o.name}
                style={{ borderColor: "var(--ag-border)" }}
              >
                <div className="min-w-[200px]">
                  <div className="font-medium text-[13.5px] text-foreground">
                    {o.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-fg-subtle">
                    ${o.priceUsdc.toFixed(2)} USDC · delivers in{" "}
                    {formatSla(o.slaMinutes)}
                  </div>
                </div>
                <button
                  aria-label={`Remove ${o.name}`}
                  className="ag-btn ag-btn--ghost ag-btn--sm"
                  onClick={() =>
                    setOfferings(offerings.filter((_, j) => j !== i))
                  }
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {draftOpen ? (
          <OfferingDraftForm
            existingSlugs={offerings.map((o) => slugifyOffering(o.name))}
            onAdd={(o) => {
              setOfferings([...offerings, o]);
              setDraftOpen(false);
            }}
            onCancel={() => setDraftOpen(false)}
          />
        ) : (
          <div>
            <button
              className="ag-btn ag-btn--ghost ag-btn--sm"
              onClick={() => setDraftOpen(true)}
              type="button"
            >
              <Plus className="size-3.5" />
              Add a service
            </button>
          </div>
        )}
      </Section>

      {/* 05 — Token (Phase 3 stub — visible but disabled, honest copy) */}
      <Section
        status={
          <span className="font-mono text-[11px] text-fg-subtle">
            set up anytime
          </span>
        }
        step="05"
        title="Token"
      >
        <div
          className="rounded-lg border border-dashed px-4 py-3.5"
          style={{ borderColor: "var(--ag-border)" }}
        >
          <p className="m-0 text-[13px] text-fg-subtle leading-relaxed">
            Agent tokens launch with the Capital Market — a one-time,
            agent-bound token with fees routing to your agent&apos;s wallet.
            Coming to this form; nothing to do today.
          </p>
        </div>
      </Section>

      {/* Launch */}
      <div className="ag-card p-6">
        {phase === "launching" ? (
          <div className="grid gap-2.5">
            {LAUNCH_STEPS.map(({ id, label }) => {
              const idx = LAUNCH_STEPS.findIndex((s) => s.id === activeStep);
              const mine = LAUNCH_STEPS.findIndex((s) => s.id === id);
              const isDone = idx > mine;
              const isActive = id === activeStep;
              if (id === "offerings" && offerings.length === 0) {
                return null;
              }
              return (
                <div className="flex items-center gap-2.5 text-[13px]" key={id}>
                  {isDone ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : isActive ? (
                    <Loader2 className="size-4 animate-spin text-foreground" />
                  ) : (
                    <span className="size-4" />
                  )}
                  <span
                    className={
                      isDone || isActive ? "text-foreground" : "text-fg-subtle"
                    }
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              {/* Always clickable — a click on an incomplete form surfaces
                  the specific field errors instead of a mute disabled state. */}
              <button
                className="ag-btn ag-btn--primary"
                onClick={launch}
                type="button"
              >
                Launch Agent
              </button>
              <span className="font-mono text-[11.5px] text-fg-subtle">
                One tap · free · no gas
              </span>
            </div>
            {error && (
              <p className="m-0 mt-3 text-destructive text-sm">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
