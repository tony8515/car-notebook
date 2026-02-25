import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "차량수첩",
  icons: {
    icon: "/icon.png",
  },
 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {/* ✅ 클릭 방해 절대 안 하게 pointerEvents none */}

        {children}
      </body>
    </html>
  );
}
