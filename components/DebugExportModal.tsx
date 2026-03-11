import React, { useState } from 'react';
import { Download, Loader2, Database, X } from 'lucide-react';

interface DebugExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DebugExportModal: React.FC<DebugExportModalProps> = ({ isOpen, onClose }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);

  React.useEffect(() => {
    console.log('[DebugExportModal] 📱 模态框状态变化:', isOpen ? '打开' : '关闭');
  }, [isOpen]);

  const handleExport = async () => {
    if (isExporting) return;

    console.log('[DebugExportModal] 🚀 开始导出数据库');
    setIsExporting(true);
    setExportResult(null);

    try {
      console.log('[DebugExportModal] 📦 正在打开 WLDB 数据库...');
      const db = await openWLDB();
      console.log('[DebugExportModal] ✅ 数据库打开成功');
      
      const exportData: any = {
        projects: [],
        assetLibrary: [],
        images: [],
        videos: [],
        projectStages: []
      };

      const stores = ['projects', 'assetLibrary', 'images', 'videos', 'projectStages'];
      console.log('[DebugExportModal] 📋 准备导出的数据表:', stores);

      for (const storeName of stores) {
        console.log(`[DebugExportModal] 🔍 检查数据表: ${storeName}`);
        
        if (!db.objectStoreNames.contains(storeName)) {
          console.log(`[DebugExportModal] ⚠️  数据表 ${storeName} 不存在，跳过`);
          exportData[storeName] = [];
          continue;
        }

        console.log(`[DebugExportModal] 📥 正在读取数据表: ${storeName}`);
        const data = await getAllFromStore(db, storeName);
        console.log(`[DebugExportModal] ✅ 数据表 ${storeName} 读取完成，共 ${data.length} 条记录`);
        exportData[storeName] = data;
      }

      console.log('[DebugExportModal] 🔒 关闭数据库连接');
      db.close();

      console.log('[DebugExportModal] 📊 生成元数据');
      const metadata = {
        exportDate: new Date().toISOString(),
        databaseName: 'WLDB',
        version: 6,
        summary: {
          projects: exportData.projects.length,
          assetLibrary: exportData.assetLibrary.length,
          images: exportData.images.length,
          videos: exportData.videos.length,
          projectStages: exportData.projectStages.length
        }
      };
      console.log('[DebugExportModal] 📈 数据统计:', metadata.summary);

      exportData.metadata = metadata;

      console.log('[DebugExportModal] 🔄 将数据转换为 JSON 字符串');
      const json = JSON.stringify(exportData, null, 2);
      console.log(`[DebugExportModal] 📝 JSON 字符串长度: ${json.length} 字符`);

      console.log('[DebugExportModal] 📦 创建 Blob 对象');
      const blob = new Blob([json], { type: 'application/json' });
      console.log(`[DebugExportModal] 📦 Blob 大小: ${blob.size} 字节`);

      console.log('[DebugExportModal] 🔗 创建对象 URL');
      const url = URL.createObjectURL(blob);
      console.log('[DebugExportModal] 🔗 对象 URL:', url);

      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `WLDB-debug-export-${timestamp}.json`;
      console.log('[DebugExportModal] 📁 文件名:', fileName);

      console.log('[DebugExportModal] 🖱️  创建下载链接并触发下载');
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[DebugExportModal] ✅ 导出完成！');
      setExportResult(metadata);
    } catch (error) {
      console.error('[DebugExportModal] ❌ 导出失败:', error);
      console.error('[DebugExportModal] ❌ 错误详情:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined
      });
      setExportResult({ error: error instanceof Error ? error.message : '未知错误' });
    } finally {
      console.log('[DebugExportModal] 🏁 导出流程结束');
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Database className="w-5 h-5" />
              数据库调试工具
            </h2>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                此工具用于调试目的，导出本地 IndexedDB (WLDB) 的所有数据到 JSON 文件。
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                包含的数据表：projects, assetLibrary, images, videos, projectStages
              </p>
            </div>

            {exportResult && (
              <div className={`p-4 rounded-lg border ${
                exportResult.error 
                  ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
                  : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
              }`}>
                <h3 className={`font-bold mb-2 ${
                  exportResult.error 
                    ? 'text-red-700 dark:text-red-400' 
                    : 'text-green-700 dark:text-green-400'
                }`}>
                  {exportResult.error ? '导出失败' : '导出成功'}
                </h3>
                {exportResult.error ? (
                  <p className="text-sm text-red-600 dark:text-red-300">{exportResult.error}</p>
                ) : (
                  <div className="text-sm space-y-1">
                    <p>导出时间: {exportResult.exportDate}</p>
                    <p>数据库: {exportResult.databaseName} v{exportResult.version}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>项目: {exportResult.summary.projects}</div>
                      <div>资产: {exportResult.summary.assetLibrary}</div>
                      <div>图片: {exportResult.summary.images}</div>
                      <div>视频: {exportResult.summary.videos}</div>
                      <div>阶段: {exportResult.summary.projectStages}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--accent-bg)] text-[var(--accent-text)] rounded-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  导出数据库
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const openWLDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('WLDB', 6);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllFromStore = async (db: IDBDatabase, storeName: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export default DebugExportModal;
