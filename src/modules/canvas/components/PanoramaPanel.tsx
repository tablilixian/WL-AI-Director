import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import type { PanoramaGenerationMode } from '../types/canvas';

interface PanoramaPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const PanoramaPanel: React.FC<PanoramaPanelProps> = ({ selectedLayerId, onClose }) => {
  const [mode, setMode] = useState<PanoramaGenerationMode>('image-to-panorama');
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setUploadPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (isProcessing) return;

    if (mode === 'upload') {
      if (!uploadFile) {
        alert('请先选择一张全景图');
        return;
      }
      setIsProcessing(true);
      try {
        const { imageStorageService } = await import('../../../../services/imageStorageService');
        const imgId = `panorama_upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const blob = new Blob([await uploadFile.arrayBuffer()], { type: uploadFile.type });
        await imageStorageService.saveImage(imgId, blob);

        addLayer({
          id: crypto.randomUUID(),
          type: 'panorama',
          x: 200,
          y: 200,
          width: 640,
          height: 360,
          src: `local:${imgId}`,
          imageId: imgId,
          title: `全景图 ${uploadFile.name}`,
          createdAt: Date.now(),
          operationType: 'panorama-generation',
          isLoading: false,
          progress: 100,
        });
        onClose();
      } catch (e) {
        console.error('[PanoramaPanel] 上传失败:', e);
        alert(`上传失败: ${(e as Error).message}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (mode === 'text-to-panorama' && !prompt.trim()) {
      alert('请输入提示词');
      return;
    }
    if (mode === 'image-to-panorama' && !hasSelectedImage) {
      alert('请先选中一张图片');
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const baseLayer = selectedLayer;
      let result: string;

      if (mode === 'image-to-panorama' && baseLayer?.src) {
        result = await canvasModelService.generate360Hdri(baseLayer.src, (p) => setProgress(p));
      } else {
        result = await canvasModelService.generateImage({
          prompt: prompt.trim() || '720 degree equirectangular panorama, seamless, wide angle view',
          referenceImages: mode === 'image-to-panorama' && baseLayer?.src ? [baseLayer.src] : undefined,
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(p),
        });
      }

      let panoramaSrc = '';
      if (typeof result === 'string') {
        panoramaSrc = result;
      } else if (result && typeof result === 'object' && 'images' in result) {
        panoramaSrc = (result as any).images?.[0]?.url || (result as any).images?.[0] || '';
      }

      if (!panoramaSrc) {
        throw new Error('生成结果为空');
      }

      const { imageStorageService } = await import('../../../../services/imageStorageService');
      let displayUrl = '';
      let finalSrc = '';
      let imageId: string | undefined;

      if (panoramaSrc.startsWith('local:')) {
        imageId = panoramaSrc.replace('local:', '');
        finalSrc = panoramaSrc;
        const blob = await imageStorageService.getImage(imageId);
        if (blob) displayUrl = URL.createObjectURL(blob);
      } else if (panoramaSrc.startsWith('data:')) {
        const imgId = `panorama_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const response = await fetch(panoramaSrc);
        const blob = await response.blob();
        await imageStorageService.saveImage(imgId, blob);
        imageId = imgId;
        finalSrc = `local:${imgId}`;
        displayUrl = panoramaSrc;
      } else {
        // http(s): 或 blob: 外部 URL — 保存到 IndexedDB，避免持久化临时 URL
        try {
          const response = await fetch(panoramaSrc);
          const blob = await response.blob();
          const imgId = `panorama_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await imageStorageService.saveImage(imgId, blob);
          imageId = imgId;
          finalSrc = `local:${imgId}`;
          displayUrl = URL.createObjectURL(blob);
        } catch (e) {
          console.warn('[PanoramaPanel] 外部 URL 保存到 IndexedDB 失败:', e);
          imageId = undefined;
          finalSrc = panoramaSrc;
          displayUrl = panoramaSrc;
        }
      }

      const baseX = baseLayer ? baseLayer.x + baseLayer.width + 40 : 200;
      const baseY = baseLayer ? baseLayer.y : 200;

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const imgEl = new Image();
        imgEl.onload = () => resolve(imgEl);
        imgEl.onerror = () => reject(new Error('图片加载失败'));
        imgEl.src = displayUrl;
      });

      addLayer({
        id: crypto.randomUUID(),
        type: 'panorama',
        x: baseX,
        y: baseY,
        width: img.naturalWidth,
        height: img.naturalHeight,
        src: finalSrc,
        imageId,
        title: `全景图 ${new Date().toLocaleTimeString()}`,
        createdAt: Date.now(),
        operationType: 'panorama-generation',
        generationPrompt: prompt.trim() || undefined,
        isLoading: false,
        progress: 100,
        sourceLayerId: selectedLayerId ?? undefined,
      });

      onClose();
    } catch (e) {
      console.error('[PanoramaPanel] 生成失败:', e);
      alert(`生成失败: ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#1e1e1e',
          borderRadius: 12,
          border: '1px solid #333',
          padding: 24,
          width: 420,
          maxWidth: '90vw',
          color: '#e0e0e0',
          fontFamily: 'sans-serif',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>720° 全景</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#999', marginBottom: 6, display: 'block' }}>方式</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setMode('image-to-panorama')} style={modeBtnStyle(mode === 'image-to-panorama')}>
              基于此图生成
            </button>
            <button onClick={() => setMode('text-to-panorama')} style={modeBtnStyle(mode === 'text-to-panorama')}>
              文本生成
            </button>
            <button onClick={() => setMode('upload')} style={modeBtnStyle(mode === 'upload')}>
              上传全景图
            </button>
          </div>
        </div>

        {mode === 'text-to-panorama' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#999', marginBottom: 6, display: 'block' }}>提示词</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想要的场景，如：一个现代简约风格的客厅，落地窗，暖色灯光..."
              style={{
                width: '100%',
                height: 80,
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: 8,
                color: '#e0e0e0',
                padding: 10,
                fontSize: 13,
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {mode === 'upload' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#999', marginBottom: 6, display: 'block' }}>
              选择等距柱状投影图（2:1 宽高比）
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #555',
                borderRadius: 8,
                padding: 24,
                textAlign: 'center',
                cursor: 'pointer',
                color: '#888',
                fontSize: 13,
              }}
            >
              {uploadPreview ? (
                <div>
                  <img src={uploadPreview} alt="preview" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 4, marginBottom: 8 }} />
                  <div>{uploadFile?.name}</div>
                </div>
              ) : (
                <div>
                  <Upload size={24} style={{ marginBottom: 8, color: '#666' }} />
                  <div>点击选择全景图文件</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16, fontSize: 12, color: '#888' }}>
          {mode === 'image-to-panorama' && (hasSelectedImage ? `源图片: ${selectedLayer?.title || selectedLayerId?.slice(0, 8)}` : '请先选中一张图片')}
          {mode === 'text-to-panorama' && 'AI 将以文本描述生成全景空间'}
          {mode === 'upload' && '支持 JPG / PNG 格式的等距柱状投影图'}
        </div>

        {isProcessing && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 4, background: '#333', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#6366f1', transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' }}>
              {progress > 0 ? `${progress}%` : '处理中...'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: '1px solid #444',
              background: 'transparent',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={isProcessing || (mode === 'image-to-panorama' && !hasSelectedImage) || (mode === 'upload' && !uploadFile)}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: isProcessing ? '#555' : '#6366f1',
              color: '#fff',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontSize: 15,
            }}
          >
            {isProcessing ? '处理中...' : mode === 'upload' ? '导入' : '生成全景'}
          </button>
        </div>
      </div>
    </div>
  );
};

const modeBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '12px 16px',
  borderRadius: 8,
  border: active ? '1px solid #6366f1' : '1px solid #444',
  background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
  color: active ? '#fff' : '#999',
  cursor: 'pointer',
  fontSize: 14,
  transition: 'all 0.15s',
});
