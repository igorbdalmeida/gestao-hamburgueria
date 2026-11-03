import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Monster Burger | Gestão & Cardápio Delivery',
  description:
    'Monster Burger - Burger Artesanal na Brasa. Sistema completo de Gestão Financeira, Notas Fiscais, Precificação e Cardápio Virtual Delivery.',
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
