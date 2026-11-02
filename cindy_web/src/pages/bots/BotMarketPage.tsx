import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ArrowLeft,
  Search,
  Star,
  Download,
  Check,
  Tag,
  Filter,
} from 'lucide-react';

export function BotMarketPage() {
  const navigate = useNavigate();
  const [filterCategory, setFilterCategory] = useState('全部');

  const categories = ['全部', '工程研发', '系统架构', '产品设计', '运营效率', '安全合规'];

  const marketBots = [
    {
      id: 'mb-1',
      name: 'Titan',
      title: 'Kubernetes 集群稳定性巡检官',
      category: '工程研发',
      downloads: 4200,
      rating: 4.95,
      description: '自动分析 Pod 崩溃、OOM 告警、CrashLoopBackOff 与集群节点负载拓扑。',
      avatar: '/assets/agent-island-blackcat.png',
      installed: false,
    },
    {
      id: 'mb-2',
      name: 'Freya',
      title: '多语言技术文档本地化专家',
      category: '运营效率',
      downloads: 6800,
      rating: 4.92,
      description: '专业术语一致性检查，Markdown / MDX 结构保留与自然流畅跨语种翻译。',
      avatar: '/assets/agent-island-cindy.png',
      installed: true,
    },
    {
      id: 'mb-3',
      name: 'Aegis',
      title: '代码安全与渗透风险审计员',
      category: '安全合规',
      downloads: 3100,
      rating: 4.98,
      description: '深度探测 SQL 注入、SSRF、权限穿透漏洞，并生成带修复代码的合规报告。',
      avatar: '/assets/agent-island-tarara.png',
      installed: false,
    },
    {
      id: 'mb-4',
      name: 'Nexus',
      title: 'API 接口契约与 Mock 自动化专家',
      category: '工程研发',
      downloads: 5400,
      rating: 4.88,
      description: '根据 OpenAPI / Swagger 规范自动生成类型定义、Mock 数据服务器与契约测试。',
      avatar: '/assets/agent-island-whitesnow.png',
      installed: false,
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border-default">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/bots')}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-accent-blue" />
              <span>AI 伙伴市场 (Bot Marketplace)</span>
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              探索社区与官方提供的专业能力伙伴，一键加入你的团队阵容
            </p>
          </div>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="搜索伙伴或角色..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-elevated border border-border-default rounded-xl text-text-primary focus:outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              filterCategory === cat
                ? 'bg-accent-cta text-accent-cta-fg shadow-sm'
                : 'bg-surface-elevated text-text-secondary hover:bg-surface-hover hover:text-text-primary border border-border-default'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {marketBots.map((bot) => (
          <div
            key={bot.id}
            className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <img
                  src={bot.avatar}
                  alt=""
                  className="w-12 h-12 rounded-2xl object-cover bg-surface-chip border border-border-default"
                />
                <div className="flex items-center gap-1 text-[11px] font-mono text-text-tertiary">
                  <Star className="w-3 h-3 text-accent-amber fill-accent-amber" />
                  <span>{bot.rating}</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-text-primary">{bot.name}</h3>
                <div className="text-xs text-accent-blue font-medium">{bot.title}</div>
                <span className="inline-block mt-1 text-[10px] bg-surface-chip text-text-tertiary px-1.5 py-0.2 rounded">
                  {bot.category}
                </span>
              </div>

              <p className="text-xs text-text-secondary leading-relaxed">
                {bot.description}
              </p>
            </div>

            <button
              disabled={bot.installed}
              className={`w-full py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                bot.installed
                  ? 'bg-surface-chip text-text-tertiary cursor-default'
                  : 'bg-accent-cta text-accent-cta-fg hover:bg-accent-hover shadow-sm'
              }`}
            >
              {bot.installed ? (
                <>
                  <Check className="w-3.5 h-3.5 text-accent-green" />
                  <span>已在阵容</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>添加至阵容</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
