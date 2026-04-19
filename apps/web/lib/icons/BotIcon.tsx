import type { SVGProps } from 'react';

export const BotIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="3" y="5" width="10" height="7.5" rx="1.5"></rect><circle cx="6" cy="8.5" r=".5" fill="currentColor"></circle><circle cx="10" cy="8.5" r=".5" fill="currentColor"></circle><path d="M8 3V5M6 12.5v1M10 12.5v1"></path>
  </svg>
);
