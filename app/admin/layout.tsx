import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Panel - DiagramKit",
  description: "DiagramKit Admin Dashboard",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Syne:wght@400..800&display=swap"
        rel="stylesheet"
      />
      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>{children}</div>
    </>
  );
}
