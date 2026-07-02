import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { PanoramaCameraState, PanoramaScreenshotMode } from '../types/canvas';
import { PANORAMA_DEFAULTS, clampFov, clampPitch, normalizeYaw, VIEW_ANGLE_LABELS } from '../utils/panoramaUtils';
import { PanoramaViewerToolbar } from './PanoramaViewerToolbar';
import { useCanvasStore } from '../hooks/useCanvasState';
import { usePanoramaEngine } from '../hooks/usePanoramaEngine';

interface PanoramaViewerProps {
  panoramaSrc: string;
  layerId?: string;
  initialCamera?: PanoramaCameraState;
  onClose: () => void;
  onScreenshots?: (results: { dataUrl: string; yaw: number; pitch: number; label: string }[]) => void;
}

interface DragState {
  clientX: number;
  clientY: number;
  lastX: number;
  lastY: number;
  yaw: number;
  pitch: number;
}

export const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  panoramaSrc,
  layerId,
  initialCamera,
  onClose,
  onScreenshots,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    stateRef,
    isLoading,
    loadError,
    zoomPercent,
    setZoomPercent,
    renderFrame,
    requestRender,
    syncCanvasSize,
    captureView,
    handleReset,
    handleSetFov,
  } = usePanoramaEngine({
    panoramaSrc,
    initialCamera,
    canvasRef,
    containerRef,
  });

  const dragRef = useRef<DragState | null>(null);
  const velocityRef = useRef({ x: 0, y: 0 });
  const inertiaRafRef = useRef(0);
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [coordDisplay, setCoordDisplay] = useState({ yaw: 0, pitch: 0 });
  const [viewPresets, setViewPresets] = useState<{ name: string; yaw: number; pitch: number; fov: number }[]>([]);
  const touchRef = useRef<{ touches: { x: number; y: number }[]; dist: number; yaw: number; pitch: number; fov: number; lastX: number; lastY: number } | null>(null);
  const gyroRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);

  const coordUpdateRef = useRef(0);
  const scheduleCoordUpdate = useCallback(() => {
    cancelAnimationFrame(coordUpdateRef.current);
    coordUpdateRef.current = requestAnimationFrame(() => {
      setCoordDisplay({ yaw: Math.round(stateRef.current.yaw % 360), pitch: Math.round(stateRef.current.pitch) });
    });
  }, [stateRef]);

  const requestRenderWithHud = useCallback(() => {
    scheduleCoordUpdate();
    requestRender();
  }, [requestRender, scheduleCoordUpdate]);

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
      requestRenderWithHud();
      inertiaRafRef.current = requestAnimationFrame(step);
    };
    inertiaRafRef.current = requestAnimationFrame(step);
  }, [stateRef, requestRenderWithHud]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? PANORAMA_DEFAULTS.wheelZoomStep : -PANORAMA_DEFAULTS.wheelZoomStep;
    const newFov = clampFov(stateRef.current.fov + delta);
    handleSetFov(newFov);
  }, [stateRef, handleSetFov]);

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
      requestRenderWithHud();
    };

    const onMouseUp = () => {
      dragRef.current = null;
      startInertia();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [stateRef, requestRenderWithHud, handleWheel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const onTouchStart = (e: TouchEvent) => {
      e.stopPropagation();
      cancelAnimationFrame(inertiaRafRef.current);
      if (e.touches.length === 1) {
        touchRef.current = {
          touches: [{ x: e.touches[0].clientX, y: e.touches[0].clientY }],
          dist: 0,
          yaw: stateRef.current.yaw,
          pitch: stateRef.current.pitch,
          fov: stateRef.current.fov,
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
        };
      } else if (e.touches.length === 2) {
        touchRef.current = {
          touches: [
            { x: e.touches[0].clientX, y: e.touches[0].clientY },
            { x: e.touches[1].clientX, y: e.touches[1].clientY },
          ],
          dist: getTouchDist(e.touches[0], e.touches[1]),
          yaw: stateRef.current.yaw,
          pitch: stateRef.current.pitch,
          fov: stateRef.current.fov,
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchRef.current) return;
      e.preventDefault();

      if (e.touches.length === 1 && touchRef.current.touches.length === 1) {
        const dx = e.touches[0].clientX - touchRef.current.touches[0].x;
        const dy = e.touches[0].clientY - touchRef.current.touches[0].y;
        stateRef.current.yaw = normalizeYaw(touchRef.current.yaw + dx * PANORAMA_DEFAULTS.dragSensitivity);
        stateRef.current.pitch = clampPitch(touchRef.current.pitch - dy * PANORAMA_DEFAULTS.dragSensitivity);
        velocityRef.current = { x: e.touches[0].clientX - touchRef.current.lastX, y: e.touches[0].clientY - touchRef.current.lastY };
        touchRef.current.lastX = e.touches[0].clientX;
        touchRef.current.lastY = e.touches[0].clientY;
        requestRenderWithHud();
      } else if (e.touches.length === 2 && touchRef.current.touches.length === 2) {
        const newDist = getTouchDist(e.touches[0], e.touches[1]);
        const scale = touchRef.current.dist / Math.max(newDist, 1);
        const fovDelta = (scale - 1) * 30;
        const newFov = clampFov(touchRef.current.fov + fovDelta);
        handleSetFov(newFov);
      }
    };

    const onTouchEnd = () => {
      touchRef.current = null;
      startInertia();
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [stateRef, requestRenderWithHud, handleSetFov]);

  useEffect(() => {
    if (!gyroEnabled) return;

    const onOrientation = (e: DeviceOrientationEvent) => {
      const alpha = e.alpha ?? 0;
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      if (!gyroRef.current) {
        gyroRef.current = { alpha, beta, gamma };
        return;
      }

      const da = alpha - gyroRef.current.alpha;
      const db = beta - gyroRef.current.beta;
      const dg = gamma - gyroRef.current.gamma;

      stateRef.current.yaw = normalizeYaw(stateRef.current.yaw + da);
      stateRef.current.pitch = clampPitch(stateRef.current.pitch - db);
      handleSetFov(clampFov(stateRef.current.fov + dg * 0.3));

      gyroRef.current = { alpha, beta, gamma };
    };

    const requestPermission = async () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const result = await (DeviceOrientationEvent as any).requestPermission();
          if (result !== 'granted') {
            setGyroEnabled(false);
            return;
          }
        } catch { }
      }
      window.addEventListener('deviceorientation', onOrientation);
    };

    requestPermission();

    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [gyroEnabled, stateRef, handleSetFov]);

  const handleScreenshot = useCallback(async (mode: PanoramaScreenshotMode) => {
    const angles = VIEW_ANGLE_LABELS[mode];
    if (!angles || angles.length === 0) return;

    const currentPitch = stateRef.current.pitch;
    const results: { dataUrl: string; yaw: number; pitch: number; label: string }[] = [];
    for (const angle of angles) {
      const dataUrl = await captureView(angle.yaw, currentPitch);
      results.push({ dataUrl, yaw: angle.yaw, pitch: currentPitch, label: angle.label });
    }
    onScreenshots?.(results);
  }, [captureView, onScreenshots, stateRef]);

  const handleExportCurrent = useCallback(async () => {
    const dataUrl = await captureView(stateRef.current.yaw, stateRef.current.pitch);
    onScreenshots?.([{ dataUrl, yaw: stateRef.current.yaw, pitch: stateRef.current.pitch, label: '当前视角' }]);
  }, [captureView, onScreenshots, stateRef]);

  const onReset = useCallback(() => {
    handleReset();
    requestRenderWithHud();
  }, [handleReset, requestRenderWithHud]);

  const handleSavePreset = useCallback(() => {
    const name = `视角 ${viewPresets.length + 1}`;
    const newPreset = { name, yaw: stateRef.current.yaw, pitch: stateRef.current.pitch, fov: stateRef.current.fov };
    setViewPresets(prev => [...prev, newPreset]);
    if (layerId) {
      useCanvasStore.getState().updateLayer(layerId, { cameraState: { yaw: stateRef.current.yaw, pitch: stateRef.current.pitch, fov: stateRef.current.fov } } as any);
    }
  }, [viewPresets, layerId, stateRef]);

  const handleRestorePreset = useCallback((preset: { name: string; yaw: number; pitch: number; fov: number }) => {
    stateRef.current.yaw = normalizeYaw(preset.yaw);
    stateRef.current.pitch = preset.pitch;
    handleSetFov(preset.fov);
  }, [stateRef, handleSetFov]);

  const handleDeletePreset = useCallback((index: number) => {
    setViewPresets(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleToggleGyro = useCallback(() => {
    setGyroEnabled(v => !v);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: 'grab',
      }}
    >
      <PanoramaViewerToolbar
        zoomPercent={zoomPercent}
        isLoading={isLoading}
        gyroEnabled={gyroEnabled}
        viewPresets={viewPresets}
        onScreenshot={handleScreenshot}
        onExportCurrent={handleExportCurrent}
        onReset={onReset}
        onClose={onClose}
        onSavePreset={handleSavePreset}
        onRestorePreset={handleRestorePreset}
        onDeletePreset={handleDeletePreset}
        onToggleGyro={handleToggleGyro}
      />
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      {isLoading && (
        <div style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 32, height: 32,
            border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: '#a855f7',
            borderRadius: '50%',
            animation: 'panorama-spin 0.8s linear infinite',
          }} />
          <div style={{ color: '#999', fontSize: 14, fontFamily: 'sans-serif' }}>
            加载全景图...
          </div>
        </div>
      )}
      {loadError && !isLoading && (
        <div style={{
          position: 'absolute',
          color: '#ef4444', fontSize: 14, fontFamily: 'sans-serif',
          textAlign: 'center', padding: 20,
        }}>
          {loadError}
          <br />
          <button onClick={onClose} style={{
            marginTop: 12, padding: '6px 16px', borderRadius: 6,
            border: '1px solid #ef4444', background: 'transparent',
            color: '#ef4444', cursor: 'pointer', fontSize: 13,
          }}>
            关闭
          </button>
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(0,0,0,0.6)', borderRadius: 8,
        padding: '6px 14px', fontFamily: 'monospace', fontSize: 13,
        color: '#ccc', zIndex: 10, userSelect: 'none', pointerEvents: 'none',
      }}>
        <svg width="80" height="28" viewBox="0 0 80 28">
          <text x="40" y="10" textAnchor="middle" fill="#888" fontSize="8" fontFamily="monospace">N</text>
          <text x="4" y="20" textAnchor="middle" fill="#666" fontSize="7" fontFamily="monospace">W</text>
          <text x="76" y="20" textAnchor="middle" fill="#666" fontSize="7" fontFamily="monospace">E</text>
          <text x="40" y="27" textAnchor="middle" fill="#666" fontSize="7" fontFamily="monospace">S</text>
          <line x1="40" y1="10" x2={40 + 30 * Math.sin(coordDisplay.yaw * Math.PI / 180)} y2={14 + 10 * Math.cos(coordDisplay.yaw * Math.PI / 180)} stroke="#a855f7" strokeWidth="2" />
          <circle cx={40 + 30 * Math.sin(coordDisplay.yaw * Math.PI / 180)} cy={14 + 10 * Math.cos(coordDisplay.yaw * Math.PI / 180)} r="2" fill="#a855f7" />
        </svg>
        <span style={{ color: '#a855f7' }}>Yaw {coordDisplay.yaw}°</span>
        <span style={{ color: '#888' }}>|</span>
        <span>Pitch {coordDisplay.pitch}°</span>
        <span style={{ color: '#888' }}>|</span>
        <span>Zoom {zoomPercent}%</span>
      </div>
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 20,
      }}>
        <div style={{ position: 'absolute', left: 0, top: -12, width: 1, height: 24, background: '#0f0' }} />
        <div style={{ position: 'absolute', left: -12, top: 0, width: 24, height: 1, background: '#0f0' }} />
        <div style={{ position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: '50%', background: '#0f0' }} />
      </div>
      <style>{`
        @keyframes panorama-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
