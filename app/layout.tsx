import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "chatbot-perijinan",
  description:
    "Asisten cerdas berbasis AI untuk layanan Persetujuan Bangunan Gedung (PBG) dan perizinan. Dapatkan informasi cepat, akurat, dan terpercaya mengenai proses pengajuan izin.",
  keywords: ["chatbot-perijinan", "PBG", "Persetujuan Bangunan Gedung", "SIMBG", "izin bangunan", "chatbot AI"],
  openGraph: {
    title: "chatbot-perijinan",
    description: "AI-powered assistant for government building permit (PBG) and licensing inquiries.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full" suppressHydrationWarning>
      <body className="h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
