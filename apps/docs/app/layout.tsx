import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';

export const metadata = {
  title: {
    default: 'Himayah Documentation',
    template: '%s - Himayah',
  },
  description: 'Lightweight, type-safe, schema-first, and Edge-compatible authentication framework for modern TypeScript apps.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen font-sans">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
