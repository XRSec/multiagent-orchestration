/**
 * Purpose: Active bot execution indicator card with stopwatch and real-time tool state.
 * Context: Conforms to Cindy/AGY spec: eliminates the 20-minute waiting black box.
 * Usage: <ActiveBotIndicator activeBotName="moAdmin" statusText="正在分析需求并调度工具链..." />
 * Prerequisites: React 19, AgentThinkingIndicator.
 */

import React from 'react';
import {
  AgentThinkingIndicator,
  type AgentThinkingIndicatorProps
} from './AgentThinkingIndicator';

export interface ActiveBotIndicatorProps extends AgentThinkingIndicatorProps {}

export const ActiveBotIndicator: React.FC<ActiveBotIndicatorProps> = (props) => {
  return <AgentThinkingIndicator {...props} />;
};

export default ActiveBotIndicator;
