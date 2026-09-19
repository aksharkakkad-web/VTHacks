import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SafeCircle — Get me home",
  description:
    "SafeCircle coordinates and verifies a simple way home across campus.",
  applicationName: "SafeCircle",
  icons: {
    icon: "/safecircle-192.png",
    apple: "/safecircle-180.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SafeCircle",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef3f0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSans.variable} antialiased`}>
      <body>{children}<PwaRegistration /></body>
    </html>
  );
}
