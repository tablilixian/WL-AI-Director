import React, { useCallback, useState } from 'react';
import { Video, X, Loader2, Plus } from 'lucide-react';
import { ProjectState } from '../../../types';
import { unifiedImageService } from '../../../services/unifiedImageService';

interface ProjectShot {
  id: string;
  index: number;
  videoUrl: string;
  duration: number;
  thumbnail?: string;
}

interface ImportFromProjectProps {
  project?: ProjectState;
  onImport: (shots: ProjectShot[]) => void;
}

export const ImportFromProject: React.FC<ImportFromProjectProps> = ({
  project,
  onImport,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedShots, setSelectedShots] = useState<Set<number>>(new Set());

  const handleSelectShot = useCallback((index: number) => {
    setSelectedShots(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!project?.shots) return;
    const allIndices = project.shots
      .map((shot, index) => shot.interval?.videoUrl ? index : -1)
      .filter(index => index !== -1);
    
    if (selectedShots.size === allIndices.length) {
      setSelectedShots(new Set());
    } else {
      setSelectedShots(new Set(allIndices));
    }
  }, [project, selectedShots]);

  const handleImport = useCallback(async () => {
    if (!project?.shots || selectedShots.size === 0) return;

    setLoading(true);

    const shotsToImport: ProjectShot[] = [];
    const sortedIndices = Array.from(selectedShots).map(Number).sort((a, b) => a - b);

    for (const index of sortedIndices) {
      const shot = project.shots[index];
      if (shot.interval?.videoUrl) {
        const originalUrl = shot.interval.videoUrl;
        const resolvedUrl = await unifiedImageService.resolveForDisplay(originalUrl);
        if (resolvedUrl) {
          let sourceId: string;
          if (originalUrl.startsWith('video:')) {
            sourceId = originalUrl;
          } else {
            try {
              sourceId = await unifiedImageService.saveVideoToLocal(resolvedUrl);
            } catch (err) {
              console.error('[ImportFromProject] 保存视频到本地存储失败:', err);
              sourceId = originalUrl;
            }
          }

          shotsToImport.push({
            id: sourceId,
            index,
            videoUrl: resolvedUrl,
            duration: shot.interval.duration || 3,
            thumbnail: shot.interval.thumbnailUrl,
          });
        }
      }
    }

    if (shotsToImport.length > 0) {
      onImport(shotsToImport);
      setSelectedShots(new Set());
    }

    setLoading(false);
  }, [project, selectedShots, onImport]);

  if (!project?.shots || project.shots.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">当前项目没有可用的视频片段</p>
      </div>
    );
  }

  const availableShots = project.shots
    .map((shot, index) => ({ shot, index }))
    .filter(({ shot }) => shot.interval?.videoUrl);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-[var(--text-primary)]">
          选择要导入的片段 ({selectedShots.size}/{availableShots.length})
        </h4>
        <button
          onClick={handleSelectAll}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          {selectedShots.size === availableShots.length ? '取消全选' : '全选'}
        </button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {availableShots.map(({ shot, index }) => (
          <button
            key={index}
            onClick={() => handleSelectShot(index)}
            className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-colors text-left ${
              selectedShots.has(index)
                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--border-subtle)] hover:border-[var(--border-primary)]'
            }`}
          >
            <div className="w-16 h-10 bg-[var(--bg-secondary)] rounded flex items-center justify-center flex-shrink-0">
              <Video className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                片段 {index + 1}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                时长: {shot.interval?.duration || 3}s
              </p>
            </div>
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
              selectedShots.has(index)
                ? 'border-[var(--accent)] bg-[var(--accent)]'
                : 'border-[var(--border-primary)]'
            }`}>
              {selectedShots.has(index) && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={handleImport}
        disabled={selectedShots.size === 0 || loading}
        className="w-full mt-4 py-2 px-3 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            导入中...
          </>
        ) : (
          <>
            <Plus className="w-3.5 h-3.5" />
            导入选中的片段 ({selectedShots.size})
          </>
        )}
      </button>
    </div>
  );
};
