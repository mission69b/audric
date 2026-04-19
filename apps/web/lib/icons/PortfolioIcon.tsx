import type { SVGProps } from 'react';

export const PortfolioIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M2.5 13V5M6 13V8M9.5 13V3M13 13V7"></path><path d="M2 13.5h12"></path>
  </svg>
);
