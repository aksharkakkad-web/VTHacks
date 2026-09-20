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
  title: "Beacon — Get me home",
  description:
    "Get me home. Beacon handles the rest. A campus mobility demo.",
  applicationName: "Beacon",
  icons: {
    icon: "/beacon-192.png",
    apple: "/beacon-180.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Beacon",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbfaf6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSans.variable} antialiased`}>
      <body>{children}<PwaRegistration /></body>
    </html>
  );
}
