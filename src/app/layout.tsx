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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}