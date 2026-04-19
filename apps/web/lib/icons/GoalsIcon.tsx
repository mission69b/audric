import type { SVGProps } from 'react';

export const GoalsIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <circle cx="8" cy="8" r="5.5"></circle><circle cx="8" cy="8" r="3"></circle><circle cx="8" cy="8" r="1" fill="currentColor"></circle>
  </svg>
);
