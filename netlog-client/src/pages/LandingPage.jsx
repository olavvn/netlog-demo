import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import logo from '../assets/logo.png'

const cards = [
  {
    key: 'map',
    icon: '🗺️',
    label: '현황 지도',
    desc: '폐어망 수거 현황을\n3D 지도로 확인하세요',
    path: '/map',
    accent: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    hover: 'hover:border-teal-400 hover:shadow-teal-100',
    arrow: 'text-teal-500',
  },
  {
    key: 'checker',
    icon: '📋',
    label: '검수자',
    desc: '수거 현장에서\n검수 작업을 진행하세요',
    path: '/checker/login',
    accent: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    hover: 'hover:border-blue-400 hover:shadow-blue-100',
    arrow: 'text-blue-500',
  },
  {
    key: 'admin',
    icon: '📊',
    label: '관리자',
    desc: '수거 데이터 전체를\n관리하고 분석하세요',
    path: '/dashboard/login',
    accent: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    hover: 'hover:border-violet-400 hover:shadow-violet-100',
    arrow: 'text-violet-500',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const els = document.querySelectorAll('.nav-card')
    els.forEach((el, i) => {
      el.style.opacity = '0'
      el.style.transform = 'translateY(1.5rem)'
      setTimeout(() => {
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease'
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      }, 200 + i * 100)
    })
  }, [])

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-6 py-16">

      {/* 로고 + 타이틀 */}
      <div className="flex flex-col items-center mb-12">
        <img
          src={logo}
          alt="NETLOG 로고"
          className="w-16 h-16 object-contain mb-4"
          onError={e => { e.target.style.display = 'none' }}
        />
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight m-0">
          NETLOG
        </h1>
        <p className="text-sm text-gray-400 mt-1 tracking-wide">
          폐어망 수거 추적 플랫폼
        </p>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl">
        {cards.map(card => (
          <button
            key={card.key}
            className={`nav-card flex flex-col gap-3 text-left bg-white rounded-2xl border-2 ${card.border} ${card.hover} hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 cursor-pointer`}
            onClick={() => navigate(card.path)}
          >
            {/* 아이콘 */}
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center text-xl`}>
              {card.icon}
            </div>

            {/* 텍스트 */}
            <div>
              <p className={`font-bold text-base ${card.accent} m-0 leading-tight`}>
                {card.label}
              </p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed whitespace-pre-line">
                {card.desc}
              </p>
            </div>

            {/* 화살표 */}
            <p className={`mt-auto text-sm font-semibold ${card.arrow} m-0`}>
              바로가기 →
            </p>
          </button>
        ))}
      </div>

      {/* 푸터 */}
      <p className="mt-16 text-xs text-gray-300 tracking-wide">
        © 2026 FORSEA × 넷스파
      </p>
    </div>
  )
}