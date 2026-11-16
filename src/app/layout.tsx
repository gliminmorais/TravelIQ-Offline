import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'TravelIQ Desktop',
  description: 'An offline workspace for travel bookings, tickets, and finances.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
