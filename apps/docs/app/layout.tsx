import './global.css';
import { Inter } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata = {
  title: {
    default: 'Himayah Documentation',
    template: '%s - Himayah',
  },
  description: 'Lightweight, type-safe, schema-first, and Edge-compatible authentication framework for modern TypeScript apps.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
