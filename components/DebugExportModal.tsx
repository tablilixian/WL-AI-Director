import React, { useState } from 'react';
import { Download, Loader2, Database, X, FileArchive, FileJson, Trash2, AlertTriangle } from 'lucide-react';
import { openDB } from '../services/storageService';

interface DebugExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DebugExportModal: React.FC<DebugExportModalProps> = ({ isOpen, onClose }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);
  const [exportMode, setExportMode] = useState<'json' | 'zip'>('json');
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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

      if (exportMode === 'json') {
        await exportAsJSON(exportData, metadata);
      } else {
        await exportAsZIP(exportData, metadata);
      }

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

  const exportAsJSON = async (exportData: any, metadata: any) => {
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
  };

  const exportAsZIP = async (exportData: any, metadata: any) => {
    console.log('[DebugExportModal] 📦 开始 ZIP 导出模式');
    
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    console.log('[DebugExportModal] 📝 添加元数据 JSON');
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    console.log('[DebugExportModal] 📝 添加项目数据 JSON');
    zip.file('projects.json', JSON.stringify(exportData.projects, null, 2));
    zip.file('assetLibrary.json', JSON.stringify(exportData.assetLibrary, null, 2));
    zip.file('projectStages.json', JSON.stringify(exportData.projectStages, null, 2));

    console.log('[DebugExportModal] 🖼️  开始添加图片文件');
    for (let i = 0; i < exportData.images.length; i++) {
      const image = exportData.images[i];
      if (image.blob) {
        const extension = image.type?.split('/')[1] || 'png';
        const fileName = `images/${image.id}.${extension}`;
        console.log(`[DebugExportModal] 🖼️  添加图片 ${i + 1}/${exportData.images.length}: ${fileName}`);
        zip.file(fileName, image.blob);
      }
    }

    console.log('[DebugExportModal] 🎬 开始添加视频文件');
    for (let i = 0; i < exportData.videos.length; i++) {
      const video = exportData.videos[i];
      if (video.blob) {
        const extension = video.type?.split('/')[1] || 'mp4';
        const fileName = `videos/${video.id}.${extension}`;
        console.log(`[DebugExportModal] 🎬 添加视频 ${i + 1}/${exportData.videos.length}: ${fileName}`);
        zip.file(fileName, video.blob);
      }
    }

    console.log('[DebugExportModal] 🗜️  生成 ZIP 文件');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    console.log(`[DebugExportModal] 📦 ZIP 大小: ${zipBlob.size} 字节`);

    const url = URL.createObjectURL(zipBlob);
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `WLDB-debug-export-${timestamp}.zip`;
    console.log('[DebugExportModal] 📁 文件名:', fileName);

    console.log('[DebugExportModal] 🖱️  创建下载链接并触发下载');
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearDatabase = async () => {
    if (isClearing) return;

    console.log('[DebugExportModal] 🗑️  开始清空数据库');
    setIsClearing(true);

    try {
      console.log('[DebugExportModal] 📦 正在打开 WLDB 数据库...');
      const db = await openWLDB();
      console.log('[DebugExportModal] ✅ 数据库打开成功');

      const allStoreNames = Array.from(db.objectStoreNames);
      console.log('[DebugExportModal] 📋 数据库中的所有数据表:', allStoreNames);

      const tablesToClear = allStoreNames.filter(storeName => {
        const shouldClear = ['projects', 'assetLibrary', 'images', 'videos', 'projectStages'].includes(storeName);
        console.log(`[DebugExportModal] 🔍 数据表 ${storeName}: ${shouldClear ? '✅ 将清空' : '⏭️  跳过'}`);
        return shouldClear;
      });

      console.log('[DebugExportModal] 📋 准备清空的数据表:', tablesToClear);

      const results: any = {};

      for (const tableName of tablesToClear) {
        console.log(`[DebugExportModal] 🔍 检查数据表: ${tableName}`);
        
        if (!db.objectStoreNames.contains(tableName)) {
          console.log(`[DebugExportModal] ⚠️  数据表 ${tableName} 不存在，跳过`);
          results[tableName] = { status: 'skipped', count: 0 };
          continue;
        }

        console.log(`[DebugExportModal] 📥 正在清空数据表: ${tableName}`);
        
        const tx = db.transaction(tableName, 'readwrite');
        const store = tx.objectStore(tableName);
        
        const count = await new Promise<number>((resolve, reject) => {
          const request = store.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        await new Promise<void>((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => {
            console.log(`[DebugExportModal] ✅ 数据表 ${tableName} 已清空，删除了 ${count} 条记录`);
            resolve();
          };
          request.onerror = () => reject(request.error);
        });

        results[tableName] = { status: 'cleared', count };
      }

      db.close();
      console.log('[DebugExportModal] 🔒 关闭数据库连接');

      console.log('[DebugExportModal] ✅ 数据库清空完成！');
      console.log('[DebugExportModal] 📊 清空统计:', results);

      setExportResult({
        type: 'clear',
        message: '数据库清空成功',
        results
      });

      setShowClearConfirm(false);
    } catch (error) {
      console.error('[DebugExportModal] ❌ 清空失败:', error);
      console.error('[DebugExportModal] ❌ 错误详情:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined
      });
      setExportResult({
        type: 'clear',
        error: error instanceof Error ? error.message : '未知错误'
      });
    } finally {
      console.log('[DebugExportModal] 🏁 清空流程结束');
      setIsClearing(false);
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
                此工具用于调试目的，导出本地 IndexedDB (WLDB) 的所有数据。
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">
                包含的数据表：projects, assetLibrary, images, videos, projectStages
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setExportMode('json')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    exportMode === 'json'
                      ? 'bg-[var(--accent-bg)] text-[var(--accent-text)] border-[var(--accent-bg)]'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
                  }`}
                >
                  <FileJson className="w-4 h-4" />
                  JSON 格式
                </button>
                <button
                  onClick={() => setExportMode('zip')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    exportMode === 'zip'
                      ? 'bg-[var(--accent-bg)] text-[var(--accent-text)] border-[var(--accent-bg)]'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
                  }`}
                >
                  <FileArchive className="w-4 h-4" />
                  ZIP 格式
                </button>
              </div>
              
              {exportMode === 'zip' && (
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  ZIP 格式会导出所有图片和视频文件，文件较大但更完整
                </p>
              )}
            </div>

            {exportResult && (
              <div className={`p-4 rounded-lg border ${
                exportResult.error 
                  ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
                  : exportResult.type === 'clear'
                    ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                    : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
              }`}>
                <h3 className={`font-bold mb-2 ${
                  exportResult.error 
                    ? 'text-red-700 dark:text-red-400' 
                    : exportResult.type === 'clear'
                      ? 'text-yellow-700 dark:text-yellow-400'
                      : 'text-green-700 dark:text-green-400'
                }`}>
                  {exportResult.error ? '操作失败' : exportResult.type === 'clear' ? '数据库清空' : '导出成功'}
                </h3>
                {exportResult.error ? (
                  <p className="text-sm text-red-600 dark:text-red-300">{exportResult.error}</p>
                ) : exportResult.type === 'clear' ? (
                  <div className="text-sm space-y-1">
                    <p>{exportResult.message}</p>
                    <div className="mt-2">
                      {Object.entries(exportResult.results).map(([table, result]: [string, any]) => (
                        <div key={table} className="flex justify-between text-xs">
                          <span>{table}:</span>
                          <span>{result.status === 'cleared' ? `已删除 ${result.count} 条` : '跳过'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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

            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={isExporting || isClearing}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[var(--accent-bg)] text-[var(--accent-text)] rounded-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    导出中...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    {exportMode === 'json' ? '导出 JSON 数据' : '导出 ZIP 文件'}
                  </>
                )}
              </button>

              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={isExporting || isClearing}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isClearing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    清空中...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    清空数据库
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-[var(--bg-base)] border border-[var(--border-primary)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">确认清空数据库</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  此操作将删除所有项目数据，包括图片和视频文件
                </p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800 mb-4">
              <p className="text-sm text-red-700 dark:text-red-400 font-bold mb-2">
                ⚠️ 警告：此操作不可恢复！
              </p>
              <p className="text-xs text-red-600 dark:text-red-300">
                将清空以下数据表：
              </p>
              <ul className="text-xs text-red-600 dark:text-red-300 mt-1 ml-4 list-disc">
                <li>projects（项目）</li>
                <li>assetLibrary（资产库）</li>
                <li>images（图片）</li>
                <li>videos（视频）</li>
                <li>projectStages（项目阶段）</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg font-bold hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                onClick={handleClearDatabase}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isClearing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                    清空中...
                  </>
                ) : (
                  '确认清空'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const openWLDB = openDB;

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
