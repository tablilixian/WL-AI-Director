/**
 * VideoEditor 主入口组件
 * 视频编辑器的顶层容器，管理编辑器的各个区域
 */

import React, { useCallback, useEffect } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Scissors, 
  Type, Music, Plus, Upload, Download, Undo2, Redo2
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { Timeline } from './Timeline/Timeline';
import { formatTime } from '../../utils/timeFormat';

interface VideoEditorProps {
  /** 项目ID，用于保存/加载 */
  projectId?: string;
  /** 初始轨道配置 */
  initialTracks?: Array<{
    type: 'video' | 'audio' | 'text';
    name: string;
  }>;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({
  projectId,
  initialTracks,
}) => {
  const {
    // 播放控制
    playState,
    currentTime,
    duration,
    play,
    pause,
    seek,
    // 缩放和滚动
    zoom,
    scrollPosition,
    setZoom,
    setScrollPosition,
    // 历史记录
    undo,
    redo,
    canUndo,
    canRedo,
    // 工具
    activeTool,
    setActiveTool,
    // 添加片段
    addTrack,
  } = useEditorStore();

  // 初始化轨道
  useEffect(() => {
    if (initialTracks && initialTracks.length > 0) {
      initialTracks.forEach((trackConfig) => {
        addTrack(trackConfig.type, trackConfig.name);
      });
    } else {
      // 默认轨道
      addTrack('video', '视频 1');
      addTrack('audio', '音频 1');
      addTrack('text', '字幕 1');
    }
  }, []);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框内的按键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 空格 - 播放/暂停
      if (e.code === 'Space') {
        e.preventDefault();
        if (playState === 'playing') {
          pause();
        } else {
          play();
        }
        return;
      }

      // Ctrl/Cmd + Z - 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y - 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playState, pause, play, undo, redo]);

  // 处理工具切换
  const handleToolChange = useCallback((tool: 'select' | 'trim' | 'split') => {
    setActiveTool(tool);
  }, [setActiveTool]);

  // 处理添加素材
  const handleAddMedia = useCallback(() => {
    // TODO: 实现文件上传
    console.log('添加素材');
  }, []);

  // 处理导出
  const handleExport = useCallback(() => {
    // TODO: 实现导出功能
    console.log('导出项目');
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)]">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-base)] border-b border-[var(--border-primary)]">
        {/* 左侧 - 播放控制 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => seek(0)}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
            title="回到开头"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => playState === 'playing' ? pause() : play()}
            className="p-2 rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            title={playState === 'playing' ? '暂停' : '播放'}
          >
            {playState === 'playing' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          
          <button
            onClick={() => seek(duration)}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
            title="跳到结尾"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* 时间显示 */}
          <div className="ml-4 font-mono text-sm text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)]">{formatTime(currentTime)}</span>
            <span className="mx-1 text-[var(--text-muted)]">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 中间 - 工具选择 */}
        <div className="flex items-center gap-1 bg-[var(--bg-secondary)] rounded-lg p-1">
          <button
            onClick={() => handleToolChange('select')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTool === 'select'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
            title="选择工具 (V)"
          >
            选择
          </button>
          
          <button
            onClick={() => handleToolChange('trim')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTool === 'trim'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
            title="裁剪工具 (T)"
          >
            <Scissors className="w-3 h-3 inline mr-1" />
            裁剪
          </button>
          
          <button
            onClick={() => handleToolChange('split')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTool === 'split'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
            title="分割工具 (S)"
          >
            <Scissors className="w-3 h-3 inline mr-1" />
            分割
          </button>
        </div>

        {/* 右侧 - 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-1.5 rounded transition-colors ${
              canUndo
                ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                : 'text-[var(--text-muted)] cursor-not-allowed'
            }`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-1.5 rounded transition-colors ${
              canRedo
                ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                : 'text-[var(--text-muted)] cursor-not-allowed'
            }`}
            title="重做 (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-[var(--border-subtle)] mx-1" />

          <button
            onClick={handleAddMedia}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
            title="添加素材"
          >
            <Upload className="w-3.5 h-3.5" />
            添加素材
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            title="导出"
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        </div>
      </div>

      {/* 时间线区域 */}
      <div className="flex-1 overflow-hidden">
        <Timeline />
      </div>
    </div>
  );
};

export default VideoEditor;
