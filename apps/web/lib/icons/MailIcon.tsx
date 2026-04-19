import type { SVGProps } from 'react';

export const MailIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="2" y="4" width="12" height="8" rx="1"></rect><path d="m2.5 4.5 5.5 4 5.5-4"></path>
  </svg>
);
