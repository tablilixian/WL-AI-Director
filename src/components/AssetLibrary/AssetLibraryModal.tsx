import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { AssetLibraryItem } from '../../../types';
import { useAssetLibrary, AssetFilter } from './useAssetLibrary';
import { AssetLibraryBrowser } from './AssetLibraryBrowser';

interface AssetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFilter?: AssetFilter;
  onImport: (item: AssetLibraryItem) => void;
  onReplace?: (item: AssetLibraryItem, targetCharId: string) => void;
  replaceTargetCharId?: string | null;
  emptyMessage?: string;
}

export const AssetLibraryModal: React.FC<AssetLibraryModalProps> = ({
  isOpen,
  onClose,
  initialFilter = 'all',
  onImport,
  onReplace,
  replaceTargetCharId,
  emptyMessage,
}) => {
  const {
    filteredItems,
    isLoading,
    filter,
    projectFilter,
    searchQuery,
    projectOptions,
    itemCount,
    setFilter,
    setProjectFilter,
    setSearchQuery,
    deleteItem,
  } = useAssetLibrary({ autoLoad: isOpen });

  const handleFilterChange = useCallback((newFilter: AssetFilter) => {
    setFilter(newFilter);
  }, [setFilter]);

  const handleDelete = useCallback(async (itemId: string) => {
    await deleteItem(itemId);
  }, [deleteItem]);

  const handleSelect = useCallback((item: AssetLibraryItem) => {
    if (replaceTargetCharId && onReplace) {
      onReplace(item, replaceTargetCharId);
    } else {
      onImport(item);
    }
  }, [replaceTargetCharId, onReplace, onImport]);

  if (!isOpen) return null;

  const handleClose = () => {
    setFilter('all');
    setProjectFilter('all');
    setSearchQuery('');
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-50 bg-[var(--bg-base)]/95 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="bg-[var(--bg-surface)] border border-[var(--border-primary)] w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-16 px-8 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0 bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <div>
              <div className="text-sm font-bold text-[var(--text-primary)]">资产库</div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <AssetLibraryBrowser
            items={filteredItems}
            isLoading={isLoading}
            filter={filter}
            projectFilter={projectFilter}
            searchQuery={searchQuery}
            projectOptions={projectOptions}
            totalCount={itemCount}
            onFilterChange={handleFilterChange}
            onProjectFilterChange={setProjectFilter}
            onSearchChange={setSearchQuery}
            onDelete={handleDelete}
            onSelect={handleSelect}
            selectLabel={replaceTargetCharId ? '替换当前图片' : '导入到当前项目'}
            emptyMessage={emptyMessage || '暂无资产。可在角色或场景卡片中选择"加入资产库"。'}
          />
        </div>
      </div>
    </div>
  );
};
