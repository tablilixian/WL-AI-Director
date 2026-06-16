import React, { useState } from 'react';
import { Save, X, Sparkles } from 'lucide-react';
import { STYLES } from './constants';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  placeholder?: string;
  size?: 'large' | 'small' | 'video';
  isVideo?: boolean;
  onApiEnhance?: (currentValue: string) => Promise<string>;
}

const PromptEditor: React.FC<Props> = ({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder = '输入提示词...',
  size = 'large',
  isVideo = false,
  onApiEnhance
}) => {
  const [isApiEnhancing, setIsApiEnhancing] = useState(false);

  const textareaClass = `${STYLES.textarea.base} ${
    size === 'large' ? STYLES.textarea.large :
    size === 'video' ? STYLES.textarea.video :
    STYLES.textarea.small
  }`;

  const saveButtonClass = isVideo 
    ? STYLES.button.saveVideo 
    : size === 'small' 
      ? STYLES.button.saveSmall 
      : STYLES.button.save;

  const cancelButtonClass = size === 'small' 
    ? STYLES.button.cancelSmall 
    : STYLES.button.cancel;

  const handleApiEnhance = async () => {
    if (!onApiEnhance || !value.trim() || isApiEnhancing) return;
    setIsApiEnhancing(true);
    try {
      const enhanced = await onApiEnhance(value);
      if (enhanced) {
        onChange(enhanced);
      }
    } finally {
      setIsApiEnhancing(false);
    }
  };

  const enhanceButtonClass = size === 'small'
    ? 'px-2 py-1 text-xs'
    : 'px-2.5 py-1.5 text-xs';

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
        placeholder={placeholder}
        autoFocus
      />
      <div className="flex gap-2">
        <button onClick={onSave} className={saveButtonClass}>
          <Save className="w-3 h-3" />
          保存
        </button>
        {onApiEnhance && (
          <button
            onClick={handleApiEnhance}
            disabled={!value.trim() || isApiEnhancing}
            className={`${enhanceButtonClass} bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1`}
          >
            {isApiEnhancing ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                API增强
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                API增强
              </>
            )}
          </button>
        )}
        <button onClick={onCancel} className={cancelButtonClass}>
          <X className="w-3 h-3" />
          取消
        </button>
      </div>
    </div>
  );
};

export default PromptEditor;
