import React, { useState } from 'react';
import { AlertTriangle, X, CloudOff } from 'lucide-react';
import { useCanvasStore } from '../hooks/useCanvasState';

/**
 * 画布数据健康告警条。
 * 展示两类问题（均来自 store，非主动轮询）：
 *  - lastSaveError：保存失败（R8），红色，提示数据可能未备份。
 *  - integrityIssues：加载时只读校验发现的问题（R4），琥珀色。
 * 可手动关闭（仅隐藏当前提示，不改变底层数据状态）。
 */
export const CanvasIntegrityBanner: React.FC = () => {
  const integrityIssues = useCanvasStore((s) => s.integrityIssues);
  const lastSaveError = useCanvasStore((s) => s.lastSaveError);

  const [hideSave, setHideSave] = useState(false);
  const [hideIntegrity, setHideIntegrity] = useState(false);

  const errorCount = integrityIssues.filter((i) => i.severity === 'error').length;
  const warnCount = integrityIssues.length - errorCount;

  const showSave = !!lastSaveError && !hideSave;
  const showIntegrity = integrityIssues.length > 0 && !hideIntegrity;

  if (!showSave && !showIntegrity) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-[min(92%,640px)] pointer-events-none">
      {showSave && (
        <div className="pointer-events-auto flex items-start gap-2 rounded-lg border border-red-500/60 bg-red-950/90 px-3 py-2 text-red-100 shadow-lg backdrop-blur">
          <CloudOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-xs leading-relaxed">
            <span className="font-semibold">保存失败：</span>
            {lastSaveError}
          </div>
          <button
            onClick={() => setHideSave(true)}
            className="flex-shrink-0 p-0.5 hover:bg-red-500/20 rounded text-red-300"
            aria-label="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showIntegrity && (
        <div className="pointer-events-auto flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-950/90 px-3 py-2 text-amber-100 shadow-lg backdrop-blur">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-xs leading-relaxed">
            <span className="font-semibold">数据完整性检查：</span>
            发现 {errorCount} 个错误、{warnCount} 个警告
            {errorCount > 0 && '（含断链引用/损坏数据，可能影响续作）'}。
            <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
              {integrityIssues.slice(0, 8).map((issue, idx) => (
                <li key={`${issue.code}-${issue.layerId ?? idx}`} className="opacity-90">
                  <span className={issue.severity === 'error' ? 'text-red-300' : 'text-amber-300'}>
                    [{issue.severity === 'error' ? '错误' : '警告'}]
                  </span>{' '}
                  {issue.message}
                </li>
              ))}
              {integrityIssues.length > 8 && (
                <li className="opacity-70">…其余 {integrityIssues.length - 8} 项见控制台日志</li>
              )}
            </ul>
          </div>
          <button
            onClick={() => setHideIntegrity(true)}
            className="flex-shrink-0 p-0.5 hover:bg-amber-500/20 rounded text-amber-300"
            aria-label="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
