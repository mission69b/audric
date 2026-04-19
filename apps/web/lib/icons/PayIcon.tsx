import type { SVGProps } from 'react';

export const PayIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="1.5" y="4" width="13" height="8" rx="1"></rect><path d="M1.5 7h13"></path><path d="M4 10h2"></path>
  </svg>
);
