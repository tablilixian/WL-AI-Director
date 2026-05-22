import React from 'react';
import { X, User, ImageIcon, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Character } from '../../types';
import { useImageLoader } from '../../hooks/useImageLoader';

interface ThreeViewModalProps {
  character: Character;
  onClose: () => void;
  onGenerate: (charId: string) => void;
  onImageClick: (imageUrl: string) => void;
  isGenerating?: boolean;
}

const ThreeViewModal: React.FC<ThreeViewModalProps> = ({
  character,
  onClose,
  onGenerate,
  onImageClick,
  isGenerating = false,
}) => {
  const { src: characterImageSrc, loading: characterImageLoading } = useImageLoader(character.imageUrl);
  const { src: threeViewImageSrc, loading: threeViewImageLoading } = useImageLoader(character.threeViewImageUrl);

  const hasThreeView = !!character.threeViewImageUrl;
  const showGenerateButton = !isGenerating;

  return (
    <div
      className="absolute inset-0 z-40 bg-[var(--bg-base)]/90 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-surface)] border border-[var(--border-primary)] w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 px-8 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0 bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-hover)] overflow-hidden border border-[var(--border-secondary)]">
              {characterImageSrc && (
                <img src={characterImageSrc} className="w-full h-full object-cover" alt={character.name} />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{character.name}</h3>
              <p className="text-xs text-[var(--text-tertiary)] font-mono uppercase tracking-wider">Three-View Sheet</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-hover)] rounded-full transition-colors">
            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Casting Image */}
            <div>
              <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-4 flex items-center gap-2">
                <User className="w-4 h-4" /> 定妆照
              </h4>
              <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-primary)]">
                <div
                  className="aspect-video bg-[var(--bg-elevated)] rounded-lg overflow-hidden mb-4 relative cursor-pointer"
                  onClick={() => characterImageSrc && onImageClick(characterImageSrc)}
                >
                  {characterImageLoading ? (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : characterImageSrc ? (
                    <img src={characterImageSrc} className="w-full h-full object-cover" alt="Casting" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                      <User className="w-12 h-12 opacity-20" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-[var(--bg-base)]/60 backdrop-blur rounded text-[10px] text-[var(--text-primary)] font-bold uppercase border border-[var(--overlay-border)]">
                    Default
                  </div>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed font-mono line-clamp-3">
                  {character.visualPrompt || '暂无视觉描述'}
                </p>
              </div>
            </div>

            {/* Right: Three-View Image */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> 三视图立绘图
                </h4>
              </div>

              <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-primary)]">
                <div className="aspect-video bg-[var(--bg-elevated)] rounded-lg overflow-hidden mb-4 relative">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-3">
                      <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)]" />
                      <span className="text-xs text-[var(--text-tertiary)]">正在生成三视图...</span>
                    </div>
                  ) : threeViewImageLoading ? (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : threeViewImageSrc ? (
                    <img
                      src={threeViewImageSrc}
                      className="w-full h-full object-cover cursor-pointer"
                      alt="Three-View"
                      onClick={() => character.threeViewImageUrl && onImageClick(character.threeViewImageUrl)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-3">
                      <ImageIcon className="w-12 h-12 opacity-20" />
                      <span className="text-xs text-[var(--text-tertiary)]">尚未生成三视图</span>
                    </div>
                  )}
                </div>

                {showGenerateButton && (
                  <button
                    onClick={() => onGenerate(character.id)}
                    disabled={!character.imageUrl}
                    className={`w-full py-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      hasThreeView
                        ? 'bg-[var(--accent-bg)] hover:bg-[var(--accent-hover-bg)] text-[var(--accent-text)] border border-[var(--accent-border)]'
                        : 'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] shadow-lg shadow-[var(--btn-primary-shadow)]'
                    }`}
                    title={!character.imageUrl ? '请先生成定妆照' : hasThreeView ? '重新生成三视图' : '生成三视图'}
                  >
                    {hasThreeView ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        重新生成三视图
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        生成三视图
                      </>
                    )}
                  </button>
                )}

                {!character.imageUrl && !isGenerating && (
                  <p className="text-[10px] text-[var(--warning-text)] text-center mt-3 flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    请先生成角色的定妆照
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreeViewModal;
