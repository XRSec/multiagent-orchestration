/**
 * mock/index.js
 * 统一导出所有 Mock 数据源与查询辅助函数
 */

export { mockPartners } from './mockPartners.js';
export { mockGroupSessions, defaultGroupSession } from './mockGroupSessions.js';
export { mockPlanList, defaultPlan } from './mockPlanData.js';

import { mockPartners } from './mockPartners.js';
import { mockGroupSessions } from './mockGroupSessions.js';
import { mockPlanList } from './mockPlanData.js';

/**
 * 辅助查询：根据 partnerId 获取伙伴详情
 */
export function getPartnerById(partnerId) {
  return mockPartners.find((p) => p.id === partnerId) || null;
}

/**
 * 辅助查询：根据 planId 获取计划卡详情
 */
export function getPlanById(planId) {
  return mockPlanList.find((plan) => plan.id === planId) || null;
}

/**
 * 辅助查询：根据 sessionId 获取群聊详情
 */
export function getGroupSessionById(sessionId) {
  return mockGroupSessions.find((s) => s.id === sessionId) || null;
}
