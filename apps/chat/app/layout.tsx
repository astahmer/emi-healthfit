import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavHeader } from "./nav-header";
import { ThemeProvider } from "./theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Emi HealthFit",
  description: "Personal gym assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <TooltipProvider>
            <div className="flex h-dvh flex-col bg-background text-foreground">
              <Suspense>
                <NavHeader />
              </Suspense>
              <div className="flex-1 overflow-hidden">{children}</div>
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
