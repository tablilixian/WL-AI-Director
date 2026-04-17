import React, { useState, useRef } from 'react';
import { Upload, Music, Film, Image, X, FolderOpen } from 'lucide-react';

interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number;
  thumbnail?: string;
}

interface AssetLibraryProps {
  onSelect?: (asset: MediaAsset) => void;
  onClose?: () => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({
  onSelect,
  onClose,
}) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'image'>('video');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const url = URL.createObjectURL(file);
      const type: 'video' | 'audio' | 'image' = file.type.startsWith('video')
        ? 'video'
        : file.type.startsWith('audio')
        ? 'audio'
        : 'image';

      const asset: MediaAsset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type,
        url,
      };

      setAssets(prev => [...prev, asset]);

      if (onSelect && type === activeTab) {
        onSelect(asset);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredAssets = assets.filter(a => a.type === activeTab);

  const getIcon = (type: string) => {
    switch (type) {
      case 'video': return <Film className="w-5 h-5" />;
      case 'audio': return <Music className="w-5 h-5" />;
      case 'image': return <Image className="w-5 h-5" />;
      default: return <FolderOpen className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg overflow-hidden w-80">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">素材库</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex border-b border-[var(--border-subtle)]">
        {(['video', 'audio', 'image'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab === 'video' ? '视频' : tab === 'audio' ? '音频' : '图片'}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3 max-h-64 overflow-y-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept={activeTab === 'video' ? 'video/*' : activeTab === 'audio' ? 'audio/*' : 'image/*'}
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 border-2 border-dashed border-[var(--border-subtle)] rounded-lg text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors flex flex-col items-center gap-1"
        >
          <Upload className="w-5 h-5" />
          <span className="text-xs">点击上传</span>
        </button>

        {filteredAssets.length > 0 ? (
          <div className="space-y-2">
            {filteredAssets.map(asset => (
              <button
                key={asset.id}
                onClick={() => onSelect?.(asset)}
                className="w-full flex items-center gap-3 p-2 rounded hover:bg-[var(--bg-hover)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-muted)]">
                  {getIcon(asset.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--text-primary)] truncate">{asset.name}</div>
                  {asset.duration && (
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {Math.floor(asset.duration / 60)}:{(asset.duration % 60).toString().padStart(2, '0')}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center text-[var(--text-muted)] text-xs py-4">
            暂无{activeTab === 'video' ? '视频' : activeTab === 'audio' ? '音频' : '图片'}
          </div>
        )}
      </div>
    </div>
  );
};
