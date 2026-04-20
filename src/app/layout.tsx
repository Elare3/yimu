import type { Metadata, Viewport } from "next";
import "./globals.css";
import SessionProvider from "@/components/providers/SessionProvider";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#FAF6F0',
};

export const metadata: Metadata = {
  title: "一木 YiMu - 你的经营伙伴",
  description: "一人成木，独木成林。为OPC创业者打造的经营伙伴。",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '一木 YiMu',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased bg-cream-50 text-brown-800">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
