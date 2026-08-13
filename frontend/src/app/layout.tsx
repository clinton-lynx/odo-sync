import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "OdoSync",
  description:
    "Service-reminder calling for fleet vehicles — schedule, place, and track the 15/10/5-day reminder calls that book the next service.",
};

// Next 16: themeColor / colorScheme belong on the `viewport` export, not `metadata`.
export const viewport: Viewport = {
  themeColor: "#FAFAF8",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
