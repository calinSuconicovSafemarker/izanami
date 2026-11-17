import { createHashRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes';

// Hash routing avoids SPA rewrite rules on S3/CloudFront (ADR-0004).
const router = createHashRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
