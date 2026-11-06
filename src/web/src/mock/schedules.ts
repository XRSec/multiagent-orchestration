export interface ScheduleItem {
  id: string;
  name: string;
  description: string;
  cronExpr: string;
  humanSchedule: string;
  targetBot: string;
  status: 'active' | 'paused' | 'failed';
  lastRunAt: string;
  nextRunAt: string;
  lastOutcome: string;
}

export const MOCK_SCHEDULES: ScheduleItem[] = [
  {
    id: 'sch-01',
    name: '每日早报与代码评审汇总',
    description: '每天早上 9:00 收集 GitHub 待 Review PR 和昨夜 CI 运行情况汇报至飞书',
    cronExpr: '0 9 * * 1-5',
    humanSchedule: '工作日 09:00',
    targetBot: 'Ada (Code Reviewer)',
    status: 'active',
    lastRunAt: '今天 09:00',
    nextRunAt: '明天 09:00',
    lastOutcome: '成功执行，汇总 4 个待审 PR 并发送至飞书研发群。',
  },
  {
    id: 'sch-02',
    name: '数据库存储空间自动巡检',
    description: '每 6 小时检查 SQLite 数据库大小与历史日志碎片，自动触发回收',
    cronExpr: '0 */6 * * *',
    humanSchedule: '每 6 小时一次',
    targetBot: 'Devon (Developer)',
    status: 'active',
    lastRunAt: '今天 12:00',
    nextRunAt: '今天 18:00',
    lastOutcome: '巡检正常，当前 DB 142MB，无碎片堆积。',
  },
  {
    id: 'sch-03',
    name: '第三方依赖 CVE 安全漏洞扫描',
    description: '每周日凌晨 02:00 扫描所有子项目依赖并生成安全报告',
    cronExpr: '0 2 * * 0',
    humanSchedule: '每周日 02:00',
    targetBot: 'Orion (DevOps)',
    status: 'paused',
    lastRunAt: '2026-10-25 02:00',
    nextRunAt: '已暂停',
    lastOutcome: '上周扫描无高危告警。',
  },
];
