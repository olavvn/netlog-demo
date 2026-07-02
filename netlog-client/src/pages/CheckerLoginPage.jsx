import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import logo from '../assets/logo.png'

export default function CheckerLoginPage() {
  const navigate = useNavigate()
  const [siteCode, setSiteCode] = useState('')
  const [pin, setPin] = useState('')
  const [siteName, setSiteName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!siteCode || !pin) {
      setError('집하장 ID와 PIN을 입력해주세요')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await axiosInstance.post('/auth/site/login', {
        site_code: siteCode,
        pin: pin
      })
      const { access_token, site_id, site_name } = res.data.data
      localStorage.setItem('checker_token', access_token)
      localStorage.setItem('site_id', site_id)
      localStorage.setItem('site_name', site_name)
      localStorage.setItem('site_code', siteCode)
      navigate('/checker')
    } catch {
      setError('집하장 ID 또는 PIN이 올바르지 않습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen bg-gradient-to-b from-blue-500 to-blue-800 flex flex-col items-center justify-center px-6">

      {/* 로고 */}
      <div className="mb-8 flex flex-col items-center gap-3">
      <img src={logo} alt="넷로그 로고" className="w-25 h-25 object-contain" />
        <h1 className="text-white text-3xl font-bold tracking-tight">
          폐어망 수거 인증
        </h1>
      </div>

      {/* 카드 */}
      <div className="w-full max-w-sm flex flex-col gap-4">

        {/* 집하장 ID */}
        <div className="flex flex-col gap-1">
          <label className="text-white/80 text-sm">집하장 ID</label>
          <input
            className="w-full px-4 py-3 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
            placeholder="예 : GIJANG-001"
            value={siteCode}
            onChange={(e) => {
              setSiteCode(e.target.value)
              setSiteName('')
            }}
          />
          {siteName && (
            <p className="text-blue-200 text-sm flex items-center gap-1 mt-1">
              ✓ {siteName}
            </p>
          )}
        </div>

        {/* PIN 번호 */}
        <div className="flex flex-col gap-1">
          <label className="text-white/80 text-sm">PIN 번호</label>
          <input
            className="w-full px-4 py-3 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
            type="password"
            placeholder="6자리 PIN 번호"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>


        {/* 에러 메시지 */}
        {error && (
          <p className="text-red-300 text-sm text-center">{error}</p>
        )}

        {/* 로그인 버튼 */}
        <button
          className="w-full py-3 rounded-xl bg-white text-blue-700 font-bold text-base mt-2 active:scale-95 transition-transform disabled:opacity-60"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>

        {/* 회원가입 링크 */}
        <p className="text-white/60 text-sm text-center mt-4">
          처음이신가요?{' '}
          <Link to="/checker/signup" className="text-white underline underline-offset-2 hover:text-blue-100 transition-colors">
            집하장 등록 (회원가입)
          </Link>
        </p>
      </div>
    </div>
  )
}