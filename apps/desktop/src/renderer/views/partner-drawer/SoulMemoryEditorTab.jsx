/**
 * SoulMemoryEditorTab.jsx
 * 伙伴配置面板 - 灵魂与记忆编辑器：
 * 支持实时查看与编辑 SOUL.md 及 MEMORY.md 文本，具备重置与持久化保存能力。
 * 单文件严格规范：<= 220 行
 */

import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Sparkles, BookOpen, Check } from 'lucide-react';

export default function SoulMemoryEditorTab({
  partner,
  onSave,
}) {
  const [activeTab, setActiveTab] = useState('soul'); // 'soul' | 'memory'
  const [soulContent, setSoulContent] = useState(partner?.soulMd || '');
  const [memoryContent, setMemoryContent] = useState(partner?.memoryMd || '');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setSoulContent(partner?.soulMd || '');
    setMemoryContent(partner?.memoryMd || '');
    setIsSaved(false);
  }, [partner?.id]);

  const handleReset = () => {
    setSoulContent(partner?.soulMd || '');
    setMemoryContent(partner?.memoryMd || '');
    setIsSaved(false);
  };

  const handleSave = () => {
    onSave?.({
      ...partner,
      soulMd: soulContent,
      memoryMd: memoryContent,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Sub-tab Switcher */}
      <div className="flex items-center justify-between border-b border-border/70 pb-2">
        <div className="flex items-center space-x-1.5 bg-card/60 p-1 rounded-xl border border-border/50">
          <button
            onClick={() => setActiveTab('soul')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'soul'
                ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>SOUL.md (系统人设)</span>
          </button>

          <button
            onClick={() => setActiveTab('memory')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'memory'
                ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>MEMORY.md (长期记忆)</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-card border border-border/60 transition-all cursor-pointer"
            title="重置修改"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleSave}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-accent text-slate-950 font-semibold text-xs hover:bg-accent-hover transition-all shadow-md active:scale-95 cursor-pointer"
          >
            {isSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSaved ? '已保存' : '保存配置'}</span>
          </button>
        </div>
      </div>

      {/* Editor Description */}
      <div className="text-[11px] text-slate-400 leading-relaxed">
        {activeTab === 'soul'
          ? '定义伙伴的核心角色设定、工作原则及与主控编排的协作协议，在启动时前置注入。'
          : '伙伴跨会话留存的持久记忆沉淀，包含历史审计产物、踩坑经验与专属项目上下文。'}
      </div>

      {/* Textarea Editor */}
      <div className="relative">
        <textarea
          rows={14}
          value={activeTab === 'soul' ? soulContent : memoryContent}
          onChange={(e) =>
            activeTab === 'soul'
              ? setSoulContent(e.target.value)
              : setMemoryContent(e.target.value)
          }
          className="w-full bg-slate-950 border border-border/80 rounded-xl p-3 font-mono text-[11px] text-slate-200 leading-relaxed outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/50 resize-y shadow-inner"
          placeholder={activeTab === 'soul' ? '# Partner Soul Prompt...' : '# Long-term Memories...'}
        />

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1 px-1">
          <span>行数: {(activeTab === 'soul' ? soulContent : memoryContent).split('\n').length} 行</span>
          <span>UTF-8 编码 · 软链映射至 ~/.multiagent-orchestration/</span>
        </div>
      </div>
    </div>
  );
}
