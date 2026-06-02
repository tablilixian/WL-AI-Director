import React from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Eye, Sparkles, RotateCw, X, Check } from 'lucide-react';
import { ConsistencyCheckResult, ConsistencyConflict } from '../../types';

interface Props {
  results: ConsistencyCheckResult[];
  conflicts: ConsistencyConflict[];
  isChecking: boolean;
  onDismissConflict: (conflictId: string) => void;
  onFixShot: (shotId: string) => void;
  onIgnore: (conflictId: string) => void;
  onRegenerateWithFix: (conflict: ConsistencyConflict) => void;
  isRegenerating: boolean;
  regeneratingConflictId: string | null;
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'error': return <AlertCircle className="w-4 h-4 text-[var(--error)]" />;
    case 'warning': return <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />;
    case 'info': return <CheckCircle className="w-4 h-4 text-[var(--success)]" />;
    default: return <AlertCircle className="w-4 h-4 text-[var(--text-tertiary)]" />;
  }
};

const getSeverityBadge = (severity: string) => {
  const baseClass = 'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded';
  switch (severity) {
    case 'error': return <span className={`${baseClass} bg-[var(--error-bg)] text-[var(--error-text)]`}>冲突</span>;
    case 'warning': return <span className={`${baseClass} bg-[var(--warning-bg)] text-[var(--warning-text)]`}>可能</span>;
    case 'info': return <span className={`${baseClass} bg-[var(--success-bg)] text-[var(--success-text)]`}>合理</span>;
    default: return null;
  }
};

const ConflictItem: React.FC<{
  conflict: ConsistencyConflict;
  onDismiss: () => void;
  onFix: () => void;
  onIgnore: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}> = ({ conflict, onDismiss, onFix, onIgnore, onRegenerate, isRegenerating }) => {
  const [isExpanded, setIsExpanded] = React.useState(conflict.severity !== 'info');

  return (
    <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {getSeverityIcon(conflict.severity)}
          <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider shrink-0">
            {conflict.characterName}
          </span>
          {getSeverityBadge(conflict.severity)}
          <span className="text-xs text-[var(--text-secondary)] truncate">
            {conflict.description.slice(0, 40)}{conflict.description.length > 40 ? '...' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {conflict.userDecision === 'dismissed' && (
            <span className="text-[10px] text-[var(--success)] font-medium">已标记合理</span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 bg-[var(--bg-surface)] border-t border-[var(--border-primary)] space-y-2">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {conflict.description}
          </p>

          {conflict.isPlotDriven && conflict.plotExplanation && (
            <div className="flex items-start gap-1.5 text-xs text-[var(--success-text)] bg-[var(--success-bg)] px-2 py-1 rounded">
              <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{conflict.plotExplanation}</span>
            </div>
          )}

          {!conflict.isPlotDriven && conflict.suggestion && (
            <div className="flex items-start gap-1.5 text-xs text-[var(--warning-text)] bg-[var(--warning-bg)] px-2 py-1 rounded">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>建议：{conflict.suggestion}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {conflict.isPlotDriven ? (
              <button
                onClick={onDismiss}
                disabled={conflict.userDecision === 'dismissed'}
                className="px-2.5 py-1 bg-[var(--success-bg)] text-[var(--success-text)] text-[10px] font-bold rounded flex items-center gap-1 hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                {conflict.userDecision === 'dismissed' ? '已标记' : '确认剧情需要'}
              </button>
            ) : (
              <>
                <button
                  onClick={onFix}
                  className="px-2.5 py-1 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[10px] font-bold rounded flex items-center gap-1 hover:bg-[var(--btn-primary-hover)] transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  查看镜头
                </button>
                <button
                  onClick={onRegenerate}
                  disabled={isRegenerating}
                  className="px-2.5 py-1 bg-[var(--accent-bg-hover)] text-[var(--accent-text)] text-[10px] font-bold rounded flex items-center gap-1 hover:opacity-80 transition-opacity disabled:opacity-50"
                >
                  {isRegenerating ? (
                    <RotateCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  AI修复
                </button>
                <button
                  onClick={onDismiss}
                  className="px-2.5 py-1 bg-[var(--bg-hover)] text-[var(--text-tertiary)] text-[10px] font-bold rounded flex items-center gap-1 hover:bg-[var(--border-secondary)] transition-colors"
                >
                  <Check className="w-3 h-3" />
                  剧情需要
                </button>
              </>
            )}
            <button
              onClick={onIgnore}
              className="px-2.5 py-1 bg-transparent text-[var(--text-muted)] text-[10px] font-bold rounded flex items-center gap-1 hover:text-[var(--text-tertiary)] transition-colors"
            >
              <X className="w-3 h-3" />
              忽略
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const VisualConsistencyPanel: React.FC<Props> = ({
  results,
  conflicts,
  isChecking,
  onDismissConflict,
  onFixShot,
  onIgnore,
  onRegenerateWithFix,
  isRegenerating,
  regeneratingConflictId,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);

  const activeConflicts = conflicts.filter(c => c.userDecision !== 'dismissed');
  const realConflicts = activeConflicts.filter(c => !c.isPlotDriven);
  const plotDrivenConflicts = activeConflicts.filter(c => c.isPlotDriven);
  const hasRealConflicts = realConflicts.length > 0;

  if (isChecking) {
    return (
      <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden bg-[var(--bg-elevated)]">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--border-secondary)] border-t-[var(--accent)] animate-spin" />
          <span className="text-sm text-[var(--text-tertiary)]">正在检查视觉一致性...</span>
        </div>
      </div>
    );
  }

  if (activeConflicts.length === 0) {
    return null;
  }

  const totalScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.consistencyScore, 0) / results.length)
    : 10;

  const getScoreStyle = () => {
    if (totalScore >= 8) {
      return { bg: 'bg-[var(--success-bg)]', border: 'border-[var(--success-border)]', text: 'text-[var(--success-text)]', icon: CheckCircle };
    }
    if (totalScore >= 6) {
      return { bg: 'bg-[var(--warning-bg)]', border: 'border-[var(--warning-border)]', text: 'text-[var(--warning-text)]', icon: AlertTriangle };
    }
    return { bg: 'bg-[var(--error-bg)]', border: 'border-[var(--error-border)]', text: 'text-[var(--error-text)]', icon: AlertCircle };
  };

  const style = getScoreStyle();

  return (
    <div className={`${style.bg} border ${style.border} rounded-xl overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <Eye className={`w-5 h-5 ${style.text}`} />
          <div className="text-left">
            <span className="text-sm font-bold text-[var(--text-primary)]">视觉一致性检查</span>
            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-mono font-bold ${style.bg} ${style.text}`}>
              {totalScore}/10
            </span>
          </div>
          {hasRealConflicts && (
            <span className="text-xs text-[var(--error-text)] bg-[var(--error-bg)] px-2 py-0.5 rounded font-bold">
              {realConflicts.length} 项冲突
            </span>
          )}
          {!hasRealConflicts && plotDrivenConflicts.length > 0 && (
            <span className="text-xs text-[var(--success-text)] bg-[var(--success-bg)] px-2 py-0.5 rounded font-bold">
              {plotDrivenConflicts.length} 项合理变化
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
      </button>

      {isExpanded && (
        <div className="px-4 py-3 bg-[var(--bg-surface)] border-t border-[var(--border-primary)] space-y-2">
          {realConflicts.length === 0 && plotDrivenConflicts.length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)] italic flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[var(--success)]" />
              未发现视觉冲突
            </p>
          )}

          {realConflicts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-[var(--error-text)] uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                需关注的冲突
              </h4>
              {realConflicts.map(conflict => (
                <ConflictItem
                  key={conflict.id}
                  conflict={conflict}
                  onDismiss={() => onDismissConflict(conflict.id)}
                  onFix={() => onFixShot(conflict.shotIds[0])}
                  onIgnore={() => onIgnore(conflict.id)}
                  onRegenerate={() => onRegenerateWithFix(conflict)}
                  isRegenerating={isRegenerating && regeneratingConflictId === conflict.id}
                />
              ))}
            </div>
          )}

          {plotDrivenConflicts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-[var(--success-text)] uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3" />
                剧情合理变化
              </h4>
              {plotDrivenConflicts.map(conflict => (
                <ConflictItem
                  key={conflict.id}
                  conflict={conflict}
                  onDismiss={() => onDismissConflict(conflict.id)}
                  onFix={() => {}}
                  onIgnore={() => onIgnore(conflict.id)}
                  onRegenerate={() => {}}
                  isRegenerating={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VisualConsistencyPanel;
