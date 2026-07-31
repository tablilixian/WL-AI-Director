import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { CanvasLayer } from '../src/modules/canvas/components/CanvasLayer';
import { useCanvasStore } from '../src/modules/canvas/hooks/useCanvasState';
import type { LayerData } from '../src/modules/canvas/types/canvas';

describe('CanvasLayer 图层交互', () => {
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

  const findLayerEl = (id: string) => document.querySelector(`[data-layer-id="${id}"]`) as HTMLElement;

  const stickyLayer: LayerData = {
    id: 'sticky-1',
    type: 'sticky',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    src: '',
    title: '便签',
    text: 'hello',
    color: '#fef3c7',
    createdAt: Date.now(),
  };

  const drawLayer: LayerData = {
    id: 'draw-1',
    type: 'drawing',
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    src: '',
    title: '标注',
    createdAt: Date.now(),
  };

  it('在 sticky 的 textarea 上按下并拖动时，图层位置不应改变', () => {
    useCanvasStore.getState().addLayer(stickyLayer);
    render(<CanvasLayer layer={stickyLayer} isSelected={false} />);

    const textarea = document.querySelector('textarea')!;
    expect(textarea).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(textarea, { button: 0, clientX: 100, clientY: 100 });
    });
    act(() => {
      fireEvent.mouseMove(window, { clientX: 160, clientY: 140 });
    });
    act(() => {
      fireEvent.mouseUp(window);
    });

    const layer = useCanvasStore.getState().layers.find(l => l.id === stickyLayer.id)!;
    expect(layer.x).toBe(100);
    expect(layer.y).toBe(100);
  });

  it('在 sticky 的空白区域（非 textarea）按下并拖动时，图层应可移动', () => {
    useCanvasStore.getState().addLayer(stickyLayer);
    render(<CanvasLayer layer={stickyLayer} isSelected={false} />);

    const textarea = document.querySelector('textarea')!;
    const container = textarea.parentElement!;

    act(() => {
      fireEvent.mouseDown(container, { button: 0, clientX: 100, clientY: 100 });
    });
    act(() => {
      fireEvent.mouseMove(window, { clientX: 120, clientY: 120 });
    });
    act(() => {
      fireEvent.mouseUp(window);
    });

    const layer = useCanvasStore.getState().layers.find(l => l.id === stickyLayer.id)!;
    expect(layer.x).toBe(120);
    expect(layer.y).toBe(120);
  });

  it('按下 textarea 时仍会选中图层', () => {
    useCanvasStore.getState().addLayer(stickyLayer);
    render(<CanvasLayer layer={stickyLayer} isSelected={false} />);

    const textarea = document.querySelector('textarea')!;
    act(() => {
      fireEvent.mouseDown(textarea, { button: 0 });
    });

    expect(useCanvasStore.getState().selectedLayerId).toBe('sticky-1');
  });

  it('简单点击图层时触发 onClick', () => {
    const onClick = vi.fn();
    useCanvasStore.getState().addLayer(stickyLayer);
    render(<CanvasLayer layer={stickyLayer} isSelected={false} onClick={onClick} />);

    const textarea = document.querySelector('textarea')!;
    act(() => {
      fireEvent.mouseDown(textarea, { button: 0 });
    });
    act(() => {
      fireEvent.mouseUp(textarea);
    });
    act(() => {
      fireEvent.click(textarea);
    });

    expect(onClick).toHaveBeenCalledWith('sticky-1');
  });

  it('拖动超过阈值后释放鼠标，不应触发 onClick', () => {
    const onClick = vi.fn();
    useCanvasStore.getState().addLayer(drawLayer);
    render(<CanvasLayer layer={drawLayer} isSelected={false} onClick={onClick} />);

    const el = findLayerEl('draw-1');
    expect(el).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(el, { button: 0, clientX: 60, clientY: 60 });
    });
    act(() => {
      fireEvent.mouseMove(window, { clientX: 80, clientY: 80 });
    });
    act(() => {
      fireEvent.mouseUp(window);
    });
    act(() => {
      fireEvent.click(el);
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('text 图层双击进入编辑，失焦后保存文字内容', () => {
    const textLayer: LayerData = {
      id: 'text-1',
      type: 'text',
      x: 10,
      y: 10,
      width: 200,
      height: 80,
      src: '',
      title: '标题',
      text: '原始文字',
      color: '#ffffff',
      fontSize: 24,
      createdAt: Date.now(),
    };
    useCanvasStore.getState().addLayer(textLayer);
    render(<CanvasLayer layer={textLayer} isSelected={false} />);

    const el = document.querySelector('[title="双击编辑文字"]') as HTMLElement;
    expect(el).toBeTruthy();
    act(() => {
      fireEvent.doubleClick(el);
    });

    const textarea = document.querySelector('textarea')!;
    expect(textarea).toBeTruthy();

    act(() => {
      fireEvent.change(textarea, { target: { value: '新文字' } });
    });
    act(() => {
      fireEvent.blur(textarea);
    });

    const layer = useCanvasStore.getState().layers.find(l => l.id === 'text-1')!;
    expect(layer.text).toBe('新文字');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('text 图层按 Esc 取消编辑，不保存', () => {
    const textLayer: LayerData = {
      id: 'text-2',
      type: 'text',
      x: 10,
      y: 10,
      width: 200,
      height: 80,
      src: '',
      title: '标题',
      text: '原始文字',
      color: '#ffffff',
      fontSize: 24,
      createdAt: Date.now(),
    };
    useCanvasStore.getState().addLayer(textLayer);
    render(<CanvasLayer layer={textLayer} isSelected={false} />);

    const el = document.querySelector('[title="双击编辑文字"]') as HTMLElement;
    act(() => {
      fireEvent.doubleClick(el);
    });
    const textarea = document.querySelector('textarea')!;
    act(() => {
      fireEvent.change(textarea, { target: { value: '不应保存' } });
    });
    act(() => {
      fireEvent.keyDown(textarea, { key: 'Escape' });
    });

    const layer = useCanvasStore.getState().layers.find(l => l.id === 'text-2')!;
    expect(layer.text).toBe('原始文字');
  });

  it('非图片图层不渲染输出连线把手', () => {
    useCanvasStore.getState().addLayer(stickyLayer);
    render(<CanvasLayer layer={stickyLayer} isSelected={true} />);

    expect(document.querySelector('[title="拖拽到其它图层建立输出连线"]')).toBeNull();
  });

  it('图片图层渲染输出连线把手', () => {
    const imgLayer: LayerData = {
      id: 'img-1',
      type: 'image',
      x: 10,
      y: 10,
      width: 200,
      height: 150,
      src: 'local:mock',
      title: '图片',
      createdAt: Date.now(),
    };
    useCanvasStore.getState().addLayer(imgLayer);
    render(<CanvasLayer layer={imgLayer} isSelected={true} />);

    expect(document.querySelector('[title="拖拽到其它图层建立输出连线"]')).toBeTruthy();
  });
});
