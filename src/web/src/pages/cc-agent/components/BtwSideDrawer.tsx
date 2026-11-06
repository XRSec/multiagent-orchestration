import React from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

interface BtwMessage {
  q: string;
  a: string;
  time: string;
}

interface BtwSideDrawerProps {
  open: boolean;
  onClose: () => void;
  btwList: BtwMessage[];
  btwQuery: string;
  onBtwQueryChange: (val: string) => void;
  onSendBtw: () => void;
}

export const BtwSideDrawer: React.FC<BtwSideDrawerProps> = ({
  open,
  onClose,
  btwList,
  btwQuery,
  onBtwQueryChange,
  onSendBtw
}) => {
  if (!open) return null;

  return (
    <div className="absolute right-4 top-12 bottom-24 w-96 bg-surface-elevated/95 backdrop-blur-2xl border border-border-default rounded-3xl shadow-2xl flex flex-col z-40 overflow-hidden text-xs animate-in slide-in-from-right-4 duration-200">
      <div className="p-3.5 border-b border-border-default bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent-blue" />
          <span className="font-semibold text-text-primary">/btw 侧边提问流</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {btwList.map((item, idx) => (
          <div key={idx} className="space-y-2">
            <div className="flex justify-end">
              <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%] text-text-primary">
                {item.q}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-surface border border-border-default rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[90%] text-text-secondary leading-relaxed">
                {item.a}
              </div>
            </div>
            <div className="text-[10px] text-text-tertiary text-right px-1">
              {item.time}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border-default bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={btwQuery}
            onChange={(e) => onBtwQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSendBtw()}
            placeholder="提出旁路问题 (不污染主 Prompt 缓存)..."
            className="flex-1 bg-surface-chip border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue transition-colors text-xs"
          />
          <button
            onClick={onSendBtw}
            className="p-2 rounded-xl bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors cursor-pointer shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
