import type { Metadata } from "next";
import "./globals.css";

/**
 * Typography: Helvetica across the entire app.
 *
 * We expose the same CSS variables the customer-facing pages already consume
 * (`--font-display`, `--font-body`, `--font-mono`) so existing styles in
 * app/page.tsx and app/sell/page.tsx keep working — they just resolve to
 * Helvetica now instead of the previous editorial pairing.
 */
const helveticaStack =
  '"Helvetica Neue", Helvetica, Arial, sans-serif';

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
    <html
      lang="en"
      style={
        {
          ["--font-display" as string]: helveticaStack,
          ["--font-body" as string]: helveticaStack,
          ["--font-mono" as string]: helveticaStack,
        } as React.CSSProperties
      }
    >
      <body style={{ fontFamily: helveticaStack }}>{children}</body>
    </html>
  );
}
