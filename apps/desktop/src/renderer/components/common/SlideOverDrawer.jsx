import React, { useEffect, useRef, useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';

/**
 * SlideOverDrawer
 * 448px 侧边抽屉容器，具备防误触拦截、ESC 输入法保护与上下文锁定
 *
 * @param {Object} props
 * @param {boolean} [props.open=false] - 抽屉是否展开
 * @param {() => void} [props.onClose] - 关闭回调
 * @param {React.ReactNode} [props.title] - 标题
 * @param {string} [props.subtitle] - 副标题
 * @param {React.ReactNode} [props.headerExtra] - 顶栏额外元素
 * @param {boolean} [props.showBackButton=false] - 是否展示返回按钮
 * @param {() => void} [props.onBack] - 点击返回按钮回调
 * @param {React.ReactNode} props.children - 抽屉主体内容
 * @param {React.ReactNode} [props.footer] - 底部固定操作栏
 * @param {boolean} [props.closeOnOverlayClick=false] - 点击遮罩是否触发关闭（防误触默认 false）
 * @param {string} [props.widthClass='max-w-md'] - 宽度样式类，默认 max-w-md (448px)
 * @param {string} [props.contentClassName=''] - 主体内容附加类名
 */
export default function SlideOverDrawer({
  open = false,
  onClose = () => {},
  title,
  subtitle,
  headerExtra,
  showBackButton = false,
  onBack,
  children,
  footer,
  closeOnOverlayClick = false,
  widthClass = 'max-w-md',
  contentClassName = '',
}) {
  const drawerRef = useRef(null);
  const [pulseShield, setPulseShield] = useState(false);

  // 1. ESC 键盘事件监听与 IME 拼音输入法候选保护
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // 当处于中文输入法组合打字中，阻止关闭抽屉，保护正在输入的候选词
        if (e.isComposing || e.keyCode === 229) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // 2. 锁定外部 Body 滚动穿透
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  // 3. 遮罩点击逻辑（防误触机制）
  const handleOverlayClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (closeOnOverlayClick) {
      onClose();
    } else {
      // 触发边缘微光闪烁，提示用户使用显式关闭按钮
      setPulseShield(true);
      setTimeout(() => setPulseShield(false), 300);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* 背景遮罩 */}
      <div
        onClick={handleOverlayClick}
        aria-hidden="true"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* 侧滑抽屉主体 */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10 pointer-events-none">
        <aside
          ref={drawerRef}
          className={`pointer-events-auto flex flex-col w-screen ${widthClass} bg-surface border-l border-border text-slate-100 shadow-2xl transition-all duration-300 ease-in-out ${
            pulseShield ? 'ring-2 ring-accent/40' : ''
          }`}
        >
          {/* Header 区域 */}
          <header className="h-14 min-h-[3.5rem] border-b border-border px-5 flex items-center justify-between gap-3 bg-surface/90 backdrop-blur-xs select-none">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {showBackButton && (
                <button
                  type="button"
                  onClick={onBack}
                  className="p-1 -ml-1 text-slate-400 hover:text-slate-200 hover:bg-card rounded-md transition-colors"
                  aria-label="返回上一层"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                {typeof title === 'string' ? (
                  <h2 className="text-sm font-semibold text-slate-100 truncate tracking-wide">{title}</h2>
                ) : (
                  title
                )}
                {subtitle && <p className="text-xs text-slate-400 truncate mt-0.5">{subtitle}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {headerExtra}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-card rounded-md transition-colors"
                aria-label="关闭抽屉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Body 区域 */}
          <main className={`flex-1 min-h-0 overflow-y-auto px-6 py-5 ${contentClassName}`}>
            {children}
          </main>

          {/* Footer 区域 */}
          {footer && (
            <footer className="border-t border-border px-6 py-4 bg-surface/95 backdrop-blur-xs shrink-0">
              {footer}
            </footer>
          )}
        </aside>
      </div>
    </div>
  );
}
