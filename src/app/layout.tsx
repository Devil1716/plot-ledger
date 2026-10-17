import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { LedgerProvider } from "@/components/ledger-provider";
import { NativeShell } from "@/components/native-shell";
import { OfflineBanner } from "@/components/offline-banner";
import { UpdatePrompt } from "@/components/update-prompt";
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
  // draw under the notch / home indicator; padding comes from --safe-top/--safe-bottom
  viewportFit: "cover",
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NativeShell />
        <OfflineBanner />
        <UpdatePrompt />
        <LedgerProvider>
          {children}
          <Toaster position="top-center" />
        </LedgerProvider>
      </body>
    </html>
  );
}
