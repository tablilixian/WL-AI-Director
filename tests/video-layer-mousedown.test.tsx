import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InfiniteCanvas } from '../src/modules/canvas/components/InfiniteCanvas';
import { useCanvasStore } from '../src/modules/canvas/hooks/useCanvasState';
import type { LayerData } from '../src/modules/canvas/types/canvas';

vi.mock('../src/modules/canvas/services/canvasModelService', () => ({
  canvasModelService: {
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
    generateVideoMkr: vi.fn(),
    generateVideoMkrGrid: vi.fn(),
  },
}));

describe('视频图层鼠标按下交互', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      projectId: 'test-proj',
      layers: [],
      offset: { x: 0, y: 0 },
      scale: 1,
      selectedLayerId: null,
      selectedLayerIds: [],
    });
  });

  const addVideoLayer = () => {
    const layer: LayerData = {
      id: 'video-layer-1',
      type: 'video',
      x: 100,
      y: 100,
      width: 320,
      height: 180,
      src: 'blob:http://localhost/video1',
      title: 'AI生成视频',
      createdAt: Date.now(),
      operationType: 'image-to-video',
      sourceLayerIds: ['img-1'],
    };
    useCanvasStore.getState().addLayer(layer);
  };

  it('鼠标按下视频图层时，不应弹出 AI 视频生成窗口', async () => {
    addVideoLayer();

    render(<InfiniteCanvas className="w-full h-[800px]" />);

    let layerEl: HTMLElement | null = null;
    await waitFor(() => {
      layerEl = document.querySelector('[title="双击预览视频"]')?.parentElement as HTMLElement | null;
      expect(layerEl).toBeTruthy();
    });

    fireEvent.mouseDown(layerEl!, { button: 0 });

    await waitFor(() => {
      expect(useCanvasStore.getState().selectedLayerId).toBe('video-layer-1');
    });

    fireEvent.mouseUp(layerEl!);
    fireEvent.click(layerEl!);

    await new Promise(r => setTimeout(r, 100));

    expect(screen.queryByText('AI 视频生成')).toBeNull();
    expect(screen.queryByText('AI 生成视频')).toBeNull();
    expect(screen.queryByText('重新生成')).toBeNull();
  });

  it('选中 MKR 视频节点时，不再自动弹出底部视频生成面板', async () => {
    const mkrLayer: LayerData = {
      id: 'mkr-video-1',
      type: 'video',
      x: 100,
      y: 100,
      width: 640,
      height: 360,
      src: '',
      title: 'MKR视频节点',
      createdAt: Date.now(),
      operationType: 'mkr-video',
      sourceLayerIds: ['img-1'],
    };
    useCanvasStore.getState().addLayer(mkrLayer);

    render(<InfiniteCanvas className="w-full h-[800px]" />);

    const layerEl = document.querySelector('[data-layer-id="mkr-video-1"]') as HTMLElement | null;
    expect(layerEl).toBeTruthy();

    fireEvent.mouseDown(layerEl!, { button: 0 });

    await waitFor(() => {
      expect(useCanvasStore.getState().selectedLayerId).toBe('mkr-video-1');
    });

    fireEvent.mouseUp(layerEl!);

    await new Promise(r => setTimeout(r, 100));

    expect(screen.queryByText('视频生成')).toBeNull();
    expect(screen.queryByText('视频已生成')).toBeNull();
  });
});
