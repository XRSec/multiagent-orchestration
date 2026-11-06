/**
 * ImportSkillModal.tsx
 * 自定义 Skill 导入与实体管理弹窗:
 * - 默认复制完整物理实体到 ~/.agents/skills/ 集中单独管理，完全与源路径脱钩
 * - 支持智能覆盖导入与旧版本安全清理
 * - 提供实体复制与软链接两种导入机制选择
 * 单文件 <= 300 行规范。
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FolderPlus,
  Link2,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  RefreshCw,
  Copy,
  Layers
} from 'lucide-react';

interface ImportSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (skill: any) => void;
}

export function ImportSkillModal({ isOpen, onClose, onSuccess }: ImportSkillModalProps) {
  const [sourcePath, setSourcePath] = useState('');
  const [skillName, setSkillName] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [mode, setMode] = useState<'copy' | 'symlink'>('copy'); // 默认复制实体，单独管理
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [successInfo, setSuccessInfo] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSourcePath('');
      setSkillName('');
      setOverwrite(false);
      setMode('copy');
      setErrorMsg(null);
      setAlreadyExists(false);
      setSuccessInfo(null);
    }
  }, [isOpen]);

  const handleSourceChange = (val: string) => {
    setSourcePath(val);
    setErrorMsg(null);
    setAlreadyExists(false);
    if (!skillName || skillName === sourcePath.split('/').filter(Boolean).pop()) {
      const base = val.trim().replace(/\/+$/, '').split('/').pop() || '';
      setSkillName(base);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourcePath.trim()) {
      setErrorMsg('请输入有效的 Skill 源目录路径');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: sourcePath.trim(),
          skillName: skillName.trim() || undefined,
          overwrite,
          mode
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error && data.error.includes('[ALREADY_EXISTS]')) {
          setAlreadyExists(true);
          setErrorMsg('该技能在 ~/.agents/skills/ 已存在，可勾选“覆盖导入”更新实体副本');
        } else {
          setErrorMsg(data.error || '导入失败，请检查路径');
        }
        return;
      }

      setSuccessInfo(data.skill);
      if (onSuccess) {
        onSuccess(data.skill);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || '网络或服务端异常');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const PRESET_SOURCES = [
    { label: 'Gemini Research Exporter', path: '/Users/xr/.gemini/config/skills/gemini-research-exporter' },
    { label: 'Impeccable Frontend Design', path: '/Users/xr/.gemini/config/skills/impeccable' },
    { label: 'VPS Browser Deployment', path: '/Users/xr/.gemini/config/skills/vps-browser-deployment' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-surface border border-border-default rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-default flex items-center justify-between bg-surface-elevated/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">导入自定义技能 (Import Skill)</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                复制实体到 <code className="text-[11px] text-emerald-400 font-mono">~/.agents/skills/</code> 单独管理与去脂蒸馏
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Quick presets */}
          <div>
            <label className="block text-text-secondary font-medium mb-1.5">快捷选择已有技能目录：</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SOURCES.map((p) => (
                <button
                  type="button"
                  key={p.path}
                  onClick={() => handleSourceChange(p.path)}
                  className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-default text-text-secondary hover:text-text-primary hover:border-emerald-500/40 text-[11px] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source Path Input */}
          <div>
            <label className="block text-text-primary font-medium mb-1">
              技能源目录路径 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => handleSourceChange(e.target.value)}
              placeholder="/path/to/your/skill-directory"
              className="w-full bg-surface-elevated border border-border-default rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Skill Name */}
          <div>
            <label className="block text-text-primary font-medium mb-1">
              导入后的技能标识 (Skill Identifier)
            </label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g. my-custom-skill"
              className="w-full bg-surface-elevated border border-border-default rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500 font-mono"
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              将在 <span className="font-mono text-emerald-400">~/.agents/skills/{skillName || '<skill-name>'}</span> 生成独立的实体目录
            </p>
          </div>

          {/* Import Mode Toggle */}
          <div className="p-3 rounded-xl bg-surface-elevated border border-border-subtle space-y-2">
            <span className="block text-text-secondary font-medium text-[11px]">存储管理模式：</span>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <label className={`flex-1 flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                mode === 'copy' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border-default hover:bg-surface-hover'
              }`}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'copy'}
                  onChange={() => setMode('copy')}
                  className="mt-0.5 text-emerald-500 focus:ring-0"
                />
                <div>
                  <div className="text-text-primary font-medium text-xs flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5 text-emerald-400" />
                    <span>复制实体目录 (推荐)</span>
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    深拷贝全部实体文件并解引用软链，单独管理与蒸馏，永不失效。
                  </p>
                </div>
              </label>

              <label className={`flex-1 flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                mode === 'symlink' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border-default hover:bg-surface-hover'
              }`}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'symlink'}
                  onChange={() => setMode('symlink')}
                  className="mt-0.5 text-emerald-500 focus:ring-0"
                />
                <div>
                  <div className="text-text-primary font-medium text-xs flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>创建软链接</span>
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    仅创建符号链接引用，依赖外部原始路径存在。
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Overwrite Toggle */}
          <div className="pt-2 border-t border-border-subtle flex items-start gap-2.5">
            <input
              type="checkbox"
              id="overwrite-check"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="mt-0.5 rounded border-border-default text-emerald-500 focus:ring-0"
            />
            <label htmlFor="overwrite-check" className="text-text-primary cursor-pointer">
              <span className="font-medium">如果目标已存在，允许覆盖导入</span>
              <span className="block text-[11px] text-text-tertiary">
                安全清理已有副本并重新复制全新实体，保持最新
              </span>
            </label>
          </div>

          {/* Security & Loop Assurance */}
          <div className="p-2.5 rounded-lg bg-surface-elevated/60 border border-border-subtle flex items-start gap-2 text-[11px] text-text-secondary">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-400">独立实体管理规范：</span>
              复制实体将自动阻断任何循环引用与同库套娃，文件永久独立保存在 <code className="text-text-primary font-mono">~/.agents/skills/</code>。
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Message */}
          {successInfo && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2 text-xs">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>
                技能已成功{successInfo.isPhysicalCopy ? '复制实体' : '软链接'}并就绪：{successInfo.skillName} (可单独管理)
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border-default">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{overwrite || alreadyExists ? '确认覆盖导入' : (mode === 'copy' ? '复制实体并导入' : '建立软链接并导入')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
