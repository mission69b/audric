"use client";

/**
 * Client half of the pay_service confirm flow. The server emits a
 * `pay_service` tool part (no server execute); this renders the
 * tap-to-confirm card and, on Allow, resolves the endpoint from the live
 * catalog and runs the x402 pay loop IN-BROWSER via `payServiceCall`
 * (zkLogin session key), then returns the delivered response + digest to
 * the agent with `addToolResult`. The user always confirms — Passport
 * "you decide".
 */

import { useEffect, useState } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { useActiveChat } from "@/hooks/use-active-chat";
import type { ChatMessage } from "@/lib/types";
import {
  type EndpointSchemaInfo,
  fetchEndpointSchema,
  PAY_SERVICE_CAP_USD,
  payServiceCall,
} from "@/lib/wallet/pay-service";

type PayServicePart = Extract<
  ChatMessage["parts"][number],
  { type: "tool-pay_service" }
>;

/** Pre-fill the form from whatever body the model built (may be absent). */
function parseModelBody(body: string | undefined): Record<string, unknown> {
  if (!body) {
    return {};
  }
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Collect SVG deliverables out of a paid response so the card can SHOW them
 * (founder, 2026-07-21: a delivered logo surfaced only as a code block).
 * Rendered through an `<img>` data-URI — browsers treat SVG-in-img as an
 * inert image document (no script execution, no external loads), so a
 * hostile seller SVG can't run anything.
 */
function extractSvgs(response: unknown): { label: string; svg: string }[] {
  const found: { label: string; svg: string }[] = [];
  const visit = (value: unknown, label: string) => {
    if (found.length >= 3) {
      return;
    }
    if (typeof value === "string") {
      const s = value.trim();
      if (s.startsWith("<svg") && s.endsWith("</svg>") && s.length <= 50_000) {
        found.push({ label, svg: s });
      }
      return;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        visit(v, k);
      }
    }
  };
  visit(response, "svg");
  return found;
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

type Swatch = { name?: string; hex: string };

/**
 * Collect color palettes out of a paid response — arrays of hex strings
 * (logo tier) or `{name, hex}` objects (palette/brand-kit tiers) — so the
 * card can render swatches instead of leaving colors as text.
 */
function extractPalettes(
  response: unknown
): { label: string; colors: Swatch[] }[] {
  const found: { label: string; colors: Swatch[] }[] = [];
  const visit = (value: unknown, label: string) => {
    if (found.length >= 2 || !value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length < 2 || value.length > 12) {
        return;
      }
      if (value.every((v) => typeof v === "string" && HEX_COLOR.test(v))) {
        found.push({
          label,
          colors: (value as string[]).map((hex) => ({ hex })),
        });
      } else if (
        value.every(
          (v) =>
            v &&
            typeof v === "object" &&
            typeof (v as Swatch).hex === "string" &&
            HEX_COLOR.test((v as Swatch).hex)
        )
      ) {
        found.push({
          label,
          colors: (value as Swatch[]).map((c) => ({
            name: typeof c.name === "string" ? c.name : undefined,
            hex: c.hex,
          })),
        });
      }
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      visit(v, k);
    }
  };
  visit(response, "palette");
  return found;
}

/** Coerce form strings back to the schema's declared types. */
function buildBodyFromForm(
  schema: EndpointSchemaInfo,
  values: Record<string, string>
): string {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(values)) {
    const value = raw.trim();
    if (value === "") {
      continue;
    }
    const type = schema.properties?.[key]?.type;
    if (type === "number" || type === "integer") {
      const n = Number(value);
      out[key] = Number.isFinite(n) ? n : value;
    } else if (type === "boolean") {
      out[key] = value === "true";
    } else {
      out[key] = value;
    }
  }
  return JSON.stringify(out);
}

export function PayServiceTool({ part }: { part: PayServicePart }) {
  const { addToolResult } = useActiveChat();
  const [pending, setPending] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [copied, setCopied] = useState(false);
  // Confirm-card form (the proper fix for model-mangled bodies, 2026-07-21):
  // when the endpoint publishes a body schema, its fields render as editable
  // inputs pre-filled from the model's body. The body sent upstream is built
  // FROM THE FORM — the model can no longer omit or garble a field, and the
  // Allow tap approves the money AND the inputs.
  // undefined = loading · null = no schema (fall back to the model's body)
  const [schema, setSchema] = useState<EndpointSchemaInfo | null | undefined>();
  const [form, setForm] = useState<Record<string, string>>({});
  const { toolCallId, state } = part;
  const widthClass = "w-[min(100%,450px)]";

  const isAwaitingConfirm =
    state !== "output-available" &&
    Boolean(part.input?.serviceId && part.input?.path);
  const inputServiceId = part.input?.serviceId;
  const inputPath = part.input?.path;
  const inputMethod = part.input?.method;
  const inputBody = part.input?.body;

  useEffect(() => {
    if (!(isAwaitingConfirm && inputServiceId && inputPath)) {
      return;
    }
    let cancelled = false;
    fetchEndpointSchema(inputServiceId, inputPath, inputMethod).then((info) => {
      if (cancelled || !info) {
        if (!cancelled) {
          setSchema(null);
        }
        return;
      }
      const modelBody = parseModelBody(inputBody);
      const seeded: Record<string, string> = {};
      for (const key of Object.keys(info.properties ?? {})) {
        const v = modelBody[key];
        seeded[key] = v == null ? "" : String(v);
      }
      setSchema(info);
      setForm(seeded);
    });
    return () => {
      cancelled = true;
    };
  }, [isAwaitingConfirm, inputServiceId, inputPath, inputMethod, inputBody]);

  async function settle(output: unknown) {
    await addToolResult({
      tool: "pay_service",
      toolCallId,
      output: output as never,
    });
  }

  if (state === "output-available") {
    const out = part.output as {
      digest?: string;
      direct?: boolean;
      denied?: boolean;
      error?: string;
      response?: unknown;
    };
    // The paid deliverable, verbatim. The user paid for this data — never
    // leave them dependent on the model's paraphrase of it (founder hit
    // this buying a brand kit: the SVG never surfaced, 2026-07-20).
    const deliverable =
      out?.response == null
        ? null
        : typeof out.response === "string"
          ? out.response
          : JSON.stringify(out.response, null, 2);
    const svgs = out?.denied || out?.error ? [] : extractSvgs(out?.response);
    const palettes =
      out?.denied || out?.error ? [] : extractPalettes(out?.response);
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full">
          <ToolHeader state="output-available" type="tool-pay_service" />
          <ToolContent>
            <div className="px-4 py-3 text-sm">
              {out?.denied && (
                <span className="text-muted-foreground">Payment declined.</span>
              )}
              {!out?.denied && out?.error && (
                <span
                  className={
                    /insufficient|balance/i.test(out.error)
                      ? "text-amber-600"
                      : "text-red-600"
                  }
                >
                  {/insufficient|balance/i.test(out.error)
                    ? "Your wallet needs more USDC for this — nothing was spent."
                    : `Call failed: ${out.error}`}
                </span>
              )}
              {!(out?.denied || out?.error) && out?.digest && (
                <span className="text-green-600">
                  Delivered ·{" "}
                  <a
                    className="font-mono text-xs underline underline-offset-2 hover:opacity-80"
                    href={`https://suiscan.xyz/mainnet/tx/${out.digest}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    title="Settlement receipt on-chain"
                  >
                    {out.digest.slice(0, 10)}… ↗
                  </a>
                </span>
              )}
              {svgs.length > 0 && (
                <div className="mt-2 grid gap-2">
                  {svgs.map(({ label, svg }) => (
                    <div
                      className="rounded-md border bg-muted/40 p-2"
                      key={label}
                    >
                      {/* biome-ignore lint/performance/noImgElement: data-URI SVG can't go through next/image */}
                      <img
                        alt={`${label} (delivered SVG)`}
                        className="mx-auto max-h-40 w-auto"
                        src={svgDataUri(svg)}
                      />
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">
                          {label}
                        </span>
                        <a
                          className="text-muted-foreground text-xs underline underline-offset-2"
                          download={`${label}.svg`}
                          href={svgDataUri(svg)}
                        >
                          Download SVG
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {palettes.length > 0 && (
                <div className="mt-2 grid gap-2">
                  {palettes.map(({ label, colors }) => (
                    <div
                      className="rounded-md border bg-muted/40 p-2"
                      key={label}
                    >
                      <div className="flex flex-wrap gap-2">
                        {colors.map((c) => (
                          <div
                            className="grid justify-items-center gap-1"
                            key={c.hex + (c.name ?? "")}
                            title={c.name ? `${c.name} · ${c.hex}` : c.hex}
                          >
                            <span
                              className="h-9 w-9 rounded-md border"
                              style={{ backgroundColor: c.hex }}
                            />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {c.hex}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-1.5 text-muted-foreground text-xs">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!(out?.denied || out?.error) && deliverable && (
                <>
                  <div className="mt-1 flex items-center gap-3">
                    <button
                      className="text-muted-foreground text-xs underline underline-offset-2"
                      onClick={() => setShowResponse((v) => !v)}
                      type="button"
                    >
                      {showResponse ? "Hide what you got" : "Show what you got"}
                    </button>
                    <button
                      className="text-muted-foreground text-xs underline underline-offset-2"
                      onClick={() => {
                        navigator.clipboard.writeText(deliverable);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      type="button"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  {showResponse && (
                    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                      {deliverable}
                    </pre>
                  )}
                </>
              )}
            </div>
          </ToolContent>
        </Tool>
      </div>
    );
  }

  const input = part.input;
  if (!(input?.serviceId && input?.path) || input.priceUsdc == null) {
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full" defaultOpen={true}>
          <ToolHeader state={state} type="tool-pay_service" />
        </Tool>
      </div>
    );
  }

  const { serviceId, path, method, body, priceUsdc, purpose } = input;
  // Render clamp: `purpose` is model-written text. A degenerate generation
  // loop once poured thousands of rambling chars into it and the card
  // rendered the whole wall (Kimi, 2026-07-21). The schema caps new calls;
  // this clamps whatever still arrives.
  const purposeLine =
    purpose && purpose.length > 200 ? `${purpose.slice(0, 200)}…` : purpose;

  const requiredKeys = schema?.required ?? [];
  const missingRequired = requiredKeys.filter((k) => !form[k]?.trim());
  const formActive = schema != null;

  const onAllow = async () => {
    // The executor re-validates fail-closed (catalog resolution, live price,
    // cap, session) — errors settle back to the agent so it explains instead
    // of retrying.
    setPending(true);
    try {
      const result = await payServiceCall({
        serviceId,
        path,
        method,
        // Form-built body wins: deterministic from what the user approved.
        body: formActive ? buildBodyFromForm(schema, form) : body,
        priceUsdc,
      });
      await settle(result);
    } catch (e) {
      await settle({ error: `${(e as Error).message}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={widthClass} key={toolCallId}>
      <Tool className="w-full" defaultOpen={true}>
        <ToolHeader state={state} type="tool-pay_service" />
        <ToolContent>
          <div className="px-4 pt-3 text-sm">
            <div className="font-medium">
              {purposeLine ?? "Paid API call"} · ${priceUsdc} USDC
            </div>
            <div className="mt-1 break-all font-mono text-muted-foreground text-xs">
              {serviceId} · {(method ?? "POST").toUpperCase()} {path}
            </div>
            <div className="mt-1 text-foreground">
              From your wallet USDC, gasless. The exact charge is the live
              catalog price — never above it.
            </div>
            {formActive && (
              <div className="mt-3 grid gap-2">
                {Object.entries(schema.properties ?? {}).map(([key, prop]) => {
                  const isRequired = requiredKeys.includes(key);
                  return (
                    <label className="grid gap-1" key={key}>
                      <span className="text-muted-foreground text-xs">
                        {key}
                        {isRequired ? (
                          <span className="text-red-500"> *</span>
                        ) : (
                          " (optional)"
                        )}
                      </span>
                      <input
                        className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                        disabled={pending}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                        placeholder={prop.description ?? key}
                        value={form[key] ?? ""}
                      />
                    </label>
                  );
                })}
                <div className="text-muted-foreground text-xs">
                  This is exactly what the seller receives — edit before paying.
                </div>
              </div>
            )}
            {!formActive && body && (
              <button
                className="mt-1 text-muted-foreground text-xs underline underline-offset-2"
                onClick={() => setShowBody((v) => !v)}
                type="button"
              >
                {showBody ? "Hide request" : "Show request"}
              </button>
            )}
            {!formActive && body && showBody && (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                {body}
              </pre>
            )}
            {priceUsdc > PAY_SERVICE_CAP_USD && (
              <div className="mt-1 text-amber-600 text-xs">
                Over the ${PAY_SERVICE_CAP_USD} in-chat cap — this will be
                refused.
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 border-t px-4 py-3">
            <button
              className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              disabled={pending}
              onClick={() => settle({ denied: true })}
              type="button"
            >
              Deny
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              disabled={
                pending || schema === undefined || missingRequired.length > 0
              }
              onClick={onAllow}
              title={
                missingRequired.length > 0
                  ? `Fill in: ${missingRequired.join(", ")}`
                  : undefined
              }
              type="button"
            >
              {pending ? "Paying…" : `Allow & Pay $${priceUsdc}`}
            </button>
          </div>
        </ToolContent>
      </Tool>
    </div>
  );
}
