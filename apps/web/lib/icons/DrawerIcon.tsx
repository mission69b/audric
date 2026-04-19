import type { SVGProps } from 'react';

export const DrawerIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="2.5" y="3" width="11" height="10" rx="1"></rect><path d="M6 3v10"></path><path d="M8.5 7.5h3M8.5 9.5h3"></path>
  </svg>
);
