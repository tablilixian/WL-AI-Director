import React from 'react';
import { Camera, Layout } from 'lucide-react';
import {
  CAMERA_SHOT_SIZES,
  CAMERA_ANGLES,
  CAMERA_SUBJECT_POSITIONS,
  CAMERA_FOCUS_TYPES,
  CAMERA_MOVEMENT_SPEEDS,
} from '../../../../../components/StageDirector/constants';
import { CAMERA_MOVEMENTS, type GenerationPanelState } from './types';

const SelectRow = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-gray-400 w-14 shrink-0">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-purple-500/50"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);

export const CameraTab: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const {
    selectedCamera,
    setSelectedCamera,
    cameraIntensity,
    setCameraIntensity,
    cameraSpeed,
    setCameraSpeed,
    useChoreography,
    setUseChoreography,
    startShotSize,
    setStartShotSize,
    startAngle,
    setStartAngle,
    startSubject,
    setStartSubject,
    startFocus,
    setStartFocus,
    movementPath,
    setMovementPath,
    movementSpeed,
    setMovementSpeed,
    endShotSize,
    setEndShotSize,
    endAngle,
    setEndAngle,
    endSubject,
    setEndSubject,
    timingStartRatio,
    setTimingStartRatio,
    timingMoveRatio,
    setTimingMoveRatio,
    timingEndRatio,
    setTimingEndRatio,
  } = panel;
  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* 运镜类型选择 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-2">
          <Camera className="w-3.5 h-3.5 text-purple-400" />
          镜头运动类型
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {CAMERA_MOVEMENTS.map((cam) => (
            <button
              key={cam.id}
              onClick={() => setSelectedCamera(cam.id)}
              className={`p-2 rounded-lg border text-left transition-all ${
                selectedCamera === cam.id
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
              }`}
            >
              <div
                className={`text-xs font-medium ${
                  selectedCamera === cam.id ? 'text-purple-300' : 'text-gray-300'
                }`}
              >
                {cam.label}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 leading-tight line-clamp-2">
                {cam.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedCamera !== 'none' && (
        <>
          {/* 强度 & 速度（基础模式共享） */}
          <div className="space-y-3 bg-gray-800/30 rounded-lg border border-gray-700/50 p-3">
            <div>
              <label className="text-xs text-gray-400 flex items-center justify-between">
                <span>运镜强度</span>
                <span className="text-purple-400 font-mono">{cameraIntensity}/10</span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={cameraIntensity}
                onChange={(e) => setCameraIntensity(parseInt(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500 mt-1"
              />
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>轻微</span>
                <span>强烈</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 flex items-center justify-between">
                <span>运镜速度</span>
                <span className="text-purple-400 font-mono">{cameraSpeed}%</span>
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={cameraSpeed}
                onChange={(e) => setCameraSpeed(parseInt(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500 mt-1"
              />
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>缓慢</span>
                <span>快速</span>
              </div>
            </div>
          </div>

          {/* 运镜编排开关 */}
          <div className="flex items-center gap-2 py-1">
            <button
              onClick={() => setUseChoreography(!useChoreography)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border ${
                useChoreography
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <Layout className="w-3 h-3" />
              {useChoreography ? '运镜编排已开启' : '启用运镜编排（起点→路径→终点）'}
            </button>
          </div>

          {useChoreography && (
            <div className="space-y-4 bg-gray-800/30 rounded-lg border border-purple-500/30 p-3">
              <p className="text-[10px] text-purple-400 font-medium">
                依据 Seedance 运镜规范：起点 → 路径 → 终点
              </p>

              {/* 起始帧 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  起始帧姿态
                </h5>
                <div className="space-y-1.5">
                  <SelectRow
                    label="景别"
                    value={startShotSize}
                    options={CAMERA_SHOT_SIZES}
                    onChange={setStartShotSize}
                  />
                  <SelectRow
                    label="角度"
                    value={startAngle}
                    options={CAMERA_ANGLES}
                    onChange={setStartAngle}
                  />
                  <SelectRow
                    label="主体位置"
                    value={startSubject}
                    options={CAMERA_SUBJECT_POSITIONS}
                    onChange={setStartSubject}
                  />
                  <SelectRow
                    label="焦点"
                    value={startFocus}
                    options={CAMERA_FOCUS_TYPES}
                    onChange={setStartFocus}
                  />
                </div>
              </div>

              {/* 运镜路径 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  运镜路径
                </h5>
                <div className="space-y-1.5">
                  <SelectRow
                    label="速度"
                    value={movementSpeed}
                    options={CAMERA_MOVEMENT_SPEEDS}
                    onChange={setMovementSpeed}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-14 shrink-0">路径描述</span>
                    <input
                      type="text"
                      value={movementPath}
                      onChange={(e) => setMovementPath(e.target.value)}
                      placeholder="如: 从右侧向前推进至面部特写"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* 结束帧 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  结束帧姿态
                </h5>
                <div className="space-y-1.5">
                  <SelectRow
                    label="景别"
                    value={endShotSize}
                    options={CAMERA_SHOT_SIZES}
                    onChange={setEndShotSize}
                  />
                  <SelectRow
                    label="角度"
                    value={endAngle}
                    options={CAMERA_ANGLES}
                    onChange={setEndAngle}
                  />
                  <SelectRow
                    label="主体位置"
                    value={endSubject}
                    options={CAMERA_SUBJECT_POSITIONS}
                    onChange={setEndSubject}
                  />
                </div>
              </div>

              {/* 时间分配 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  时间分配
                </h5>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span>起始段占比</span>
                      <span className="text-purple-400 font-mono">
                        {Math.round(timingStartRatio * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      value={Math.round(timingStartRatio * 100)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) / 100;
                        const remaining = 1 - v;
                        const m = timingMoveRatio / (timingMoveRatio + timingEndRatio);
                        setTimingStartRatio(v);
                        setTimingMoveRatio(Math.round(remaining * m * 100) / 100);
                        setTimingEndRatio(Math.round(remaining * (1 - m) * 100) / 100);
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span>运镜段占比</span>
                      <span className="text-purple-400 font-mono">
                        {Math.round(timingMoveRatio * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={70}
                      value={Math.round(timingMoveRatio * 100)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) / 100;
                        const remaining = 1 - v;
                        setTimingMoveRatio(v);
                        setTimingStartRatio(
                          Math.round(Math.min(timingStartRatio, remaining - 0.1) * 100) / 100,
                        );
                        setTimingEndRatio(
                          Math.round(
                            (remaining - Math.min(timingStartRatio, remaining - 0.1)) * 100,
                          ) / 100,
                        );
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span>结束段占比</span>
                      <span className="text-purple-400 font-mono">
                        {Math.round(timingEndRatio * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      value={Math.round(timingEndRatio * 100)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) / 100;
                        const remaining = 1 - v;
                        const s = timingStartRatio / (timingStartRatio + timingMoveRatio);
                        setTimingEndRatio(v);
                        setTimingStartRatio(Math.round(remaining * s * 100) / 100);
                        setTimingMoveRatio(Math.round(remaining * (1 - s) * 100) / 100);
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
