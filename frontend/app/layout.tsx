import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'NexusWA — Multi-device console',
  description: 'Dashboard pribadi untuk mengelola perangkat WhatsApp yang kamu miliki.',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" className="dark">
    <body>
      {children}
      <Toaster position="top-right" theme="dark" richColors closeButton toastOptions={{ className: 'border border-border bg-panel text-slate-100' }} />
    </body>
  </html>;
}
