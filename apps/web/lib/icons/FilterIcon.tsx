import type { SVGProps } from 'react';

export const FilterIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M2 3h12l-4.5 5.5V13L6.5 14V8.5L2 3Z"></path>
  </svg>
);
