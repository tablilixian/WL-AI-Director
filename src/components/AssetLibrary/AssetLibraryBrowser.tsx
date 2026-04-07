import React, { useCallback } from 'react';
import { Search, Trash2, Loader2 } from 'lucide-react';
import { AssetLibraryItem } from '../../../types';
import { AssetLibraryImage } from './AssetLibraryImage';
import { getAssetPreviewUrl, getAssetTypeLabel, AssetFilter } from './useAssetLibrary';
import { useAlert } from '../../../components/GlobalAlert';

const FILTER_TYPES: AssetFilter[] = ['all', 'character', 'scene', 'prop', 'turnaround'];

interface AssetLibraryBrowserProps {
  items: AssetLibraryItem[];
  isLoading: boolean;
  filter: AssetFilter;
  projectFilter: string;
  searchQuery: string;
  projectOptions: string[];
  totalCount: number;
  onFilterChange: (filter: AssetFilter) => void;
  onProjectFilterChange: (project: string) => void;
  onSearchChange: (query: string) => void;
  onDelete: (itemId: string) => void;
  onSelect?: (item: AssetLibraryItem) => void;
  selectLabel?: string;
  selectedItemId?: string | null;
  emptyMessage?: string;
}

export const AssetLibraryBrowser: React.FC<AssetLibraryBrowserProps> = ({
  items,
  isLoading,
  filter,
  projectFilter,
  searchQuery,
  projectOptions,
  totalCount,
  onFilterChange,
  onProjectFilterChange,
  onSearchChange,
  onDelete,
  onSelect,
  selectLabel = '选择',
  selectedItemId,
  emptyMessage = '暂无资产',
}) => {
  const { showAlert } = useAlert();

  const handleDelete = useCallback((item: AssetLibraryItem) => {
    showAlert(`确定从资产库删除"${item.name}"吗？`, {
      type: 'warning',
      showCancel: true,
      onConfirm: () => onDelete(item.id),
    });
  }, [showAlert, onDelete]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索资产名称..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--bg-deep)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-secondary)]"
          />
        </div>
        
        <div className="min-w-[180px]">
          <select
            value={projectFilter}
            onChange={(e) => onProjectFilterChange(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-deep)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-secondary)]"
          >
            <option value="all">全部项目</option>
            {projectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex gap-2">
          {FILTER_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onFilterChange(type)}
              className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border rounded transition-colors ${
                filter === type
                  ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)]'
                  : 'bg-transparent text-[var(--text-tertiary)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
              }`}
            >
              {type === 'all' ? '全部' : getAssetTypeLabel(type)}
            </button>
          ))}
        </div>
        
        <div className="ml-auto text-[10px] text-[var(--text-muted)] font-mono self-center">
          {items.length} / {totalCount} assets
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-[var(--text-tertiary)] animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-[var(--border-primary)] rounded-xl p-10 text-center text-[var(--text-muted)] text-sm">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const previewUrl = getAssetPreviewUrl(item);
            const isSelected = selectedItemId === item.id;
            
            return (
              <div
                key={item.id}
                className={`bg-[var(--bg-deep)] border rounded-xl overflow-hidden transition-colors ${
                  isSelected
                    ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
                    : 'border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
                }`}
              >
                <div className="aspect-video bg-[var(--bg-elevated)] relative">
                  <AssetLibraryImage
                    imageUrl={previewUrl}
                    alt={item.name}
                    type={item.type}
                  />
                </div>
                
                <div className="p-4 space-y-3">
                  <div>
                    <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest mt-1">
                      {getAssetTypeLabel(item.type)}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1 line-clamp-1">
                      {(item.projectName && item.projectName.trim()) || '未知项目'}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {onSelect && (
                      <button
                        onClick={() => onSelect(item)}
                        className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                          isSelected
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)]'
                        }`}
                      >
                        {selectLabel}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-2 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--error-text)] hover:border-[var(--error-border)] rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
