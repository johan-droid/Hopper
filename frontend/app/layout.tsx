import type { Metadata } from 'next';
import '../src/styles/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Hopper — Next-Generation CI/CD Failure Diagnosis',
  description: 'Understand every failure. Move your development forward with Hopper CI/CD diagnosis.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head />
      <body className="bg-neutral-950 text-neutral-100 antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
