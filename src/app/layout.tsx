import type { Metadata } from "next";
import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "가계부",
  description: "개인 가계부 앱",

  applicationName: "가계부",
  appleWebApp: {
    capable: true,
    title: "가계부",
    statusBarStyle: "default",
  },

  manifest: "/manifest.webmanifest",

  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },

  themeColor: "#ffffff",
};
