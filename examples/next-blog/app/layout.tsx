import '@sapphirelabs/blog-cms-next/prose.css';
import './site.css';

import type { ReactNode } from 'react';

export const metadata = { title: 'Example blog (Next)' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
