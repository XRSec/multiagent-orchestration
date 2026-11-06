import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { NewChatPage } from '@/pages/cc-agent/NewChatPage';
import { CCAgentSessionView } from '@/pages/cc-agent/SessionPage';
import { WorkdirBrowsePage } from '@/pages/cc-agent/WorkdirBrowsePage';
import { OrcaWorkflowPage } from '@/pages/cc-agent/OrcaWorkflowPage';
import { SchedulerPage } from '@/pages/cc-agent/SchedulerPage';
import { BotsHomePage } from '@/pages/bots/BotsHomePage';
import { BotRosterPage } from '@/pages/bots/BotRosterPage';
import { BotMarketPage } from '@/pages/bots/BotMarketPage';
import { BotSessionPage } from '@/pages/bots/BotSessionPage';
import { BotGroupChatPage } from '@/pages/bots/BotGroupChatPage';
import { SkillhubLocalPage } from '@/pages/skillhub/SkillhubLocalPage';
import { SkillhubDetailPage } from '@/pages/skillhub/SkillhubDetailPage';
import { GhostPluginPage } from '@/pages/plugins/GhostPluginPage';
import { GhostAppViewPage } from '@/pages/plugins/GhostAppViewPage';
import { McpServersPage } from '@/pages/mcp/McpServersPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { AddAccountPage } from '@/pages/auth/AddAccountPage';
import { MakerExperimentalPage } from '@/pages/experimental/MakerExperimentalPage';
import { IssueTrackerPage } from '@/pages/issues/IssueTrackerPage';
import { ExtensionConfigPage } from '@/pages/control-plane/ExtensionConfigPage';
import { DistillationDiffPage } from '@/pages/control-plane/DistillationDiffPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/add-account',
    element: <AddAccountPage />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <NewChatPage /> },
      // CC-Agent Section
      { path: 'cc-agent/new', element: <NewChatPage /> },
      { path: 'cc-agent/scheduled', element: <SchedulerPage /> },
      { path: 'cc-agent/files/:sessionId', element: <WorkdirBrowsePage /> },
      { path: 'cc-agent/files', element: <WorkdirBrowsePage /> },
      { path: 'cc-agent/orca/:sessionId', element: <OrcaWorkflowPage /> },
      { path: 'cc-agent/orca', element: <OrcaWorkflowPage /> },
      { path: 'cc-agent/:sessionId', element: <CCAgentSessionView /> },

      // Bots Section
      { path: 'bots', element: <BotsHomePage /> },
      { path: 'bots/list', element: <BotsHomePage /> },
      { path: 'bots/roster', element: <BotRosterPage /> },
      { path: 'bots/market', element: <BotMarketPage /> },
      { path: 'bots/groups/:groupId', element: <BotGroupChatPage /> },
      { path: 'bots/:botId', element: <BotSessionPage /> },

      // SkillHub / Customizations Section
      { path: 'skillhub', element: <SkillhubLocalPage /> },
      { path: 'skillhub/local', element: <SkillhubLocalPage /> },
      { path: 'skillhub/detail', element: <SkillhubDetailPage /> },
      { path: 'skillhub/market', element: <SkillhubLocalPage /> },

      // Unified Customizations (Redirecting legacy separate plugins & mcp)
      { path: 'plugins', element: <Navigate to="/skillhub?tab=marketplace" replace /> },
      { path: 'mcp', element: <Navigate to="/skillhub" replace /> },
      { path: 'apps/:ghostId', element: <GhostAppViewPage /> },

      // Settings
      { path: 'settings', element: <SettingsPage /> },

      // Experimental & Diagnostics
      { path: 'maker-experimental', element: <MakerExperimentalPage /> },

      // Control Plane (Unified Extensions & Distillation Diff)
      { path: 'control-plane/extensions', element: <Navigate to="/skillhub?tab=installed" replace /> },
      { path: 'control-plane/distill', element: <DistillationDiffPage /> },

      // Issue Tracker
      { path: 'issues', element: <IssueTrackerPage /> },

      // Fallback
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
