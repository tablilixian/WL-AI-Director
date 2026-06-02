/**
 * 厂商 API Key 配置组件
 * 展示所有厂商的 API Key 配置入口
 */

import React, { useState } from 'react';
import { Key, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { getProviders, updateProvider, getProviderById } from '../../services/modelRegistry';
import { verifyApiKey } from '../../services/modelService';

interface GlobalSettingsProps {
  onRefresh: () => void;
}

const GlobalSettings: React.FC<GlobalSettingsProps> = ({ onRefresh }) => {
  const providers = getProviders();

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {providers.map((provider) => (
          <ProviderKeyCard key={provider.id} provider={provider} onRefresh={onRefresh} />
        ))}
      </div>

      <div className="p-4 bg-[var(--bg-elevated)]/50 rounded-lg border border-[var(--border-primary)]">
        <h4 className="text-xs font-bold text-[var(--text-tertiary)] mb-2">配置说明</h4>
        <ul className="text-[10px] text-[var(--text-muted)] space-y-1 list-disc list-inside">
          <li>每个厂商可以独立配置 API Key</li>
          <li>添加自定义厂商时，在该厂商面板中配置 Key</li>
          <li>所有配置仅保存在本地浏览器，不会上传到服务器</li>
        </ul>
      </div>
    </div>
  );
};

interface ProviderKeyCardProps {
  provider: { id: string; name: string; baseUrl: string; apiKey?: string };
  onRefresh: () => void;
}

const ProviderKeyCard: React.FC<ProviderKeyCardProps> = ({ provider, onRefresh }) => {
  const [apiKey, setApiKey] = useState(provider.apiKey || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'success' | 'error'>(
    provider.apiKey ? 'success' : 'idle'
  );
  const [verifyMessage, setVerifyMessage] = useState(provider.apiKey ? 'API Key 已配置' : '');

  const handleVerifyAndSave = async () => {
    if (!apiKey.trim()) {
      setVerifyStatus('error');
      setVerifyMessage('请输入 API Key');
      return;
    }

    setIsVerifying(true);
    setVerifyStatus('idle');
    setVerifyMessage('');

    try {
      const fullProvider = getProviderById(provider.id);
      const baseUrl = fullProvider?.baseUrl;
      const result = await verifyApiKey(apiKey.trim(), baseUrl);

      if (result.success) {
        setVerifyStatus('success');
        setVerifyMessage('验证成功！API Key 已保存');
        updateProvider(provider.id, { apiKey: apiKey.trim() });
        onRefresh();
      } else {
        setVerifyStatus('error');
        setVerifyMessage(result.message);
      }
    } catch (error: any) {
      setVerifyStatus('error');
      setVerifyMessage(error.message || '验证过程出错');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearKey = () => {
    setApiKey('');
    setVerifyStatus('idle');
    setVerifyMessage('');
    updateProvider(provider.id, { apiKey: '' });
    onRefresh();
  };

  const isIdle = verifyStatus === 'idle' && !verifyMessage;

  return (
    <div className="bg-[var(--bg-elevated)]/30 border border-[var(--border-primary)] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Key className="w-4 h-4 text-[var(--accent-text)]" />
        <span className="text-sm font-bold text-[var(--text-primary)]">{provider.name}</span>
        <span className="text-[10px] text-[var(--text-muted)] font-mono">({provider.baseUrl})</span>
      </div>

      <div className="space-y-3">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setVerifyStatus('idle');
            setVerifyMessage('');
          }}
          placeholder={`输入 ${provider.name} API Key...`}
          className="w-full bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] px-4 py-2.5 text-sm rounded-lg focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-hover)] transition-all font-mono placeholder:text-[var(--text-muted)]"
          disabled={isVerifying}
        />

        {verifyMessage && (
          <div className={`flex items-center gap-2 text-xs ${
            verifyStatus === 'success' ? 'text-[var(--success-text)]' : 'text-[var(--error-text)]'
          }`}>
            {verifyStatus === 'success' ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            {verifyMessage}
          </div>
        )}

        <div className="flex gap-3">
          {apiKey && (
            <button
              onClick={handleClearKey}
              className="flex-1 py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider transition-colors rounded-lg border border-[var(--border-primary)]"
            >
              清除 Key
            </button>
          )}
          <button
            onClick={handleVerifyAndSave}
            disabled={isVerifying || !apiKey.trim()}
            className="flex-1 py-2.5 bg-[var(--accent)] text-[var(--text-primary)] font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                验证中...
              </>
            ) : (
              '验证并保存'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalSettings;
