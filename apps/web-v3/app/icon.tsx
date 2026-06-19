import { ImageResponse } from "next/og";

// Favicon — the Audric diamond, INVERTED per brand: dark mark on a white
// background (the in-app sidebar mark is the opposite — ink on the dark chrome).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const CELLS: [number, number][] = [
  [22, 0],
  [11, 11],
  [33, 11],
  [0, 22],
  [22, 22],
  [44, 22],
  [11, 33],
  [33, 33],
  [22, 44],
];

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        borderRadius: 6,
      }}
    >
      <svg
        fill="none"
        height={22}
        viewBox="0 0 53 53"
        width={22}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Audric</title>
        {CELLS.map(([x, y]) => (
          <rect
            fill="#0a0a0a"
            height={9}
            key={`${x}-${y}`}
            rx={2}
            width={9}
            x={x}
            y={y}
          />
        ))}
      </svg>
    </div>,
    { ...size }
  );
}
