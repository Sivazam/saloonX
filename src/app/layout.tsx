import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shell/providers";
import { PwaRegister } from "@/components/shell/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SaloonX — Salon Billing",
  description:
    "Ultra-simple salon billing for Indian salons — bill in seconds, UPI QR receipts, reports and staff management.",
  applicationName: "SaloonX",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SaloonX",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5E1A2C" },
    { media: "(prefers-color-scheme: dark)", color: "#1D1418" },
  ],
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled (WCAG 1.4.4) — low-vision users must be able to
  // zoom even on the POS. Double-tap-zoom is disabled instead.
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}
