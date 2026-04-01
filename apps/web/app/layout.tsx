import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Audric — Your money, handled.",
  description:
    "The financial operating system for humans and agents. Save, pay, send, borrow — by conversation.",
  openGraph: {
    title: "Audric",
    description: "Your money, handled.",
    siteName: "Audric",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="flex min-h-svh flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
