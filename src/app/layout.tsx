import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Monster Burger | Cardápio Online & Delivery',
  description:
    'Monster Burger - Burger Artesanal na Brasa. Faça seu pedido online pelo cardápio digital oficial e receba quentinho no conforto da sua casa.',
  openGraph: {
    title: 'Monster Burger | Cardápio Online & Delivery',
    description:
      'Monster Burger - Burger Artesanal na Brasa. Faça seu pedido online pelo cardápio digital oficial.',
    url: 'https://monsterburger.vercel.app',
    siteName: 'Monster Burger',
    images: [
      {
        url: '/logo.jpg',
        width: 800,
        height: 800,
        alt: 'Monster Burger',
      },
    ],
    locale: 'pt_BR',
    type: 'website',
  },
  icons: {
    icon: '/logo.jpg',
    apple: '/logo.jpg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
