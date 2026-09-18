import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vertex ERP — Shahjalal Islami Bank PLC",
  description:
    "Enterprise ERP and integrated workflow platform for the Common Services Division, " +
    "Shahjalal Islami Bank PLC.",
  // No external icon request: the venue may have no internet.
  icons: { icon: "data:," },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
