import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock dependencies ────────────────────────────────────

const mockOnChange = vi.fn(() => vi.fn());
const mockAuthStore = {
  isValid: false,
  model: null as any,
  token: '',
  clear: vi.fn(),
  save: vi.fn(),
  onChange: mockOnChange,
};
const mockCollection = vi.fn();
const mockEnsureValidAuth = vi.fn();

vi.mock('../src/api/pocketbase', () => ({
  pb: {
    authStore: mockAuthStore,
    collection: mockCollection,
    baseUrl: 'http://127.0.0.1:8090',
  },
  ensureValidAuth: mockEnsureValidAuth,
  startTokenRefresh: vi.fn(),
  stopTokenRefresh: vi.fn(),
}));

// ── Import after mocks ───────────────────────────────────

let useAuthStore: any;

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset auth store state
  mockAuthStore.isValid = false;
  mockAuthStore.model = null;
  mockAuthStore.token = '';

  await import('../src/api/pocketbase');

  const authModule = await import('../src/stores/authStore');
  useAuthStore = authModule.useAuthStore;
  // Reset Zustand store to default
  useAuthStore.setState({ user: null, loading: false, error: null });
});

// ── Tests ────────────────────────────────────────────────

describe('Auth Store - Sign Up', () => {
  it('should create user and auto-login on signUp', async () => {
    const mockRecord = { id: 'user-1', email: 'test@test.com' };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          create: vi.fn().mockResolvedValue(mockRecord),
          authWithPassword: vi.fn().mockResolvedValue({ record: mockRecord, token: 'mock-token' }),
        };
      }
      return {};
    });

    await useAuthStore.getState().signUp('test@test.com', 'password123');
    const state = useAuthStore.getState();
    expect(state.user?.id).toBe('user-1');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should set error on signUp failure', async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return { create: vi.fn().mockRejectedValue(new Error('Email already exists')) };
      }
      return {};
    });

    await expect(useAuthStore.getState().signUp('test@test.com', 'pw')).rejects.toThrow();
    const state = useAuthStore.getState();
    expect(state.error).toBeTruthy();
    expect(state.loading).toBe(false);
  });
});

describe('Auth Store - Sign In', () => {
  it('should authenticate user and set user state', async () => {
    const mockRecord = { id: 'user-1', email: 'test@test.com' };
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          authWithPassword: vi.fn().mockResolvedValue({ record: mockRecord, token: 'mock-token' }),
        };
      }
      return {};
    });

    await useAuthStore.getState().signIn('test@test.com', 'password123');
    const state = useAuthStore.getState();
    expect(state.user?.id).toBe('user-1');
    expect(state.loading).toBe(false);
  });

  it('should set error on invalid credentials', async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return { authWithPassword: vi.fn().mockRejectedValue(new Error('Invalid credentials')) };
      }
      return {};
    });

    await expect(useAuthStore.getState().signIn('bad@test.com', 'wrong')).rejects.toThrow();
    const state = useAuthStore.getState();
    expect(state.error).toBeTruthy();
  });
});

describe('Auth Store - Sign Out', () => {
  it('should clear user and auth store on signOut', async () => {
    useAuthStore.setState({ user: { id: 'user-1' } });

    await useAuthStore.getState().signOut();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(mockAuthStore.clear).toHaveBeenCalled();
  });
});

describe('Auth Store - Password Reset', () => {
  it('should call requestPasswordReset on resetPassword', async () => {
    const mockRequestReset = vi.fn().mockResolvedValue({});
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return { requestPasswordReset: mockRequestReset };
      }
      return {};
    });

    await useAuthStore.getState().resetPassword('test@test.com');
    expect(mockRequestReset).toHaveBeenCalledWith('test@test.com');
  });
});

describe('Auth Store - Change Password', () => {
  it('should update password with old + new password', async () => {
    mockAuthStore.model = { id: 'user-1' };
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'user-1' });
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return { update: mockUpdate };
      }
      return {};
    });

    await useAuthStore.getState().changePassword('oldPass', 'newPass123');
    expect(mockUpdate).toHaveBeenCalledWith('user-1', {
      oldPassword: 'oldPass',
      password: 'newPass123',
      passwordConfirm: 'newPass123',
    });
  });
});

describe('Auth Store - Update Profile', () => {
  it('should update name and api_key', async () => {
    mockAuthStore.model = { id: 'user-1' };
    const mockUpdate = vi
      .fn()
      .mockResolvedValue({ id: 'user-1', name: 'New Name', api_key: 'sk-xxx' });
    mockCollection.mockImplementation((name: string) => {
      if (name === 'users') {
        return { update: mockUpdate };
      }
      return {};
    });

    await useAuthStore.getState().updateProfile({ name: 'New Name', api_key: 'sk-xxx' });
    expect(mockUpdate).toHaveBeenCalledWith('user-1', { name: 'New Name', api_key: 'sk-xxx' });
    const state = useAuthStore.getState();
    expect(state.user?.name).toBe('New Name');
  });
});

describe('Auth Store - Initialize', () => {
  it('should restore session when authStore.isValid is true', async () => {
    mockAuthStore.isValid = true;
    mockAuthStore.model = { id: 'restored-user' };
    mockAuthStore.token = 'restored-token';

    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.user?.id).toBe('restored-user');
    expect(state.loading).toBe(false);
  });

  it('should set loading false when no session', async () => {
    // Reset store and mock to baseline
    useAuthStore.setState({ user: null, loading: true });
    mockAuthStore.isValid = false;
    mockAuthStore.model = null;

    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('should register onChange listener', async () => {
    await useAuthStore.getState().initialize();
    expect(mockOnChange).toHaveBeenCalled();
  });
});

describe('Auth Store - Error handling', () => {
  it('should clear error on clearError', () => {
    useAuthStore.setState({ error: 'some error' });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });
});
