import type { Metadata } from "next";
import "./globals.css";
import "@/components/dining/product-ui.css";
import { LanguageProvider } from "@/components/dining/Language";

export const metadata: Metadata = {
  title: "Allvailable | AI scheduling from screenshots and voice",
  description: "Import availability from calendar screenshots or voice, review AI suggestions, and choose a time with required attendees available.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
