import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";

// Dynamically import Providers with SSR disabled
const Providers = dynamic(
  () => import("@/components/Providers").then(mod => mod.Providers),
  { ssr: false }
);
const Navigation = dynamic(
  () => import("@/components/Navigation").then(mod => mod.Navigation),
  { ssr: false }
);
const Footer = dynamic(
  () => import("@/components/Footer").then(mod => mod.Footer),
  { ssr: false }
);
const MobileBottomNav = dynamic(
  () => import("@/components/MobileBottomNav").then(mod => mod.MobileBottomNav),
  { ssr: false }
);

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://lyncz.io'),
  title: "LyncZ - The Trustless CNY-Crypto P2P Exchange",
  description: "Buy crypto with Alipay or WeChat Pay. Verified by zero-knowledge proofs. No trust required.",
  icons: {
    icon: [
      { url: '/lyncz_logo_nav.png?v=2', type: 'image/png', sizes: '32x32' },
      { url: '/lyncz_logo_nav.png?v=2', type: 'image/png', sizes: '512x512' },
    ],
    apple: { url: '/lyncz_logo_nav.png?v=2', type: 'image/png', sizes: '512x512' },
  },
  openGraph: {
    title: "LyncZ - The Trustless CNY-Crypto P2P Exchange",
    description: "Buy crypto with Alipay or WeChat Pay. Verified by zero-knowledge proofs. No trust required.",
    images: ['/og-image.svg'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "LyncZ - The Trustless CNY-Crypto P2P Exchange",
    description: "Buy crypto with Alipay or WeChat Pay. Verified by zero-knowledge proofs. No trust required.",
    images: ['/og-image.svg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <Navigation />
          <main className="pb-20 md:pb-0">
            {children}
          </main>
          <Footer />
          <MobileBottomNav />
        </Providers>
      </body>
    </html>
  );
}
