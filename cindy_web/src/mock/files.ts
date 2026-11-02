export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  gitStatus?: 'modified' | 'added' | 'untracked';
  content?: string;
  language?: string;
}

export const MOCK_FILE_TREE: FileNode[] = [
  {
    id: 'f-src',
    name: 'src',
    path: 'src',
    type: 'directory',
    children: [
      {
        id: 'f-router',
        name: 'router.tsx',
        path: 'src/router.tsx',
        type: 'file',
        gitStatus: 'modified',
        language: 'typescript',
        content: `import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { CCAgentSessionView } from '@/pages/cc-agent/SessionPage';
import { NewChatPage } from '@/pages/cc-agent/NewChatPage';
import { BotsHomePage } from '@/pages/bots/BotsHomePage';
import { SkillhubPage } from '@/pages/skillhub/SkillhubLocalPage';
import { GhostPluginPage } from '@/pages/plugins/GhostPluginPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { LoginPage } from '@/pages/auth/LoginPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <NewChatPage /> },
      { path: 'cc-agent/new', element: <NewChatPage /> },
      { path: 'cc-agent/:sessionId', element: <CCAgentSessionView /> },
      { path: 'bots/*', element: <BotsHomePage /> },
      { path: 'skillhub/*', element: <SkillhubPage /> },
      { path: 'plugins/*', element: <GhostPluginPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);`,
      },
      {
        id: 'f-main',
        name: 'main.tsx',
        path: 'src/main.tsx',
        type: 'file',
        language: 'typescript',
        content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);`,
      },
      {
        id: 'f-components',
        name: 'components',
        path: 'src/components',
        type: 'directory',
        children: [
          {
            id: 'f-sidebar',
            name: 'Sidebar.tsx',
            path: 'src/components/Sidebar.tsx',
            type: 'file',
            language: 'typescript',
            content: `// Cindy App Sidebar Shell
export function Sidebar() {
  return <aside className="w-64 bg-sidebar border-r border-default h-full" />;
}`,
          },
        ],
      },
    ],
  },
  {
    id: 'f-package',
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    gitStatus: 'modified',
    language: 'json',
    content: `{
  "name": "cindy_web",
  "version": "1.0.0",
  "private": true
}`,
  },
  {
    id: 'f-readme',
    name: 'README.md',
    path: 'README.md',
    type: 'file',
    language: 'markdown',
    content: `# Cindy Web App
All UI page shells extracted from Cindy desktop with mock data.`,
  },
];
