import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export interface SlashCommand {
  name: string;
  description: string;
  onlyInSession?: boolean;
}

export const ALL_SLASH_COMMANDS: SlashCommand[] = [
  { name: 'btw', description: '侧边提问', onlyInSession: true },
  { name: 'goal', description: '目标模式' },
  { name: 'rewind', description: '回退会话', onlyInSession: true },
  { name: 'fork', description: '分叉会话', onlyInSession: true },
  { name: 'subtask', description: '拆分子任务' },
  { name: 'mcp', description: '管理 MCP 连接器' },
  { name: 'plugin', description: '管理插件' },
  { name: 'model', description: '选择模型' },
  { name: 'effort', description: '思考深度' },
  { name: 'plan', description: '计划模式' },
  { name: 'permissions', description: '权限模式' },
  { name: 'skills', description: '管理技能' },
  { name: 'output-style', description: '输出风格' },
  { name: 'rename', description: '重命名会话', onlyInSession: true },
  { name: 'add-dir', description: '添加工作目录' },
  { name: 'cd', description: '切换工作目录' },
  { name: 'diff', description: '查看改动', onlyInSession: true },
  { name: 'tasks', description: '后台任务' },
  { name: 'workflows', description: '工作流' },
  { name: 'status', description: '会话状态', onlyInSession: true },
  { name: 'usage', description: '用量与限额' },
  { name: 'autocompact', description: '自动压缩设置' },
  { name: 'config', description: '打开设置' },
  { name: 'storage', description: '存储占用' },
  { name: 'sandbox', description: '沙箱设置' },
  { name: 'theme', description: '切换主题' },
  { name: 'resume', description: '继续会话' },
  { name: 'help', description: '帮助与支持' },
  { name: 'copy', description: '复制回复', onlyInSession: true },
  { name: 'agents', description: '自定义智能体' },
];

interface SlashCommandMenuProps {
  isOpen: boolean;
  filterText: string;
  isNewChat?: boolean; // 新会话不支持 /btw
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  isOpen,
  filterText,
  isNewChat = false,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter commands:
  // 1. If isNewChat, hide onlyInSession commands (like btw)
  // 2. Filter by search text (matching name or description)
  const cleanFilter = filterText.replace(/^\/+/, '').toLowerCase();

  const availableCommands = ALL_SLASH_COMMANDS.filter((cmd) => {
    if (isNewChat && cmd.name === 'btw') return false;
    if (isNewChat && cmd.onlyInSession) return false;
    if (!cleanFilter) return true;
    return (
      cmd.name.toLowerCase().includes(cleanFilter) ||
      cmd.description.toLowerCase().includes(cleanFilter)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || availableCommands.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % availableCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? availableCommands.length - 1 : prev - 1
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = availableCommands[selectedIndex];
        if (selected) {
          onSelect(selected);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, availableCommands, selectedIndex, onSelect, onClose]);

  if (!isOpen || availableCommands.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 mb-2 w-72 max-h-[340px] overflow-y-auto bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs select-none"
    >
      <div className="space-y-0.5">
        {availableCommands.map((cmd, idx) => {
          const isFocused = idx === selectedIndex;
          return (
            <div
              key={cmd.name}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                isFocused
                  ? 'bg-surface-chip text-text-primary'
                  : 'hover:bg-surface-hover text-text-secondary'
              }`}
            >
              <span className="font-medium text-text-primary font-mono text-[13px]">
                {cmd.name}
              </span>
              <span className="text-[12px] text-text-tertiary">
                {cmd.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
