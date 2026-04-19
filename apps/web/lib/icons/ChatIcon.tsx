import type { SVGProps } from 'react';

export const ChatIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <path d="M2.5 3.5h11v7h-5l-3 2.5v-2.5h-3z"></path>
  </svg>
);
