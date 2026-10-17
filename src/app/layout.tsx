import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { LedgerProvider } from "@/components/ledger-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Plot Ledger",
  description: "Shared plot ownership based on what each contributor paid.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f4d3a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LedgerProvider>
          {children}
          <Toaster position="top-center" />
        </LedgerProvider>
      </body>
    </html>
  );
}
