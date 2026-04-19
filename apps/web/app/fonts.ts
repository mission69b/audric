import localFont from 'next/font/local';

export const newYorkDisplay = localFont({
  variable: '--font-ny-display',
  display: 'swap',
  src: [
    {
      path: './fonts/NewYorkExtraLarge-Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/NewYorkExtraLarge-MediumItalic.otf',
      weight: '500',
      style: 'italic',
    },
    {
      path: './fonts/NewYorkExtraLarge-Semibold.otf',
      weight: '600',
      style: 'normal',
    },
  ],
});

export const newYorkLarge = localFont({
  variable: '--font-ny-large',
  display: 'swap',
  src: [
    {
      path: './fonts/NewYorkLarge-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/NewYorkLarge-Medium.otf',
      weight: '500',
      style: 'normal',
    },
  ],
});

export const newYorkMedium = localFont({
  variable: '--font-ny-medium',
  display: 'swap',
  src: [
    {
      path: './fonts/NewYorkMedium-Regular.otf',
      weight: '400',
      style: 'normal',
    },
  ],
});

export const departureMono = localFont({
  variable: '--font-departure-mono',
  display: 'swap',
  src: [
    {
      path: './fonts/DepartureMono-Regular.otf',
      weight: '400',
      style: 'normal',
    },
  ],
});
