import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ApiKeysProvider } from "@/contexts/ApiKeysContext";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Open Lovable DIY - AI-Powered Website Cloning Platform",
  description: "Transform any website into a modern, responsive web application with AI. Open-source alternative to Lovable.dev. Clone websites instantly with React, TypeScript, and Tailwind CSS.",
  keywords: [
    "website cloning",
    "AI website builder",
    "React code generator",
    "open source",
    "web scraping",
    "TypeScript",
    "Tailwind CSS",
    "Next.js",
    "website recreation"
  ],
  authors: [{ name: "Open Source Community" }],
  creator: "Open Lovable DIY",
  publisher: "Open Lovable DIY",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://openlovable.diy"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Open Lovable DIY - AI-Powered Website Cloning Platform",
    description: "Transform any website into a modern, responsive web application with AI. Open-source alternative to Lovable.dev.",
    url: "https://openlovable.diy",
    siteName: "Open Lovable DIY",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Open Lovable DIY - AI Website Cloning Platform",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Open Lovable DIY - AI-Powered Website Cloning Platform",
    description: "Transform any website into a modern, responsive web application with AI. Open-source alternative to Lovable.dev.",
    images: ["/og-image.png"],
    creator: "@openlovable",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ApiKeysProvider>
            {children}
          </ApiKeysProvider>
        </AuthProvider>
      </body>
    </html>
  );
}