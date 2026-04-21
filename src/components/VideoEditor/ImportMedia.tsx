import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, Plus } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { nanoid } from 'nanoid';

interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number;
  thumbnail?: string;
}

interface ImportMediaProps {
  onImport?: (clips: any[]) => void;
}

export const ImportMedia: React.FC<ImportMediaProps> = ({
  onImport,
}) => {
  const { tracks, addTrack, addClip, clear } = useEditorStore();
  const [showPanel, setShowPanel] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getMediaDuration = (url: string, type: string): Promise<number> => {
    return new Promise((resolve) => {
      if (type.startsWith('video') || type.startsWith('audio')) {
        const media = document.createElement(type.startsWith('video') ? 'video' : 'audio');
        media.preload = 'metadata';
        media.onloadedmetadata = () => {
          console.log('[ImportMedia] 获取视频时长成功', { type, duration: media.duration * 1000 });
          URL.revokeObjectURL(url);
          resolve(media.duration * 1000);
        };
        media.onerror = () => {
          console.warn('[ImportMedia] 获取视频时长失败，使用默认值');
          URL.revokeObjectURL(url);
          resolve(5000);
        };
        media.src = url;
      } else {
        resolve(3000);
      }
    });
  };

  const getOrCreateTrack = useCallback((type: 'video' | 'audio' | 'text', name: string) => {
    let track = tracks.find(t => t.type === type);
    if (!track) {
      const trackId = addTrack(type, name);
      track = useEditorStore.getState().tracks.find(t => t.id === trackId);
    }
    return track;
  }, [tracks, addTrack]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setImporting(true);

    for (const file of Array.from(files) as File[]) {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video') ? 'video' 
        : file.type.startsWith('audio') ? 'audio' : 'image';

      const videoTrack = getOrCreateTrack('video', '视频轨道');
      if (!videoTrack) continue;

      const duration = await getMediaDuration(url, file.type);

      const clip: any = {
        id: nanoid(),
        type: 'video',
        sourceType: type,
        sourceId: file.name,
        sourceUrl: url,
        startTime: 0,
        duration,
        inPoint: 0,
        outPoint: duration,
        volume: 1,
        speed: 1,
        opacity: 1,
      };

      addClip(videoTrack.id, clip);
    }

    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [getOrCreateTrack, addClip]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    setImporting(true);

    for (const file of Array.from(files) as File[]) {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video') ? 'video' 
        : file.type.startsWith('audio') ? 'audio' : 'image';

      const track = getOrCreateTrack('video', '视频轨道');
      if (!track) continue;

      const duration = await getMediaDuration(url, file.type);

      const clip: any = {
        id: nanoid(),
        type: 'video',
        sourceType: type,
        sourceId: file.name,
        sourceUrl: url,
        startTime: 0,
        duration,
        inPoint: 0,
        outPoint: duration,
        volume: 1,
        speed: 1,
        opacity: 1,
      };

      addClip(track.id, clip);
    }

    setImporting(false);
  }, [getOrCreateTrack, addClip]);

  const handleClearAll = () => {
    clear();
  };

  const clipCount = tracks.reduce((sum, t) => sum + t.clips.length, 0);

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {!showPanel ? (
        <button
          onClick={() => setShowPanel(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          添加素材 ({clipCount})
        </button>
      ) : (
        <div className="absolute top-0 right-0 w-72 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">添加素材</h3>
            <button
              onClick={() => setShowPanel(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div 
            className="p-4"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full py-6 border-2 border-dashed border-[var(--border-subtle)] rounded-lg text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors flex flex-col items-center gap-2 disabled:opacity-50"
            >
              {importing ? (
                <span className="text-xs">导入中...</span>
              ) : (
                <>
                  <Upload className="w-6 h-6" />
                  <span className="text-xs">点击上传文件</span>
                  <span className="text-[10px]">或拖拽文件到这里</span>
                </>
              )}
            </button>

            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span>当前素材: {clipCount} 个片段</span>
                {clipCount > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-red-400 hover:text-red-300"
                  >
                    清空全部
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 bg-[var(--bg-secondary)] rounded-lg">
              <div className="text-xs text-[var(--text-muted)]">
                <div className="font-medium text-[var(--text-tertiary)] mb-2">支持格式</div>
                <div>• 视频: MP4, WebM, MOV</div>
                <div>• 音频: MP3, WAV, OGG</div>
                <div>• 图片: PNG, JPG, GIF</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};