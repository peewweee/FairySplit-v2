import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/fairy/app-shell";

/**
 * One family, no exceptions — headings, body, the wordmark and the numbers all
 * sit in Figtree, the way the reference sets its own name in its own type
 * rather than a separate logo face.
 */
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "FairySplit",
  description: "Split shared bills by the days you actually stayed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${figtree.variable}`}>
      <body className="flex min-h-full flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
