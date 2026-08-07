import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      layerEl = document.querySelector('[title="双击预览视频"]')
        ?.parentElement as HTMLElement | null;
      expect(layerEl).toBeTruthy();
    });

    fireEvent.mouseDown(layerEl!, { button: 0 });

    await waitFor(() => {
      expect(useCanvasStore.getState().selectedLayerId).toBe('video-layer-1');
    });

    fireEvent.mouseUp(layerEl!);
    fireEvent.click(layerEl!);

    await new Promise((r) => setTimeout(r, 100));

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

    await new Promise((r) => setTimeout(r, 100));

    expect(screen.queryByText('视频生成')).toBeNull();
    expect(screen.queryByText('视频已生成')).toBeNull();
  });

  it('单击（按下+抬起未拖动）MKR 视频节点时打开视频生成配置面板', async () => {
    const mkrLayer: LayerData = {
      id: 'mkr-video-2',
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

    const layerEl = document.querySelector('[data-layer-id="mkr-video-2"]') as HTMLElement | null;
    expect(layerEl).toBeTruthy();

    fireEvent.mouseDown(layerEl!, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.mouseUp(layerEl!, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.click(layerEl!);

    await waitFor(() => {
      expect(screen.getByText('视频生成')).toBeTruthy();
    });
  });

  it('点击图片菜单「多关键帧视频 (MKR)」创建节点后，自动打开视频生成面板', async () => {
    const imgLayer: LayerData = {
      id: 'img-1',
      type: 'image',
      x: 100,
      y: 100,
      width: 320,
      height: 180,
      src: 'local:mock',
      title: '源图片',
      createdAt: Date.now(),
    };
    useCanvasStore.getState().addLayer(imgLayer);

    render(<InfiniteCanvas className="w-full h-[800px]" />);

    const layerEl = document.querySelector('[data-layer-id="img-1"]') as HTMLElement | null;
    expect(layerEl).toBeTruthy();

    fireEvent.mouseDown(layerEl!, { button: 0 });
    fireEvent.mouseUp(layerEl!);

    await waitFor(() => {
      expect(useCanvasStore.getState().selectedLayerId).toBe('img-1');
    });

    const groupBtn = screen.getByText('基于此图生成');
    fireEvent.click(groupBtn);

    const mkrItem = screen.getByText('多关键帧视频 (MKR)');
    fireEvent.click(mkrItem);

    const mkrLayer = useCanvasStore.getState().layers.find((l) => l.operationType === 'mkr-video');
    expect(mkrLayer).toBeTruthy();
    expect(useCanvasStore.getState().selectedLayerId).toBe(mkrLayer!.id);

    await waitFor(() => {
      expect(screen.getByText('视频生成')).toBeTruthy();
    });
  });
});
