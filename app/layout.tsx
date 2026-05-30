import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Witter Coin — Buybacks",
  description: "Sell your coins back to Witter Coin. Fast, fair offers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
