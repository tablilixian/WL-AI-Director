import React, { useState, useEffect } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { styleTemplates } from '../data/styleTemplates';
import { TemplateApplyDialog } from './TemplateApplyDialog';
import type { StyleTemplate } from '../data/styleTemplates';

interface PromptBarProps {
  selectedLayerId: string | null;
}

type Mode = 'generate' | 'video';

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
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

/**
 * 解析图片 URL 为 Base64 格式
 * 
 * @deprecated 使用 unifiedImageService.resolveForApi() 代替
 */
async function resolveImageUrl(imageUrl: string): Promise<string> {
  return await unifiedImageService.resolveForApi(imageUrl);
}

/**
 * Blob 转 Base64
 * 
 * @deprecated 使用 unifiedImageService.blobToBase64() 代替
 */
function blobToBase64(blob: Blob): Promise<string> {
  return unifiedImageService.blobToBase64(blob);
}

export const PromptBar: React.FC<PromptBarProps> = ({ selectedLayerId }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<Mode>('generate');
  const [isAnime, setIsAnime] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StyleTemplate | null>(null);
  const { layers, addLayer, updateLayer, suggestedPrompt, setSuggestedPrompt, setTemplatePanelOpen } = useCanvasStore();

  useEffect(() => {
    if (suggestedPrompt) {
      setPrompt(suggestedPrompt);
      setSuggestedPrompt('');
    }
  }, [suggestedPrompt, setSuggestedPrompt]);

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
          isAnime,
          onProgress: (p) => {
            updateLayer(placeholderId, { progress: p });
          }
        });

        console.log('[PromptBar] 生成图片 URL:', imageUrl?.substring(0, 50));

        const resolvedUrl = await resolveImageUrl(imageUrl);
        let imageId: string | undefined;

        if (resolvedUrl.startsWith('data:')) {
          try {
            const imgId = unifiedImageService.generateImageId();
            const response = await fetch(resolvedUrl);
            const blob = await response.blob();
            await unifiedImageService.saveImage(imgId, blob);
            imageId = imgId;
            console.log('[PromptBar] 文生图已保存到 IndexedDB:', imgId);
          } catch (e) {
            console.warn('[PromptBar] 保存图片到 IndexedDB 失败:', e);
          }
        } else if (resolvedUrl.startsWith('local:')) {
          imageId = resolvedUrl.replace('local:', '');
        }

        const dimensions = await getImageDimensions(resolvedUrl);

        updateLayer(placeholderId, {
          src: resolvedUrl,
          imageId,
          width: Math.round(dimensions.width),
          height: Math.round(dimensions.height),
          title: prompt.slice(0, 30),
          isLoading: false,
          progress: 100
        });
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
        
        let videoId: string | undefined;
        if (videoUrl.startsWith('video:')) {
          videoId = videoUrl.replace('video:', '');
          console.log('[PromptBar] 视频已保存到本地:', videoId);
        }

        let videoWidth = 640;
        let videoHeight = 360;
        try {
          const dims = await getVideoDimensions(resolvedUrl);
          videoWidth = dims.width;
          videoHeight = dims.height;
        } catch (e) {
          console.warn('[PromptBar] 获取视频尺寸失败，使用默认值:', e);
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
      }

      setPrompt('');
    } catch (error: any) {
      console.error('Generation failed:', error);
      alert(`生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const isVideoMode = mode === 'video';
  const canGenerate = !isGenerating && prompt.trim();

  return (
    <>
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-[700px]">
      <div className="bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1">
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
              onClick={() => setMode('video')}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                mode === 'video'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              文生视频
            </button>
          </div>
          {mode === 'generate' && (
            <button
              onClick={() => setIsAnime(!isAnime)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                isAnime
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="使用动漫风格模型生成图像"
            >
              {isAnime ? '🎨 动漫' : '🎨 写实'}
            </button>
          )}
        </div>

        {mode === 'generate' && (
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-none">
            {styleTemplates.filter(t => ['realistic-portrait', 'anime-ghibli', 'illustration-watercolor', 'artistic-oil', '3d-pixar', 'cinematic-blockbuster'].includes(t.id)).map(template => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className="shrink-0 px-2.5 py-1 text-[11px] bg-gray-700/60 text-gray-400 rounded-lg hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
                title={template.name}
              >
                {template.name}
              </button>
            ))}
            <button
              onClick={() => setTemplatePanelOpen(true)}
              className="shrink-0 px-2.5 py-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
            >
              更多▸
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder={
              mode === 'generate' ? '描述你想生成的图片...' :
              '描述你想生成的视频...'
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
          {mode === 'video' && '输入描述，AI 将生成视频（约需1-3分钟）'}
        </div>
      </div>
    </div>

    {selectedTemplate && (
      <TemplateApplyDialog
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
      />
    )}
    </>
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
      const blob = await unifiedImageService.getImage(localId);
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
