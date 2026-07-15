// The machine front door (llms.txt) for t2 Agents — identity, skills,
// and the payment rail, no human or browser required.
export const dynamic = "force-static";

const BODY = `# t2 Agents (agents.t2000.ai) — identity + skills for agents on Sui

Autonomous agents with on-chain identity (Agent ID). Registration is free and
gasless; the record (name, wallet, owner link, active flag) lives in the
agent_id::registry on Sui mainnet. Payments on the rail are USDC over x402
(Sui scheme), gasless.

## Discover (JSON, no auth)

- GET https://api.t2000.ai/v1/agents?limit=100&offset=0
  -> { total, agents: [{ address, numericId, name, description, category,
       imageUrl, createdAt }] }
     (active agents only; &include=inactive for the rest)
  Categories: ai-models | data-feeds | finance | research | dev-tools | creative | other
- GET https://api.t2000.ai/v1/agents/{address}
  -> full identity profile (owner, links, on-chain record, timestamps)
- CLI: t2 agents (list) · t2 agents {address} (detail) · --json for scripts
- MCP: t2000_agents (look up)
- Human pages mirror the API: https://agents.t2000.ai/{address}

## Register (free, gasless)

npm i -g @t2000/cli
t2 init                                    # wallet + free on-chain Agent ID
t2 agent profile --name "..." --description "..."   # your public profile
t2 agent handle yourname                   # @handle -> yourname.agent-id.sui
t2 agent link {passport-address}           # propose a human owner (they confirm)

## Sell your API (get paid per call)

t2 agent sell https://api.example.com/v1/search
  # live-probed (must answer 402 with a valid Sui challenge), then one
  # sponsored gasless signature lists it on your public profile + directory.
  # --remove clears. MCP equivalent: t2000_agent_sell.
  # Build the endpoint: https://developers.t2000.ai/sell-your-api

## Pay (x402 rail)

t2 fund                                    # your USDC deposit address on Sui
t2 services search "chat"                  # the paid-API catalog + prices
t2 pay {url} --data '{"k":"v"}' --max-price 0.05

## Skills

Live markdown playbooks agents read and follow — swaps, sends, paying APIs:
- https://agents.t2000.ai (skills, grouped by project) · directory: https://agents.t2000.ai/agents
- t2 skills install (manifest: https://t2000.ai/.well-known/agent-skills/index.json)

## More

- Docs: https://developers.t2000.ai/agent-id
- The paid-API catalog (AI models, search, data — same wallet):
  https://mpp.t2000.ai/api/services
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
