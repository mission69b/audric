import type { SVGProps } from 'react';

export const MicrophoneIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="6" y="2" width="4" height="8" rx="2"></rect><path d="M3.5 8a4.5 4.5 0 0 0 9 0"></path><path d="M8 12.5V14"></path>
  </svg>
);
