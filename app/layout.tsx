import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "diARI",
  description: "Diary study research platform",
  icons: { icon: "/favicon.svg" },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
