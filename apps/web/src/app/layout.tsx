import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getPrefs } from "@/lib/prefs-server";
import { themeClass } from "@/lib/prefs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Privacy Desk", template: "%s · Privacy Desk" },
  description:
    "Case desk for UK data protection complaints and subject access requests.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Theme and density come from the person's own cookie, so the first paint is already right.
  const prefs = await getPrefs();
  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${themeClass(prefs.theme)} ${prefs.density === "compact" ? "density-compact" : ""}`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
