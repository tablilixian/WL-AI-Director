import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { assetStore } from '../services/assetStore';
import { imageStorageService } from '../../../../services/imageStorageService';

interface PromptBarProps {
  selectedLayerId: string | null;
}

type Mode = 'generate' | 'edit' | 'video' | 'video-edit';

async function resolveImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';

  if (imageUrl.startsWith('data:') || imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('local:')) {
    const localId = imageUrl.replace('local:', '');
    console.log('[PromptBar] 解析本地图片引用:', localId);

    try {
      const blob = await imageStorageService.getImage(localId);
      if (blob) {
        const base64 = await blobToBase64(blob);
        console.log('[PromptBar] 本地图片解析成功:', localId);
        return base64;
      }
    } catch (error) {
      console.error('[PromptBar] 解析本地图片失败:', error);
    }
  }

  return imageUrl;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const PromptBar: React.FC<PromptBarProps> = ({ selectedLayerId }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<Mode>('generate');
  const { layers, addLayer, updateLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);

    try {
      if (mode === 'generate') {
        const placeholderId = crypto.randomUUID();

        addLayer({
          id: placeholderId,
          type: 'image',
          x: 100,
          y: 100,
          width: 400,
          height: 300,
          src: '',
          title: '生成中...',
          isLoading: true,
          createdAt: Date.now(),
          operationType: 'text-to-image'
        });

        const imageUrl = await canvasModelService.generateImage({
          prompt,
          aspectRatio: '16:9',
          onProgress: (p) => {
            updateLayer(placeholderId, { progress: p });
          }
        });

        console.log('[PromptBar] 生成图片 URL:', imageUrl?.substring(0, 50));

        const resolvedUrl = await resolveImageUrl(imageUrl);
        let imageId: string | undefined;

        if (resolvedUrl.startsWith('data:')) {
          try {
            const { imageStorageService } = await import('../../../../services/imageStorageService');
            const imgId = `canvas_gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const response = await fetch(resolvedUrl);
            const blob = await response.blob();
            await imageStorageService.saveImage(imgId, blob);
            imageId = imgId;
            console.log('[PromptBar] 文生图已保存到 IndexedDB:', imgId);
          } catch (e) {
            console.warn('[PromptBar] 保存图片到 IndexedDB 失败:', e);
          }
        } else if (resolvedUrl.startsWith('local:')) {
          imageId = resolvedUrl.replace('local:', '');
        }

        updateLayer(placeholderId, {
          src: resolvedUrl,
          imageId,
          title: prompt.slice(0, 30),
          isLoading: false,
          progress: 100
        });
      } else if (mode === 'edit' && hasSelectedImage && selectedLayer) {
        updateLayer(selectedLayer.id, {
          isLoading: true,
          progress: 0
        });

        const editedUrl = await canvasModelService.generateImage({
          prompt: `Edit this image: ${prompt}`,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => {
            updateLayer(selectedLayer.id, { progress: p });
          }
        });

        const resolvedUrl = await resolveImageUrl(editedUrl);
        let imageId: string | undefined;

        if (resolvedUrl.startsWith('data:')) {
          try {
            const { imageStorageService } = await import('../../../../services/imageStorageService');
            const imgId = `canvas_edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const response = await fetch(resolvedUrl);
            const blob = await response.blob();
            await imageStorageService.saveImage(imgId, blob);
            imageId = imgId;
            console.log('[PromptBar] 图生图已保存到 IndexedDB:', imgId);
          } catch (e) {
            console.warn('[PromptBar] 保存图片到 IndexedDB 失败:', e);
          }
        } else if (resolvedUrl.startsWith('local:')) {
          imageId = resolvedUrl.replace('local:', '');
        }

        const newLayerId = crypto.randomUUID();
        addLayer({
          id: newLayerId,
          type: 'image',
          x: selectedLayer.x + selectedLayer.width + 20,
          y: selectedLayer.y,
          width: selectedLayer.width,
          height: selectedLayer.height,
          src: resolvedUrl,
          imageId,
          title: prompt.slice(0, 30),
          isLoading: false,
          createdAt: Date.now(),
          sourceLayerId: selectedLayer.id,
          operationType: 'image-to-image'
        });

        updateLayer(selectedLayer.id, { isLoading: false, progress: 100 });
      } else if (mode === 'video') {
        const placeholderId = crypto.randomUUID();

        addLayer({
          id: placeholderId,
          type: 'video',
          x: 100,
          y: 100,
          width: 640,
          height: 360,
          src: '',
          title: '生成视频中...',
          isLoading: true,
          createdAt: Date.now(),
          operationType: 'text-to-image'
        });

        const videoUrl = await canvasModelService.generateVideo({
          prompt,
          aspectRatio: '16:9',
          duration: 5,
          onProgress: (p) => {
            updateLayer(placeholderId, { progress: p });
          }
        });

        console.log('[PromptBar] 生成视频 URL:', videoUrl?.substring(0, 50));

        const resolvedUrl = await resolveVideoUrl(videoUrl);

        updateLayer(placeholderId, {
          src: resolvedUrl,
          title: prompt.slice(0, 30),
          isLoading: false,
          progress: 100
        });
      } else if (mode === 'video-edit' && hasSelectedImage && selectedLayer) {
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
          duration: 5,
          onProgress: (p) => {
            updateLayer(placeholderId, { progress: p });
          }
        });

        const resolvedUrl = await resolveVideoUrl(videoUrl);

        updateLayer(placeholderId, {
          src: resolvedUrl,
          title: prompt.slice(0, 30),
          isLoading: false,
          progress: 100
        });
      }

      setPrompt('');
    } catch (error: any) {
      console.error('Generation failed:', error);
      alert(`生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const isVideoMode = mode === 'video' || mode === 'video-edit';
  const isImageMode = mode === 'generate' || mode === 'edit';
  const needsImage = mode === 'edit' || mode === 'video-edit';
  const canGenerate = !isGenerating && prompt.trim() && (!needsImage || hasSelectedImage);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-[700px]">
      <div className="bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1 border-r border-gray-600 pr-2">
            <button
              onClick={() => setMode('generate')}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                mode === 'generate'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              文生图
            </button>
            <button
              onClick={() => setMode('edit')}
              disabled={!hasSelectedImage}
              className={`px-3 py-1 text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === 'edit'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={!hasSelectedImage ? '请先选中一张图片' : '编辑选中的图片'}
            >
              图生图
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode('video')}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                mode === 'video'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              文生视频
            </button>
            <button
              onClick={() => setMode('video-edit')}
              disabled={!hasSelectedImage}
              className={`px-3 py-1 text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === 'video-edit'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={!hasSelectedImage ? '请先选中一张图片' : '用选中的图片生成视频'}
            >
              图生视频
            </button>
          </div>
          {(mode === 'edit' || mode === 'video-edit') && selectedLayer && (
            <span className="text-xs text-gray-400">
              参考: {selectedLayer.title}
            </span>
          )}
          {!hasSelectedImage && isImageMode && (
            <span className="text-xs text-gray-500">
              💡 选中图片后可使用图生图/图生视频
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder={
              mode === 'generate' ? '描述你想生成的图片...' :
              mode === 'edit' ? '描述你想对图片进行的修改...' :
              mode === 'video' ? '描述你想生成的视频...' :
              '描述视频内容...'
            }
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            disabled={isGenerating}
          />
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`px-4 py-2 text-white text-sm rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              isVideoMode ? 'bg-purple-600' : 'bg-blue-600'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {isVideoMode ? '生成视频' : '生成图片'}
              </>
            )}
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          {mode === 'generate' && '输入描述，AI 将生成新图片'}
          {mode === 'edit' && (hasSelectedImage ? `编辑图片: ${selectedLayer?.title}` : '请先选中一张图片')}
          {mode === 'video' && '输入描述，AI 将生成视频（约需1-3分钟）'}
          {mode === 'video-edit' && (hasSelectedImage ? `用图片生成视频: ${selectedLayer?.title}` : '请先选中一张图片')}
        </div>
      </div>
    </div>
  );
};

async function resolveVideoUrl(videoUrl: string): Promise<string> {
  if (!videoUrl) return '';

  if (videoUrl.startsWith('data:') || videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    return videoUrl;
  }

  if (videoUrl.startsWith('video:')) {
    const localId = videoUrl.replace('video:', '');
    console.log('[PromptBar] 解析本地视频引用:', localId);

    try {
      const { videoStorageService } = await import('../../../../services/imageStorageService');
      const blob = await videoStorageService.getVideo(localId);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        console.log('[PromptBar] 本地视频解析成功:', localId);
        return objectUrl;
      }
    } catch (error) {
      console.error('[PromptBar] 解析本地视频失败:', error);
    }
  }

  if (videoUrl.startsWith('local:')) {
    const localId = videoUrl.replace('local:', '');
    console.log('[PromptBar] 解析本地视频引用:', localId);

    try {
      const blob = await imageStorageService.getImage(localId);
      if (blob) {
        const base64 = await blobToBase64(blob);
        console.log('[PromptBar] 本地视频解析成功:', localId);
        return base64;
      }
    } catch (error) {
      console.error('[PromptBar] 解析本地视频失败:', error);
    }
  }

  return videoUrl;
}
