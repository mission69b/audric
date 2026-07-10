// Project brand tile for the skills shelf — the protocol's mark on a soft
// accent-tinted tile (same 22% radius language as AgentAvatar).

export function ProjectIcon({
  accent,
  icon,
  name,
  size = 44,
}: {
  accent: string;
  icon: string;
  name: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[22%]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, ${accent}24, ${accent}0a)`,
        border: `1px solid ${accent}40`,
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: local /brand asset */}
      <img
        alt={`${name} logo`}
        height={Math.round(size * 0.62)}
        src={icon}
        style={{ borderRadius: "22%" }}
        width={Math.round(size * 0.62)}
      />
    </div>
  );
}
