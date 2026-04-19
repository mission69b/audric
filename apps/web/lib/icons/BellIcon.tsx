import type { SVGProps } from 'react';

export const BellIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M4 11V8a4 4 0 0 1 8 0v3l1 1.5H3L4 11Z"></path><path d="M6.5 13a1.5 1.5 0 0 0 3 0"></path>
  </svg>
);
