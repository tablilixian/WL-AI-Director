import React, { useState } from 'react';
import { X, Check, Camera } from 'lucide-react';
import { CameraChoreography } from '../../types';
import {
  CAMERA_SHOT_SIZES,
  CAMERA_ANGLES,
  CAMERA_SUBJECT_POSITIONS,
  CAMERA_FOCUS_TYPES,
  CAMERA_MOVEMENT_TYPES,
  CAMERA_MOVEMENT_SPEEDS,
} from './constants';

interface CameraChoreographyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (choreography: CameraChoreography | undefined) => void;
  initial?: CameraChoreography;
}

const SelectField = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly string[];
  onChange: (v: T) => void;
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-[var(--text-tertiary)] w-14 shrink-0">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="flex-1 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);

export const CameraChoreographyModal: React.FC<CameraChoreographyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initial,
}) => {
  const [useChoreography, setUseChoreography] = useState(!!initial);
  const [movementType, setMovementType] = useState(initial?.movementType || 'push-in');
  const [movementPath, setMovementPath] = useState(initial?.movementPath || '');
  const [movementSpeed, setMovementSpeed] = useState(initial?.movementSpeed || '中速');
  const [movementIntensity, setMovementIntensity] = useState(initial?.movementIntensity ?? 5);
  const [startShotSize, setStartShotSize] = useState(initial?.startShotSize || '中景');
  const [startAngle, setStartAngle] = useState(initial?.startAngle || '平视');
  const [startSubject, setStartSubject] = useState(initial?.startSubject || '居中');
  const [startFocus, setStartFocus] = useState(initial?.startFocus || '浅景深');
  const [endShotSize, setEndShotSize] = useState(initial?.endShotSize || '近景');
  const [endAngle, setEndAngle] = useState(initial?.endAngle || '仰拍');
  const [endSubject, setEndSubject] = useState(initial?.endSubject || '黄金分割左');
  const [timingStartRatio, setTimingStartRatio] = useState(initial?.timingStartRatio ?? 0.3);
  const [timingMoveRatio, setTimingMoveRatio] = useState(initial?.timingMoveRatio ?? 0.4);
  const [timingEndRatio, setTimingEndRatio] = useState(initial?.timingEndRatio ?? 0.3);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!useChoreography) {
      onSave(undefined);
      return;
    }
    onSave({
      startShotSize: startShotSize as CameraChoreography['startShotSize'],
      startAngle: startAngle as CameraChoreography['startAngle'],
      startSubject: startSubject as CameraChoreography['startSubject'],
      startFocus: startFocus as CameraChoreography['startFocus'],
      movementType,
      movementPath,
      movementSpeed: movementSpeed as CameraChoreography['movementSpeed'],
      movementIntensity,
      endShotSize: endShotSize as CameraChoreography['endShotSize'],
      endAngle: endAngle as CameraChoreography['endAngle'],
      endSubject: endSubject as CameraChoreography['endSubject'],
      timingStartRatio,
      timingMoveRatio,
      timingEndRatio,
    });
  };

  const handleTimingStartChange = (v: number) => {
    const remaining = 1 - v;
    const m = timingMoveRatio / (timingMoveRatio + timingEndRatio);
    setTimingStartRatio(v);
    setTimingMoveRatio(Math.round(remaining * m * 100) / 100);
    setTimingEndRatio(Math.round(remaining * (1 - m) * 100) / 100);
  };

  const handleTimingMoveChange = (v: number) => {
    const remaining = 1 - v;
    setTimingMoveRatio(v);
    setTimingStartRatio(Math.round(Math.min(timingStartRatio, remaining - 0.1) * 100) / 100);
    setTimingEndRatio(
      Math.round((remaining - Math.min(timingStartRatio, remaining - 0.1)) * 100) / 100,
    );
  };

  const handleTimingEndChange = (v: number) => {
    const remaining = 1 - v;
    const s = timingStartRatio / (timingStartRatio + timingMoveRatio);
    setTimingEndRatio(v);
    setTimingStartRatio(Math.round(remaining * s * 100) / 100);
    setTimingMoveRatio(Math.round(remaining * (1 - s) * 100) / 100);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--overlay-heavy)] backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-[var(--text-primary)] font-bold flex items-center gap-2">
            <Camera className="w-4 h-4 text-[var(--accent-text)]" />
            编辑运镜编排
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseChoreography(!useChoreography)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
              useChoreography
                ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                : 'border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:border-[var(--border-primary)]'
            }`}
          >
            {useChoreography ? '✓ 运镜编排已开启' : '启用运镜编排（起点→路径→终点）'}
          </button>
        </div>

        {useChoreography && (
          <div className="space-y-5">
            {/* Movement Type */}
            <div>
              <h5 className="text-[11px] text-[var(--text-secondary)] font-medium mb-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                镜头运动类型
              </h5>
              <div className="grid grid-cols-3 gap-1.5">
                {CAMERA_MOVEMENT_TYPES.filter((m) => m.id !== 'none').map((cam) => (
                  <button
                    key={cam.id}
                    onClick={() => setMovementType(cam.id)}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      movementType === cam.id
                        ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                        : 'border-[var(--border-secondary)] bg-[var(--bg-surface)] hover:border-[var(--border-primary)]'
                    }`}
                  >
                    <div
                      className={`text-[11px] font-medium ${
                        movementType === cam.id
                          ? 'text-[var(--accent-text)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {cam.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 起始帧 */}
            <div>
              <h5 className="text-[11px] text-[var(--text-secondary)] font-medium mb-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                起始帧姿态
              </h5>
              <div className="space-y-1.5">
                <SelectField
                  label="景别"
                  value={startShotSize}
                  options={CAMERA_SHOT_SIZES}
                  onChange={setStartShotSize}
                />
                <SelectField
                  label="角度"
                  value={startAngle}
                  options={CAMERA_ANGLES}
                  onChange={setStartAngle}
                />
                <SelectField
                  label="主体位置"
                  value={startSubject}
                  options={CAMERA_SUBJECT_POSITIONS}
                  onChange={setStartSubject}
                />
                <SelectField
                  label="焦点"
                  value={startFocus}
                  options={CAMERA_FOCUS_TYPES}
                  onChange={setStartFocus}
                />
              </div>
            </div>

            {/* 运镜路径 */}
            <div>
              <h5 className="text-[11px] text-[var(--text-secondary)] font-medium mb-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                运镜路径
              </h5>
              <div className="space-y-1.5">
                <SelectField
                  label="速度"
                  value={movementSpeed}
                  options={CAMERA_MOVEMENT_SPEEDS}
                  onChange={setMovementSpeed}
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-tertiary)] w-14 shrink-0">
                    路径
                  </span>
                  <input
                    type="text"
                    value={movementPath}
                    onChange={(e) => setMovementPath(e.target.value)}
                    placeholder="如: 从右侧向前推进至面部特写"
                    className="flex-1 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] flex items-center justify-between">
                    <span>强度</span>
                    <span className="text-[var(--accent-text)] font-mono">
                      {movementIntensity}/10
                    </span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={movementIntensity}
                    onChange={(e) => setMovementIntensity(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[var(--border-primary)] rounded-full appearance-none cursor-pointer accent-[var(--accent)] mt-1"
                  />
                </div>
              </div>
            </div>

            {/* 结束帧 */}
            <div>
              <h5 className="text-[11px] text-[var(--text-secondary)] font-medium mb-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                结束帧姿态
              </h5>
              <div className="space-y-1.5">
                <SelectField
                  label="景别"
                  value={endShotSize}
                  options={CAMERA_SHOT_SIZES}
                  onChange={setEndShotSize}
                />
                <SelectField
                  label="角度"
                  value={endAngle}
                  options={CAMERA_ANGLES}
                  onChange={setEndAngle}
                />
                <SelectField
                  label="主体位置"
                  value={endSubject}
                  options={CAMERA_SUBJECT_POSITIONS}
                  onChange={setEndSubject}
                />
              </div>
            </div>

            {/* 时间分配 */}
            <div>
              <h5 className="text-[11px] text-[var(--text-secondary)] font-medium mb-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                时间分配
              </h5>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-[var(--text-tertiary)] flex items-center justify-between">
                    <span>起始段占比</span>
                    <span className="text-[var(--accent-text)] font-mono">
                      {Math.round(timingStartRatio * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    value={Math.round(timingStartRatio * 100)}
                    onChange={(e) => handleTimingStartChange(parseInt(e.target.value) / 100)}
                    className="w-full h-1.5 bg-[var(--border-primary)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-tertiary)] flex items-center justify-between">
                    <span>运镜段占比</span>
                    <span className="text-[var(--accent-text)] font-mono">
                      {Math.round(timingMoveRatio * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={70}
                    value={Math.round(timingMoveRatio * 100)}
                    onChange={(e) => handleTimingMoveChange(parseInt(e.target.value) / 100)}
                    className="w-full h-1.5 bg-[var(--border-primary)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-tertiary)] flex items-center justify-between">
                    <span>结束段占比</span>
                    <span className="text-[var(--accent-text)] font-mono">
                      {Math.round(timingEndRatio * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    value={Math.round(timingEndRatio * 100)}
                    onChange={(e) => handleTimingEndChange(parseInt(e.target.value) / 100)}
                    className="w-full h-1.5 bg-[var(--border-primary)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
                  />
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-primary)] p-3">
              <h5 className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-1.5">
                预览
              </h5>
              <div className="bg-[var(--bg-base)] rounded p-2 text-[10px] text-[var(--text-muted)] font-mono leading-relaxed">
                <div className="text-[var(--text-tertiary)]">
                  起始: {startShotSize}/{startAngle}/{startSubject}
                </div>
                <div className="text-[var(--accent-text)]">
                  {CAMERA_MOVEMENT_TYPES.find((m) => m.id === movementType)?.label || movementType}
                  {movementPath ? ` → ${movementPath}` : ''}
                </div>
                <div className="text-[var(--text-tertiary)]">
                  结束: {endShotSize}/{endAngle}/{endSubject}
                </div>
                <div className="text-gray-600">
                  时间: {Math.round(timingStartRatio * 100)}% / {Math.round(timingMoveRatio * 100)}%
                  / {Math.round(timingEndRatio * 100)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border-secondary)] rounded-lg text-sm font-bold transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraChoreographyModal;
