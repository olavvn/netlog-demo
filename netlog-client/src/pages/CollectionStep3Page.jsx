import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import DashboardLayout from '../components/DashboardLayout'
import side3 from '../assets/side3.svg'
import check_icon from '../assets/check_icon.svg'
import { activeFilter } from '../components/DashboardLayout'


function Stepper({ current }) {
  const steps = ['수거 정보', '보관 장소', '수거 완료']
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
      {steps.map((label, idx) => {
        const num = idx + 1
        const done = num < current
        const active = num === current
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: active || done ? '#0055FF' : '#F3F4F6', color: active || done ? '#fff' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>
                {done ? '✓' : num}
              </div>
              <span style={{ fontSize: '12px', fontWeight: active ? 600 : 400, color: active ? '#0055FF' : done ? '#0055FF' : '#9CA3AF' }}>{label}</span>
            </div>
            {idx < steps.length - 1 && <div style={{ width: '160px', height: '2px', marginBottom: '18px', backgroundColor: done ? '#0055FF' : '#F3F4F6' }} />}
          </div>
        )
      })}
    </div>
  )
}

export default function CollectionStep3Page() {
  const navigate = useNavigate()
  const { collectionId } = useParams()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleLogout = () => { localStorage.removeItem('admin_token'); navigate('/dashboard/login') }

  useEffect(() => {
    axiosInstance.get(`/dashboard/collection-records/${collectionId}`)
      .then(res => setRecord(res.data.data))
      .catch(console.error).finally(() => setLoading(false))
  }, [collectionId])

  const handleComplete = async () => {
    setSubmitting(true)
    setError('')
    try {
      // stacking POST 이후 상태는 이미 stacking_pending
      // stacking_pending → stacked 전환만 필요
      await axiosInstance.patch(`/dashboard/collection-records/${collectionId}/status`, { status: 'stacked' })
      navigate('/dashboard/collections')
    } catch (e) { setError('수거 완료 처리에 실패했습니다'); console.error(e) }
    finally { setSubmitting(false) }
  }

  const rackSummary = record?.sites?.flatMap(s => s.racks || [])
    .reduce((acc, r) => {
      const existing = acc.find(a => a.rack_code === r.rack_code)
      if (existing) existing.bag_count += r.bag_count
      else acc.push({ ...r })
      return acc
    }, [])
    .map(r => `${r.rack_code} 구역 : ${r.bag_count}자루`).join(' · ') || '-'

  const totalBags = record?.sites?.reduce((sum, s) => sum + (s.actual_bag_count || s.bag_count || 0), 0) || 0
  const totalWeight = record?.total_weight_kg
  const siteName = record?.sites?.map(s => s.site_name).join(', ') || '-'
  const collectedAt = record?.collected_at ? new Date(record.collected_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'

  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #E5E7EB' }

  if (loading) return <DashboardLayout onLogout={handleLogout}><div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF' }}>불러오는 중...</div></DashboardLayout>

  return (
    <DashboardLayout onLogout={handleLogout}>
      {/* 헤더 */}
      <div style={{
        backgroundColor: '#fff',
        padding: '16px 28px',
        display: 'flex',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        justifyContent: 'space-between',
        borderBottom: '1px solid #DDE2EF'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={side3} width="22" height="22" style={{ filter: activeFilter }} />
          <span style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
            수거 정보 입력
          </span>
        </div>
      </div>

      <div style={{ maxWidth: '720px', width: '100%', margin: '0 auto', padding: '0 24px 120px' }}>
        <Stepper current={3} />

        <div style={{ textAlign: 'center', marginTop: '24px', marginBottom: '32px' }}>
          <img src={check_icon} alt="" width="48" height="48" style={{ display: 'block', margin: '0 auto 16px' }} />
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#111827' }}>수거 정보 확인 및 등록</h2>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#9CA3AF' }}>아래 내용을 확인하고 수거를 완료하세요.</p>
        </div>

        <div style={{ backgroundColor: '#0055FF1A', borderRadius: '16px', padding: '0 32px', width: 'calc(100% + 32px)', marginLeft: '-16px', boxSizing: 'border-box' }}>
          <div style={rowStyle}><span style={{ fontSize: '14px', color: '#6B7280' }}>집하장</span><span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{siteName}</span></div>
          <div style={rowStyle}><span style={{ fontSize: '14px', color: '#6B7280' }}>총 자루 수</span><span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{totalBags}자루</span></div>
          <div style={rowStyle}><span style={{ fontSize: '14px', color: '#6B7280' }}>계근 무게</span><span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{totalWeight ? `${totalWeight} kg` : '-'}</span></div>
          <div style={rowStyle}><span style={{ fontSize: '14px', color: '#6B7280' }}>구역 별 보관</span><span style={{ fontSize: '15px', fontWeight: 600, color: '#111827', textAlign: 'right', maxWidth: '60%' }}>{rackSummary}</span></div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}><span style={{ fontSize: '14px', color: '#6B7280' }}>일시</span><span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{collectedAt}</span></div>
        </div>

        {error && <p style={{ color: '#EF4444', fontSize: '13px', textAlign: 'center', marginTop: '16px', padding: '12px', backgroundColor: '#FEF2F2', borderRadius: '8px' }}>{error}</p>}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: window.innerWidth >= 768 ? '56px' : 0, right: 0, backgroundColor: '#fff', borderTop: '1px solid #F3F4F6', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <button onClick={() => navigate(-1)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#fff', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>← 이전</button>
        <button onClick={handleComplete} disabled={submitting} style={{ padding: '12px 28px', borderRadius: '10px', border: 'none', backgroundColor: '#0055FF', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? '처리 중...' : '수거 완료'}
        </button>
      </div>
    </DashboardLayout>
  )
}