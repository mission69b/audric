import type { SVGProps } from 'react';

export const DashboardIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="2.5" y="2.5" width="4.5" height="5.5" rx=".75"></rect><rect x="9" y="2.5" width="4.5" height="3.5" rx=".75"></rect><rect x="2.5" y="10" width="4.5" height="3.5" rx=".75"></rect><rect x="9" y="8" width="4.5" height="5.5" rx=".75"></rect>
  </svg>
);
