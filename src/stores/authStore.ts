import { create } from 'zustand'
import { supabase } from '../api/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '../types/supabase'

interface AuthState {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  error: string | null
  
  // Actions
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  session: null,
  loading: true,
  error: null,
  
  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        
        set({ 
          session, 
          user: session.user, 
          profile,
          loading: false 
        })
      } else {
        set({ session: null, user: null, profile: null, loading: false })
      }
      
      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          
          set({ session, user: session.user, profile })
          
          // 登录成功后同步资产库
          setTimeout(() => {
            import('../../services/hybridStorageService').then(({ hybridStorage }) => {
              hybridStorage.getAllAssetLibraryItems().then((items) => {
                console.log(`[Auth] Auth state change 资产库同步完成: ${items.length} 个资产`)
              }).catch(console.error)
            }).catch(console.error)
          }, 100)
        } else {
          set({ session: null, user: null, profile: null })
        }
      })
    } catch (error) {
      console.error('Auth init error:', error)
      set({ loading: false, error: 'Failed to initialize auth' })
    }
  },
  
  signIn: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (error) throw error
      
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
        
        set({ 
          user: data.user, 
          session: data.session, 
          profile,
          loading: false 
        })
        
        // 登录成功后触发云端双向同步
        setTimeout(() => {
          import('../../services/hybridStorageService').then(({ syncFromCloud, hybridStorage }) => {
            // 同步项目
            syncFromCloud().then((result: { uploaded: number; downloaded: number; conflicts: number }) => {
              console.log(`[Auth] 登录双向同步完成: 上传 ${result.uploaded}, 下载 ${result.downloaded}, 冲突 ${result.conflicts}`)
              if (result.uploaded > 0 || result.downloaded > 0) {
                window.dispatchEvent(new CustomEvent('projects-synced'))
              }
            }).catch(console.error)
            
            // 同步资产库
            hybridStorage.getAllAssetLibraryItems().then((items) => {
              console.log(`[Auth] 登录后资产库同步完成: ${items.length} 个资产`)
            }).catch(console.error)
          }).catch(console.error)
        }, 100)
      }
    } catch (error: any) {
      set({ loading: false, error: error.message })
      throw error
    }
  },
  
  signUp: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            email
          }
        }
      })
      
      if (error) throw error
      
      // Auto sign in after signup (if email confirmation is disabled)
      if (data.session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user?.id)
          .single()
        
        set({ 
          user: data.user, 
          session: data.session, 
          profile,
          loading: false 
        })
      } else {
        set({ loading: false })
      }
    } catch (error: any) {
      set({ loading: false, error: error.message })
      throw error
    }
  },
  
  signOut: async () => {
    set({ loading: true })
    try {
      await supabase.auth.signOut()
      set({ user: null, session: null, profile: null, loading: false })
    } catch (error: any) {
      set({ loading: false, error: error.message })
    }
  },
  
  updateProfile: async (updates) => {
    const { user } = get()
    if (!user) return
    
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single()
      
      if (error) throw error
      
      set({ profile: data, loading: false })
    } catch (error: any) {
      set({ loading: false, error: error.message })
      throw error
    }
  },
  
  clearError: () => set({ error: null })
}))
