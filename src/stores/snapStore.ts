/**
 * 吸附配置 Zustand Store
 * 管理吸附功能的开关、阈值等配置
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SnapConfig, DEFAULT_SNAP_CONFIG } from '../types/editor';

interface SnapStore {
  config: SnapConfig;
  toggleSnap: () => void;
  setThreshold: (threshold: number) => void;
  togglePlayheadSnap: () => void;
  toggleMarkerSnap: () => void;
  toggleClipEdgesSnap: () => void;
  toggleClipCenterSnap: () => void;
  resetConfig: () => void;
}

export const useSnapStore = create<SnapStore>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_SNAP_CONFIG },

      toggleSnap: () => set((state) => ({
        config: { ...state.config, enabled: !state.config.enabled }
      })),

      setThreshold: (threshold) => set((state) => ({
        config: { ...state.config, threshold: Math.max(100, Math.min(1000, threshold)) }
      })),

      togglePlayheadSnap: () => set((state) => ({
        config: { ...state.config, snapToPlayhead: !state.config.snapToPlayhead }
      })),

      toggleMarkerSnap: () => set((state) => ({
        config: { ...state.config, snapToMarkers: !state.config.snapToMarkers }
      })),

      toggleClipEdgesSnap: () => set((state) => ({
        config: { ...state.config, snapToClipEdges: !state.config.snapToClipEdges }
      })),

      toggleClipCenterSnap: () => set((state) => ({
        config: { ...state.config, snapToClipCenter: !state.config.snapToClipCenter }
      })),

      resetConfig: () => set({ config: { ...DEFAULT_SNAP_CONFIG } }),
    }),
    {
      name: 'video-editor-snap-config',
    }
  )
);

// ============================================================
// 吸附计算 Hook
// ============================================================

import {
  Track,
  SnapPoint,
  SnapResult,
} from '../types/editor';
import { useEditorStore } from './editorStore';

/**
 * 计算吸附点的 Hook
 */
export function useSnapCalculation() {
  const { config } = useSnapStore();
  const { tracks, currentTime } = useEditorStore();

  /**
   * 获取所有吸附点
   */
  const getSnapPoints = (
    currentClipId?: string,
    excludeTrackId?: string
  ): SnapPoint[] => {
    const points: SnapPoint[] = [];

    for (const track of tracks) {
      if (track.id === excludeTrackId) continue;

      for (const clip of track.clips) {
        if (clip.id === currentClipId) continue;

        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        const clipCenter = clipStart + clip.duration / 2;

        // 片段边界吸附点
        if (config.snapToClipEdges) {
          points.push({
            type: 'clip-start',
            time: clipStart,
            clipId: clip.id,
            trackId: track.id,
            label: `${track.name} 开始`,
          });

          points.push({
            type: 'clip-end',
            time: clipEnd,
            clipId: clip.id,
            trackId: track.id,
            label: `${track.name} 结束`,
          });
        }

        // 片段中心吸附点
        if (config.snapToClipCenter) {
          points.push({
            type: 'clip-center',
            time: clipCenter,
            clipId: clip.id,
            trackId: track.id,
            label: `${track.name} 中心`,
          });
        }
      }
    }

    // 播放头吸附点
    if (config.snapToPlayhead) {
      points.push({
        type: 'playhead',
        time: currentTime,
        label: '播放头',
      });
    }

    // 时间标记吸附点
    if (config.snapToMarkers) {
      const interval = 5000; // 每 5 秒一个标记
      for (let t = 0; t <= currentTime * 2; t += interval) {
        points.push({
          type: 'time-marker',
          time: t,
          label: `${t / 1000}s`,
        });
      }
    }

    return points;
  };

  /**
   * 计算吸附
   */
  const calculateSnap = (
    currentTime: number,
    snapPoints: SnapPoint[]
  ): SnapResult => {
    if (!config.enabled) {
      return { snapped: false, snappedTime: currentTime, snapPoint: null };
    }

    let closestPoint: SnapPoint | null = null;
    let closestDistance = Infinity;

    for (const point of snapPoints) {
      const distance = Math.abs(currentTime - point.time);

      if (distance <= config.threshold && distance < closestDistance) {
        closestDistance = distance;
        closestPoint = point;
      }
    }

    if (closestPoint) {
      return {
        snapped: true,
        snappedTime: closestPoint.time,
        snapPoint: closestPoint,
        distance: closestDistance,
      };
    }

    return { snapped: false, snappedTime: currentTime, snapPoint: null };
  };

  /**
   * 计算片段吸附（考虑首尾两端）
   */
  const calculateClipSnap = (
    clipStartTime: number,
    clipDuration: number,
    snapPoints: SnapPoint[]
  ): { finalTime: number; snapInfo: SnapResult | null } => {
    if (!config.enabled) {
      return { finalTime: clipStartTime, snapInfo: null };
    }

    // 尝试吸附片段开始点
    const startSnap = calculateSnap(clipStartTime, snapPoints);

    // 尝试吸附片段结束点
    const endTime = clipStartTime + clipDuration;
    const endSnap = calculateSnap(endTime, snapPoints);
    const adjustedEndSnap: SnapResult = endSnap.snapped
      ? { ...endSnap, snappedTime: endSnap.snappedTime - clipDuration }
      : endSnap;

    // 选择更好的吸附结果
    if (startSnap.snapped && (!adjustedEndSnap.snapped ||
        Math.abs(clipStartTime - startSnap.snappedTime) <
        Math.abs(clipStartTime - adjustedEndSnap.snappedTime))) {
      return { finalTime: startSnap.snappedTime, snapInfo: startSnap };
    } else if (adjustedEndSnap.snapped) {
      return { finalTime: adjustedEndSnap.snappedTime, snapInfo: adjustedEndSnap };
    }

    return { finalTime: clipStartTime, snapInfo: null };
  };

  return {
    config,
    getSnapPoints,
    calculateSnap,
    calculateClipSnap,
  };
}

// 导出吸附配置 hook
export const useSnapConfig = () => useSnapStore((s) => s.config);
