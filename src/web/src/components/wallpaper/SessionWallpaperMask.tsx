import React, { useState, useEffect } from 'react';
import { Image, Sliders, Check, Eye } from 'lucide-react';

export interface WallpaperOption {
  id: string;
  name: string;
  src: string;
  thumbnail: string;
}

export const WALLPAPER_PRESETS: WallpaperOption[] = [
  { id: 'cindy-dream', name: 'Cindy 梦境', src: '/src/assets/wallpapers/cindy-dream.webp', thumbnail: '/src/assets/wallpapers/cindy-dream.webp' },
  { id: 'cindy-studio', name: 'Cindy 工坊', src: '/src/assets/wallpapers/cindy-studio.webp', thumbnail: '/src/assets/wallpapers/cindy-studio.webp' },
  { id: 'cindy-neon', name: '霓虹夜行', src: '/src/assets/wallpapers/cindy-neon.webp', thumbnail: '/src/assets/wallpapers/cindy-neon.webp' },
  { id: 'rose-quartz', name: '玫瑰晶体', src: '/src/assets/wallpapers/rose-quartz.webp', thumbnail: '/src/assets/wallpapers/rose-quartz.webp' },
  { id: 'planet-dawn', name: '行星黎明', src: '/src/assets/wallpapers/planet-dawn.webp', thumbnail: '/src/assets/wallpapers/planet-dawn.webp' },
  { id: 'indigo-folds', name: '靛青褶皱', src: '/src/assets/wallpapers/indigo-folds.webp', thumbnail: '/src/assets/wallpapers/indigo-folds.webp' },
  { id: 'silent-orbits', name: '静默轨道', src: '/src/assets/wallpapers/silent-orbits.webp', thumbnail: '/src/assets/wallpapers/silent-orbits.webp' },
  { id: 'dune-dawn', name: '沙丘曦光', src: '/src/assets/wallpapers/dune-dawn.webp', thumbnail: '/src/assets/wallpapers/dune-dawn.webp' },
];

export interface WallpaperMaskConfig {
  enabled: boolean;
  wallpaperId: string;
  maskOpacity: number; // 0 to 1, e.g. 0.85
  blurAmount: number; // e.g. 12
}

const STORAGE_KEY = 'cindy_wallpaper_mask_config_v2';

export function getStoredWallpaperConfig(): WallpaperMaskConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    enabled: false, // 必须默认关闭，保持高对比度与纯净原生会话背景
    wallpaperId: 'cindy-dream',
    maskOpacity: 0.85,
    blurAmount: 16
  };
}

export function saveStoredWallpaperConfig(cfg: WallpaperMaskConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export const SessionWallpaperMask: React.FC = () => {
  const [config, setConfig] = useState<WallpaperMaskConfig>(getStoredWallpaperConfig);

  useEffect(() => {
    const handleStorageChange = () => {
      setConfig(getStoredWallpaperConfig());
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('cindy_wallpaper_config_updated', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('cindy_wallpaper_config_updated', handleStorageChange);
    };
  }, []);

  if (!config.enabled) {
    return null;
  }

  const currentWallpaper = WALLPAPER_PRESETS.find((w) => w.id === config.wallpaperId) || WALLPAPER_PRESETS[0];

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* 1. Underlying Wallpaper Asset */}
      <img
        src={currentWallpaper.src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500 scale-105"
        style={{
          filter: `blur(${config.blurAmount}px)`,
          transform: 'scale(1.08)'
        }}
      />

      {/* 2. Frosted Glass Mask Layer with Radial Vignette */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          backgroundColor: `rgba(var(--surface-color-rgb, 24, 24, 27), ${config.maskOpacity})`,
          backdropFilter: `blur(${config.blurAmount}px)`
        }}
      />

      {/* 3. Subtle Vignette & Gradient Mask for Text Contrast */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-surface/40 to-surface/90 opacity-90" />
    </div>
  );
};

export const WallpaperMaskPickerButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<WallpaperMaskConfig>(getStoredWallpaperConfig);

  const updateConfig = (newCfg: WallpaperMaskConfig) => {
    setConfig(newCfg);
    saveStoredWallpaperConfig(newCfg);
    window.dispatchEvent(new Event('cindy_wallpaper_config_updated'));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="会话背景与蒙版设置"
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
          config.enabled
            ? 'bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25'
            : 'bg-surface-chip hover:bg-surface-hover text-text-secondary'
        }`}
      >
        <Image className="w-3.5 h-3.5" />
        <span>背景蒙版</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-surface-elevated/95 backdrop-blur-xl border border-border-default rounded-2xl shadow-2xl p-3 z-50 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
            <span className="font-semibold text-text-primary">会话壁纸与蒙版</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-[11px] text-text-tertiary">启用</span>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => updateConfig({ ...config, enabled: e.target.checked })}
                className="w-3.5 h-3.5 accent-accent-blue cursor-pointer"
              />
            </label>
          </div>

          {config.enabled && (
            <>
              {/* Presets Grid */}
              <div className="space-y-1">
                <div className="text-[10px] text-text-tertiary">壁纸预设</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {WALLPAPER_PRESETS.map((wp) => {
                    const isSelected = config.wallpaperId === wp.id;
                    return (
                      <button
                        key={wp.id}
                        title={wp.name}
                        onClick={() => updateConfig({ ...config, wallpaperId: wp.id })}
                        className={`relative aspect-video rounded-lg overflow-hidden border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-accent-blue ring-2 ring-accent-blue/30 scale-105'
                            : 'border-border-default hover:border-text-tertiary'
                        }`}
                      >
                        <img src={wp.thumbnail} alt={wp.name} className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-accent-blue/30 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mask Opacity Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-text-tertiary">蒙版遮罩浓度</span>
                  <span className="font-mono text-text-primary">{Math.round(config.maskOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="0.95"
                  step="0.05"
                  value={config.maskOpacity}
                  onChange={(e) => updateConfig({ ...config, maskOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-accent-blue cursor-pointer"
                />
              </div>

              {/* Blur Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-text-tertiary">毛玻璃模糊度</span>
                  <span className="font-mono text-text-primary">{config.blurAmount}px</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="32"
                  step="2"
                  value={config.blurAmount}
                  onChange={(e) => updateConfig({ ...config, blurAmount: parseInt(e.target.value, 10) })}
                  className="w-full accent-accent-blue cursor-pointer"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
