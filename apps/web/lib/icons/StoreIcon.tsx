import type { SVGProps } from 'react';

export const StoreIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M2.5 5.5h11l-.75 3.5a1 1 0 0 1-1 .75h-7.5a1 1 0 0 1-1-.75L2.5 5.5Z"></path><path d="M4.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 11.5 4v1.5"></path><path d="M3.5 10v3.5h9V10"></path>
  </svg>
);
