import type { ReactNode } from "react";

export const metadata = {
  title: "HypeAuditor Webhook",
  description: "Deterministic HypeAuditor to Airtable webhook parser.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
