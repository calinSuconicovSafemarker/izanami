import type { RouteObject } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CreditsPage } from './pages/CreditsPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrgPage } from './pages/OrgPage';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/org/:slug', element: <OrgPage /> },
      { path: '/credits', element: <CreditsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
