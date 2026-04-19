import type { SVGProps } from 'react';

export const SettingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    {...props}
  >
    <circle cx="8" cy="8" r="2"></circle><path d="M8 1.5v1.75M8 12.75v1.75M1.5 8h1.75M12.75 8h1.75M3.5 3.5l1.25 1.25M11.25 11.25l1.25 1.25M3.5 12.5l1.25-1.25M11.25 4.75l1.25-1.25"></path>
  </svg>
);
