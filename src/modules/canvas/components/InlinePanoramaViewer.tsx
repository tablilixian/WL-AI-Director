import React, { useRef, useCallback, useState, useEffect } from 'react';
import { PANORAMA_DEFAULTS, clampFov, clampPitch, normalizeYaw } from '../utils/panoramaUtils';
import { usePanoramaEngine } from '../hooks/usePanoramaEngine';

interface InlinePanoramaViewerProps {
  panoramaSrc: string;
  onOpenFullscreen?: () => void;
  onToggleFlat?: () => void;
}

export const InlinePanoramaViewer: React.FC<InlinePanoramaViewerProps> = ({
  panoramaSrc,
  onOpenFullscreen,
  onToggleFlat,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const toolbarTimerRef = useRef(0);
  const [containerH, setContainerH] = useState(300);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerH(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = containerH / 360;
  const iconSize = Math.min(Math.max(14, Math.round(14 * scale)), 28);
  const fontSize = Math.min(Math.max(10, Math.round(10 * scale)), 20);
  const padBtn = Math.max(4, Math.round(4 * scale));
  const padBar = Math.max(8, Math.round(8 * scale));

  const {
    stateRef,
    isLoading,
    zoomPercent,
    requestRender,
    handleReset,
    handleSetFov,
  } = usePanoramaEngine({
    panoramaSrc,
    canvasRef,
    containerRef,
  });

  const dragRef = useRef<{ clientX: number; clientY: number; lastX: number; lastY: number; yaw: number; pitch: number } | null>(null);
  const velocityRef = useRef({ x: 0, y: 0 });
  const inertiaRafRef = useRef(0);

  const showToolbarTemporarily = useCallback(() => {
    setShowToolbar(true);
    clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = window.setTimeout(() => setShowToolbar(false), 3000);
  }, []);

  const startInertia = useCallback(() => {
    cancelAnimationFrame(inertiaRafRef.current);
    const decay = 0.92;
    const minV = 0.5;
    let vx = velocityRef.current.x;
    let vy = velocityRef.current.y;
    if (Math.abs(vx) < minV && Math.abs(vy) < minV) return;
    const step = () => {
      stateRef.current.yaw = normalizeYaw(stateRef.current.yaw + vx * PANORAMA_DEFAULTS.dragSensitivity);
      stateRef.current.pitch = clampPitch(stateRef.current.pitch - vy * PANORAMA_DEFAULTS.dragSensitivity);
      vx *= decay;
      vy *= decay;
      if (Math.abs(vx) < minV && Math.abs(vy) < minV) return;
      requestRender();
      inertiaRafRef.current = requestAnimationFrame(step);
    };
    inertiaRafRef.current = requestAnimationFrame(step);
  }, [stateRef, requestRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      cancelAnimationFrame(inertiaRafRef.current);
      dragRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        yaw: stateRef.current.yaw,
        pitch: stateRef.current.pitch,
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.clientX;
      const dy = e.clientY - dragRef.current.clientY;
      stateRef.current.yaw = normalizeYaw(dragRef.current.yaw + dx * PANORAMA_DEFAULTS.dragSensitivity);
      stateRef.current.pitch = clampPitch(dragRef.current.pitch - dy * PANORAMA_DEFAULTS.dragSensitivity);
      velocityRef.current = { x: e.clientX - dragRef.current.lastX, y: e.clientY - dragRef.current.lastY };
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      requestRender();
    };

    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        showToolbarTemporarily();
        startInertia();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleSetFov(clampFov(stateRef.current.fov + (e.deltaY > 0 ? PANORAMA_DEFAULTS.wheelZoomStep : -PANORAMA_DEFAULTS.wheelZoomStep)));
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [stateRef, requestRender, handleSetFov, showToolbarTemporarily]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenFullscreen?.();
  }, [onOpenFullscreen]);

  const handleResetClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    handleReset();
    showToolbarTemporarily();
  }, [handleReset, showToolbarTemporarily]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden rounded-lg"
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
      onDoubleClick={handleDoubleClick}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {showToolbar && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-lg z-10"
          style={{ bottom: Math.max(4, Math.round(containerH / 60)), borderRadius: Math.max(6, Math.round(containerH / 50)), padding: `${Math.max(4, Math.round(containerH / 80))}px ${padBar}px` }}
        >
          {onToggleFlat && (
            <button
              className="rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="切换为平面缩略图"
              onClick={(e) => { e.stopPropagation(); onToggleFlat(); }}
              style={{ padding: padBtn, borderRadius: Math.max(4, Math.round(containerH / 60)) }}
            >
              <svg width={iconSize} height={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          <button
            className="rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors"
            title="重置视角"
            onClick={handleResetClick}
            style={{ padding: padBtn, borderRadius: Math.max(4, Math.round(containerH / 60)) }}
          >
            <svg width={iconSize} height={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <span className="text-white/60 font-mono text-center" style={{ fontSize, minWidth: Math.max(28, Math.round(containerH / 12)) }}>{zoomPercent}%</span>
          {onOpenFullscreen && (
            <button
              className="rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="全屏查看"
              onClick={(e) => { e.stopPropagation(); onOpenFullscreen(); }}
              style={{ padding: padBtn, borderRadius: Math.max(4, Math.round(containerH / 60)) }}
            >
              <svg width={iconSize} height={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
