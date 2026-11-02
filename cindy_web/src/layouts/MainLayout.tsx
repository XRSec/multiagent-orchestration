import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ContentHeader } from './ContentHeader';
import { RightSidebar } from './RightSidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { useTheme } from '@/contexts/ThemeContext';

export function MainLayout() {
  const { isDark, toggleTheme } = useTheme();
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Sidebar Width & Collapsed state with Drag-to-Resize (用户要求：侧边栏与主对话之间需要支持拖拽)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('cindy_sidebar_width');
    return saved ? parseInt(saved, 10) : 260;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Sidebar Peek (鼠标悬浮的时候主动打开侧边栏，鼠标不离开侧边栏不消失，参考 Cindy)
  const [isPeeking, setIsPeeking] = useState(false);
  const peekCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTriggerPeek = () => {
    if (!sidebarCollapsed) return;
    if (peekCloseTimer.current) {
      clearTimeout(peekCloseTimer.current);
      peekCloseTimer.current = null;
    }
    setIsPeeking(true);
  };

  const handleMouseEnterDrawer = () => {
    if (peekCloseTimer.current) {
      clearTimeout(peekCloseTimer.current);
      peekCloseTimer.current = null;
    }
    setIsPeeking(true);
  };

  const handleMouseLeaveDrawer = () => {
    if (!sidebarCollapsed) return;
    if (peekCloseTimer.current) {
      clearTimeout(peekCloseTimer.current);
    }
    peekCloseTimer.current = setTimeout(() => {
      setIsPeeking(false);
    }, 220);
  };

  // Global Keyboard shortcuts: ⌘K for Command Palette, ⌘B for toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle Dragging Sidebar Width
  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebar) return;
      const newWidth = Math.max(180, Math.min(480, e.clientX));
      setSidebarWidth(newWidth);
      localStorage.setItem('cindy_sidebar_width', newWidth.toString());
    };

    const handleMouseUp = () => {
      if (isResizingSidebar) {
        setIsResizingSidebar(false);
      }
    };

    if (isResizingSidebar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden bg-surface text-text-primary ${
        isResizingSidebar ? 'select-none cursor-col-resize' : ''
      }`}
    >
      {/* 侧栏收起时的左边缘感应热区 (鼠标碰触自动滑出侧边栏，参考 Cindy) */}
      {sidebarCollapsed && (
        <div
          onMouseEnter={handleTriggerPeek}
          className="fixed left-0 top-0 bottom-0 w-3.5 z-40 cursor-pointer bg-transparent"
          title="鼠标悬停展开侧边栏 (Cindy 规范)"
        />
      )}

      {/* 1. Left Navigation Sidebar */}
      <Sidebar
        width={sidebarWidth}
        collapsed={sidebarCollapsed}
        isPeeking={isPeeking}
        onToggleCollapse={() => {
          setSidebarCollapsed(!sidebarCollapsed);
          setIsPeeking(false);
        }}
        onMouseEnterDrawer={handleMouseEnterDrawer}
        onMouseLeaveDrawer={handleMouseLeaveDrawer}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* 侧栏 Peek 态时的透明遮罩 (点击可直接关闭) */}
      {sidebarCollapsed && isPeeking && (
        <div
          onClick={() => setIsPeeking(false)}
          className="fixed inset-0 bg-black/10 z-40 backdrop-blur-[1px] transition-opacity"
        />
      )}

      {/* 2. Drag-to-Resize Handle (侧边栏与主对话之间的拖拽手柄，双击重置) */}
      {!sidebarCollapsed && (
        <div
          onMouseDown={handleStartResize}
          onDoubleClick={() => {
            setSidebarWidth(260);
            localStorage.setItem('cindy_sidebar_width', '260');
          }}
          className={`w-1 hover:w-1.5 h-full cursor-col-resize transition-colors z-30 shrink-0 ${
            isResizingSidebar ? 'bg-accent-blue w-1.5' : 'bg-transparent hover:bg-accent-blue/40'
          }`}
          title="拖拽调整侧栏宽度，双击恢复默认宽度"
        />
      )}

      {/* 3. Main Content Center Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <ContentHeader
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(false)}
          onTriggerPeek={handleTriggerPeek}
          rightSidebarOpen={rightSidebarOpen}
          onToggleRightSidebar={() => setRightSidebarOpen(!rightSidebarOpen)}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto relative bg-content-area flex flex-col">
          <Outlet />
        </main>
      </div>

      {/* 4. Right Sidebar Dock */}
      {rightSidebarOpen && (
        <RightSidebar onClose={() => setRightSidebarOpen(false)} />
      )}

      {/* 5. Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
