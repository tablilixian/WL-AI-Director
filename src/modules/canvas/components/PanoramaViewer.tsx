import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { PanoramaCameraState, PanoramaScreenshotMode } from '../types/canvas';
import { PANORAMA_DEFAULTS, clampFov, clampPitch, VIEW_ANGLE_LABELS, computePanoramaResolution } from '../utils/panoramaUtils';
import { PanoramaViewerToolbar } from './PanoramaViewerToolbar';
import { useCanvasStore } from '../hooks/useCanvasState';

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
  const stateRef = useRef({
    yaw: initialCamera?.yaw ?? PANORAMA_DEFAULTS.yaw,
    pitch: initialCamera?.pitch ?? PANORAMA_DEFAULTS.pitch,
    fov: initialCamera?.fov ?? PANORAMA_DEFAULTS.fov,
  });
  const dragRef = useRef<DragState | null>(null);
  const threeRef = useRef<{
    THREE: any;
    renderer: any;
    scene: any;
    camera: any;
    sphere: any;
  } | null>(null);
  const rafRef = useRef(0);
  const loadTokenRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [coordDisplay, setCoordDisplay] = useState({ yaw: 0, pitch: 0 });
  const [viewPresets, setViewPresets] = useState<{ name: string; yaw: number; pitch: number; fov: number }[]>([]);
  const touchRef = useRef<{ touches: { x: number; y: number }[]; dist: number; yaw: number; pitch: number; fov: number } | null>(null);
  const gyroRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const needsRenderRef = useRef(false);

  const renderFrame = useCallback(() => {
    const t = threeRef.current;
    if (!t) return;
    const { renderer, scene, camera, THREE } = t;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return;

    if (renderer.domElement.width !== width || renderer.domElement.height !== height) {
      renderer.setSize(width, height, false);
    }
    camera.fov = stateRef.current.fov;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();

    const pitch = clampPitch(stateRef.current.pitch);
    const phi = THREE.MathUtils.degToRad(90 - pitch);
    const theta = THREE.MathUtils.degToRad(stateRef.current.yaw);

    // Set camera orientation via quaternion (avoid lookAt issues)
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    camera.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld(true);

    renderer.render(scene, camera);
  }, []);

  // Update HUD display after each render via rAF
  const coordUpdateRef = useRef(0);
  const scheduleCoordUpdate = useCallback(() => {
    cancelAnimationFrame(coordUpdateRef.current);
    coordUpdateRef.current = requestAnimationFrame(() => {
      setCoordDisplay({ yaw: Math.round(stateRef.current.yaw % 360), pitch: Math.round(stateRef.current.pitch) });
    });
  }, []);

  // Sync coord display state from ref (throttled to ~10fps via ref-based counter)
  const updateCoordDisplay = useCallback(() => {
    setCoordDisplay({ yaw: Math.round(stateRef.current.yaw), pitch: Math.round(stateRef.current.pitch) });
  }, []);

  const requestRender = useCallback(() => {
    scheduleCoordUpdate();
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      renderFrame();
    });
  }, [renderFrame, scheduleCoordUpdate]);

  const syncCanvasSize = useCallback(() => {
    const t = threeRef.current;
    const container = containerRef.current;
    if (!t || !container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w > 0 && h > 0) {
      const renderer = t.renderer;
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) ||
          renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        requestRender();
      }
    }
  }, [requestRender]);

  const captureView = useCallback((yaw: number, pitch: number): Promise<string> => {
    return new Promise((resolve) => {
      const prevYaw = stateRef.current.yaw;
      const prevPitch = stateRef.current.pitch;
      stateRef.current.yaw = yaw;
      stateRef.current.pitch = pitch;
      renderFrame();
      const canvas = canvasRef.current;
      if (canvas) {
        resolve(canvas.toDataURL('image/png'));
      }
      stateRef.current.yaw = prevYaw;
      stateRef.current.pitch = prevPitch;
    });
  }, [renderFrame]);

  const handleScreenshot = useCallback(async (mode: PanoramaScreenshotMode) => {
    const angles = VIEW_ANGLE_LABELS[mode];
    if (!angles || angles.length === 0) return;

    const results: { dataUrl: string; yaw: number; pitch: number; label: string }[] = [];
    for (const angle of angles) {
      const dataUrl = await captureView(angle.yaw, 0);
      results.push({ dataUrl, yaw: angle.yaw, pitch: 0, label: angle.label });
    }
    onScreenshots?.(results);
  }, [captureView, onScreenshots]);

  const handleReset = useCallback(() => {
    stateRef.current.yaw = PANORAMA_DEFAULTS.yaw;
    stateRef.current.pitch = PANORAMA_DEFAULTS.pitch;
    stateRef.current.fov = PANORAMA_DEFAULTS.fov;
    setZoomPercent(100);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    renderFrame();
  }, [renderFrame]);

  const handleExportCurrent = useCallback(async () => {
    const dataUrl = await captureView(stateRef.current.yaw, stateRef.current.pitch);
    onScreenshots?.([{ dataUrl, yaw: stateRef.current.yaw, pitch: stateRef.current.pitch, label: '当前视角' }]);
  }, [captureView, onScreenshots]);

  // Initialize Three.js and load the panorama image
  useEffect(() => {
    const token = ++loadTokenRef.current;
    let disposed = false;

    (async () => {
      const THREE = await import('three').catch((err) => {
        console.error('[PanoramaViewer] Failed to load Three.js:', err);
        return null;
      });
      if (!THREE || disposed || token !== loadTokenRef.current) {
        if (!THREE) setLoadError('Three.js 加载失败');
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();

      const rect = containerRef.current?.getBoundingClientRect();
      const initW = rect ? Math.max(1, Math.round(rect.width)) : window.innerWidth;
      const initH = rect ? Math.max(1, Math.round(rect.height)) : window.innerHeight;
      renderer.setSize(initW, initH, false);

      const camera = new THREE.PerspectiveCamera(75, initW / initH, 1, 1200);
      camera.position.set(0, 0, 0);

      const geometry = new THREE.SphereGeometry(
        PANORAMA_DEFAULTS.sphereRadius,
        PANORAMA_DEFAULTS.sphereSegmentsW,
        PANORAMA_DEFAULTS.sphereSegmentsH,
      );

      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);

      threeRef.current = { THREE, renderer, scene, camera, sphere };
      const img = new Image();

      img.onload = () => {
        if (disposed || token !== loadTokenRef.current) return;
        console.log('[PanoramaViewer] Image loaded:', img.naturalWidth, 'x', img.naturalHeight);
        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.x = -1;
        texture.offset.x = 1;
        texture.needsUpdate = true;
        sphere.material.map = texture;
        sphere.material.needsUpdate = true;

        syncCanvasSize();
        setIsLoading(false);
        setLoadError(null);
        requestRender();
      };

      img.onerror = (e) => {
        if (disposed) return;
        console.error('[PanoramaViewer] Image load error:', panoramaSrc?.substring(0, 100));
        setIsLoading(false);
        setLoadError('全景图加载失败，请检查图片是否有效');
      };

      img.src = panoramaSrc;
      if (img.complete && img.naturalWidth) {
        img.onload(new Event('load') as any);
      }
    })();

    return () => {
      disposed = true;
      loadTokenRef.current++;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      const t = threeRef.current;
      if (t) {
        t.renderer.dispose();
        t.scene.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
      }
      threeRef.current = null;
    };
  }, [panoramaSrc, requestRender, syncCanvasSize]);

  // ResizeObserver to keep canvas size in sync with container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      syncCanvasSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [syncCanvasSize]);

  // Mouse events for desktop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        yaw: stateRef.current.yaw,
        pitch: stateRef.current.pitch,
      };
      console.log('[PanoramaDrag] DOWN', { yaw: dragRef.current.yaw, pitch: dragRef.current.pitch });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.clientX;
      const dy = e.clientY - dragRef.current.clientY;
      stateRef.current.yaw = dragRef.current.yaw - dx * PANORAMA_DEFAULTS.dragSensitivity;
      stateRef.current.pitch = clampPitch(dragRef.current.pitch + dy * PANORAMA_DEFAULTS.dragSensitivity);
      requestRender();
    };

    const onMouseUp = () => {
      dragRef.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? PANORAMA_DEFAULTS.wheelZoomStep : -PANORAMA_DEFAULTS.wheelZoomStep;
      stateRef.current.fov = clampFov(stateRef.current.fov + delta);
      setZoomPercent(Math.round((PANORAMA_DEFAULTS.fov / stateRef.current.fov) * 100));
      requestRender();
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
  }, [requestRender]);

  // Touch events for mobile support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const onTouchStart = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 1) {
        touchRef.current = {
          touches: [{ x: e.touches[0].clientX, y: e.touches[0].clientY }],
          dist: 0,
          yaw: stateRef.current.yaw,
          pitch: stateRef.current.pitch,
          fov: stateRef.current.fov,
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
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchRef.current) return;
      e.preventDefault();

      if (e.touches.length === 1 && touchRef.current.touches.length === 1) {
        const dx = e.touches[0].clientX - touchRef.current.touches[0].x;
        const dy = e.touches[0].clientY - touchRef.current.touches[0].y;
        stateRef.current.yaw = touchRef.current.yaw - dx * PANORAMA_DEFAULTS.dragSensitivity;
        stateRef.current.pitch = clampPitch(touchRef.current.pitch + dy * PANORAMA_DEFAULTS.dragSensitivity);
        requestRender();
      } else if (e.touches.length === 2 && touchRef.current.touches.length === 2) {
        const newDist = getTouchDist(e.touches[0], e.touches[1]);
        const scale = touchRef.current.dist / Math.max(newDist, 1);
        const fovDelta = (scale - 1) * 30;
        stateRef.current.fov = clampFov(touchRef.current.fov + fovDelta);
        setZoomPercent(Math.round((PANORAMA_DEFAULTS.fov / stateRef.current.fov) * 100));
        requestRender();
      }
    };

    const onTouchEnd = () => {
      touchRef.current = null;
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
  }, [requestRender]);

  // Gyroscope support
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

      stateRef.current.yaw = stateRef.current.yaw + da;
      stateRef.current.pitch = clampPitch(stateRef.current.pitch - db);
      stateRef.current.fov = clampFov(stateRef.current.fov + dg * 0.3);
      setZoomPercent(Math.round((PANORAMA_DEFAULTS.fov / stateRef.current.fov) * 100));
      requestRender();

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
  }, [gyroEnabled, requestRender]);

  const handleSavePreset = useCallback(() => {
    const name = `视角 ${viewPresets.length + 1}`;
    const newPreset = { name, yaw: stateRef.current.yaw, pitch: stateRef.current.pitch, fov: stateRef.current.fov };
    const updated = [...viewPresets, newPreset];
    setViewPresets(updated);
    if (layerId) {
      useCanvasStore.getState().updateLayer(layerId, { cameraState: { yaw: stateRef.current.yaw, pitch: stateRef.current.pitch, fov: stateRef.current.fov } } as any);
    }
  }, [viewPresets, layerId]);

  const handleRestorePreset = useCallback((preset: { name: string; yaw: number; pitch: number; fov: number }) => {
    stateRef.current.yaw = preset.yaw;
    stateRef.current.pitch = preset.pitch;
    stateRef.current.fov = preset.fov;
    setZoomPercent(Math.round((PANORAMA_DEFAULTS.fov / preset.fov) * 100));
    requestRender();
  }, [requestRender]);

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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: dragRef.current ? 'grabbing' : 'grab',
      }}
    >
      <PanoramaViewerToolbar
        zoomPercent={zoomPercent}
        isLoading={isLoading}
        gyroEnabled={gyroEnabled}
        viewPresets={viewPresets}
        onScreenshot={handleScreenshot}
        onExportCurrent={handleExportCurrent}
        onReset={handleReset}
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
            width: 32,
            height: 32,
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
          color: '#ef4444',
          fontSize: 14,
          fontFamily: 'sans-serif',
          textAlign: 'center',
          padding: 20,
        }}>
          {loadError}
          <br />
          <button
            onClick={onClose}
            style={{
              marginTop: 12,
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid #ef4444',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            关闭
          </button>
        </div>
      )}
      {/* Coordinate HUD */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 8,
        padding: '6px 14px',
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#ccc',
        zIndex: 10,
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        {/* Compass arc */}
        <svg width="80" height="28" viewBox="0 0 80 28">
          <text x="40" y="10" textAnchor="middle" fill="#888" fontSize="8" fontFamily="monospace">N</text>
          <text x="4" y="20" textAnchor="middle" fill="#666" fontSize="7" fontFamily="monospace">W</text>
          <text x="76" y="20" textAnchor="middle" fill="#666" fontSize="7" fontFamily="monospace">E</text>
          <text x="40" y="27" textAnchor="middle" fill="#666" fontSize="7" fontFamily="monospace">S</text>
          {/* Yaw indicator */}
          <line x1="40" y1="10" x2={40 + 30 * Math.sin(coordDisplay.yaw * Math.PI / 180)} y2={14 + 10 * Math.cos(coordDisplay.yaw * Math.PI / 180)} stroke="#a855f7" strokeWidth="2" />
          <circle cx={40 + 30 * Math.sin(coordDisplay.yaw * Math.PI / 180)} cy={14 + 10 * Math.cos(coordDisplay.yaw * Math.PI / 180)} r="2" fill="#a855f7" />
        </svg>
        <span style={{ color: '#a855f7' }}>Yaw {coordDisplay.yaw}°</span>
        <span style={{ color: '#888' }}>|</span>
        <span>Pitch {coordDisplay.pitch}°</span>
        <span style={{ color: '#888' }}>|</span>
        <span>Zoom {zoomPercent}%</span>
      </div>
      {/* Center crosshair */}
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
