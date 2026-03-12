/**
 * 模型列表组件
 * 显示特定类型的模型列表，支持选择激活模型
 */

import React, { useState, useEffect } from 'react';
import { Plus, Info, CheckCircle, ExternalLink, Building, Key, Loader2, ChevronDown, ChevronRight, AlertCircle, Trash2, X } from 'lucide-react';
import { 
  ModelType, 
  ModelDefinition, 
  ModelProvider,
} from '../../types/model';
import {
  getModels,
  updateModel,
  registerModel,
  removeModel,
  getActiveModelsConfig,
  setActiveModel,
  getProviderById,
  getProviders,
  addProvider,
  removeProvider,
  updateProvider,
  getApiKeyForModel,
  getApiKeySource,
  validateApiKey,
} from '../../services/modelRegistry';
import { verifyApiKey } from '../../services/modelService';
import { useAlert } from '../GlobalAlert';
import ModelCard from './ModelCard';
import AddModelForm from './AddModelForm';

interface ModelListProps {
  type: ModelType;
  onRefresh: () => void;
}

const typeDescriptions: Record<ModelType, string> = {
  chat: '用于剧本解析、分镜生成、提示词优化等文本生成任务',
  image: '用于角色定妆、场景生成、关键帧生成等图片生成任务',
  video: '用于视频片段生成任务',
};

const ModelList: React.FC<ModelListProps> = ({ type, onRefresh }) => {
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [providerApiKey, setProviderApiKey] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState('');
  const [newProviderApiKey, setNewProviderApiKey] = useState('');
  const { showAlert } = useAlert();

  useEffect(() => {
    loadModels();
    loadProviders();
  }, [type]);

  const loadModels = () => {
    const allModels = getModels(type);
    setModels(allModels);
    // 获取当前激活的模型
    const activeConfig = getActiveModelsConfig();
    setActiveModelId(activeConfig[type]);
  };

  const loadProviders = () => {
    const allProviders = getProviders();
    setProviders(allProviders);
    if (allProviders.length > 0 && !selectedProvider) {
      setSelectedProvider(allProviders[0].id);
      loadProviderApiKey(allProviders[0].id);
    }
  };

  const loadProviderApiKey = (providerId: string) => {
    const provider = getProviderById(providerId);
    setProviderApiKey(provider?.apiKey || '');
    setVerifyStatus('idle');
    setVerifyMessage('');
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    loadProviderApiKey(providerId);
  };

  const handleProviderApiKeyChange = (value: string) => {
    setProviderApiKey(value);
  };

  const handleProviderApiKeySave = () => {
    if (selectedProvider) {
      const updates: Partial<ModelProvider> = { apiKey: providerApiKey.trim() || undefined };
      if (updateProvider(selectedProvider, updates)) {
        showAlert('厂商 API Key 已保存', { type: 'success' });
        onRefresh();
      } else {
        showAlert('保存厂商 API Key 失败', { type: 'error' });
      }
    }
  };

  const handleVerifyApiKey = async () => {
    if (!selectedProvider || !providerApiKey.trim()) {
      showAlert('请输入 API Key 后再验证', { type: 'warning' });
      return;
    }

    setIsVerifying(true);
    setVerifyStatus('idle');
    setVerifyMessage('');

    try {
      const provider = getProviderById(selectedProvider);
      const baseUrl = provider?.baseUrl || '';
      const result = await verifyApiKey(providerApiKey, baseUrl);
      if (result.success) {
        setVerifyStatus('success');
        setVerifyMessage('API Key 验证成功！');
        showAlert('API Key 验证成功', { type: 'success' });
      } else {
        setVerifyStatus('error');
        setVerifyMessage(`验证失败: ${result.message}`);
        showAlert(`API Key 验证失败: ${result.message}`, { type: 'error' });
      }
    } catch (error) {
      setVerifyStatus('error');
      setVerifyMessage(`验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
      showAlert(`API Key 验证失败: ${error instanceof Error ? error.message : '未知错误'}`, { type: 'error' });
    } finally {
      setIsVerifying(false);
    }
  };

  const toggleProviderExpanded = (providerId: string) => {
    setExpandedProviders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(providerId)) {
        newSet.delete(providerId);
      } else {
        newSet.add(providerId);
      }
      return newSet;
    });
  };

  const isProviderExpanded = (providerId: string) => {
    return expandedProviders.has(providerId);
  };

  const groupModelsByProvider = () => {
    const grouped: Record<string, ModelDefinition[]> = {};
    models.forEach(model => {
      if (!grouped[model.providerId]) {
        grouped[model.providerId] = [];
      }
      grouped[model.providerId].push(model);
    });
    return grouped;
  };

  const getProviderName = (providerId: string) => {
    const provider = getProviderById(providerId);
    return provider?.name || providerId;
  };

  const handleSetActiveModel = (modelId: string) => {
    if (setActiveModel(type, modelId)) {
      setActiveModelId(modelId);
      const model = models.find(m => m.id === modelId);
      const provider = model ? getProviderById(model.providerId) : null;
      showAlert(
        `已切换到 ${model?.name}${provider ? ` (${provider.name})` : ''}`, 
        { type: 'success' }
      );
      onRefresh();
    } else {
      showAlert('设置激活模型失败，请确保模型已启用', { type: 'error' });
    }
  };

  const handleUpdateModel = (modelId: string, updates: Partial<ModelDefinition>) => {
    if (updateModel(modelId, updates)) {
      loadModels();
      onRefresh();
    }
  };

  const handleDeleteModel = (modelId: string) => {
    showAlert('确定要删除这个模型吗？', {
      type: 'warning',
      showCancel: true,
      onConfirm: () => {
        if (removeModel(modelId)) {
          loadModels();
          onRefresh();
          showAlert('模型已删除', { type: 'success' });
        }
      }
    });
  };

  const handleAddModel = (model: Omit<ModelDefinition, 'isBuiltIn'> & { id?: string }) => {
    try {
      registerModel(model);
      setIsAddingModel(false);
      loadModels();
      onRefresh();
      showAlert('模型添加成功', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '添加模型失败', { type: 'error' });
    }
  };

  const handleToggleExpand = (modelId: string) => {
    setExpandedModelId(expandedModelId === modelId ? null : modelId);
  };

  const handleAddProvider = () => {
    if (!newProviderName.trim() || !newProviderBaseUrl.trim()) {
      showAlert('请填写厂商名称和 API 基础 URL', { type: 'warning' });
      return;
    }
    try {
      const sanitizedUrl = newProviderBaseUrl.trim().replace(/\/+$/, '');
      const newProvider = addProvider({
        name: newProviderName.trim(),
        baseUrl: sanitizedUrl,
        apiKey: newProviderApiKey.trim() || undefined,
        isDefault: false,
      });
      setNewProviderName('');
      setNewProviderBaseUrl('');
      setNewProviderApiKey('');
      setIsAddingProvider(false);
      loadProviders();
      setSelectedProvider(newProvider.id);
      loadProviderApiKey(newProvider.id);
      showAlert(`厂商 "${newProvider.name}" 已添加`, { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '添加厂商失败', { type: 'error' });
    }
  };

  const handleRemoveProvider = (providerId: string) => {
    const provider = getProviderById(providerId);
    if (!provider) return;
    if (provider.isBuiltIn) {
      showAlert('不能删除内置厂商', { type: 'warning' });
      return;
    }
    const modelCount = models.filter(m => m.providerId === providerId).length;
    showAlert(
      modelCount > 0
        ? `确定要删除厂商 "${provider.name}" 吗？该厂商下的 ${modelCount} 个模型也将被删除。`
        : `确定要删除厂商 "${provider.name}" 吗？`,
      {
        type: 'warning',
        showCancel: true,
        onConfirm: () => {
          if (removeProvider(providerId)) {
            loadProviders();
            loadModels();
            if (selectedProvider === providerId) {
              const fallback = getProviders()[0];
              if (fallback) {
                setSelectedProvider(fallback.id);
                loadProviderApiKey(fallback.id);
              }
            }
            onRefresh();
            showAlert(`厂商 "${provider.name}" 已删除`, { type: 'success' });
          } else {
            showAlert('删除厂商失败', { type: 'error' });
          }
        }
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* 当前激活模型信息 */}
      <div className="bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle className="w-4 h-4 text-[var(--accent-text)]" />
          <span className="text-xs font-bold text-[var(--accent-text-hover)]">当前使用</span>
        </div>
        {(() => {
          const activeModel = models.find(m => m.id === activeModelId);
          const provider = activeModel ? getProviderById(activeModel.providerId) : null;
          return (
            <p className="text-[11px] text-[var(--text-secondary)]">
              <span className="font-medium">{activeModel?.name || '未选择'}</span>
              {provider && (
                <span className="text-[var(--text-tertiary)] ml-2">
                  → {provider.name} ({provider.baseUrl})
                </span>
              )}
            </p>
          );
        })()}
      </div>

      {/* 厂商管理区域 */}
      <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-primary)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">厂商管理</h3>
          </div>
          <button
            onClick={() => setIsAddingProvider(!isAddingProvider)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--accent-text)] hover:text-[var(--accent-text-hover)] transition-colors rounded hover:bg-[var(--accent-bg)]"
          >
            {isAddingProvider ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {isAddingProvider ? '取消' : '添加厂商'}
          </button>
        </div>

        {/* 添加新厂商表单 */}
        {isAddingProvider && (
          <div className="mb-3 p-3 bg-[var(--bg-hover)] rounded-lg border border-[var(--border-secondary)] space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">厂商名称 *</label>
                <input
                  type="text"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  placeholder="如：OpenAI Official"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">API 基础 URL *</label>
                <input
                  type="text"
                  value={newProviderBaseUrl}
                  onChange={(e) => setNewProviderBaseUrl(e.target.value)}
                  placeholder="如：https://api.openai.com"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">厂商 API Key（可选）</label>
              <input
                type="password"
                value={newProviderApiKey}
                onChange={(e) => setNewProviderApiKey(e.target.value)}
                placeholder="留空则使用全局 API Key"
                className="w-full bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono"
              />
            </div>
            <button
              onClick={handleAddProvider}
              className="w-full py-2 bg-[var(--accent)] text-[var(--text-primary)] text-xs font-bold rounded hover:bg-[var(--accent-hover)] transition-colors"
            >
              添加厂商
            </button>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="md:col-span-1">
            <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">
              选择厂商
            </label>
            <div className="flex gap-2">
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="flex-1 bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.isBuiltIn ? '🏢' : '🔧'} {provider.name}
                  </option>
                ))}
              </select>
              {selectedProvider && !getProviderById(selectedProvider)?.isBuiltIn && (
                <button
                  onClick={() => handleRemoveProvider(selectedProvider)}
                  className="px-2 py-2 text-[var(--text-tertiary)] hover:text-[var(--error-text)] transition-colors"
                  title="删除此厂商"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          
          <div className="md:col-span-2">
            <label className="text-[10px] text-[var(--text-tertiary)] block mb-1">
              厂商 API Key（中等优先级）
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={providerApiKey}
                onChange={(e) => handleProviderApiKeyChange(e.target.value)}
                placeholder="输入厂商 API Key"
                autoComplete="off"
                className="flex-1 bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded px-3 py-2 text-xs text-[var(--text-primary)] font-mono"
              />
              <button
                onClick={handleProviderApiKeySave}
                className="px-3 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-bold rounded hover:bg-[var(--btn-primary-hover)] transition-colors whitespace-nowrap"
              >
                保存
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleVerifyApiKey}
            disabled={isVerifying || !providerApiKey.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-[var(--accent)] text-[var(--text-primary)] text-xs font-bold rounded hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Key className="w-3 h-3" />
            )}
            验证 API Key
          </button>
          
          {verifyStatus !== 'idle' && (
            <div className="flex items-center gap-1 text-xs">
              {verifyStatus === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 text-[var(--success)]" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-[var(--error-text)]" />
              )}
              <span className={verifyStatus === 'success' ? 'text-[var(--success)]' : 'text-[var(--error-text)]'}>
                {verifyMessage}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* API Key 配置说明 */}
      <div className="bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded-lg p-3">
        <div className="flex items-start gap-2 mb-2">
          <ExternalLink className="w-4 h-4 text-[var(--accent-text)] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)] mb-1">API Key 配置说明</h4>
            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
              系统支持三级 API Key 配置，优先级从高到低：
            </p>
          </div>
        </div>
        <div className="space-y-1.5 ml-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full flex-shrink-0"></span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">模型专属 API Key</span>（最高优先级）- 为每个模型单独配置
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--text-tertiary)] rounded-full flex-shrink-0"></span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">厂商 API Key</span>（中等优先级）- 为同一厂商的所有模型配置
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--text-tertiary)] rounded-full flex-shrink-0"></span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">全局 API Key</span>（最低优先级）- 所有模型共享
            </span>
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-2 ml-6">
          💡 建议：为高频使用的模型配置专属 API Key，其他使用厂商或全局配置
        </p>
      </div>

      {/* 按厂商分组的模型列表 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-[var(--text-tertiary)]" />
          <h4 className="text-xs font-bold text-[var(--text-primary)]">模型列表（按厂商分组）</h4>
        </div>
        
        {Object.entries(groupModelsByProvider()).map(([providerId, providerModels]) => {
          const providerName = getProviderName(providerId);
          const expanded = isProviderExpanded(providerId);
          
          return (
            <div key={providerId} className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
              {/* 厂商分组头部 */}
              <div 
                className="bg-[var(--bg-elevated)]/30 p-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-elevated)]/50 transition-colors"
                onClick={() => toggleProviderExpanded(providerId)}
              >
                <div className="flex items-center gap-2">
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                  )}
                  <Building className="w-4 h-4 text-[var(--accent-text)]" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">{providerName}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">({providerModels.length} 个模型)</span>
                </div>
              </div>
              
              {/* 厂商模型列表 */}
              {expanded && (
                <div className="divide-y divide-[var(--border-primary)]">
                  {providerModels.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isExpanded={expandedModelId === model.id}
                      isActive={activeModelId === model.id}
                      onToggleExpand={() => handleToggleExpand(model.id)}
                      onUpdate={(updates) => handleUpdateModel(model.id, updates)}
                      onDelete={() => handleDeleteModel(model.id)}
                      onSetActive={() => handleSetActiveModel(model.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 添加模型 */}
      {isAddingModel ? (
        <AddModelForm
          type={type}
          onSave={handleAddModel}
          onCancel={() => setIsAddingModel(false)}
        />
      ) : (
        <button
          onClick={() => setIsAddingModel(true)}
          className="w-full py-3 border border-dashed border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-secondary)] transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          添加自定义模型
        </button>
      )}
    </div>
  );
};

export default ModelList;
