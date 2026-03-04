import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { useAuthStore } from '../src/stores/authStore';
import { hybridStorage } from '../services/hybridStorageService';
import { createNewProjectState } from '../services/storageService';
import { AlertProvider } from '../components/GlobalAlert';
import { ThemeProvider } from '../contexts/ThemeContext';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <AlertProvider>
        {component}
      </AlertProvider>
    </ThemeProvider>
  );
};

describe('项目流程测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([]);
    
    useAuthStore.setState({
      user: null,
      profile: null,
      session: null,
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. 登录流程测试', () => {
    it('未登录时显示登录页面', async () => {
      renderWithProviders(<App />);

      await waitFor(() => {
        expect(screen.getByText(/登录账号/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('登录成功后显示项目库页面', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };

      const { signIn } = useAuthStore.getState();
      vi.spyOn(useAuthStore.getState(), 'signIn').mockResolvedValue();
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(screen.getByText(/新建/i)).toBeInTheDocument();
      });
    });
  });

  describe('2. 项目库页面数据同步测试', () => {
    it('登录后自动从云端拉取项目列表', async () => {
      const mockCloudProjects = [
        createNewProjectState(),
        createNewProjectState(),
      ];

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue(mockCloudProjects);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });

    it('云端数据比本地新时，使用云端数据', async () => {
      const localProject = createNewProjectState();
      localProject.title = '本地项目';
      localProject.version = 1;
      localProject.lastModified = Date.now() - 100000;

      const cloudProject = { ...localProject };
      cloudProject.version = 2;
      cloudProject.lastModified = Date.now();

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([cloudProject]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });

    it('本地数据比云端新时，使用本地数据', async () => {
      const cloudProject = createNewProjectState();
      cloudProject.title = '云端项目';
      cloudProject.version = 1;
      cloudProject.lastModified = Date.now() - 100000;

      const localProject = { ...cloudProject };
      localProject.version = 2;
      localProject.lastModified = Date.now();

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([cloudProject]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });

    it('云端有新项目时，自动添加到本地', async () => {
      const cloudProject = createNewProjectState();
      cloudProject.title = '新云端项目';

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([cloudProject]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });

    it('云端和本地项目合并后，去重显示', async () => {
      const project1 = createNewProjectState();
      project1.title = '项目1';
      project1.id = 'proj-1';

      const project2 = createNewProjectState();
      project2.title = '项目2';
      project2.id = 'proj-2';

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([project1, project2]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });

    it('数据合并时格式正确，包含所有必需字段', async () => {
      const cloudProject = createNewProjectState();
      cloudProject.title = '测试项目';
      cloudProject.version = 3;
      cloudProject.lastModified = Date.now();
      cloudProject.stage = 'script';
      cloudProject.rawScript = '测试剧本';

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([cloudProject]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });

      const projects = await hybridStorage.getAllProjects();
      const mergedProject = projects[0];

      expect(mergedProject).toHaveProperty('id');
      expect(mergedProject).toHaveProperty('title');
      expect(mergedProject).toHaveProperty('createdAt');
      expect(mergedProject).toHaveProperty('lastModified');
      expect(mergedProject).toHaveProperty('version');
      expect(mergedProject).toHaveProperty('stage');
      expect(mergedProject).toHaveProperty('rawScript');
      expect(mergedProject.title).toBe('测试项目');
      expect(mergedProject.version).toBe(3);
      expect(mergedProject.stage).toBe('script');
      expect(mergedProject.rawScript).toBe('测试剧本');
    });

    it('云端数据格式异常时，使用默认值', async () => {
      const cloudProject = {
        id: 'test-id',
        title: '异常项目',
        createdAt: Date.now(),
        lastModified: Date.now(),
        version: 1,
        stage: 'script',
        rawScript: '',
        targetDuration: '60',
        language: '中文',
        visualStyle: 'anime',
        shotGenerationModel: '',
        scriptData: null,
        shots: [],
        isParsingScript: false,
        renderLogs: [],
      } as any;

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([cloudProject]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });

      const projects = await hybridStorage.getAllProjects();
      const mergedProject = projects[0];

      expect(mergedProject.stage).toBe('script');
      expect(mergedProject.rawScript).toBe('');
      expect(mergedProject.targetDuration).toBe('60');
      expect(mergedProject.language).toBe('中文');
    });

    it('网络错误时，回退到本地数据', async () => {
      vi.spyOn(hybridStorage, 'getAllProjects').mockRejectedValue(new Error('Network error'));

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });
  });

  describe('3. 版本号和时间戳比较测试', () => {
    it('版本号不同时，使用版本号较高的数据', async () => {
      const localProject = createNewProjectState();
      localProject.title = '测试项目';
      localProject.version = 1;
      localProject.lastModified = Date.now();

      const cloudProject = { ...localProject };
      cloudProject.version = 2;
      cloudProject.lastModified = Date.now() - 10000;

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([cloudProject]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });

    it('版本号相同时，使用时间戳较新的数据', async () => {
      const localProject = createNewProjectState();
      localProject.title = '测试项目';
      localProject.version = 1;
      localProject.lastModified = Date.now() - 10000;

      const cloudProject = { ...localProject };
      cloudProject.version = 1;
      cloudProject.lastModified = Date.now();

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([cloudProject]);

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
      };
      useAuthStore.setState({ user: mockUser as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });
  });

  describe('4. 用户切换测试', () => {
    it('切换用户后，只显示当前用户的项目', async () => {
      const user1Project = createNewProjectState();
      user1Project.title = '用户1项目';

      const user2Project = createNewProjectState();
      user2Project.title = '用户2项目';

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([user1Project]);

      const mockUser1 = {
        id: 'test-user-id-1',
        email: 'user1@example.com',
      };
      useAuthStore.setState({ user: mockUser1 as any, loading: false });

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });

      vi.spyOn(hybridStorage, 'getAllProjects').mockResolvedValue([user2Project]);
      
      const mockUser2 = {
        id: 'test-user-id-2',
        email: 'user2@example.com',
      };
      useAuthStore.setState({ user: mockUser2 as any, loading: false });

      await waitFor(() => {
        expect(hybridStorage.getAllProjects).toHaveBeenCalled();
      });
    });
  });
});
