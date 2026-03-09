import React, { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

interface LoginPageProps {
  onSwitchToRegister: () => void
  onLoginSuccess: () => void
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSwitchToRegister,
  onLoginSuccess
}) => {
  const { signIn, loading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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

            {/* Error Message */}
            {error && (
              <div className="text-[var(--error)] text-sm bg-[var(--error-bg)] p-3 rounded-lg border border-[var(--error-border)]">
                {error}
              </div>
            )}

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
