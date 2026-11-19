import type { RouteObject } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CreditsPage } from './pages/CreditsPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrgPage } from './pages/OrgPage';
import { StartPage } from './pages/StartPage';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <StartPage /> },
      { path: '/orgs', element: <HomePage /> },
      { path: '/org/:slug', element: <OrgPage /> },
      { path: '/credits', element: <CreditsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
