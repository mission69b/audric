import type { SVGProps } from 'react';

export const MonitorIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="2" y="2.5" width="12" height="9" rx="1.25"></rect><path d="M5.5 14h5M8 11.5V14"></path>
  </svg>
);
