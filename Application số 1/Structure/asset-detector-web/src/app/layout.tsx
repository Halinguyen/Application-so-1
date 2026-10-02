import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tạo bản sao website",
  description: "Chọn game, thay asset, xem trước — công cụ tạo bản sao homepage cho vận hành",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Marcellus&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
