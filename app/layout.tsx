import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "게이트비젼 챗봇 문의 분석",
  description: "브랜드별 카카오 챗봇 문의 추이, FAQ 매칭 성과와 미매칭 질문을 분석합니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
