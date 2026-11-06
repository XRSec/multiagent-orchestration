/**
 * Purpose: Room top bar with room switching dropdown, member avatars stack, sequence indicator, and navigation.
 * Context: Displays current room metadata, watermarks, and allows switching to other discovered group rooms.
 * Usage: <RoomHeader currentRoom={room} allRooms={rooms} onSelectRoom={handleRoomSelect} />
 * Prerequisites: React 19, Lucide icons, Tailwind CSS, GroupRecord.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ChevronDown,
  ArrowLeft,
  Hash,
  Sparkles,
  Bot,
  CheckSquare,
  FileText
} from 'lucide-react';
import type { GroupRecord, PartnerInfo } from '@/types/room';
import { WallpaperMaskPickerButton } from '../wallpaper/SessionWallpaperMask';

interface RoomHeaderProps {
  currentRoom: GroupRecord | null;
  allRooms: GroupRecord[];
  partners: PartnerInfo[];
  isSelecting?: boolean;
  onToggleSelectMode?: () => void;
  onSelectRoom: (roomId: string) => void;
  onToggleBlackboard?: () => void;
  blackboardOpen?: boolean;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  currentRoom,
  allRooms,
  partners,
  isSelecting = false,
  onToggleSelectMode,
  onSelectRoom,
  onToggleBlackboard,
  blackboardOpen = false,
}) => {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const roomName = currentRoom?.name || '多智能体群聊';
  const memberCount = currentRoom ? Object.keys(currentRoom.members || {}).length : partners.length;
  const currentSequence = currentRoom?.currentSequence || 0;

  return (
    <div className="relative h-14 border-b border-border-subtle bg-surface/90 backdrop-blur-md px-4 flex items-center justify-between z-30 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => navigate('/bots/groups')}
          className="p-1.5 -ml-1 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
          title="返回群聊概览"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Room Switcher Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover transition-all text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-accent-blue/10 text-accent-blue border border-accent-blue/20 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-text-primary truncate max-w-[200px] sm:max-w-xs">
                  {roomName}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              <p className="text-[10px] text-text-tertiary font-mono truncate">
                {currentRoom?.id || 'multiagent-orchestration'}
              </p>
            </div>
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1.5 w-72 rounded-2xl bg-surface-elevated border border-border-default shadow-2xl p-1.5 z-50 space-y-1">
                <div className="px-3 py-1.5 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                  切换协同房间
                </div>
                {allRooms.map((r) => {
                  const isCurrent = currentRoom?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        onSelectRoom(r.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left ${
                        isCurrent
                          ? 'bg-surface-chip text-text-primary font-semibold shadow-xs'
                          : 'hover:bg-surface-hover text-text-secondary'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="text-[10px] text-text-tertiary font-mono truncate">{r.id}</div>
                      </div>
                      <span className="text-[10px] font-mono text-text-tertiary shrink-0">
                        #{r.currentSequence || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Partner Avatars, Wallpaper, Multi-select, Sequence Indicator */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Avatars Stack */}
        <div className="hidden sm:flex items-center -space-x-1.5 overflow-hidden">
          {partners.slice(0, 5).map((p) => (
            <img
              key={p.id}
              src={p.avatarUrl || '/assets/agent-island-cindy.png'}
              alt={p.name}
              title={`${p.name} (${p.role})`}
              className="w-6 h-6 rounded-full object-cover border-2 border-surface shrink-0"
            />
          ))}
          {partners.length > 5 && (
            <div className="w-6 h-6 rounded-full bg-surface-chip text-text-tertiary border-2 border-surface flex items-center justify-center text-[10px] font-bold">
              +{partners.length - 5}
            </div>
          )}
        </div>

        {/* Wallpaper Mask Control */}
        <WallpaperMaskPickerButton />

        {/* Multi-select toggle button */}
        {onToggleSelectMode && (
          <button
            type="button"
            onClick={onToggleSelectMode}
            title={isSelecting ? '退出多选模式' : '多选消息'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              isSelecting
                ? 'bg-accent-blue text-white shadow-xs'
                : 'bg-surface-chip hover:bg-surface-hover text-text-secondary hover:text-text-primary'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{isSelecting ? '完成多选' : '多选'}</span>
          </button>
        )}

        {/* Blackboard & Charter Toggle */}
        {onToggleBlackboard && (
          <button
            type="button"
            onClick={onToggleBlackboard}
            title="查看共享黑板与团队章程"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
              blackboardOpen
                ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/40 shadow-xs'
                : 'bg-surface-chip hover:bg-surface-hover border-border-default text-text-secondary hover:text-text-primary'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-accent-purple" />
            <span className="hidden sm:inline">共享黑板</span>
          </button>
        )}

        {/* Member Count Badge */}
        <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-chip/60 text-text-secondary text-[11px] font-medium border border-border-subtle">
          <Users className="w-3.5 h-3.5 text-text-tertiary" />
          <span>{memberCount} 位成员</span>
        </div>

        {/* Monotonic Sequence Pill */}
        <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-accent-blue/10 text-accent-blue text-[10px] sm:text-[11px] font-mono font-semibold border border-accent-blue/20 shrink-0">
          <Hash className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <span><span className="hidden sm:inline">Seq </span>#{currentSequence}</span>
        </div>
      </div>
    </div>
  );
};
