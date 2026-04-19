import type { SVGProps } from 'react';

export const SpinnerIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" strokeDasharray="2 1.5"></path><circle cx="8" cy="1.5" r=".75" fill="currentColor" stroke="none"></circle>
  </svg>
);
