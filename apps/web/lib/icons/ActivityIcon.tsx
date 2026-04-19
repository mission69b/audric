import type { SVGProps } from 'react';

export const ActivityIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M1.5 8h2.5l1.5-4 3 9 2.5-5h3.5"></path>
  </svg>
);
