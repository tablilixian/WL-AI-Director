import React from 'react';
import { Play, Download, FileVideo, Loader2, Video } from 'lucide-react';
import { STYLES, DownloadState } from './constants';
import { useAlert } from '../GlobalAlert';
import MergeProgressModal from './MergeProgressModal';
import { mergeVideos, MergeProgress as MergeProgressType } from '../../services/videoMergeService';
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
      console.error('视频合并失败:', error);
      
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
          disabled={progress < 100 || isDownloading} 
          className={
            isDownloading
              ? STYLES.button.loading
              : progress === 100 
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
        
        <button 
          className={STYLES.button.tertiary}
          onClick={() => showAlert('暂未开发', { type: 'info', title: '提示' })}
        >
          <FileVideo className="w-4 h-4" />
          Export EDL / XML
        </button>
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
