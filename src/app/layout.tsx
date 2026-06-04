import type { Metadata } from "next";
import { DynaPuff, Inter } from "next/font/google";
import "./globals.css";

// Playful rounded display (DynaPuff) + clean body (Inter).
const display = DynaPuff({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Banter League — Weekly football predictions for your group chat",
  description:
    "Turn your WhatsApp group into a weekly prediction arena. Predict scores, play your chips, climb the leaderboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
