import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import logo from '../assets/logo.svg'

export default function DashboardSignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('operator') // 기본값 operator
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!name || !loginId || !password) {
      setError('이름, 아이디, 비밀번호를 모두 입력해주세요')
      return
    }
    setLoading(true)
    setError('')
    try {
      await axiosInstance.post('/auth/manager/signup', {
        name,
        login_id: loginId,
        password,
        role,
      })
      alert('관리자 계정 등록이 완료되었습니다. 로그인 화면으로 이동합니다.')
      navigate('/dashboard/login')
    } catch (err) {
      setError(err.response?.data?.message || '등록 중 오류가 발생했습니다. 아이디 중복을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-12 px-8"
      style={{ background: 'linear-gradient(160deg, #4A90E2 0%, #1A4FC4 100%)' }}
    >
      {/* 로고 */}
      <div className="mb-10 text-center">
        <img
          src={logo}
          alt="NETLOG"
          className="h-12 mx-auto object-contain"
          onError={e => { e.target.style.display = 'none' }}
        />
        <h1 className="text-white text-2xl font-bold text-center mt-2">
          관리자 계정 생성 (회원가입)
        </h1>
      </div>

      {/* 폼 카드 */}
      <div className="w-full max-w-sm flex flex-col gap-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8">
        
        {/* 이름 */}
        <div className="flex flex-col gap-2">
          <label className="text-white text-sm font-medium">이름</label>
          <input
            className="bg-transparent border-b border-white/50 text-white text-base py-2 outline-none placeholder:text-white/30 focus:border-white transition-colors"
            placeholder="이름을 입력하세요"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        {/* 아이디 */}
        <div className="flex flex-col gap-2">
          <label className="text-white text-sm font-medium">아이디</label>
          <input
            className="bg-transparent border-b border-white/50 text-white text-base py-2 outline-none placeholder:text-white/30 focus:border-white transition-colors"
            placeholder="아이디를 입력하세요"
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
          />
        </div>

        {/* 비밀번호 */}
        <div className="flex flex-col gap-2">
          <label className="text-white text-sm font-medium">비밀번호</label>
          <div className="relative">
            <input
              className="w-full bg-transparent border-b border-white/50 text-white text-base py-2 outline-none placeholder:text-white/30 focus:border-white transition-colors pr-8"
              type={showPw ? 'text' : 'password'}
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={e => setPassword(e.target.value)}
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

        {/* 역할 선택 */}
        <div className="flex flex-col gap-2">
          <label className="text-white text-sm font-medium">권한 역할 (Role)</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full bg-blue-700/60 border border-white/30 text-white text-base py-2 px-3 rounded-xl outline-none focus:border-white transition-colors cursor-pointer"
          >
            <option className="bg-blue-800 text-white" value="operator">Operator (운영팀)</option>
            <option className="bg-blue-800 text-white" value="admin">Admin (최고 관리자)</option>
          </select>
        </div>

        {/* 에러 */}
        {error && (
          <p className="text-red-300 text-sm text-center mt-2">{error}</p>
        )}

        {/* 가입 버튼 */}
        <div className="flex flex-col gap-2 mt-4">
          <button
            className="w-full py-3.5 rounded-2xl bg-white text-blue-600 font-bold text-base active:scale-95 transition-transform disabled:opacity-60"
            onClick={handleSignup}
            disabled={loading}
          >
            {loading ? '가입 중...' : '계정 생성 완료'}
          </button>
          <button
            className="w-full py-3.5 rounded-2xl bg-white/20 text-white font-bold text-base hover:bg-white/30 active:scale-95 transition-all"
            onClick={() => navigate('/dashboard/login')}
            disabled={loading}
          >
            취소 및 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}
