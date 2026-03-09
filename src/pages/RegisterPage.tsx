import React, { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'

interface RegisterPageProps {
  onSwitchToLogin: () => void
  onRegisterSuccess: () => void
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  onSwitchToLogin,
  onRegisterSuccess
}) => {
  const { signUp, loading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [validationError, setValidationError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setValidationError('')

    if (password !== confirmPassword) {
      setValidationError('两次输入的密码不一致')
      return
    }

    if (password.length < 6) {
      setValidationError('密码长度至少为 6 位')
      return
    }

    try {
      await signUp(email, password)
      setEmailSent(true)
    } catch (err) {
      console.error('Register error:', err)
    }
  }

  if (emailSent) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-primary)] p-8 text-center">
            <div className="w-16 h-16 bg-[var(--success-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-[var(--success)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              注册成功！
            </h2>
            <p className="text-[var(--text-muted)] mb-6">
              我们已向 {email} 发送了一封验证邮件，请查收并点击链接完成验证。
            </p>
            <button
              onClick={onSwitchToLogin}
              className="text-[var(--accent)] hover:underline"
            >
              返回登录 →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            WL AI Director
          </h1>
          <p className="text-[var(--text-muted)]">
            AI 漫剧创作平台
          </p>
        </div>

        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-primary)] p-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6">
            创建账号
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div>
              <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
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

            <div>
              <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">
                确认密码
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                required
                className="w-full bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-secondary)] rounded-lg px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            {(error || validationError) && (
              <div className="text-[var(--error)] text-sm bg-[var(--error-bg)] p-3 rounded-lg border border-[var(--error-border)]">
                {validationError || error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[var(--accent)] text-[var(--text-primary)] rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? '注册中...' : '注册'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-[var(--text-muted)] text-sm">
              已有账号？
            </span>
            <button
              onClick={onSwitchToLogin}
              className="ml-1 text-[var(--accent)] text-sm hover:underline"
            >
              立即登录
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={onSwitchToLogin}
            className="text-[var(--text-muted)] text-sm hover:text-[var(--text-primary)]"
          >
            ← 返回登录
          </button>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
