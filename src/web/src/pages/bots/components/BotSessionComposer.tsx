/**
 * Purpose: Enhanced interactive message composer for bot chat session.
 * Context: BotSessionPage bottom input area with slash/mention popups and audio controls.
 * Usage: Rendered at the bottom of BotSessionPage.
 * Prerequisites: React, lucide-react, MentionOption type.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  FileCode,
  Image as ImageIcon,
  Zap,
  Plus,
  Shield,
  Mic,
  MicOff,
  ArrowUp,
} from 'lucide-react';

export interface MentionOption {
  name: string;
  subtitle: string;
  type: 'bot' | 'file';
  avatar?: string;
  insert: string;
}

export interface SlashCommandOption {
  cmd: string;
  desc: string;
  insert: string;
}

export interface BotSessionComposerProps {
  botName: string;
  inputVal: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onAppendText: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  showSlashMenu: boolean;
  slashCommands: SlashCommandOption[];
  onInsertSlash: (insertText: string) => void;
  showMentionMenu: boolean;
  mentionItems: MentionOption[];
  onInsertMention: (insertText: string) => void;
  isRecording: boolean;
  recordingDuration: number;
  onToggleRecording: () => void;
  permissionMode: 'Auto' | 'Ask';
  onTogglePermissionMode: () => void;
}

export function BotSessionComposer({
  botName,
  inputVal,
  onInputChange,
  onSend,
  onAppendText,
  textareaRef,
  showSlashMenu,
  slashCommands,
  onInsertSlash,
  showMentionMenu,
  mentionItems,
  onInsertMention,
  isRecording,
  recordingDuration,
  onToggleRecording,
  permissionMode,
  onTogglePermissionMode,
}: BotSessionComposerProps) {
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Close plus menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setIsPlusMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="p-4 border-t border-border-default bg-surface shrink-0 relative">
      <div className="max-w-3xl mx-auto relative">
        {/* A. '/' 斜杠命令联想弹窗 */}
        {showSlashMenu && slashCommands.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in slide-in-from-bottom-2">
            <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
              快捷指令 (Slash Commands)
            </div>
            {slashCommands.map((c) => (
              <div
                key={c.cmd}
                onClick={() => onInsertSlash(c.insert)}
                className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors flex items-center justify-between"
              >
                <span className="font-mono font-bold text-accent-blue">{c.cmd}</span>
                <span className="text-text-tertiary text-[11px] truncate max-w-[150px]">
                  {c.desc}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* B. '@' 提及联想弹窗 */}
        {showMentionMenu && mentionItems.length > 0 && (
          <div className="absolute bottom-full left-8 mb-2 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in slide-in-from-bottom-2">
            <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
              提及伙伴或引用文件 (@ Mentions)
            </div>
            {mentionItems.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onInsertMention(item.insert)}
                className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors flex items-center gap-2"
              >
                {item.type === 'bot' && item.avatar ? (
                  <img src={item.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <FileCode className="w-4 h-4 text-accent-blue" />
                )}
                <div className="flex flex-col truncate">
                  <span className="font-semibold text-text-primary text-xs">@{item.name}</span>
                  <span className="text-[10px] text-text-tertiary">{item.subtitle}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* C. Composer Card Box */}
        <div className="bg-surface-elevated border border-border-default rounded-2xl shadow-lg p-2.5 flex flex-col focus-within:border-accent-blue/50 transition-all">
          {/* 正在录音时的声波视觉提示 */}
          {isRecording ? (
            <div className="py-3 px-3 flex items-center justify-between bg-surface rounded-xl border border-border-subtle animate-pulse mb-2">
              <div className="flex items-center gap-2 text-xs text-accent-red font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-red animate-ping" />
                <span>正在语音录音... 00:0{recordingDuration}</span>
              </div>
              <button
                type="button"
                onClick={onToggleRecording}
                className="px-2.5 py-1 bg-accent-red text-white text-xs rounded-lg font-medium hover:bg-red-600 transition-colors cursor-pointer"
              >
                完成转写
              </button>
            </div>
          ) : null}

          {/* Input Textarea */}
          <textarea
            ref={textareaRef}
            value={inputVal}
            onChange={onInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={`给 ${botName} 发送专属任务，输入 / 触发指令，输入 @ 提及伙伴与文件...`}
            rows={2}
            className="w-full bg-transparent resize-none border-none text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none p-1 leading-relaxed"
          />

          {/* Bottom Actions Row */}
          <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
            <div className="flex items-center gap-1.5">
              {/* 1. '+' 扩展菜单按钮 */}
              <div className="relative" ref={plusMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                  className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  title="添加内容与附件 (+)"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* '+' Menu Dropdown */}
                {isPlusMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-52 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5">
                    <div
                      onClick={() => {
                        setIsPlusMenuOpen(false);
                        onAppendText('@file:src/App.tsx ');
                      }}
                      className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer flex items-center gap-2 text-text-primary"
                    >
                      <FileCode className="w-3.5 h-3.5 text-accent-blue" />
                      <span>添加代码文件引用</span>
                    </div>
                    <div
                      onClick={() => {
                        setIsPlusMenuOpen(false);
                        onAppendText('@image:screenshot.png ');
                      }}
                      className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer flex items-center gap-2 text-text-primary"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-accent-green" />
                      <span>上传视觉参考图</span>
                    </div>
                    <div
                      onClick={() => {
                        setIsPlusMenuOpen(false);
                        onAppendText('/skill ');
                      }}
                      className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer flex items-center gap-2 text-text-primary"
                    >
                      <Zap className="w-3.5 h-3.5 text-accent-amber" />
                      <span>插入技能执行指令</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. 权限配置按钮 */}
              <button
                type="button"
                onClick={onTogglePermissionMode}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-surface-hover text-text-secondary text-xs transition-colors cursor-pointer border border-border-subtle"
                title="切换工具执行权限"
              >
                <Shield
                  className={`w-3.5 h-3.5 ${
                    permissionMode === 'Auto' ? 'text-accent-green' : 'text-accent-amber'
                  }`}
                />
                <span className="font-mono text-[11px]">
                  {permissionMode === 'Auto' ? 'Auto (自动审批)' : 'Ask (手动确认)'}
                </span>
              </button>
            </div>

            {/* Right Side: Voice Input + Send Button */}
            <div className="flex items-center gap-2">
              {/* 语音录音按钮 */}
              <button
                type="button"
                onClick={onToggleRecording}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isRecording
                    ? 'bg-accent-red text-white'
                    : 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'
                }`}
                title={isRecording ? '点击停止并转写' : '语音输入 (按住或点击)'}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* 发送按钮 */}
              <button
                type="button"
                onClick={onSend}
                disabled={!inputVal.trim()}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  inputVal.trim()
                    ? 'bg-accent-cta text-accent-cta-fg shadow-md hover:bg-accent-hover'
                    : 'bg-surface-chip text-text-disabled cursor-not-allowed'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
