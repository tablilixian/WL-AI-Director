import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';

interface ImageToVideoPanelProps {
  selectedLayerId: string;
  onClose: () => void;
}

function getVideoDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = reject;
    video.src = src;
  });
}

async function resolveVideoUrl(videoUrl: string): Promise<string> {
  if (!videoUrl) return '';
  if (videoUrl.startsWith('data:') || videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    return videoUrl;
  }
  if (videoUrl.startsWith('video:')) {
    const localId = videoUrl.replace('video:', '');
    try {
      const { videoStorageService } = await import('../../../../services/imageStorageService');
      const blob = await videoStorageService.getVideo(localId);
      if (blob) return URL.createObjectURL(blob);
    } catch (error) {
      console.error('[ImageToVideo] 解析本地视频失败:', error);
    }
  }
  if (videoUrl.startsWith('local:')) {
    const localId = videoUrl.replace('local:', '');
    try {
      const blob = await unifiedImageService.getImage(localId);
      if (blob) {
        const base64 = await unifiedImageService.blobToBase64(blob);
        return base64;
      }
    } catch (error) {
      console.error('[ImageToVideo] 解析本地视频失败:', error);
    }
  }
  return videoUrl;
}

export const ImageToVideoPanel: React.FC<ImageToVideoPanelProps> = ({ selectedLayerId, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const { layers, addLayer, updateLayer } = useCanvasStore();

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  if (!selectedLayer || selectedLayer.type !== 'image') return null;

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);

    try {
      const placeholderId = crypto.randomUUID();
      addLayer({
        id: placeholderId,
        type: 'video',
        x: selectedLayer.x + selectedLayer.width + 20,
        y: selectedLayer.y,
        width: 640,
        height: 360,
        src: '',
        title: '生成视频中...',
        isLoading: true,
        createdAt: Date.now(),
        sourceLayerId: selectedLayer.id,
        operationType: 'image-to-video'
      });

      const videoUrl = await canvasModelService.generateVideo({
        prompt,
        startImage: selectedLayer.src,
        aspectRatio: '16:9',
        duration,
        onProgress: (p) => {
          updateLayer(placeholderId, { progress: p });
        }
      });

      const resolvedUrl = await resolveVideoUrl(videoUrl);

      let videoId: string | undefined;
      if (videoUrl.startsWith('video:')) {
        videoId = videoUrl.replace('video:', '');
      }

      let videoWidth = 640;
      let videoHeight = 360;
      try {
        const dims = await getVideoDimensions(resolvedUrl);
        videoWidth = dims.width;
        videoHeight = dims.height;
      } catch (e) {
        console.warn('[ImageToVideo] 获取视频尺寸失败，使用默认值:', e);
      }

      updateLayer(placeholderId, {
        src: resolvedUrl,
        imageId: videoId,
        width: videoWidth,
        height: videoHeight,
        title: prompt.slice(0, 30),
        isLoading: false,
        progress: 100
      });

      setPrompt('');
      onClose();
    } catch (error: any) {
      console.error('图生视频失败:', error);
      alert(`生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-4 w-[480px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">图生视频</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-xs text-gray-400 mb-3">
          参考: {selectedLayer.title}
        </div>

        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          placeholder="描述视频内容..."
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
          disabled={isGenerating}
        />

        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs text-gray-400">时长:</span>
          {[3, 5, 10].map(d => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                duration === d
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {d}秒
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="px-4 py-2 text-xs text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              '生成视频'
            )}
          </button>
        </div>

        {isGenerating && (
          <div className="mt-3">
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
