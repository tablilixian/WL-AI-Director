import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import StageScript from './components/StageScript';
import StageAssets from './components/StageAssets';
import StageDirector from './components/StageDirector';
import StageExport from './components/StageExport';
import StagePrompts from './components/StagePrompts';
import StageCanvas from './components/StageCanvas';
import VideoEditor from './src/components/VideoEditor';
import { canvasIntegrationService } from './src/modules/canvas/services/canvasIntegrationService';
import Dashboard from './components/Dashboard';
import Onboarding, { shouldShowOnboarding, resetOnboarding } from './components/Onboarding';
import ModelConfigModal from './components/ModelConfig';
import { ProjectState } from './types';
import { Save, CheckCircle } from 'lucide-react';
import { saveProjectToDB, loadProjectFromDB, saveCurrentStage, getCurrentStage } from './services/storageService';
import { hybridStorage } from './services/hybridStorageService';
import { setGlobalApiKey } from './services/aiService';
import { setLogCallback, clearLogCallback } from './services/renderLogService';
// import { checkOldDatabaseExists, migrateDatabase, deleteOldDatabase } from './services/dbMigrationService';
import { useAlert } from './components/GlobalAlert';
import { useAuthStore } from './src/stores/authStore';
import LoginPage from './src/pages/LoginPage';
import RegisterPage from './src/pages/RegisterPage';
import logoImg from './logo.png';
import { logger, LogCategory } from './services/logger';
import './src/i18n';

type AuthView = 'login' | 'register' | 'app';

function App() {
  const { showAlert } = useAlert();
  const { user, loading: authLoading, initialize } = useAuthStore();
  const [authView, setAuthView] = useState<AuthView>('app');
  const [project, setProject] = useState<ProjectState | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  
  const saveTimeoutRef = useRef<any>(null);
  const hideStatusTimeoutRef = useRef<any>(null);
  const initialProjectRef = useRef<ProjectState | null>(null);
  const isFirstLoadRef = useRef(true);
  const lastSavedHashRef = useRef<string>('');

  const computeProjectHash = (project: ProjectState | null): string => {
    if (!project) return '';
    const { stage, ...projectWithoutStage } = project;
    const projectString = JSON.stringify(projectWithoutStage);
    let hash = 0;
    for (let i = 0; i < projectString.length; i++) {
      const char = projectString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  };

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, []);

  // ============================================================================
  // 历史遗留数据处理（已废弃）
  // ============================================================================
  // 用于从 BigBananaDB 迁移到 WLDB
  // 正式版本可删除此部分代码
  // ============================================================================
  /*
  // Check and migrate old database on mount
  useEffect(() => {
    const checkAndMigrate = async () => {
      try {
        const oldDbExists = await checkOldDatabaseExists();
        if (oldDbExists) {
          logger.info(LogCategory.APP, '🔄 检测到旧数据库 BigBananaDB，开始迁移...');
          const result = await migrateDatabase();
          if (result.success) {
            logger.info(LogCategory.APP, '✅ 数据库迁移成功');
            showAlert('数据库迁移成功', 'success');
            const deleted = await deleteOldDatabase();
            if (deleted) {
              logger.info(LogCategory.APP, '✅ 旧数据库已删除');
            }
          } else {
            logger.error(LogCategory.APP, '❌ 数据库迁移失败', result.errors);
            showAlert('数据库迁移失败，请检查控制台', 'error');
          }
        }
      } catch (error) {
        logger.error(LogCategory.APP, '数据库迁移检查失败:', error);
      }
    };
    checkAndMigrate();
  }, []);
  */

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user && authView === 'app') {
      setAuthView('login');
    }
  }, [user, authLoading, authView]);

  // Detect mobile device on mount
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load API Key from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('antsk_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      setGlobalApiKey(storedKey);
    }
    if (shouldShowOnboarding()) {
      setShowOnboarding(true);
    }
  }, []);

  // Handle onboarding complete
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  // Handle onboarding quick start
  const handleOnboardingQuickStart = (option: 'script' | 'example') => {
    setShowOnboarding(false);
    logger.debug(LogCategory.APP, 'Quick start option:', option);
  };

  // Show onboarding
  const handleShowOnboarding = () => {
    resetOnboarding();
    setShowOnboarding(true);
  };

  // Save API Key
  const handleSaveApiKey = (key: string) => {
    if (key) {
      setApiKey(key);
      setGlobalApiKey(key);
      localStorage.setItem('antsk_api_key', key);
    } else {
      setApiKey('');
      setGlobalApiKey('');
      localStorage.removeItem('antsk_api_key');
    }
  };

  // Show model config
  const handleShowModelConfig = () => {
    setShowModelConfig(true);
  };

  // Handle API Key error
  const handleApiKeyError = (error: any) => {
    if (error?.name === 'ApiKeyError' || 
        error?.message?.includes('API Key missing') ||
        error?.message?.includes('AntSK API Key') ||
        error?.message?.includes('API Key 缺失')) {
      logger.warn(LogCategory.APP, '检测到 API Key 错误，请配置 API Key...');
      setShowModelConfig(true);
      return true;
    }
    return false;
  };

  // Global error handler
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.name === 'ApiKeyError' || 
          event.error?.message?.includes('API Key missing') ||
          event.error?.message?.includes('AntSK API Key') ||
          event.error?.message?.includes('API Key 缺失')) {
        logger.warn(LogCategory.APP, '检测到 API Key 错误，请配置 API Key...');
        setShowModelConfig(true);
        event.preventDefault();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.name === 'ApiKeyError' ||
          event.reason?.message?.includes('API Key missing') ||
          event.reason?.message?.includes('AntSK API Key') ||
          event.reason?.message?.includes('API Key 缺失')) {
        logger.warn(LogCategory.APP, '检测到 API Key 错误，请配置 API Key...');
        setShowModelConfig(true);
        event.preventDefault();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Setup render log callback
  useEffect(() => {
    if (project) {
      setLogCallback((log) => {
        setProject(prev => {
          if (!prev) return null;
          return {
            ...prev,
            renderLogs: [...(prev.renderLogs || []), log]
          };
        });
      });
    } else {
      clearLogCallback();
    }
    
    return () => clearLogCallback();
  }, [project?.id]);

  // Auto-save logic
  useEffect(() => {
    if (!project || isExiting || isAIProcessing) return;

    // 首次加载时跳过 auto-save
    if (isFirstLoadRef.current) {
      logger.debug(LogCategory.APP, '📥 首次加载项目，跳过 auto-save');
      isFirstLoadRef.current = false;
      lastSavedHashRef.current = computeProjectHash(project);
      return;
    }

    // 计算当前 project 的 hash
    const currentHash = computeProjectHash(project);
    
    // 如果内容没有变化，跳过保存
    if (currentHash === lastSavedHashRef.current) {
      logger.debug(LogCategory.APP, '🔄 项目内容未变化，跳过保存');
      return;
    }

    logger.debug(LogCategory.APP, '📝 项目内容已变化，准备保存...');
    setSaveStatus('unsaved');
    setShowSaveStatus(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await hybridStorage.saveProject(project);
        setSaveStatus('saved');
        // 更新 hash，避免重复保存
        lastSavedHashRef.current = currentHash;
        logger.debug(LogCategory.APP, '✅ 项目保存成功，hash:', currentHash);
      } catch (e) {
        logger.error(LogCategory.STORAGE, "Auto-save failed", e);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [project, isExiting]);

  // Auto-hide save status
  useEffect(() => {
    if (saveStatus === 'saved') {
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
      hideStatusTimeoutRef.current = setTimeout(() => {
        setShowSaveStatus(false);
      }, 2000);
    } else if (saveStatus === 'saving') {
      setShowSaveStatus(true);
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
    }

    return () => {
      if (hideStatusTimeoutRef.current) clearTimeout(hideStatusTimeoutRef.current);
    };
  }, [saveStatus]);

  // Update project
  const updateProject = (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => {
    if (!project) return;
    setProject(prev => {
      if (!prev) return null;
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  };

  const updateProjectWithoutSave = (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => {
    if (!project) return;
    setIsAIProcessing(true);
    setProject(prev => {
      if (!prev) return null;
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  };

  const finishAIProcessing = () => {
    setIsAIProcessing(false);
  };

  // Update project state only (without triggering cloud sync)
  const updateProjectState = (updates: Partial<ProjectState>) => {
    if (!project) return;
    setProject(prev => {
      if (!prev) return null;
      return { ...prev, ...updates };
    });
  };

  // Set stage
  const setStage = async (stage: 'script' | 'assets' | 'director' | 'editor' | 'export' | 'prompts' | 'canvas') => {
    if (project) {
      await canvasIntegrationService.setProjectId(project.id);
    }
    
    canvasIntegrationService.saveImmediately(true);
    
    if (isGenerating) {
      showAlert('当前正在执行生成任务（剧本分镜 / 首帧 / 视频等），切换页面会导致生成数据丢失，且已扣除的费用无法恢复。\n\n确定要离开当前页面吗？', {
        title: '生成任务进行中',
        type: 'warning',
        showCancel: true,
        confirmText: '确定离开',
        cancelText: '继续等待',
        onConfirm: () => {
          setIsGenerating(false);
          updateProjectState({ stage });
          if (project) {
            saveCurrentStage(project.id, stage);
          }
        }
      });
      return;
    }
    updateProjectState({ stage });
    if (project) {
      saveCurrentStage(project.id, stage);
    }
  };

  // Handle open project
  const handleOpenProject = async (proj: string | ProjectState) => {
    // 重置首次加载标记
    isFirstLoadRef.current = true;
    
    // 如果传入的是字符串（项目ID），则先从本地加载完整项目
    if (typeof proj === 'string') {
      logger.debug(LogCategory.APP, '正在从本地加载项目:', proj);
      const fullProject = await loadProjectFromDB(proj);
      if (fullProject) {
        await canvasIntegrationService.setProjectId(fullProject.id);
        
        const currentStage = await getCurrentStage(proj);
        logger.debug(LogCategory.APP, '恢复 stage:', currentStage);
        
        const projectWithStage = { ...fullProject, stage: currentStage as any };
        setProject(projectWithStage);
        initialProjectRef.current = JSON.parse(JSON.stringify(projectWithStage));
        logger.debug(LogCategory.APP, '项目加载成功:', fullProject.title);
      } else {
        logger.error(LogCategory.STORAGE, '无法加载项目，项目不存在:', proj);
      }
    } else {
      await canvasIntegrationService.setProjectId(proj.id);
      
      const currentStage = await getCurrentStage(proj.id);
      logger.debug(LogCategory.APP, '恢复 stage:', currentStage);
      
      const projectWithStage = { ...proj, stage: currentStage as any };
      setProject(projectWithStage);
      initialProjectRef.current = JSON.parse(JSON.stringify(projectWithStage));
    }
  };

  // 比较两个项目对象是否相等（深度比较）
  const isProjectEqual = (p1: ProjectState | null, p2: ProjectState | null): boolean => {
    if (!p1 || !p2) return false;
    
    // 比较关键字段
    return (
      p1.id === p2.id &&
      p1.title === p2.title &&
      p1.stage === p2.stage &&
      p1.rawScript === p2.rawScript &&
      p1.targetDuration === p2.targetDuration &&
      p1.language === p2.language &&
      p1.visualStyle === p2.visualStyle &&
      JSON.stringify(p1.scriptData) === JSON.stringify(p2.scriptData) &&
      JSON.stringify(p1.shots) === JSON.stringify(p2.shots)
    );
  };

  // Handle exit project
  const handleExitProject = async () => {
    logger.debug(LogCategory.APP, '🚪 handleExitProject 开始执行');
    logger.debug(LogCategory.APP, 'isGenerating:', isGenerating);
    logger.debug(LogCategory.APP, 'project:', project);
    
    // 比较项目是否有变化
    const hasChanges = !isProjectEqual(project, initialProjectRef.current);
    logger.debug(LogCategory.APP, '项目是否有变化:', hasChanges);
    
    if (!hasChanges) {
      logger.debug(LogCategory.APP, '⏭️ 项目无变化，直接退出，跳过保存');
      setProject(null);
      setTimeout(() => setIsExiting(false), 100);
      return;
    }
    
    logger.debug(LogCategory.APP, '💾 项目有变化，开始保存...');
    
    if (isGenerating) {
      showAlert('当前正在执行生成任务（剧本分镜 / 首帧 / 视频等），退出项目会导致生成数据丢失，且已扣除的费用无法恢复。\n\n确定要退出吗？', {
        title: '生成任务进行中',
        type: 'warning',
        showCancel: true,
        confirmText: '确定退出',
        cancelText: '继续等待',
        onConfirm: async () => {
          logger.debug(LogCategory.APP, '⚠️ 用户确认退出生成任务');
          setIsGenerating(false);
          setIsExiting(true);
          if (project) {
            await hybridStorage.saveProject(project);
          }
          logger.debug(LogCategory.APP, '🚪 调用 setProject(null)');
          setProject(null);
          setTimeout(() => setIsExiting(false), 100);
        }
      });
      return;
    }
    
    logger.debug(LogCategory.APP, '💾 开始保存项目...');
    setIsExiting(true);
    if (project) {
      await hybridStorage.saveProject(project);
    }
    logger.debug(LogCategory.APP, '🚪 调用 setProject(null)');
    setProject(null);
    setTimeout(() => setIsExiting(false), 100);
    logger.debug(LogCategory.APP, '✅ handleExitProject 执行完成');
  };

  // Render stage
  const renderStage = () => {
    if (!project) return null;
    switch (project.stage) {
      case 'script':
        return (
          <StageScript
            project={project}
            updateProject={updateProject}
            updateProjectWithoutSave={updateProjectWithoutSave}
            finishAIProcessing={finishAIProcessing}
            onShowModelConfig={handleShowModelConfig}
            onGeneratingChange={setIsGenerating}
          />
        );
      case 'assets':
        return <StageAssets project={project} updateProject={updateProject} onApiKeyError={handleApiKeyError} onGeneratingChange={setIsGenerating} />;
      case 'director':
        return <StageDirector project={project} updateProject={updateProject} onApiKeyError={handleApiKeyError} onGeneratingChange={setIsGenerating} />;
      case 'editor':
        return <VideoEditor project={project} />;
      case 'export':
        return <StageExport project={project} />;
      case 'prompts':
        return <StagePrompts project={project} updateProject={updateProject} />;
      case 'canvas':
        return <StageCanvas project={project} updateProject={updateProject} />;
      default:
        return <div className="text-[var(--text-primary)]">未知阶段</div>;
    }
  };

  // Auth handlers
  const handleLoginSuccess = () => {
    setAuthView('app');
  };

  const handleSwitchToRegister = () => {
    setAuthView('register');
  };

  const handleSwitchToLogin = () => {
    setAuthView('login');
  };

  // Show loading while checking auth
  if (authLoading && authView !== 'app') {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-[var(--text-muted)]">加载中...</div>
      </div>
    );
  }

  // Show login page
  if (authView === 'login') {
    return (
      <LoginPage
        onSwitchToRegister={handleSwitchToRegister}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // Show register page
  if (authView === 'register') {
    return (
      <RegisterPage
        onSwitchToLogin={handleSwitchToLogin}
        onRegisterSuccess={handleLoginSuccess}
      />
    );
  }

  // Mobile warning
  if (isMobile) {
    return (
      <div className="h-screen bg-[var(--bg-base)] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <img src={logoImg} alt="Logo" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">WL AI Director</h1>
          <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-8">
            <p className="text-[var(--text-tertiary)] text-base leading-relaxed              为了获得最佳 mb-4">
体验，请使用 PC 端浏览器访问。
            </p>
            <p className="text-[var(--text-muted)] text-sm">
              本应用需要较大的屏幕空间和桌面级浏览器环境才能正常运行。
            </p>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            <span className="text-[var(--text-tertiary)]">访问产品首页了解更多</span>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard view
  if (!project) {
    return (
       <>
         <Dashboard 
           onOpenProject={handleOpenProject} 
           onShowOnboarding={handleShowOnboarding}
           onShowModelConfig={handleShowModelConfig}
         />
         {showOnboarding && (
           <Onboarding 
             onComplete={handleOnboardingComplete}
             onQuickStart={handleOnboardingQuickStart}
             currentApiKey={apiKey}
             onSaveApiKey={handleSaveApiKey}
           />
         )}
         <ModelConfigModal
           isOpen={showModelConfig}
           onClose={() => setShowModelConfig(false)}
         />
       </>
    );
  }

  // Workspace view
  return (
    <div className="flex h-screen bg-[var(--bg-secondary)] font-sans text-[var(--text-secondary)] selection:bg-[var(--accent-bg)]">
      <Sidebar 
        currentStage={project.stage} 
        setStage={setStage} 
        onExit={handleExitProject} 
        projectName={project.title}
        onShowOnboarding={handleShowOnboarding}
        onShowModelConfig={() => setShowModelConfig(true)}
        isNavigationLocked={isGenerating}
      />
      
      <main className="ml-72 flex-1 h-screen overflow-hidden relative">
        {renderStage()}
        
        {showSaveStatus && (
          <div className="absolute top-4 right-6 pointer-events-none flex items-center gap-2 text-xs font-mono text-[var(--text-tertiary)] bg-[var(--overlay-medium)] px-2 py-1 rounded-full backdrop-blur-sm z-50 animate-in fade-in slide-in-from-top-2 duration-200">
             {saveStatus === 'saving' ? (
               <>
                 <Save className="w-3 h-3 animate-pulse" />
                 保存中...
               </>
             ) : (
               <>
                 <CheckCircle className="w-3 h-3 text-[var(--success)]" />
                 已保存
               </>
             )}
          </div>
        )}
      </main>

      {showOnboarding && (
        <Onboarding 
          onComplete={handleOnboardingComplete}
          onQuickStart={handleOnboardingQuickStart}
          currentApiKey={apiKey}
          onSaveApiKey={handleSaveApiKey}
        />
      )}

      <ModelConfigModal
        isOpen={showModelConfig}
        onClose={() => setShowModelConfig(false)}
      />
    </div>
  );
}

export default App;
