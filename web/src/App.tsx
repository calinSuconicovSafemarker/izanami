import { createHashRouter, RouterProvider } from 'react-router-dom';
import { isFramed } from './lib/framing';
import { routes } from './routes';

// Hash routing avoids SPA rewrite rules on S3/CloudFront (ADR-0004).
const router = createHashRouter(routes);

/**
 * GitHub Pages can't send `X-Frame-Options` and a meta CSP can't carry `frame-ancestors`, so
 * the bundle refuses to run inside a frame instead (ticket 23; CloudFront also sends DENY).
 */
function FramedNotice() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16 font-mono">
      <h1 className="text-xl font-bold tracking-[0.2em] text-emerald-400">IZANAMI</h1>
      <p className="text-zinc-300">IZANAMI doesn’t run inside another site’s frame.</p>
      <a
        href={window.location.href}
        target="_top"
        rel="noopener noreferrer"
        className="self-start rounded-sm border border-emerald-500 px-4 py-2 text-emerald-400 hover:bg-emerald-950"
      >
        Open IZANAMI directly
      </a>
    </main>
  );
}

export function App() {
  if (isFramed()) return <FramedNotice />;
  return <RouterProvider router={router} />;
}
