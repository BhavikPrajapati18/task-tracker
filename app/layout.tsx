import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Tracker | Workboard",
  description: "A minimal, secure project and task management dashboard.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
