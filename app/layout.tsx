import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ApiKeysProvider } from "@/contexts/ApiKeysContext";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Youssef AI – Build and remix apps with conversational AI",
  description:
    "Youssef AI helps you design, build, and iterate on modern web apps using AI-powered conversations. Generate polished React, TypeScript, and Tailwind code in minutes.",
  keywords: [
    "website cloning",
    "AI website builder",
    "React code generator",
    "open source",
    "web scraping",
    "TypeScript",
    "Tailwind CSS",
    "Next.js",
    "website recreation",
  ],
  authors: [{ name: "Youssef AI" }],
  creator: "Youssef AI",
  publisher: "Youssef AI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://youssef.ai"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Youssef AI – Build and remix apps with conversational AI",
    description:
      "Ship beautiful web experiences faster with Youssef AI’s collaborative, open-source builder.",
    url: "https://youssef.ai",
    siteName: "Youssef AI",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Youssef AI – Conversational builder",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Youssef AI – Build and remix apps with conversational AI",
    description:
      "Generate React, TypeScript, and Tailwind UI from natural language prompts.",
    images: ["/og-image.png"],
    creator: "@youssefai",
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