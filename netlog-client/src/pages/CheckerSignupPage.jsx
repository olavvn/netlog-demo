import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import logo from '../assets/logo.png'

export default function CheckerSignupPage() {
  const navigate = useNavigate()
  const [siteCode, setSiteCode] = useState('')
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!siteCode || !name || !region || !latitude || !longitude || !pin) {
      setError('필수 입력 항목을 모두 채워주세요.')
      return
    }
    
    // PIN validation
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN 번호는 6자리 숫자여야 합니다.')
      return
    }

    const latVal = parseFloat(latitude)
    const lngVal = parseFloat(longitude)
    if (isNaN(latVal) || isNaN(lngVal)) {
      setError('위도와 경도는 올바른 숫자여야 합니다.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await axiosInstance.post('/auth/site/signup', {
        site_code: siteCode.toUpperCase(),
        name,
        region,
        address: address || null,
        latitude: latVal,
        longitude: lngVal,
        pin
      })
      alert('집하장(검수자) 등록이 완료되었습니다. 로그인 화면으로 이동합니다.')
      navigate('/checker/login')
    } catch (err) {
      setError(err.response?.data?.message || '등록 중 오류가 발생했습니다. 아이디 중복을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-blue-800 flex flex-col items-center justify-center py-12 px-6">
      {/* 로고 */}
      <div className="mb-6 flex flex-col items-center gap-3">
        <img src={logo} alt="넷로그 로고" className="w-20 h-20 object-contain" />
        <h1 className="text-white text-3xl font-bold tracking-tight">
          집하장 등록 (회원가입)
        </h1>
      </div>

      {/* 카드 */}
      <div className="w-full max-w-md bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 flex flex-col gap-4">
        {/* 집하장 ID */}
        <div className="flex flex-col gap-1">
          <label className="text-white/85 text-sm font-medium">집하장 ID (필수)</label>
          <input
            className="w-full px-4 py-2.5 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
            placeholder="예: GIJANG-001"
            value={siteCode}
            onChange={(e) => setSiteCode(e.target.value)}
          />
        </div>

        {/* 집하장명 */}
        <div className="flex flex-col gap-1">
          <label className="text-white/85 text-sm font-medium">집하장명 (필수)</label>
          <input
            className="w-full px-4 py-2.5 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
            placeholder="예: 기장항 집하장"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* 지역 */}
        <div className="flex flex-col gap-1">
          <label className="text-white/85 text-sm font-medium">지역 (필수)</label>
          <input
            className="w-full px-4 py-2.5 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
            placeholder="예: 부산 기장군"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>

        {/* 주소 */}
        <div className="flex flex-col gap-1">
          <label className="text-white/85 text-sm font-medium">상세주소 (선택)</label>
          <input
            className="w-full px-4 py-2.5 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
            placeholder="예: 부산광역시 기장군 기장읍 대변리 123"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        {/* 위도 & 경도 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-white/85 text-sm font-medium">위도 (필수)</label>
            <input
              className="w-full px-4 py-2.5 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
              placeholder="예: 35.2443"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-white/85 text-sm font-medium">경도 (필수)</label>
            <input
              className="w-full px-4 py-2.5 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
              placeholder="예: 129.2211"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>
        </div>

        {/* PIN 번호 */}
        <div className="flex flex-col gap-1">
          <label className="text-white/85 text-sm font-medium">PIN 번호 (필수)</label>
          <input
            className="w-full px-4 py-2.5 rounded-xl bg-white/90 text-gray-800 text-base outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
            type="password"
            placeholder="6자리 숫자"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>

        {/* 에러 메시지 */}
        {error && (
          <p className="text-red-300 text-sm text-center">{error}</p>
        )}

        {/* 버튼들 */}
        <div className="flex flex-col gap-2 mt-2">
          <button
            className="w-full py-3 rounded-xl bg-white text-blue-700 font-bold text-base active:scale-95 transition-transform disabled:opacity-60"
            onClick={handleSignup}
            disabled={loading}
          >
            {loading ? '등록 중...' : '등록 완료'}
          </button>
          <button
            className="w-full py-3 rounded-xl bg-white/20 text-white font-bold text-base hover:bg-white/30 active:scale-95 transition-all"
            onClick={() => navigate('/checker/login')}
            disabled={loading}
          >
            취소 및 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}
