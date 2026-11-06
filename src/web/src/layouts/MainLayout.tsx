import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ContentHeader } from './ContentHeader';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { CommandPalette } from '@/components/CommandPalette';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useIsMobile } from '@/hooks/useIsMobile';

export function MainLayout() {
  const { isDark, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Auto-adapt padding when virtual keyboard opens
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFocus = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setIsKeyboardOpen(true);
      }
    };
    const handleBlur = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setIsKeyboardOpen(false);
      }
    };
    window.addEventListener('focus', handleFocus, true);
    window.addEventListener('blur', handleBlur, true);
    return () => {
      window.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('blur', handleBlur, true);
    };
  }, []);

  // Network offline/online listener (pi-web style network banner)
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      showToast('网络已重新连接，数据同步恢复正常', 'success');
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast('网络连接中断，当前处于离线模式', 'warning');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Sidebar Width & Collapsed state with Drag-to-Resize
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('cindy_sidebar_width');
    return saved ? parseInt(saved, 10) : 260;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth < 768;
    return false;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Auto-collapse on mobile breakpoint transition
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile]);

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
      {/* 侧栏收起时的左边缘感应热区 (仅在桌面端有效) */}
      {!isMobile && sidebarCollapsed && (
        <div
          onMouseEnter={handleTriggerPeek}
          className="fixed left-0 top-0 bottom-0 w-3.5 z-40 cursor-pointer bg-transparent"
          title="鼠标悬停展开侧边栏 (Cindy 规范)"
        />
      )}

      {/* 1. Left Navigation Sidebar (支持桌面端正常/折叠与移动端 Drawer 抽屉) */}
      <Sidebar
        width={sidebarWidth}
        collapsed={sidebarCollapsed}
        isPeeking={isPeeking}
        isMobile={isMobile}
        onToggleCollapse={() => {
          setSidebarCollapsed(!sidebarCollapsed);
          setIsPeeking(false);
        }}
        onCloseMobile={() => setSidebarCollapsed(true)}
        onMouseEnterDrawer={handleMouseEnterDrawer}
        onMouseLeaveDrawer={handleMouseLeaveDrawer}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* 移动端打开抽屉时的全屏暗色遮罩 */}
      {isMobile && !sidebarCollapsed && (
        <div
          onClick={() => setSidebarCollapsed(true)}
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* 侧栏 Peek 态时的透明遮罩 (桌面端，点击可直接关闭) */}
      {!isMobile && sidebarCollapsed && isPeeking && (
        <div
          onClick={() => setIsPeeking(false)}
          className="fixed inset-0 bg-black/10 z-40 backdrop-blur-[1px] transition-opacity"
        />
      )}

      {/* 2. Drag-to-Resize Handle (仅桌面端渲染，双击重置) */}
      {!isMobile && !sidebarCollapsed && (
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

      {/* 3. Main Content Center Column (移动端撑满 100% 宽度，底部预留 Tab 空间) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden w-full">
        {/* Top Header */}
        <ContentHeader
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onTriggerPeek={handleTriggerPeek}
          rightSidebarOpen={rightSidebarOpen}
          onToggleRightSidebar={() => setRightSidebarOpen(!rightSidebarOpen)}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          isMobile={isMobile}
        />

        {/* Offline Banner (pi-web inspiration: subtle amber strip on connection loss) */}
        {isOffline && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 px-4 py-1.5 text-xs flex items-center justify-between shrink-0 z-30 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>网络连接已中断，当前处于离线只读状态</span>
            </div>
            <span className="text-[11px] font-mono text-amber-400/80">等待自动重连...</span>
          </div>
        )}

        {/* Dynamic Page Content (预留底部导航安全间距，软键盘唤起时动态吸附) */}
        <main
          className={`flex-1 overflow-y-auto relative bg-content-area flex flex-col ${
            isMobile && !isKeyboardOpen ? 'pb-14' : 'pb-0'
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* 4. Mobile Bottom Navigation Bar (pi-web 风格一键触达) */}
      {isMobile && <MobileBottomNav />}

      {/* 5. Right Sidebar Dock */}
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
