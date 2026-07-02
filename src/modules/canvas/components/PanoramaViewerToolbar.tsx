import React, { useState } from 'react';
import { Camera, Grid3x3, RotateCcw, X, Layers, Smartphone, Bookmark, BookmarkCheck, Trash2 } from 'lucide-react';
import type { PanoramaScreenshotMode } from '../types/canvas';

interface ViewPreset {
  name: string;
  yaw: number;
  pitch: number;
  fov: number;
}

interface PanoramaViewerToolbarProps {
  zoomPercent: number;
  isLoading: boolean;
  gyroEnabled: boolean;
  viewPresets: ViewPreset[];
  onScreenshot: (mode: PanoramaScreenshotMode) => void;
  onExportCurrent: () => void;
  onReset: () => void;
  onClose: () => void;
  onSavePreset: () => void;
  onRestorePreset: (preset: ViewPreset) => void;
  onDeletePreset: (index: number) => void;
  onToggleGyro: () => void;
}

export const PanoramaViewerToolbar: React.FC<PanoramaViewerToolbarProps> = ({
  zoomPercent,
  isLoading,
  gyroEnabled,
  viewPresets,
  onScreenshot,
  onExportCurrent,
  onReset,
  onClose,
  onSavePreset,
  onRestorePreset,
  onDeletePreset,
  onToggleGyro,
}) => {
  const [showPresets, setShowPresets] = useState(false);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(30, 30, 30, 0.92)',
          backdropFilter: 'blur(8px)',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '6px 12px',
          zIndex: 10,
          userSelect: 'none',
        }}
      >
        <button
          title="截图当前视角"
          onClick={onExportCurrent}
          disabled={isLoading}
          style={buttonStyle}
        >
          <Camera size={16} />
          <span style={{ marginLeft: 4, fontSize: 12 }}>截图</span>
        </button>

        <div style={dividerStyle} />

        <button
          title="4 大视角截图（每 90°）"
          onClick={() => onScreenshot('quad')}
          disabled={isLoading}
          style={buttonStyle}
        >
          <Grid3x3 size={16} />
          <span style={{ marginLeft: 4, fontSize: 12 }}>4 视角</span>
        </button>

        <button
          title="12 大视角截图（每 30°）"
          onClick={() => onScreenshot('dodeca')}
          disabled={isLoading}
          style={buttonStyle}
        >
          <Layers size={16} />
          <span style={{ marginLeft: 4, fontSize: 12 }}>12 视角</span>
        </button>

        <div style={dividerStyle} />

        <button
          title="重置视角"
          onClick={onReset}
          disabled={isLoading}
          style={buttonStyle}
        >
          <RotateCcw size={16} />
          <span style={{ marginLeft: 4, fontSize: 12 }}>重置</span>
        </button>

        <div style={dividerStyle} />

        <button
          title={gyroEnabled ? '关闭陀螺仪' : '开启陀螺仪'}
          onClick={onToggleGyro}
          disabled={isLoading}
          style={{ ...buttonStyle, color: gyroEnabled ? '#a855f7' : '#e0e0e0' }}
        >
          <Smartphone size={16} />
          <span style={{ marginLeft: 4, fontSize: 12 }}>{gyroEnabled ? '陀螺仪' : '陀螺'}</span>
        </button>

        <div style={dividerStyle} />

        <button
          title="保存当前视角"
          onClick={onSavePreset}
          disabled={isLoading}
          style={buttonStyle}
        >
          <Bookmark size={16} />
          <span style={{ marginLeft: 4, fontSize: 12 }}>保存</span>
        </button>

        {viewPresets.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              title="查看保存的视角"
              onClick={() => setShowPresets(v => !v)}
              style={{ ...buttonStyle, color: showPresets ? '#a855f7' : '#e0e0e0' }}
            >
              <BookmarkCheck size={16} />
              <span style={{ marginLeft: 4, fontSize: 12 }}>{viewPresets.length}</span>
            </button>
            {showPresets && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                background: 'rgba(30,30,30,0.95)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                padding: 4,
                minWidth: 160,
                zIndex: 20,
              }}>
                {viewPresets.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: '#ccc',
                      fontSize: 12,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span
                      style={{ flex: 1 }}
                      onClick={() => { onRestorePreset(p); setShowPresets(false); }}
                    >
                      {p.name}
                    </span>
                    <button
                      onClick={() => onDeletePreset(i)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                      title="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={dividerStyle} />

        <span style={{ color: '#999', fontSize: 12, minWidth: 44, textAlign: 'center' }}>
          {zoomPercent}%
        </span>

        <div style={dividerStyle} />

        <button
          title="关闭预览"
          onClick={onClose}
          style={{ ...buttonStyle, color: '#ef4444' }}
        >
          <X size={16} />
          <span style={{ marginLeft: 4, fontSize: 12 }}>关闭</span>
        </button>
      </div>
    </>
  );
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  color: '#e0e0e0',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'sans-serif',
  transition: 'background 0.15s',
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'rgba(255,255,255,0.15)',
  margin: '0 2px',
};
