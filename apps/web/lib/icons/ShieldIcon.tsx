import type { SVGProps } from 'react';

export const ShieldIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M8 2 3 4v4c0 3 2 5 5 6 3-1 5-3 5-6V4L8 2Z"></path>
  </svg>
);
