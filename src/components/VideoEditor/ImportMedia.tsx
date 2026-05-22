import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, Plus, FolderOpen } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { indexedDBService } from '../../services/indexedDB';
import { nanoid } from 'nanoid';
import { ProjectState } from '../../../types';
import { ImportFromProject } from './ImportFromProject';

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
  project?: ProjectState;
}

export const ImportMedia: React.FC<ImportMediaProps> = ({
  onImport,
  project,
}) => {
  const { tracks, addTrack, addClip, clear, save } = useEditorStore();
  const [showPanel, setShowPanel] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'file' | 'project'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getMediaDuration = (url: string, type: string): Promise<number> => {
    return new Promise((resolve) => {
      if (type.startsWith('video') || type.startsWith('audio')) {
        const media = document.createElement(type.startsWith('video') ? 'video' : 'audio');
        media.preload = 'metadata';
        media.onloadedmetadata = () => {
          console.log('[ImportMedia] 获取视频时长成功', { type, duration: media.duration * 1000 });
          resolve(media.duration * 1000);
        };
        media.onerror = () => {
          console.warn('[ImportMedia] 获取视频时长失败，使用默认值');
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

      const trackType = type === 'audio' ? 'audio' : 'video';
      const trackName = type === 'audio' ? '音频轨道' : '视频轨道';
      const track = getOrCreateTrack(trackType, trackName);
      if (!track) continue;

      const duration = await getMediaDuration(url, file.type);
      const fileName = file.name.replace(/\.[^/.]+$/, '');

      const sourceId = `file-${nanoid()}`;
      try {
        await indexedDBService.saveFile(sourceId, file);
      } catch (err) {
        console.error('[ImportMedia] 保存文件到 IndexedDB 失败:', err);
      }

      const clip: any = {
        id: nanoid(),
        type: type === 'image' ? 'image' : type,
        sourceType: type,
        sourceId,
        sourceUrl: url,
        name: fileName,
        startTime: 0,
        duration,
        inPoint: 0,
        outPoint: duration,
        volume: type === 'audio' ? 1 : undefined,
        speed: 1,
        opacity: type === 'image' ? 1 : undefined,
      };

      addClip(track.id, clip);
    }

    await save();
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [getOrCreateTrack, addClip, save]);

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

      const trackType = type === 'audio' ? 'audio' : 'video';
      const trackName = type === 'audio' ? '音频轨道' : '视频轨道';
      const track = getOrCreateTrack(trackType, trackName);
      if (!track) continue;

      const duration = await getMediaDuration(url, file.type);
      const fileName = file.name.replace(/\.[^/.]+$/, '');

      const sourceId = `file-${nanoid()}`;
      try {
        await indexedDBService.saveFile(sourceId, file);
      } catch (err) {
        console.error('[ImportMedia] 保存文件到 IndexedDB 失败:', err);
      }

      const clip: any = {
        id: nanoid(),
        type: type === 'image' ? 'image' : type,
        sourceType: type,
        sourceId,
        sourceUrl: url,
        name: fileName,
        startTime: 0,
        duration,
        inPoint: 0,
        outPoint: duration,
        volume: type === 'audio' ? 1 : undefined,
        speed: 1,
        opacity: type === 'image' ? 1 : undefined,
      };

      addClip(track.id, clip);
    }

    await save();
    setImporting(false);
  }, [getOrCreateTrack, addClip, save]);

  const handleClearAll = async () => {
    clear();
    await save();
  };

  const handleProjectImport = useCallback(async (shots: any[]) => {
    if (shots.length === 0) return;

    setImporting(true);

    const videoTrack = getOrCreateTrack('video', '视频轨道');
    if (!videoTrack) {
      setImporting(false);
      return;
    }

    let currentTime = 0;

    for (const shot of shots) {
      const clipDuration = shot.duration * 1000;

      const clip: any = {
        id: nanoid(),
        type: 'video',
        sourceType: 'video',
        sourceId: shot.id,
        sourceUrl: shot.videoUrl,
        name: `片段 ${shot.index + 1}`,
        startTime: currentTime,
        duration: clipDuration,
        inPoint: 0,
        outPoint: clipDuration,
        volume: 1,
        speed: 1,
        opacity: 1,
      };

      addClip(videoTrack.id, clip);
      currentTime += clipDuration;
    }

    await save();
    setImporting(false);
    setShowPanel(false);
  }, [getOrCreateTrack, addClip, save]);

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
        <div className="absolute top-0 right-0 w-80 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">添加素材</h3>
            <button
              onClick={() => setShowPanel(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex border-b border-[var(--border-subtle)]">
            <button
              onClick={() => setActiveTab('file')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'file'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Upload className="w-3.5 h-3.5 inline mr-1" />
              本地文件
            </button>
            <button
              onClick={() => setActiveTab('project')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'project'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 inline mr-1" />
              项目素材
            </button>
          </div>

          {activeTab === 'file' ? (
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
          ) : (
            <ImportFromProject
              project={project}
              onImport={handleProjectImport}
            />
          )}
        </div>
      )}
    </div>
  );
};