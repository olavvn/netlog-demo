import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import logo from '../assets/logo.svg'

export default function DashboardLoginPage() {
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [keepLogin, setKeepLogin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!loginId || !password) {
      setError('아이디와 비밀번호를 입력해주세요')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await axiosInstance.post('/auth/manager/login', {
        login_id: loginId,
        password: password,
      })
      const { access_token, manager_id, name, role } = res.data.data
      localStorage.setItem('admin_token', access_token)
      localStorage.setItem('manager_id', manager_id)
      localStorage.setItem('manager_name', name)
      localStorage.setItem('manager_role', role)
      navigate('/dashboard')
    } catch {
      setError('아이디 또는 비밀번호가 올바르지 않습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8"
      style={{ background: 'linear-gradient(160deg, #4A90E2 0%, #1A4FC4 100%)' }}
    >
      {/* 로고 */}
      <div className="mb-16">
        <img
          src={logo}
          alt="NETLOG"
          className="h-12 object-contain"
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>

      {/* 폼 */}
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* 아이디 */}
        <div className="flex flex-col gap-2">
          <label className="text-white text-sm font-medium">아이디</label>
          <input
            className="bg-transparent border-b border-white/50 text-white text-base py-2 outline-none placeholder:text-white/30 focus:border-white transition-colors"
            placeholder=""
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>

        {/* 비밀번호 */}
        <div className="flex flex-col gap-2">
          <label className="text-white text-sm font-medium">비밀번호</label>
          <div className="relative">
            <input
              className="w-full bg-transparent border-b border-white/50 text-white text-base py-2 outline-none placeholder:text-white/30 focus:border-white transition-colors pr-8"
              type={showPw ? 'text' : 'password'}
              placeholder=""
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            <button
              className="absolute right-0 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
              onClick={() => setShowPw(v => !v)}
              tabIndex={-1}
            >
              {showPw ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 로그인 상태 유지 */}
        <div className="flex items-center gap-2">
          <input
            id="keep-login"
            type="checkbox"
            checked={keepLogin}
            onChange={e => setKeepLogin(e.target.checked)}
            className="w-4 h-4 rounded border-white/50 bg-transparent accent-white cursor-pointer"
          />
          <label htmlFor="keep-login" className="text-white/80 text-sm cursor-pointer">
            로그인 상태 유지
          </label>
        </div>

        {/* 에러 */}
        {error && (
          <p className="text-red-300 text-sm text-center -mt-4">{error}</p>
        )}

        {/* 로그인 버튼 */}
        <button
          className="w-full py-4 rounded-2xl bg-white text-blue-600 font-bold text-base active:scale-95 transition-transform disabled:opacity-60"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </div>

      {/* 하단 */}
      <p className="mt-16 text-white/50 text-sm">
        접근 권한이 없으신가요?{' '}
        <a href="mailto:forsea@netlog.kr" className="text-white underline underline-offset-2">
          관리자에게 문의하기
        </a>
      </p>
    </div>
  )
}