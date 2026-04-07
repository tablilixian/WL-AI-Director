import React, { useState, useCallback } from 'react';
import { X, Archive } from 'lucide-react';
import { AssetLibraryItem, ProjectState } from '../../../types';
import { useAssetLibrary, AssetFilter } from './useAssetLibrary';
import { AssetLibraryBrowser } from './AssetLibraryBrowser';

interface AssetLibraryPageProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectState[];
  onSelectProjectAndImport: (projectId: string, item: AssetLibraryItem) => Promise<void>;
}

export const AssetLibraryPage: React.FC<AssetLibraryPageProps> = ({
  isOpen,
  onClose,
  projects,
  onSelectProjectAndImport,
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
    refresh,
  } = useAssetLibrary({ autoLoad: isOpen });

  const [selectedItem, setSelectedItem] = useState<AssetLibraryItem | null>(null);

  const handleDelete = useCallback(async (itemId: string) => {
    await deleteItem(itemId);
  }, [deleteItem]);

  const handleSelectItem = useCallback((item: AssetLibraryItem) => {
    setSelectedItem(item);
  }, []);

  const handleSelectProject = useCallback(async (projectId: string) => {
    if (!selectedItem) return;
    try {
      await onSelectProjectAndImport(projectId, selectedItem);
      setSelectedItem(null);
    } catch {
      // error handled by parent
    }
  }, [selectedItem, onSelectProjectAndImport]);

  const handleClose = () => {
    setFilter('all');
    setProjectFilter('all');
    setSearchQuery('');
    setSelectedItem(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)]/70 p-6"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-end justify-between border-b border-[var(--border-subtle)] pb-6 mb-6">
          <div>
            <h2 className="text-lg text-[var(--text-primary)] flex items-center gap-2">
              <Archive className="w-4 h-4 text-[var(--accent-text)]" />
              资产库
              <span className="text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">Asset Library</span>
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              在项目里将角色与场景加入资产库，跨项目复用
            </p>
          </div>
        </div>

        <AssetLibraryBrowser
          items={filteredItems}
          isLoading={isLoading}
          filter={filter}
          projectFilter={projectFilter}
          searchQuery={searchQuery}
          projectOptions={projectOptions}
          totalCount={itemCount}
          onFilterChange={setFilter}
          onProjectFilterChange={setProjectFilter}
          onSearchChange={setSearchQuery}
          onDelete={handleDelete}
          onSelect={handleSelectItem}
          selectLabel="选择项目使用"
          selectedItemId={selectedItem?.id}
          emptyMessage={'暂无资产。可在项目的"角色与场景"中加入资产库。'}
        />

        {selectedItem && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="relative w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] p-6 md:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute right-4 top-4 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="space-y-4">
                <div className="text-[var(--text-primary)] text-sm font-bold tracking-widest uppercase">
                  选择项目使用
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
                  将资产"{selectedItem.name}"导入到以下项目
                </div>
                {projects.length === 0 ? (
                  <div className="text-[var(--text-muted)] text-sm">暂无项目可用</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {projects.map((proj) => (
                      <button
                        key={proj.id}
                        onClick={() => handleSelectProject(proj.id)}
                        className="p-4 text-left border border-[var(--border-primary)] hover:border-[var(--border-secondary)] bg-[var(--bg-deep)] hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <div className="text-sm text-[var(--text-primary)] font-bold line-clamp-1">{proj.title}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">
                          {new Date(proj.lastModified).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
