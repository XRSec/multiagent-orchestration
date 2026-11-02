/**
 * mock/index.js
 * 统一导出所有 Mock 数据源与查询辅助函数
 */

export { mockPartners, PARTNERS_MAP, getPartnerById } from './mockPartners.js';
export { mockGroupSessions, defaultGroupSession, getGroupSessionById } from './mockGroupSessions.js';
export { mockPlanList, defaultPlan, mockPlanData, getPlanById } from './mockPlanData.js';

import { mockPartners, PARTNERS_MAP, getPartnerById } from './mockPartners.js';
import { mockGroupSessions, defaultGroupSession, getGroupSessionById } from './mockGroupSessions.js';
import { mockPlanList, defaultPlan, mockPlanData, getPlanById } from './mockPlanData.js';

const mockBundle = {
  mockPartners,
  PARTNERS_MAP,
  getPartnerById,
  mockGroupSessions,
  defaultGroupSession,
  getGroupSessionById,
  mockPlanList,
  defaultPlan,
  mockPlanData,
  getPlanById,
};

export default mockBundle;
