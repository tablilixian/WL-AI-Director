import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Shot } from '../../types';
import { detectOpeningHook, detectMutedTest, QualityCheckResult } from '../../services/ai/scriptQualityService';

interface ScriptQualityPanelProps {
  scriptText: string;
  shots: Shot[];
  collapsed?: boolean;
}

interface QualitySectionProps {
  title: string;
  result: QualityCheckResult;
  defaultOpen?: boolean;
}

const QualitySection: React.FC<QualitySectionProps> = ({ title, result, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const getStatusIcon = () => {
    if (result.score >= 8) return <CheckCircle className="w-4 h-4 text-[var(--success)]" />;
    if (result.score >= 6) return <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />;
    return <AlertCircle className="w-4 h-4 text-[var(--error)]" />;
  };

  const getScoreBadge = () => {
    const baseClass = 'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold';
    if (result.score >= 8) {
      return <span className={`${baseClass} bg-[var(--success-bg)] text-[var(--success-text)]`}>{result.score}/10</span>;
    }
    if (result.score >= 6) {
      return <span className={`${baseClass} bg-[var(--warning-bg)] text-[var(--warning-text)]`}>{result.score}/10</span>;
    }
    return <span className={`${baseClass} bg-[var(--error-bg)] text-[var(--error-text)]`}>{result.score}/10</span>;
  };

  const errorCount = result.issues.filter(i => i.severity === 'error').length;
  const warningCount = result.issues.filter(i => i.severity === 'warning').length;

  return (
    <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">{title}</span>
          {getScoreBadge()}
          {result.issues.length > 0 && (
            <div className="flex items-center gap-1.5 ml-2">
              {errorCount > 0 && (
                <span className="text-[10px] text-[var(--error-text)] bg-[var(--error-bg)] px-1 rounded">
                  {errorCount} 错误
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-[10px] text-[var(--warning-text)] bg-[var(--warning-bg)] px-1 rounded">
                  {warningCount} 警告
                </span>
              )}
            </div>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
        )}
      </button>

      {isOpen && (
        <div className="px-3 py-2 bg-[var(--bg-surface)] border-t border-[var(--border-primary)]">
          {result.issues.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] italic">✓ 无问题</p>
          ) : (
            <ul className="space-y-2">
              {result.issues.map((issue, index) => (
                <li key={index} className="text-xs">
                  <div className="flex items-start gap-1.5">
                    <span className={
                      issue.severity === 'error' ? 'text-[var(--error)]' : 'text-[var(--warning)]'
                    }>
                      {issue.severity === 'error' ? '✕' : '!'}
                    </span>
                    <div>
                      <span className="text-[var(--text-tertiary)] font-mono text-[10px]">
                        [{issue.location}]
                      </span>
                      <span className="text-[var(--text-secondary)] ml-1">{issue.description}</span>
                    </div>
                  </div>
                  <p className="ml-4 text-[var(--text-muted)] text-[10px] italic">
                    → {issue.suggestion}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const ScriptQualityPanel: React.FC<ScriptQualityPanelProps> = ({
  scriptText,
  shots,
  collapsed = false
}) => {
  const [isExpanded, setIsExpanded] = React.useState(!collapsed);

  const hookResult = useMemo(() => detectOpeningHook(scriptText), [scriptText]);
  const mutedResult = useMemo(() => detectMutedTest(shots), [shots]);
  const totalScore = useMemo(() => Math.round((hookResult.score + mutedResult.score) / 2), [hookResult, mutedResult]);

  const getTotalScoreStyle = () => {
    if (totalScore >= 8) {
      return {
        bg: 'bg-[var(--success-bg)]',
        border: 'border-[var(--success-border)]',
        text: 'text-[var(--success-text)]',
        icon: CheckCircle
      };
    } else if (totalScore >= 6) {
      return {
        bg: 'bg-[var(--warning-bg)]',
        border: 'border-[var(--warning-border)]',
        text: 'text-[var(--warning-text)]',
        icon: AlertTriangle
      };
    } else {
      return {
        bg: 'bg-[var(--error-bg)]',
        border: 'border-[var(--error-border)]',
        text: 'text-[var(--error-text)]',
        icon: AlertCircle
      };
    }
  };

  if (totalScore >= 8 && !isExpanded) {
    return null;
  }

  const style = getTotalScoreStyle();
  const Icon = style.icon;
  const alwaysShow = totalScore < 8;

  if (totalScore >= 8 && !isExpanded) {
    return null;
  }

  return (
    <div className={`${style.bg} border ${style.border} rounded-xl overflow-hidden ${alwaysShow ? '' : 'cursor-pointer'}`}>
      {!alwaysShow && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${style.text}`} />
            <div className="text-left">
              <span className="text-sm font-bold text-[var(--text-primary)]">剧本质量报告</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-mono font-bold ${style.bg} ${style.text}`}>
                {totalScore}/10
              </span>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
          )}
        </button>
      )}

      {alwaysShow && (
        <div className="px-4 py-3 bg-[var(--bg-elevated)] border-b border-[var(--border-primary)] flex items-center gap-3">
          <Icon className={`w-5 h-5 ${style.text}`} />
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">剧本质量报告</span>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${style.bg} ${style.text}`}>
              {totalScore}/10
            </span>
          </div>
        </div>
      )}

      {(isExpanded || alwaysShow) && (
        <div className="px-4 py-3 bg-[var(--bg-surface)] border-t border-[var(--border-primary)] space-y-2">
          <QualitySection title="开篇钩子" result={hookResult} defaultOpen={hookResult.score < 8} />
          <QualitySection title="动作密度（静音测试）" result={mutedResult} defaultOpen={mutedResult.score < 8} />

          {totalScore < 8 && (
            <div className="mt-3 pt-3 border-t border-[var(--border-primary)]">
              <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                改进建议
              </h4>
              <ul className="space-y-1">
                {[...hookResult.suggestions, ...mutedResult.suggestions].map((s, i) => (
                  <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                    <span className="text-[var(--accent)]">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScriptQualityPanel;