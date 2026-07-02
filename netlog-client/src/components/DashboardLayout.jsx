import { useNavigate, useLocation } from 'react-router-dom'
import side1 from '../assets/side1.svg'
import side2 from '../assets/side2.svg'
import side3 from '../assets/side3.svg'
import side4 from '../assets/side4.svg'
import side5 from '../assets/side5.svg'

const NAV_ITEMS = [
  { path: '/dashboard',             src: side1, label: '메인'    },
  { path: '/dashboard/collections', src: side2, label: '수거관리' },
  { path: '/dashboard/storage',     src: side3, label: '보관현황' },
  { path: '/dashboard/processing',  src: side4, label: '공정투입' },
  { path: '/dashboard/status',      src: side5, label: '공정현황' },
]

export const activeFilter = 'invert(13%) sepia(94%) saturate(4975%) hue-rotate(218deg) brightness(101%) contrast(103%)'
export const inactiveFilter = 'invert(67%) sepia(8%) saturate(414%) hue-rotate(182deg) brightness(94%) contrast(87%)'

export function Sidebar({ onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname

  if (window.innerWidth < 768) return null

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: '56px', backgroundColor: '#fff',
      borderRight: '1px solid #F3F4F6',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '16px 0', zIndex: 20
    }}>
      {NAV_ITEMS.map(({ path, src, label }) => {
        const active = currentPath.startsWith(path) && (path !== '/dashboard' || currentPath === '/dashboard')
        return (
          <button key={path} onClick={() => navigate(path)} title={label}
            style={{
              width: '40px', height: '40px', borderRadius: '10px', border: 'none',
              backgroundColor: active ? '#0055FF1A' : 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: '4px'
            }}>
            <img src={src} width="22" height="22" style={{ filter: active ? activeFilter : inactiveFilter }} />
          </button>
        )
      })}
      <div style={{ flex: 1 }} />
      <button onClick={onLogout}
        style={{
          width: '40px', height: '40px', borderRadius: '10px', border: 'none',
          backgroundColor: 'transparent', cursor: 'pointer',
          color: '#9CA3AF', fontSize: '11px'
        }}>로그아웃</button>
    </aside>
  )
}

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname

  if (window.innerWidth >= 768) return null

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      backgroundColor: '#fff', borderTop: '1px solid #F3F4F6',
      display: 'flex', zIndex: 20
    }}>
      {NAV_ITEMS.map(({ path, src, label }) => {
        const active = currentPath.startsWith(path) && (path !== '/dashboard' || currentPath === '/dashboard')
        return (
          <button key={path} onClick={() => navigate(path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '10px 0', border: 'none', backgroundColor: 'transparent',
              cursor: 'pointer', color: active ? '#0055FF' : '#9CA3AF',
              fontSize: '10px', gap: '3px'
            }}>
            <img src={src} width="22" height="22" style={{ filter: active ? activeFilter : inactiveFilter }} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default function DashboardLayout({ children, onLogout, bgColor = '#fff' }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: bgColor || '#F9FAFB' }}>
      <Sidebar onLogout={onLogout} />
      <div style={{
        marginLeft: window.innerWidth >= 768 ? '56px' : '0',
        paddingBottom: window.innerWidth < 768 ? '80px' : '0'
      }}>
        {children}
      </div>
      <BottomNav />
    </div>
  )
}