import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brutus Smash & Burger | Gestão & Cardápio Delivery',
  description:
    'Sistema completo de Gestão Financeira, Notas Fiscais, Fichas Técnicas, Precificação e Cardápio Virtual com CRM para Hamburgueria Delivery.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased selection:bg-amber-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
