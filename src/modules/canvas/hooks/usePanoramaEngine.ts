import { useRef, useEffect, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { PANORAMA_DEFAULTS, clampFov, clampPitch, normalizeYaw } from '../utils/panoramaUtils';
import type { PanoramaCameraState } from '../types/canvas';

interface EngineRef {
  THREE: any;
  renderer: any;
  scene: any;
  camera: any;
  sphere: any;
}

interface UsePanoramaEngineOptions {
  panoramaSrc: string;
  initialCamera?: PanoramaCameraState;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  onLoad?: () => void;
}

export function usePanoramaEngine({
  panoramaSrc,
  initialCamera,
  canvasRef,
  containerRef,
  onLoad,
}: UsePanoramaEngineOptions) {
  const stateRef = useRef({
    yaw: initialCamera?.yaw ?? PANORAMA_DEFAULTS.yaw,
    pitch: initialCamera?.pitch ?? PANORAMA_DEFAULTS.pitch,
    fov: initialCamera?.fov ?? PANORAMA_DEFAULTS.fov,
  });
  const engineRef = useRef<EngineRef | null>(null);
  const rafRef = useRef(0);
  const loadTokenRef = useRef(0);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

  const renderFrame = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    const { renderer, scene, camera, THREE } = e;
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

    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(-stateRef.current.pitch),
      THREE.MathUtils.degToRad(stateRef.current.yaw - 90),
      0,
      'YXZ',
    );
    camera.quaternion.setFromEuler(euler);
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
  }, [canvasRef]);

  const requestRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      renderFrame();
    });
  }, [renderFrame]);

  const syncCanvasSize = useCallback(() => {
    const e = engineRef.current;
    const container = containerRef.current;
    if (!e || !container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w > 0 && h > 0) {
      const renderer = e.renderer;
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) ||
          renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        requestRender();
      }
    }
  }, [containerRef, requestRender]);

  const captureView = useCallback((yaw: number, pitch: number): Promise<string> => {
    return new Promise((resolve) => {
      const prevYaw = stateRef.current.yaw;
      const prevPitch = stateRef.current.pitch;
      stateRef.current.yaw = yaw;
      stateRef.current.pitch = pitch;
      renderFrame();
      const canvas = canvasRef.current;
      if (canvas) resolve(canvas.toDataURL('image/png'));
      stateRef.current.yaw = prevYaw;
      stateRef.current.pitch = prevPitch;
    });
  }, [renderFrame, canvasRef]);

  const handleReset = useCallback(() => {
    stateRef.current.yaw = PANORAMA_DEFAULTS.yaw;
    stateRef.current.pitch = PANORAMA_DEFAULTS.pitch;
    stateRef.current.fov = PANORAMA_DEFAULTS.fov;
    setZoomPercent(100);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    renderFrame();
  }, [renderFrame]);

  const handleWheelZoom = useCallback((deltaY: number) => {
    const delta = deltaY > 0 ? PANORAMA_DEFAULTS.wheelZoomStep : -PANORAMA_DEFAULTS.wheelZoomStep;
    stateRef.current.fov = clampFov(stateRef.current.fov + delta);
    setZoomPercent(Math.round((PANORAMA_DEFAULTS.fov / stateRef.current.fov) * 100));
    requestRender();
  }, [requestRender]);

  const handleDeltaYaw = useCallback((dyaw: number) => {
    stateRef.current.yaw = normalizeYaw(stateRef.current.yaw + dyaw);
    requestRender();
  }, [requestRender]);

  const handleDeltaPitch = useCallback((dpitch: number) => {
    stateRef.current.pitch = clampPitch(stateRef.current.pitch + dpitch);
    requestRender();
  }, [requestRender]);

  const handleSetFov = useCallback((fov: number) => {
    stateRef.current.fov = clampFov(fov);
    setZoomPercent(Math.round((PANORAMA_DEFAULTS.fov / fov) * 100));
    requestRender();
  }, [requestRender]);

  // Initialize Three.js
  useEffect(() => {
    const token = ++loadTokenRef.current;
    let disposed = false;

    (async () => {
      const THREE = await import('three').catch(() => null);
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

      engineRef.current = { THREE, renderer, scene, camera, sphere };

      const img = new Image();
      img.onload = () => {
        if (disposed || token !== loadTokenRef.current) return;
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
        onLoad?.();
      };
      img.onerror = () => {
        if (disposed) return;
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
      const e = engineRef.current;
      if (e) {
        e.renderer.dispose();
        e.scene.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
      }
      engineRef.current = null;
    };
  }, [panoramaSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, syncCanvasSize]);

  return {
    stateRef,
    engineRef,
    isLoading,
    loadError,
    zoomPercent,
    setZoomPercent,
    renderFrame,
    requestRender,
    syncCanvasSize,
    captureView,
    handleReset,
    handleWheelZoom,
    handleDeltaYaw,
    handleDeltaPitch,
    handleSetFov,
  };
}
