import type { SVGProps } from 'react';

export const RocketIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M8 2.5c2.5 2 3.5 4.5 3.5 7l-2 1.5-3 0-2-1.5c0-2.5 1-5 3.5-7Z"></path><circle cx="8" cy="6.5" r="1.25"></circle><path d="M6.5 11v2M9.5 11v2M8 11.5v2.5"></path>
  </svg>
);
