import React, { useState, useEffect } from 'react';
import { unifiedImageService } from '../../../../services/unifiedImageService';

/**
 * 解析图层 src 为可显示的 URL 后渲染。
 *
 * layer.src 可能存的是 local:img_xxx / video:xxx 持久引用（浏览器 <img> 无法直接识别，
 * 会报 net::ERR_UNKNOWN_URL_SCHEME），需经 unifiedImageService.resolveForDisplay()
 * 解析为 blob:/data: URL 才能显示。同时兼容 blob:/data:/http(s): 直接引用。
 *
 * 约定：持久化状态只存 local:/video: 引用，blob: 仅由本组件在渲染层临时生成。
 */
export const ResolvedImage: React.FC<{
  src?: string;
  alt?: string;
  className?: string;
}> = ({ src, alt = '', className = '' }) => {
  const [resolved, setResolved] = useState<string>('');
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setErrored(false);

    if (!src) {
      setResolved('');
      return;
    }
    // data:/http(s): 已是可直接显示的 URL，无需解析
    if (src.startsWith('data:') || src.startsWith('http')) {
      setResolved(src);
      return;
    }
    unifiedImageService
      .resolveForDisplay(src)
      .then(url => {
        if (cancelled) return;
        setResolved(url);
        // 仅当解析生成了新的 blob URL 时，才需要在卸载时回收
        if (url.startsWith('blob:') && url !== src) objectUrl = url;
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (errored || !resolved) {
    return (
      <div className={`${className} bg-[var(--bg-hover)] flex items-center justify-center text-[8px] text-gray-500`}>
        无图
      </div>
    );
  }
  return <img src={resolved} alt={alt} className={className} onError={() => setErrored(true)} />;
};
