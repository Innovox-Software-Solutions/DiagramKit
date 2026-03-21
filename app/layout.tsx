import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lobster_Two, Inter, Roboto, Open_Sans, Manrope, Space_Grotesk } from "next/font/google";
import SessionProvider from "@/components/SessionProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lobsterTwo = Lobster_Two({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-lobster-two",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const roboto = Roboto({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "DiagramKit | Collaborative Diagramming Tool & Online Whiteboard",
  description: "Create, collaborate, and share diagrams in real-time. The ultimate interactive visual workspace for system design, flowcharts, and team brainstorming.",
  keywords: [
    "Collaborative Diagramming Tool",
    "Online Whiteboard",
    "Real-time Diagramming",
    "System Design Tool",
    "Flowchart Maker",
    "DiagramKit",
    "Visual Collaboration",
    "Next.js whiteboard",
    "Interactive Visual Workspace",
    "Online wireframing"
  ],
  authors: [{ name: "Innovox Software Solutions" }],
  openGraph: {
    title: "DiagramKit | Collaborative Diagramming Tool",
    description: "Empower your team with real-time visual collaboration for system design and brainstorming.",
    url: "https://diagramkit.com",
    siteName: "DiagramKit",
    images: [
      {
        url: "/logo.png",
        width: 800,
        height: 600,
        alt: "DiagramKit Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DiagramKit | Collaborative Diagramming Tool",
    description: "The fast, collaborative way to create diagrams together.",
    images: ["/logo.png"],
  },
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${lobsterTwo.variable} ${inter.variable} ${roboto.variable} ${openSans.variable} ${manrope.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
