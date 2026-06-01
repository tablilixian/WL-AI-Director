import React, { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'

interface LoginPageProps {
  onSwitchToRegister: () => void
  onLoginSuccess: () => void
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSwitchToRegister,
  onLoginSuccess
}) => {
  const { signIn, resetPassword, loading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    
    try {
      await signIn(email, password)
      onLoginSuccess()
    } catch (err) {
      console.error('Login error:', err)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await resetPassword(email)
      setResetSent(true)
    } catch (err) {
      // error is already set via authStore
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            WL AI Director
          </h1>
          <p className="text-[var(--text-muted)]">
            AI 漫剧创作平台
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-primary)] p-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6">
            登录账号
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  required
                  className="w-full bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg px-4 py-3 pr-12 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={() => { setShowReset(!showReset); setResetSent(false); clearError() }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                忘记密码？
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-[var(--error)] text-sm bg-[var(--error-bg)] p-3 rounded-lg border border-[var(--error-border)]">
                {error}
              </div>
            )}

            {resetSent ? (
              <div className="text-[var(--success)] text-sm bg-[var(--success-bg)] p-3 rounded-lg border border-[var(--success-border)]">
                如果该邮箱已注册，重置密码的链接已发送。请检查您的邮箱或在本地 PocketBase 日志中查看重置链接。
              </div>
            ) : showReset ? (
              <form onSubmit={handleResetPassword} className="space-y-3 p-3 bg-[var(--bg-base)] rounded-lg border border-[var(--border-secondary)]">
                <p className="text-sm text-[var(--text-muted)]">输入邮箱地址获取密码重置链接：</p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg px-4 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 bg-[var(--accent)] text-[var(--text-primary)] rounded-lg text-sm font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    发送重置链接
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReset(false); clearError() }}
                    className="py-2 px-3 text-[var(--text-muted)] text-sm hover:text-[var(--text-primary)]"
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : null}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[var(--accent)] text-[var(--text-primary)] rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          {/* Switch to Register */}
          <div className="mt-6 text-center">
            <span className="text-[var(--text-muted)] text-sm">
              还没有账号？
            </span>
            <button
              onClick={onSwitchToRegister}
              className="ml-1 text-[var(--accent)] text-sm hover:underline"
            >
              立即注册
            </button>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-6 text-center">
          <button
            onClick={onLoginSuccess}
            className="text-[var(--text-muted)] text-sm hover:text-[var(--text-primary)]"
          >
            ← 暂不登录，继续试用
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
