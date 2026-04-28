import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * [PR 5 — v0.56] Internal scaling dashboard.
 *
 * Gated by the `x-internal-key` cookie — same key used by cron routes.
 * Navigate to /admin/scaling?key=<T2000_INTERNAL_KEY> to set the cookie
 * and access the dashboard.
 *
 * Shows:
 *   - Vercel Observability embed (BV CB, NAVI 5xx, Anthropic token spend)
 *   - Upstash Redis console link (cache hit ratios, command rate)
 *   - Cron shard health (last 24h duration + user counts from structured logs)
 *   - Quick-reference runbook for each circuit breaker
 *
 * At 500–1k DAU the Vercel-native surfaces answer every incident question.
 * Graduate to Axiom/Grafana when we hit the criteria in the scaling spec
 * (>30d retention, distributed traces, PagerDuty integration).
 */

async function validateAccess(keyParam: string | null): Promise<boolean> {
  if (keyParam) {
    const cookieStore = await cookies();
    cookieStore.set('x-internal-key', keyParam, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24h
      path: '/admin',
    });
    return keyParam === env.T2000_INTERNAL_KEY;
  }
  const cookieStore = await cookies();
  const stored = cookieStore.get('x-internal-key')?.value;
  return stored === env.T2000_INTERNAL_KEY;
}

export default async function ScalingDashboard({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const params = await searchParams;
  const isAuthorized = await validateAccess(params.key ?? null);

  if (!isAuthorized) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-6">
          <h1 className="text-2xl font-mono font-bold text-white">Scaling Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1 font-mono">
            500–1k DAU readiness · v0.56 · Internal only
          </p>
        </header>

        {/* Metric legend */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'bv.cache_hit', desc: 'Wallet + DeFi cache reads', color: 'emerald' },
            { name: 'bv.cb_open', desc: 'BV circuit breaker state', color: 'red' },
            { name: 'navi.cache_hit', desc: 'NAVI MCP cache reads', color: 'blue' },
            { name: 'navi.cb_open', desc: 'NAVI circuit breaker state', color: 'orange' },
            { name: 'anthropic.tokens', desc: 'Token spend per kind', color: 'purple' },
            { name: 'anthropic.latency_ms', desc: 'Turn latency histogram', color: 'yellow' },
            { name: 'upstash.requests', desc: 'Redis ops by prefix+op', color: 'teal' },
            { name: 'cron.fin_ctx_shard_duration_ms', desc: 'Cron shard timing', color: 'cyan' },
            { name: 'cron.fin_ctx_users_processed', desc: 'Users per shard', color: 'zinc' },
          ].map((m) => (
            <div key={m.name} className="border border-zinc-800 rounded-lg p-4 space-y-1">
              <p className="font-mono text-xs text-zinc-400 truncate">{m.name}</p>
              <p className="text-xs text-zinc-600">{m.desc}</p>
            </div>
          ))}
        </section>

        {/* Vercel Observability */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-semibold text-zinc-300 uppercase tracking-wider">
            Vercel Observability
          </h2>
          <p className="text-zinc-500 text-xs">
            All metrics above are emitted as{' '}
            <code className="text-zinc-300 bg-zinc-900 px-1 rounded">
              {'{ kind: "metric", name, value, ...tags }'}
            </code>{' '}
            structured log lines ingested by Vercel Observability. Query them in the{' '}
            <a
              href="https://vercel.com/dashboard/observability"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline underline-offset-2"
            >
              Observability tab
            </a>{' '}
            using <code className="text-zinc-300 bg-zinc-900 px-1 rounded">kind:metric name:bv.cb_open</code>.
          </p>
        </section>

        {/* Runbooks */}
        <section className="space-y-4">
          <h2 className="text-sm font-mono font-semibold text-zinc-300 uppercase tracking-wider">
            Incident Runbooks
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Runbook
              title="BV circuit breaker open (bv.cb_open = 1)"
              steps={[
                'Check BlockVision status page / BV dashboard for 429 spikes',
                'Verify BLOCKVISION_API_KEY is non-empty in Vercel env',
                'CB auto-heals after 30s — check if bv.cache_hit freshness recovers',
                'If stuck open: restart Vercel deployment to reset process-local CB state',
              ]}
            />
            <Runbook
              title="NAVI circuit breaker open (navi.cb_open = 1)"
              steps={[
                'Check NAVI protocol status at naviprotocol.io',
                'MCP endpoint: open-api.naviprotocol.io/api/mcp',
                'CB auto-heals after 30s — savings_info / health_check will re-try',
                'navi.cache_hit will serve stale-served data until CB closes',
              ]}
            />
            <Runbook
              title="Cron shard failures (cron.fin_ctx_shard_duration_ms missing)"
              steps={[
                'Check ECS task logs for T2000_FIN_CTX_SHARD_COUNT and AUDRIC_INTERNAL_KEY',
                'Verify /api/internal/financial-context-snapshot returns 200 for manual POST',
                'Each shard is independent — one failure does not abort others',
                'Run at T2000_FIN_CTX_SHARD_COUNT=1 to isolate the failing user slice',
              ]}
            />
            <Runbook
              title="High Anthropic spend (anthropic.tokens spiking)"
              steps={[
                'Filter by kind=cache_read — if low, prompt caching may have regressed',
                'Check microcompact logs for repeated tool calls in same session',
                'Review chat route for missing cache_control on system prompt',
                'anthropic.latency_ms p95 > 4s → escalate to Anthropic status',
              ]}
            />
          </div>
        </section>

        {/* Quick links */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-semibold text-zinc-300 uppercase tracking-wider">
            Quick Links
          </h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Vercel Observability', href: 'https://vercel.com/dashboard/observability' },
              { label: 'Vercel Speed Insights', href: 'https://vercel.com/dashboard/speed-insights' },
              { label: 'Upstash Console', href: 'https://console.upstash.com' },
              { label: 'BlockVision Dashboard', href: 'https://console.blockvision.org' },
              { label: 'Anthropic Usage', href: 'https://console.anthropic.com/usage' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-3 py-2 rounded text-zinc-300 hover:text-white transition-colors"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Runbook({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
      <h3 className="text-xs font-mono font-semibold text-white">{title}</h3>
      <ol className="space-y-1">
        {steps.map((step, i) => (
          <li key={i} className="text-xs text-zinc-500 flex gap-2">
            <span className="text-zinc-700 shrink-0">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
