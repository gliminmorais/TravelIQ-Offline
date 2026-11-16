'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="center-screen">
      <h1>We couldn’t open your workspace.</h1>
      <p>Close and reopen TravelIQ, then try again. Your bookings are saved on this computer.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
