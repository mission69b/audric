import type { SVGProps } from 'react';

export const ContactsIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <circle cx="6" cy="6.25" r="2.25"></circle><path d="M2 13.5c.5-2.25 2-3.5 4-3.5s3.5 1.25 4 3.5"></path><path d="M11 5.5a2 2 0 0 1 0 4"></path><path d="M11.5 10.5c1.5.25 2.5 1.25 3 3"></path>
  </svg>
);
