// Agent avatar: the agent's image if set, else a deterministic gradient derived
// from its address (unique per agent, no blanks, no external dependency).

function hueFromAddress(address: string, offset: number): number {
  let h = 0;
  for (let i = 2; i < Math.min(address.length, 14); i++) {
    h = (h * 31 + address.charCodeAt(i)) % 360;
  }
  return (h + offset) % 360;
}

export function AgentAvatar({
  address,
  imageUrl,
  size = 36,
}: {
  address: string;
  imageUrl?: string | null;
  size?: number;
}) {
  if (imageUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: external agent avatar URL
      <img
        alt=""
        className="shrink-0 rounded-full border border-border/50 object-cover"
        height={size}
        src={imageUrl}
        width={size}
      />
    );
  }
  const h1 = hueFromAddress(address, 0);
  const h2 = hueFromAddress(address, 75);
  return (
    <div
      aria-hidden="true"
      className="shrink-0 rounded-full border border-border/50"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${h1} 62% 48%), hsl(${h2} 58% 32%))`,
      }}
    />
  );
}
