import { create } from 'zustand';
import { pb, startTokenRefresh, stopTokenRefresh } from '../api/pocketbase';
import { logger, LogCategory } from '../../services/logger.ts';

interface AuthState {
  user: any;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (data: { name?: string; api_key?: string }) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: pb.authStore.isValid ? pb.authStore.model : null,
  loading: !pb.authStore.isValid,
  error: null,

  initialize: async () => {
    logger.info(LogCategory.APP, '[Auth] initialize:', {
      isValid: pb.authStore.isValid,
      model: pb.authStore.model?.id,
      token: pb.authStore.token?.slice(0, 20),
    });
    // PocketBase 的 LocalAuthStore 已自动从 localStorage 恢复会话
    if (pb.authStore.isValid) {
      set({ user: pb.authStore.model, loading: false });
      startTokenRefresh();
    } else {
      set({ loading: false });
    }

    // 监听认证状态变化
    pb.authStore.onChange((token, model) => {
      logger.info(LogCategory.APP, '[Auth] onChange:', {
        modelId: model?.id,
        token: token?.slice(0, 20),
      });
      set({ user: model });
      if (model) {
        startTokenRefresh();
      } else {
        stopTokenRefresh();
      }
    });
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const authData = await pb.collection('users').authWithPassword(email, password);
      logger.info(LogCategory.APP, '[Auth] signIn authData:', {
        recordId: authData.record?.id,
        token: authData.token?.slice(0, 20) + '...',
        modelId: pb.authStore.model?.id,
      });
      set({ user: authData.record, loading: false });
      startTokenRefresh();

      // 登录后同步数据
      setTimeout(() => {
        import('../../services/hybridStorageService')
          .then(({ syncFromCloud, hybridStorage }) => {
            syncFromCloud()
              .then((result: any) => {
                logger.info(
                  LogCategory.APP,
                  `[Auth] 登录同步完成: 上传 ${result.uploaded}, 下载 ${result.downloaded}`,
                );
                if (result.uploaded > 0 || result.downloaded > 0) {
                  window.dispatchEvent(new CustomEvent('projects-synced'));
                }
              })
              .catch((err) => logger.error(LogCategory.APP, '[Auth] 云端同步失败', err));
            hybridStorage
              .getAllAssetLibraryItems()
              .catch((err) => logger.error(LogCategory.APP, '[Auth] 资产库读取失败', err));
          })
          .catch((err) => logger.error(LogCategory.APP, '[Auth] 同步模块加载失败', err));
      }, 100);
    } catch (error: any) {
      set({ loading: false, error: error.message || error.response?.message });
      throw error;
    }
  },

  signUp: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const record = await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
      });
      logger.info(LogCategory.APP, '[Auth] signUp create record:', { recordId: record?.id });

      // 注册后自动登录
      const authData = await pb.collection('users').authWithPassword(email, password);
      logger.info(LogCategory.APP, '[Auth] signUp authData:', {
        recordId: authData.record?.id,
        token: authData.token?.slice(0, 20) + '...',
        modelId: pb.authStore.model?.id,
      });
      set({ user: authData.record, loading: false });
      startTokenRefresh();

      // 注册后同步数据
      setTimeout(() => {
        import('../../services/hybridStorageService')
          .then(({ syncFromCloud, hybridStorage }) => {
            syncFromCloud()
              .then((result: any) => {
                logger.info(
                  LogCategory.APP,
                  `[Auth] 注册同步完成: 上传 ${result.uploaded}, 下载 ${result.downloaded}`,
                );
                if (result.uploaded > 0 || result.downloaded > 0) {
                  window.dispatchEvent(new CustomEvent('projects-synced'));
                }
              })
              .catch((err) => logger.error(LogCategory.APP, '[Auth] 云端同步失败', err));
            hybridStorage
              .getAllAssetLibraryItems()
              .catch((err) => logger.error(LogCategory.APP, '[Auth] 资产库读取失败', err));
          })
          .catch((err) => logger.error(LogCategory.APP, '[Auth] 同步模块加载失败', err));
      }, 100);
    } catch (error: any) {
      set({ loading: false, error: error.message || error.response?.message });
      throw error;
    }
  },

  signOut: async () => {
    stopTokenRefresh();
    pb.authStore.clear();
    set({ user: null, loading: false });
  },

  resetPassword: async (email: string) => {
    set({ loading: true, error: null });
    try {
      await pb.collection('users').requestPasswordReset(email);
      set({ loading: false });
    } catch (error: any) {
      set({ loading: false, error: error.message || error.response?.message });
      throw error;
    }
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    set({ loading: true, error: null });
    try {
      // PocketBase requires re-validation by passing the old password
      const currentUser = pb.authStore.model;
      if (!currentUser) {
        throw new Error('用户未登录或会话已失效，请重新登录后再修改密码');
      }
      await pb.collection('users').update(currentUser.id, {
        oldPassword,
        password: newPassword,
        passwordConfirm: newPassword,
      });
      set({ loading: false });
    } catch (error: any) {
      set({ loading: false, error: error.message || error.response?.message });
      throw error;
    }
  },

  updateProfile: async (data: { name?: string; api_key?: string }) => {
    set({ loading: true, error: null });
    try {
      const currentUser = pb.authStore.model;
      if (!currentUser) {
        throw new Error('用户未登录或会话已失效，请重新登录后再更新资料');
      }
      const record = await pb.collection('users').update(currentUser.id, data);
      set({ user: record, loading: false });
    } catch (error: any) {
      set({ loading: false, error: error.message || error.response?.message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
