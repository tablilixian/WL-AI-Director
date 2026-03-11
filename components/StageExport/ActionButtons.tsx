import React, { useEffect, useRef } from 'react';
import { Play, Download, FileVideo, Loader2, Video, ChevronDown, FileCode, FileText } from 'lucide-react';
import { STYLES, DownloadState } from './constants';
import { useAlert } from '../GlobalAlert';
import { logger, LogCategory } from '../../services/logger';
import MergeProgressModal from './MergeProgressModal';
import { mergeVideos, MergeProgress as MergeProgressType } from '../../services/videoMergeService';
import { downloadEDL } from '../../services/edlExportService';
import { downloadFCPXML } from '../../services/fcpxmlExportService';
import { ProjectState } from '../../types';

interface Props {
  completedShotsCount: number;
  totalShots: number;
  progress: number;
  downloadState: DownloadState;
  project: ProjectState;
  onPreview: () => void;
  onDownloadMaster: () => void;
}

const ActionButtons: React.FC<Props> = ({
  completedShotsCount,
  totalShots,
  progress,
  downloadState,
  project,
  onPreview,
  onDownloadMaster
}) => {
  const { showAlert } = useAlert();
  const { isDownloading, phase, progress: downloadProgress } = downloadState;

  const [isMerging, setIsMerging] = React.useState(false);
  const [mergeProgress, setMergeProgress] = React.useState<MergeProgressType>({
    phase: '',
    progress: 0
  });

  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMergeVideos = async () => {
    if (completedShotsCount === 0) {
      showAlert('没有可合并的视频片段', { type: 'warning' });
      return;
    }

    setIsMerging(true);
    setMergeProgress({ phase: '准备合并...', progress: 0 });

    try {
      const blob = await mergeVideos(project, {}, (progress) => {
        setMergeProgress(progress);
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const mimeType = blob.type;
      let extension = 'webm';
      if (mimeType.includes('mp4')) {
        extension = 'mp4';
      }
      
      a.download = `${project.scriptData?.title || project.title || 'master'}_merged.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showAlert(`视频合并成功！已下载 ${extension.toUpperCase()} 格式的视频文件`, { type: 'success' });
    } catch (error) {
      logger.error(LogCategory.VIDEO, '视频合并失败:', error);
      
      let errorMessage = '视频合并失败';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        if (error.message.includes('用户取消了合并操作')) {
          errorMessage = '合并操作已取消';
        } else if (error.message.includes('下载视频片段')) {
          errorMessage = '部分视频片段下载失败，请检查视频是否完整生成';
        } else if (error.message.includes('没有可导出的视频片段')) {
          errorMessage = '没有可合并的视频片段，请先生成视频';
        } else if (error.message.includes('无法获取视频 URL')) {
          errorMessage = '视频数据可能损坏，请重新生成视频片段';
        } else if (error.message.includes('无法创建 Canvas')) {
          errorMessage = '浏览器不支持 Canvas，请使用现代浏览器';
        } else if (error.message.includes('录制失败')) {
          errorMessage = '视频录制失败，请重试';
        }
      }
      
      showAlert(errorMessage, { type: 'error', title: '合并失败' });
    } finally {
      setIsMerging(false);
      setTimeout(() => {
        setMergeProgress({ phase: '', progress: 0 });
      }, 2000);
    }
  };

  const handleExportEDL = () => {
    if (completedShotsCount === 0) {
      showAlert('没有可导出的镜头，请先生成视频', { type: 'warning' });
      return;
    }
    try {
      downloadEDL(project);
      showAlert('EDL 文件导出成功！可在 Premiere Pro、DaVinci Resolve 等软件中使用', { type: 'success' });
    } catch (error) {
      logger.error(LogCategory.VIDEO, 'EDL 导出失败:', error);
      showAlert(`EDL 导出失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    }
    setShowExportMenu(false);
  };

  const handleExportFCPXML = () => {
    if (completedShotsCount === 0) {
      showAlert('没有可导出的镜头，请先生成视频', { type: 'warning' });
      return;
    }
    try {
      downloadFCPXML(project);
      showAlert('FCPXML 文件导出成功！可在 Final Cut Pro、DaVinci Resolve 等软件中使用', { type: 'success' });
    } catch (error) {
      logger.error(LogCategory.VIDEO, 'FCPXML 导出失败:', error);
      showAlert(`FCPXML 导出失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    }
    setShowExportMenu(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button 
          onClick={onPreview}
          disabled={completedShotsCount === 0}
          className={completedShotsCount > 0 ? STYLES.button.primary : STYLES.button.disabled}
        >
          <Play className="w-4 h-4" />
          Preview Video ({completedShotsCount}/{totalShots})
        </button>

        <button 
          onClick={handleMergeVideos}
          disabled={completedShotsCount === 0 || isMerging} 
          className={
            isMerging
              ? STYLES.button.loading
              : completedShotsCount > 0 
              ? STYLES.button.secondary
              : STYLES.button.disabled
          }
        >
          {isMerging ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Video className="w-4 h-4" />
          )}
          {isMerging ? `${mergeProgress.phase} ${mergeProgress.progress}%` : 'Merge Videos (.mp4/.webm)'}
        </button>

        <button 
          onClick={onDownloadMaster}
          disabled={completedShotsCount === 0 || isDownloading} 
          className={
            isDownloading
              ? STYLES.button.loading
              : completedShotsCount > 0 
              ? STYLES.button.secondary
              : STYLES.button.disabled
          }
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isDownloading ? `${phase} ${downloadProgress}%` : 'Download ZIP'}
        </button>

        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={completedShotsCount === 0} 
            className={
              completedShotsCount > 0 
              ? STYLES.button.tertiary
              : STYLES.button.disabled
            }
          >
            <FileVideo className="w-4 h-4" />
            Export EDL / XML
            <ChevronDown className="w-3 h-3 ml-1" />
          </button>

          {showExportMenu && (
            <div className="absolute top-full left-0 mt-2 w-full bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 overflow-hidden">
              <button
                onClick={handleExportEDL}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-[var(--nav-hover-bg)] transition-colors"
              >
                <FileCode className="w-4 h-4 text-[var(--text-muted)]" />
                <div className="flex-1">
                  <div className="text-[var(--text-primary)] font-medium">Export EDL</div>
                  <div className="text-[var(--text-tertiary)] text-[10px]">Premiere Pro / DaVinci Resolve</div>
                </div>
              </button>
              <button
                onClick={handleExportFCPXML}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-[var(--nav-hover-bg)] transition-colors border-t border-[var(--border-primary)]"
              >
                <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                <div className="flex-1">
                  <div className="text-[var(--text-primary)] font-medium">Export FCPXML</div>
                  <div className="text-[var(--text-tertiary)] text-[10px]">Final Cut Pro / DaVinci Resolve</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Merge Progress Modal */}
      <MergeProgressModal
        isOpen={isMerging}
        phase={mergeProgress.phase}
        progress={mergeProgress.progress}
        currentShot={mergeProgress.currentShot}
        totalShots={mergeProgress.totalShots}
        onClose={() => setIsMerging(false)}
      />
    </>
  );
};

export default ActionButtons;
