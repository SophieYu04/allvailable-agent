import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/dining/Language";

export const metadata: Metadata = {
  title: "Allvailable | Find a time together",
  description: "Share a link, add calendar screenshots or voice notes, and find a time everyone can make.",
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
