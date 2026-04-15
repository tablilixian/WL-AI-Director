import React from 'react';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { QualityCheckResult } from '../../services/ai/scriptQualityService';

interface QualityWarningBadgeProps {
  result: QualityCheckResult;
}

const QualityWarningBadge: React.FC<QualityWarningBadgeProps> = ({ result }) => {
  if (result.score >= 8) return null;

  const getScoreColor = () => {
    if (result.score >= 7) return 'warning';
    return 'error';
  };

  const colorClass = getScoreColor() === 'warning'
    ? {
        bg: 'bg-[var(--warning-bg)]',
        border: 'border-[var(--warning-border)]',
        text: 'text-[var(--warning-text)]',
        icon: 'text-[var(--warning)]'
      }
    : {
        bg: 'bg-[var(--error-bg)]',
        border: 'border-[var(--error-border)]',
        text: 'text-[var(--error-text)]',
        icon: 'text-[var(--error)]'
      };

  return (
    <div className={`${colorClass.bg} border ${colorClass.border} rounded-lg p-3 animate-in fade-in duration-200`}>
      <div className={`flex items-center gap-2 ${colorClass.text} font-bold text-xs mb-2`}>
        <AlertCircle className="w-4 h-4" />
        <span>剧本质量提醒</span>
        <span className={`${colorClass.bg} px-1.5 py-0.5 rounded text-[10px] font-mono`}>
          {result.score}/10
        </span>
      </div>
      <ul className="text-xs text-[var(--text-secondary)] space-y-1">
        {result.suggestions.slice(0, 3).map((s, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className={colorClass.icon}>•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score, size = 'sm' }) => {
  const getScoreStyle = () => {
    if (score >= 8) {
      return {
        bg: 'bg-[var(--success-bg)]',
        border: 'border-[var(--success-border)]',
        text: 'text-[var(--success-text)]',
        icon: CheckCircle
      };
    } else if (score >= 6) {
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

  const style = getScoreStyle();
  const Icon = style.icon;
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span className={`inline-flex items-center gap-1 ${style.bg} ${style.border} ${style.text} ${sizeClass} rounded font-mono font-bold`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      <span>{score}</span>
    </span>
  );
};

export default QualityWarningBadge;