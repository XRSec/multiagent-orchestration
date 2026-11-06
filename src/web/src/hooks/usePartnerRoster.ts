/**
 * Purpose: Hook for discovering and fetching the 7 core Mo-Bots roster from /api/partners.
 * Context: Provides partner metadata (avatars, roles, aliases) for autocomplete and message badging.
 * Usage: const { partners, partnerMap, loading } = usePartnerRoster();
 * Prerequisites: React 19, /api/partners endpoint.
 */

import { useEffect, useState, useMemo } from 'react';
import type { PartnerInfo } from '@/types/room';

const DEFAULT_CORE_PARTNERS: PartnerInfo[] = [
  {
    id: 'bot_moadmin_director_03',
    name: 'moAdmin',
    role: '核心调度与主管 · 负责任务拆解与协同推进',
    aliases: ['moadmin', 'moAdmin', 'admin', '主管', '编排主管'],
    avatarUrl: '/assets/agent-island-cindy.png',
    badgeText: '编排主管',
    badgeTheme: 'purple',
    isLead: true
  },
  {
    id: 'bot_mocode_engine_01',
    name: 'moCode',
    role: '核心全栈工程师 · 负责代码实现、重构演进与测试',
    aliases: ['mocode', 'moCode', 'code', '研发', '全栈研发'],
    avatarUrl: '/assets/agent-island-boli.png',
    badgeText: '全栈研发',
    badgeTheme: 'blue'
  },
  {
    id: 'bot_modoc_scribe_02',
    name: 'moDoc',
    role: '架构文胆与文档专员 · 负责架构规范与黑板沉淀',
    aliases: ['modoc', 'moDoc', 'doc', '文胆', '架构文胆'],
    avatarUrl: '/assets/agent-island-annie.png',
    badgeText: '架构文胆',
    badgeTheme: 'teal'
  },
  {
    id: 'bot_moci_sentinel_07',
    name: 'MoCI',
    role: '持续集成与测试哨兵 · 负责自动化构建与质量门禁',
    aliases: ['moci', 'MoCI', 'ci', '测试', '测试哨兵'],
    avatarUrl: '/assets/agent-island-tarara.png',
    badgeText: '测试哨兵',
    badgeTheme: 'rose'
  },
  {
    id: 'bot_mogit_scm_05',
    name: 'MoGit',
    role: '版本控制与代码审计 · 负责代码纯净度与分支治理',
    aliases: ['mogit', 'MoGit', 'git', '审计', '代码审计'],
    avatarUrl: '/assets/agent-island-erika.png',
    badgeText: '代码审计',
    badgeTheme: 'emerald'
  },
  {
    id: 'bot_modeep_scout_04',
    name: 'MoDeep',
    role: '深度调研与技术情报 · 负责业界前沿架构分析',
    aliases: ['modeep', 'MoDeep', 'deep', '情报', '深度情报'],
    avatarUrl: '/assets/agent-island-chaku.png',
    badgeText: '深度情报',
    badgeTheme: 'indigo'
  },
  {
    id: 'bot_mo_meta_06',
    name: 'Mo',
    role: '元工具与伙伴锻造师 · 负责工具研发与Agent治理',
    aliases: ['mo', 'Mo', 'meta', '锻造师', '元工具师'],
    avatarUrl: '/assets/agent-island-muffin.png',
    badgeText: '元工具师',
    badgeTheme: 'orange'
  }
];

export function usePartnerRoster() {
  const [partners, setPartners] = useState<PartnerInfo[]>(DEFAULT_CORE_PARTNERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoster = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/partners');
      const data = await res.json();
      if (data.ok && Array.isArray(data.partners) && data.partners.length > 0) {
        // Merge server partners with default presets
        const map = new Map<string, PartnerInfo>();
        for (const p of DEFAULT_CORE_PARTNERS) {
          map.set(p.id, p);
        }
        for (const p of data.partners) {
          map.set(p.id, { ...map.get(p.id), ...p });
        }
        setPartners(Array.from(map.values()));
        setError(null);
      }
    } catch {
      // Keep robust defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, []);

  const partnerMap = useMemo(() => {
    const map: Record<string, PartnerInfo> = {};
    for (const p of partners) {
      map[p.id] = p;
      if (p.name) map[p.name] = p;
    }
    return map;
  }, [partners]);

  return {
    partners,
    partnerMap,
    loading,
    error,
    refresh: fetchRoster
  };
}
