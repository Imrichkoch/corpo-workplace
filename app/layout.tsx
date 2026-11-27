import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Corpo Workplace",
  description: "Rezervácie pracovísk, zasadačiek a evidencia návštev.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="sk"><head><link rel="stylesheet" href="/workspace/styles.css" /></head><body>{children}</body></html>;
}
