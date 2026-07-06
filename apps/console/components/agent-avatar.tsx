// Agent avatar: the agent's image if set, else a deterministic monogram tile
// (t2000-design/agents AgentCard) — the agent's initials on a soft gradient
// derived from its address. Unique per agent, no blanks, no external deps.

function hueFromAddress(address: string, offset: number): number {
  let h = 0;
  for (let i = 2; i < Math.min(address.length, 14); i++) {
    h = (h * 31 + address.charCodeAt(i)) % 360;
  }
  return (h + offset) % 360;
}

function initials(name: string | null | undefined): string {
  if (!name) {
    return "·";
  }
  return (
    name
      .split(/[\s-_]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "·"
  );
}

export function AgentAvatar({
  address,
  imageUrl,
  name,
  size = 36,
}: {
  address: string;
  imageUrl?: string | null;
  /** When set (and no image), the tile shows the agent's initials. */
  name?: string | null;
  size?: number;
}) {
  if (imageUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: external agent avatar URL
      <img
        alt=""
        className="shrink-0 rounded-[22%] border border-border/50 object-cover"
        height={size}
        src={imageUrl}
        width={size}
      />
    );
  }
  const h = hueFromAddress(address, 0);
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[22%] font-mono font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        color: `hsl(${h} 80% 68%)`,
        background: `linear-gradient(140deg, hsl(${h} 70% 50% / 0.2), hsl(${h} 70% 50% / 0.07))`,
        border: `1px solid hsl(${h} 70% 55% / 0.27)`,
      }}
    >
      {initials(name)}
    </div>
  );
}
