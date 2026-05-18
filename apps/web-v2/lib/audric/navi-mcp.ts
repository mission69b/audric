/**
 * NAVI MCP connection singleton for the Day 2b audric chat route.
 *
 * Mirrors the `ensureMcpConnected()` pattern in
 * `audric/web/lib/engine/engine-factory.ts` ~L187. Single module-scoped
 * `McpClientManager` reused across requests (MCP connections are
 * expensive; reconnecting per turn is wasteful).
 *
 * The `balance_check` tool routes through NAVI MCP for savings / debt /
 * rewards when `hasNaviMcpGlobal(context)` returns true. Without an
 * MCP manager wired, the tool falls through to its SDK path and
 * requires a `T2000` agent instance (which web-v2 doesn't have — and
 * which would force a signing keypair we don't want for read-only
 * Day 2b smoke).
 *
 * On connection failure we keep the manager around but flag the
 * failure timestamp; subsequent requests retry after MCP_RETRY_MS.
 * This matches the production "degrade gracefully" behavior so MCP
 * flakiness never wedges the chat route.
 */

import { McpClientManager, NAVI_MCP_CONFIG } from "@t2000/engine";

let mcpManager: McpClientManager | null = null;
let mcpConnecting: Promise<void> | null = null;
let mcpFailedAt = 0;
const MCP_RETRY_MS = 60_000;

export async function ensureNaviMcpConnected(): Promise<McpClientManager> {
  if (mcpManager?.isConnected(NAVI_MCP_CONFIG.name)) {
    return mcpManager;
  }

  if (mcpManager && Date.now() - mcpFailedAt < MCP_RETRY_MS) {
    return mcpManager;
  }

  if (!mcpConnecting) {
    mcpConnecting = (async () => {
      const mgr = mcpManager ?? new McpClientManager();
      try {
        await mgr.connect(NAVI_MCP_CONFIG);
        mcpManager = mgr;
        mcpFailedAt = 0;
      } catch (err) {
        console.warn(
          "[web-v2 navi-mcp] connection failed, balance_check will degrade:",
          err
        );
        mcpManager = mgr;
        mcpFailedAt = Date.now();
      } finally {
        mcpConnecting = null;
      }
    })();
  }

  await mcpConnecting;
  // After the awaited promise resolves `mcpManager` is guaranteed
  // non-null (either connected or held with `mcpFailedAt` set).
  if (!mcpManager) {
    throw new Error(
      "[web-v2 navi-mcp] mcpManager unexpectedly null after connect"
    );
  }
  return mcpManager;
}
