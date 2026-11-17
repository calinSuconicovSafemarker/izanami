import { createHashRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from './pages/HomePage';

// Hash routing avoids SPA rewrite rules on S3/CloudFront (ADR-0004).
const router = createHashRouter([{ path: '/', element: <HomePage /> }]);

export function App() {
  return <RouterProvider router={router} />;
}
