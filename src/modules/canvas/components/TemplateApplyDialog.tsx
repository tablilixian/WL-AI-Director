import React, { useState, useEffect } from 'react';
import { StyleTemplate } from '../data/styleTemplates';
import { canvasModelService } from '../services/canvasModelService';
import { templatePreviewService } from '../services/templatePreviewService';
import { useCanvasStore } from '../hooks/useCanvasState';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { AspectRatio } from '../../../../types/model';

interface Props {
  template: StyleTemplate;
  onClose: () => void;
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

export const TemplateApplyDialog: React.FC<Props> = ({ template, onClose }) => {
  const [zhSubject, setZhSubject] = useState(template.subjectPlaceholderZh);
  const [enSubject, setEnSubject] = useState(template.subjectPlaceholder);
  const [zhNegative, setZhNegative] = useState(template.negativePromptZh || '');
  const [enNegative, setEnNegative] = useState(template.negativePrompt || '');
  const [useChinese, setUseChinese] = useState(() =>
    (navigator.language || '').startsWith('zh')
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  useEffect(() => {
    templatePreviewService.getPreviewUrl(template.id).then(setPreviewUrl);
  }, [template.id]);

  const addLayer = useCanvasStore((s) => s.addLayer);
  const updateLayer = useCanvasStore((s) => s.updateLayer);

  const activeSubject = useChinese ? zhSubject : enSubject;
  const stylePart = useChinese ? template.stylePromptZh : template.stylePrompt;
  const activeNegative = useChinese ? zhNegative : enNegative;

  const handleToggleLanguage = () => {
    setUseChinese(!useChinese);
  };

  const handleSubjectChange = (value: string) => {
    if (useChinese) {
      setZhSubject(value);
    } else {
      setEnSubject(value);
    }
  };

  const handleNegativeChange = (value: string) => {
    if (useChinese) {
      setZhNegative(value);
    } else {
      setEnNegative(value);
    }
  };

  const handleGenerate = async () => {
    if (!activeSubject.trim() || isGenerating) return;
    const fullPrompt = `${activeSubject}, ${stylePart}`;

    setIsGenerating(true);

    try {
      const placeholderId = crypto.randomUUID();

      addLayer({
        id: placeholderId,
        type: 'image',
        x: 100,
        y: 100,
        width: 400,
        height: 300,
        src: '',
        title: template.name,
        isLoading: true,
        createdAt: Date.now(),
        operationType: 'text-to-image',
      });

      const imageUrl = await canvasModelService.generateImage({
        prompt: fullPrompt,
        negativePrompt: activeNegative || undefined,
        aspectRatio,
        onProgress: (p) => {
          updateLayer(placeholderId, { progress: p });
        },
      });

      const resolvedUrl = await unifiedImageService.resolveForApi(imageUrl);
      let imageId: string | undefined;

      if (resolvedUrl.startsWith('data:')) {
        try {
          const imgId = unifiedImageService.generateImageId();
          const response = await fetch(resolvedUrl);
          const blob = await response.blob();
          await unifiedImageService.saveImage(imgId, blob);
          imageId = imgId;
        } catch (e) {
          console.warn('[TemplateApplyDialog] 保存图片失败:', e);
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
        title: template.name,
        isLoading: false,
        progress: 100,
      });

      onClose();
    } catch (error: any) {
      console.error('[TemplateApplyDialog] 生成失败:', error);
      alert(`生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[560px] max-h-[85vh] bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h3 className="text-base font-medium text-white">{template.name}</h3>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div className={`h-36 rounded-lg bg-gradient-to-br ${template.gradient} flex items-center justify-center relative overflow-hidden`}>
            {previewUrl ? (
              <button
                onClick={() => setShowLightbox(true)}
                className="w-full h-full rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <img
                  src={previewUrl}
                  alt={template.name}
                  className="w-full h-full object-contain"
                />
              </button>
            ) : (
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto text-white/40 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-white/50">{template.name}</span>
              </div>
            )}
            <div className="absolute top-2 right-2">
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="bg-gray-900/80 border border-gray-600 rounded text-xs text-white px-2 py-1 focus:outline-none focus:border-blue-500"
                disabled={isGenerating}
              >
                <option value="16:9">16:9 横屏</option>
                <option value="9:16">9:16 竖屏</option>
                <option value="1:1">1:1 方形</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-200">主体描述</label>
              <button
                onClick={handleToggleLanguage}
                className="px-2.5 py-1 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                {useChinese ? 'EN' : '中文'}
              </button>
            </div>
            <textarea
              value={activeSubject}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
              disabled={isGenerating}
              placeholder={useChinese ? '描述你想画的主体内容...' : 'Describe what you want to create...'}
            />
            <div className="mt-1.5 text-xs text-gray-500">
              修改上方文字自定义生成内容，风格会自动保留
            </div>
          </div>

          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400">风格描述（自动保留）</label>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{stylePart}</p>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">负面提示词</label>
            <textarea
              value={activeNegative}
              onChange={(e) => handleNegativeChange(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
              disabled={isGenerating}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={!activeSubject.trim() || isGenerating}
            className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                直接生成
              </>
            )}
          </button>
        </div>
      </div>
    </div>

    {showLightbox && previewUrl && (
      <button
        onClick={() => setShowLightbox(false)}
        className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center cursor-zoom-out"
      >
        <img
          src={previewUrl}
          alt={template.name}
          className="max-w-[90vw] max-h-[90vh] object-contain"
        />
      </button>
    )}
  </>
  );
};
