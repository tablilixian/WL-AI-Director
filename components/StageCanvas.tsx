/**
 * Stage Canvas - 画布阶段组件
 * 集成无限画布功能到 WL AI Director
 */

import React, { useState } from 'react';
import { ProjectState, Shot, Keyframe } from '../types';
import { InfiniteCanvas } from '../src/modules/canvas';
import { canvasIntegrationService } from '../src/modules/canvas/services/canvasIntegrationService';
import { useCanvasStore } from '../src/modules/canvas/hooks/useCanvasState';
import { StyleTransferPanel } from '../src/modules/canvas/components/StyleTransferPanel';
import { ImageEditPanel } from '../src/modules/canvas/components/ImageEditPanel';
import { RemoveBackgroundPanel } from '../src/modules/canvas/components/RemoveBackgroundPanel';
import { VariantPanel } from '../src/modules/canvas/components/VariantPanel';

interface StageCanvasProps {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
}

const StageCanvas: React.FC<StageCanvasProps> = ({ project, updateProject }) => {
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showStyleTransfer, setShowStyleTransfer] = useState(false);
  const [showImageEdit, setShowImageEdit] = useState(false);
  const [showRemoveBackground, setShowRemoveBackground] = useState(false);
  const [showVariant, setShowVariant] = useState(false);
  const [imageEditMode, setImageEditMode] = useState<'background' | 'expand'>('background');
  const { layers, selectedLayerId } = useCanvasStore();

  const getAllKeyframes = (): Keyframe[] => {
    if (!project.shots) return [];
    return project.shots.flatMap(shot => shot.keyframes || []);
  };

  const handleImportShots = async () => {
    if (!project.shots || project.shots.length === 0) {
      alert('项目中没有分镜数据');
      return;
    }

    const shotsWithKeyframes = project.shots.filter(s => s.keyframes && s.keyframes.length > 0);
    const keyframesWithImages = shotsWithKeyframes.flatMap(s => s.keyframes.filter(k => k.imageUrl));

    console.log('=== 分镜导入调试 ===');
    console.log('分镜总数:', project.shots.length);
    console.log('有关键帧的分镜:', shotsWithKeyframes.length);
    console.log('有图片的关键帧:', keyframesWithImages.length);
    
    if (keyframesWithImages.length > 0) {
      console.log('第一个关键帧示例:', {
        id: keyframesWithImages[0].id,
        type: keyframesWithImages[0].type,
        status: keyframesWithImages[0].status,
        imageUrlLength: keyframesWithImages[0].imageUrl?.length,
        imageUrlPrefix: keyframesWithImages[0].imageUrl?.substring(0, 50)
      });
    }

    if (keyframesWithImages.length === 0) {
      alert(`项目有 ${project.shots.length} 个分镜，但没有找到已生成的关键帧图片。\n\n请先在「导演工作台」生成关键帧图片后再导入。`);
      return;
    }

    const count = await canvasIntegrationService.importShotsToCanvas(project.shots);
    alert(`成功导入 ${count} 个分镜到画布`);
    setShowImportDialog(false);
  };

  const handleImportKeyframes = async () => {
    const keyframes = getAllKeyframes();
    if (keyframes.length === 0) {
      alert('项目中没有关键帧数据');
      return;
    }

    const count = await canvasIntegrationService.importKeyframesToCanvas(keyframes);
    alert(`成功导入 ${count} 个关键帧到画布`);
    setShowImportDialog(false);
  };

  const handleExportToKeyframes = () => {
    const keyframes = canvasIntegrationService.exportCanvasToKeyframes();
    if (keyframes.length === 0) {
      alert('画布中没有可导出的图层');
      return;
    }

    const confirmed = confirm(`确定要将画布中的 ${keyframes.length} 个图层导出为关键帧吗？`);
    if (confirmed) {
      console.log('导出的关键帧:', keyframes);
      alert(`已导出 ${keyframes.length} 个关键帧到控制台`);
    }
  };

  const handleExportImages = async () => {
    const imageLayers = layers.filter(l => l.type === 'image' && l.src);
    if (imageLayers.length === 0) {
      alert('画布中没有可导出的图片');
      return;
    }

    const confirmed = confirm(`确定要导出 ${imageLayers.length} 张图片吗？`);
    if (confirmed) {
      for (let i = 0; i < imageLayers.length; i++) {
        const layer = imageLayers[i];
        const link = document.createElement('a');
        link.href = layer.src;
        link.download = `${layer.title || `image_${i + 1}`}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      alert(`已导出 ${imageLayers.length} 张图片`);
    }
  };

  const handleExportVideos = async () => {
    const videoLayers = layers.filter(l => l.type === 'video' && l.src);
    if (videoLayers.length === 0) {
      alert('画布中没有可导出的视频');
      return;
    }

    const confirmed = confirm(`确定要导出 ${videoLayers.length} 个视频吗？`);
    if (confirmed) {
      for (let i = 0; i < videoLayers.length; i++) {
        const layer = videoLayers[i];
        try {
          let videoUrl = layer.src;
          
          if (layer.src.startsWith('video:')) {
            const { videoStorageService } = await import('../services/imageStorageService');
            const blob = await videoStorageService.getVideo(layer.src.replace('video:', ''));
            if (blob) {
              videoUrl = URL.createObjectURL(blob);
            }
          }

          const link = document.createElement('a');
          link.href = videoUrl;
          link.download = `${layer.title || `video_${i + 1}`}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          if (layer.src.startsWith('video:')) {
            URL.revokeObjectURL(videoUrl);
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error('导出视频失败:', error);
        }
      }
      alert(`已导出 ${videoLayers.length} 个视频`);
    }
  };

  const handleExportSelected = async () => {
    if (!selectedLayerId) {
      alert('请先选中一个图层');
      return;
    }

    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) {
      alert('选中的图层不存在');
      return;
    }

    if (layer.type === 'image' && layer.src) {
      const link = document.createElement('a');
      link.href = layer.src;
      link.download = `${layer.title || 'image'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      alert('已导出选中的图片');
    } else if (layer.type === 'video' && layer.src) {
      try {
        let videoUrl = layer.src;
        
        if (layer.src.startsWith('video:')) {
          const { videoStorageService } = await import('../services/imageStorageService');
          const blob = await videoStorageService.getVideo(layer.src.replace('video:', ''));
          if (blob) {
            videoUrl = URL.createObjectURL(blob);
          }
        }

        const link = document.createElement('a');
        link.href = videoUrl;
        link.download = `${layer.title || 'video'}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        if (layer.src.startsWith('video:')) {
          URL.revokeObjectURL(videoUrl);
        }
        
        alert('已导出选中的视频');
      } catch (error) {
        console.error('导出视频失败:', error);
        alert('导出视频失败');
      }
    } else {
      alert('选中的图层不支持导出');
    }
  };

  const handleTakeScreenshot = () => {
    const infiniteCanvas = document.querySelector('[class*="InfiniteCanvas"]') as HTMLElement;
    if (!infiniteCanvas) {
      alert('找不到画布');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        alert('无法创建 Canvas');
        return;
      }

      const rect = infiniteCanvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const images = infiniteCanvas.querySelectorAll('img');
      images.forEach((img) => {
        const imgRect = img.getBoundingClientRect();
        const x = imgRect.left - rect.left;
        const y = imgRect.top - rect.top;
        try {
          ctx.drawImage(img, x, y, imgRect.width, imgRect.height);
        } catch (e) {
          console.warn('绘制图片失败:', e);
        }
      });

      const link = document.createElement('a');
      link.download = `canvas-screenshot-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert('画布截图已保存');
    } catch (error) {
      console.error('截图失败:', error);
      alert('截图失败');
    }
  };

  const handleExportAsZip = async () => {
    const exportableLayers = layers.filter(l => 
      (l.type === 'image' || l.type === 'video') && l.src
    );

    if (exportableLayers.length === 0) {
      alert('画布中没有可导出的图片或视频');
      return;
    }

    const confirmed = confirm(`确定要将 ${exportableLayers.length} 个文件打包下载吗？`);
    if (!confirmed) return;

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < exportableLayers.length; i++) {
        const layer = exportableLayers[i];
        let blob: Blob | null = null;
        let filename = '';

        try {
          if (layer.type === 'image') {
            if (layer.imageId) {
              const { imageStorageService } = await import('../services/imageStorageService');
              blob = await imageStorageService.getImage(layer.imageId);
              filename = `${layer.title || `image_${i + 1}`}.png`;
              console.log('从 IndexedDB 获取图片:', layer.imageId);
            } else if (layer.src.startsWith('data:')) {
              const response = await fetch(layer.src);
              blob = await response.blob();
              filename = `${layer.title || `image_${i + 1}`}.png`;
            } else if (layer.src.startsWith('local:')) {
              const { imageStorageService } = await import('../services/imageStorageService');
              blob = await imageStorageService.getImage(layer.src.replace('local:', ''));
              filename = `${layer.title || `image_${i + 1}`}.png`;
            }
          } else if (layer.type === 'video') {
            if (layer.src.startsWith('video:')) {
              const { videoStorageService } = await import('../services/imageStorageService');
              blob = await videoStorageService.getVideo(layer.src.replace('video:', ''));
              filename = `${layer.title || `video_${i + 1}`}.mp4`;
            } else if (layer.src.startsWith('http')) {
              let downloadUrl = layer.src;
              
              if (layer.src.includes('aigc-files.bigmodel.cn')) {
                downloadUrl = layer.src.replace('https://aigc-files.bigmodel.cn', '/bigmodel-files');
              } else if (layer.src.includes('maas-watermark-prod-new.cn-wlcb.ufileos.com')) {
                downloadUrl = layer.src.replace('https://maas-watermark-prod-new.cn-wlcb.ufileos.com', '/video-proxy');
              }
              
              const response = await fetch(downloadUrl);
              blob = await response.blob();
              filename = `${layer.title || `video_${i + 1}`}.mp4`;
            }
          }

          if (blob) {
            zip.file(filename, blob);
            console.log('添加到 ZIP:', filename, blob.size);
          } else {
            console.warn('无法获取图层数据:', layer.id, layer.type);
          }
        } catch (e) {
          console.warn('处理图层失败:', layer.id, e);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `canvas-export-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      alert(`已打包下载 ${exportableLayers.length} 个文件`);
    } catch (error) {
      console.error('打包下载失败:', error);
      alert('打包下载失败');
    }
  };

  const handleClearCanvas = () => {
    const summary = canvasIntegrationService.getCanvasSummary();
    if (summary.totalLayers === 0) {
      alert('画布已经是空的');
      return;
    }

    const confirmed = confirm(`确定要清空画布吗？当前有 ${summary.totalLayers} 个图层。`);
    if (confirmed) {
      canvasIntegrationService.clearCanvas();
    }
  };

  const handleSaveCanvas = async () => {
    await canvasIntegrationService.saveCanvasState();
    alert('画布状态已保存');
  };

  const handleRestoreCanvas = async () => {
    const restored = await canvasIntegrationService.restoreCanvasState();
    if (restored) {
      alert('画布状态已恢复');
    } else {
      alert('没有找到保存的画布状态');
    }
  };

  const handleExportJson = () => {
    const saved = localStorage.getItem('wl-canvas-backup');
    if (!saved) {
      alert('没有找到保存的画布数据，请先点击"保存画布"');
      return;
    }

    try {
      const data = JSON.parse(saved);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `canvas-data-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      alert('画布数据已导出');
    } catch (error) {
      console.error('导出 JSON 失败:', error);
      alert('导出失败');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-4 border-b border-[var(--border-primary)] bg-[var(--bg-base)]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">创意画布</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              在无限画布上自由创作、排列和编辑您的素材
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportDialog(true)}
              className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              导入素材
            </button>
            <button
              onClick={() => setShowStyleTransfer(true)}
              disabled={!selectedLayerId}
              className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!selectedLayerId ? '请先选中一张图片' : '风格迁移'}
            >
              风格迁移
            </button>
            <button
              onClick={() => { setImageEditMode('background'); setShowImageEdit(true); }}
              disabled={!selectedLayerId}
              className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!selectedLayerId ? '请先选中一张图片' : '背景替换'}
            >
              背景替换
            </button>
            <button
              onClick={() => { setImageEditMode('expand'); setShowImageEdit(true); }}
              disabled={!selectedLayerId}
              className="px-3 py-1.5 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!selectedLayerId ? '请先选中一张图片' : '图片扩展'}
            >
              图片扩展
            </button>
            <button
              onClick={() => setShowRemoveBackground(true)}
              disabled={!selectedLayerId}
              className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!selectedLayerId ? '请先选中一张图片' : '智能抠图'}
            >
              智能抠图
            </button>
            <button
              onClick={() => setShowVariant(true)}
              disabled={!selectedLayerId}
              className="px-3 py-1.5 bg-lime-600 text-white text-xs rounded-lg hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!selectedLayerId ? '请先选中一张图片' : '图片变体'}
            >
              图片变体
            </button>
            <button
              onClick={handleExportImages}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              导出图片
            </button>
            <button
              onClick={handleExportVideos}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              导出视频
            </button>
            <button
              onClick={handleExportSelected}
              disabled={!selectedLayerId}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              导出选中
            </button>
            <button
              onClick={handleTakeScreenshot}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              画布截图
            </button>
            <button
              onClick={handleExportToKeyframes}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              导出分镜
            </button>
            <button
              onClick={handleExportAsZip}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              打包下载
            </button>
            <button
              onClick={handleSaveCanvas}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              保存画布
            </button>
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              导出JSON
            </button>
            <button
              onClick={handleRestoreCanvas}
              className="px-3 py-1.5 bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs rounded-lg hover:bg-[var(--bg-active)] transition-colors"
            >
              恢复画布
            </button>
            <button
              onClick={handleClearCanvas}
              className="px-3 py-1.5 bg-[var(--error)]/10 text-[var(--error)] text-xs rounded-lg hover:bg-[var(--error)]/20 transition-colors"
            >
              清空画布
            </button>
            <span className="px-2 py-1 bg-[var(--bg-hover)] rounded text-xs text-[var(--text-muted)]">
              Beta
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          Shift+拖拽平移 | Ctrl+滚轮缩放 | 支持图片/视频/文字/便签 | 文生图/图生图/文生视频/图生视频/风格迁移
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <InfiniteCanvas />
      </div>

      {showImportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">导入素材到画布</h3>

            <div className="space-y-4">
              <div className="p-4 bg-[var(--bg-hover)] rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">分镜导入</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {project.shots?.length || 0} 个分镜
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  将所有分镜的关键帧图片导入画布，按网格排列
                </p>
                <button
                  onClick={handleImportShots}
                  disabled={!project.shots || project.shots.length === 0}
                  className="w-full py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  导入分镜
                </button>
              </div>

              <div className="p-4 bg-[var(--bg-hover)] rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">关键帧导入</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {getAllKeyframes().length} 个关键帧
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  将所有关键帧图片导入画布，按网格排列
                </p>
                <button
                  onClick={handleImportKeyframes}
                  disabled={getAllKeyframes().length === 0}
                  className="w-full py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  导入关键帧
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowImportDialog(false)}
                className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showStyleTransfer && (
        <StyleTransferPanel
          selectedLayerId={selectedLayerId}
          onClose={() => setShowStyleTransfer(false)}
        />
      )}

      {showImageEdit && (
        <ImageEditPanel
          selectedLayerId={selectedLayerId}
          editMode={imageEditMode}
          onClose={() => setShowImageEdit(false)}
        />
      )}

      {showRemoveBackground && (
        <RemoveBackgroundPanel
          selectedLayerId={selectedLayerId}
          onClose={() => setShowRemoveBackground(false)}
        />
      )}

      {showVariant && (
        <VariantPanel
          selectedLayerId={selectedLayerId}
          onClose={() => setShowVariant(false)}
        />
      )}
    </div>
  );
};

export default StageCanvas;
