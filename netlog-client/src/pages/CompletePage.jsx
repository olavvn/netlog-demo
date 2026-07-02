import { useLocation, useNavigate } from 'react-router-dom'
import checkIcon from '../assets/check_icon_2.png'

export default function CompletePage() {
  const { state } = useLocation()
  const navigate = useNavigate()

  const result = state?.result
  const siteName = state?.siteName || '집하장'

  const formatDate = (isoString) => {
    const date = new Date(isoString)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const ampm = hours < 12 ? '오전' : '오후'
    const displayHours = hours % 12 || 12
    return `${month.toString().padStart(2, '0')}. ${day.toString().padStart(2, '0')} ${ampm} ${displayHours}:${minutes}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-400 to-blue-700 flex flex-col items-center justify-between px-8 py-16">

      {/* 상단 체크 아이콘 + 타이틀 */}
      <div className="flex flex-col items-center gap-6 mt-8">
        <div className="w-20 h-20 flex items-center justify-center">
          <img src={checkIcon} alt="완료" className="w-20 h-20 object-contain brightness-0 invert" />
        </div>
        <h1 className="text-white text-3xl font-bold text-center leading-snug">
          수거 인증이<br />완료되었습니다!
        </h1>
      </div>

      {/* 정보 카드 */}
      <div className="w-full">
        {/* 구분선 */}
        <div className="h-px bg-white/30 mb-5" />

        {/* 상세 정보 */}
        <div className="flex flex-col gap-4 mb-5">
          <div className="flex justify-between items-center">
            <span className="text-white/70 text-base">항구명</span>
            <span className="text-white text-base font-medium">{siteName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/70 text-base">선박명</span>
            <span className="text-white text-base font-medium">{result?.vessel_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/70 text-base">자루 수</span>
            <span className="text-white text-base font-medium">{result?.bag_count} 자루</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/70 text-base">일시</span>
            <span className="text-white text-base font-medium">
              {result?.inspected_at ? formatDate(result.inspected_at) : '-'}
            </span>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-white/30 mb-5" />

        {/* 누적 수량 */}
        <div className="flex justify-between items-center mb-10">
          <span className="text-white text-base">누적 수량</span>
          <span className="text-white text-3xl font-bold">
            {result?.total_remaining_bag_count} 자루
          </span>
        </div>

        {/* 버튼 */}
        <button
          className="w-full py-4 rounded-2xl bg-white text-blue-600 font-bold text-base active:scale-95 transition-transform"
          onClick={() => navigate('/checker')}
        >
          새로운 수거 등록하기
        </button>
      </div>
    </div>
  )
}