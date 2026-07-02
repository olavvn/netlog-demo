import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import DashboardLayout, { activeFilter } from '../components/DashboardLayout'
import side4 from '../assets/side4.svg'

function Step1({ onNext }) {
  const [bagCount, setBagCount] = useState('')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleCalculate = async () => {
    if (!bagCount || parseInt(bagCount) <= 0) return
    setLoading(true)
    try {
      const res = await axiosInstance.get('/dashboard/racks')
      const needed = parseInt(bagCount)
      const plan = []
      let remaining = needed
      for (const rack of res.data.data.items.sort((a, b) => a.rack_code.localeCompare(b.rack_code))) {
        if (remaining <= 0) break
        const take = Math.min(rack.current_count, remaining)
        if (take > 0) { plan.push({ rack_code: rack.rack_code, bag_count: take }); remaining -= take }
      }
      setPreview({ bagCount: needed, plan })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '32px', fontWeight: 700, color: '#111827' }}>공정에 투입할 마대자루 수</h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#9CA3AF', textAlign: 'center' }}>입력한 수량만큼 날짜 기준 선입선출(FIFO)로<br/>투입 대상이 자동 선정됩니다.</p>
        <div style={{ position: 'relative', width: '200px', margin: 30 }}>
          <input type="number" value={bagCount} onChange={e => { setBagCount(e.target.value); setPreview(null) }}
            style={{ width: '100%', padding: '12px 48px 12px 16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '16px', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} placeholder="0" />
          <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '14px' }}>자루</span>
        </div>
        <button onClick={handleCalculate} disabled={!bagCount || parseInt(bagCount) <= 0 || loading}
          style={{ padding: '14px 160px', borderRadius: '12px', border: 'none', backgroundColor: bagCount && parseInt(bagCount) > 0 ? '#0055FF' : '#E5E7EB', color: bagCount && parseInt(bagCount) > 0 ? '#fff' : '#9CA3AF', fontSize: '15px', fontWeight: 600, cursor: bagCount ? 'pointer' : 'not-allowed' }}>
          {loading ? '계산 중...' : '선입선출 계산 →'}
        </button>
      </div>

      {preview && (
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #F3F4F6', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: '#111827' }}>선입선출(FIFO) 투입 예정 내역</h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 10px', borderRadius: '999px', backgroundColor: '#EFF6FF', color: '#0055FF', fontSize: '12px', fontWeight: 500 }}>총 {preview.bagCount}자루</span>
            <span style={{ padding: '4px 10px', borderRadius: '999px', backgroundColor: '#F0FDF4', color: '#16A34A', fontSize: '12px', fontWeight: 500 }}>{preview.plan.map(p => `${p.rack_code}구역`).join(' · ')}</span>
          </div>
          {preview.plan.map(p => (
            <div key={p.rack_code} style={{ backgroundColor: '#F9FAFB', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '8px', backgroundColor: '#0055FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>{p.rack_code}</div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{p.rack_code}구역</span>
              </div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0055FF' }}>{p.bag_count}자루</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
            <button onClick={() => setPreview(null)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#fff', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>← 이전</button>
            <button onClick={() => onNext(preview)} style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', backgroundColor: '#0055FF', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>공정 투입 대기 등록</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProcessingPage() {
  const navigate = useNavigate()
  const [racks, setRacks] = useState([])
  const [totalStored, setTotalStored] = useState(0)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(null)

  const handleLogout = () => { localStorage.removeItem('admin_token'); navigate('/dashboard/login') }

  useEffect(() => {
    Promise.all([axiosInstance.get('/dashboard/racks'), axiosInstance.get('/dashboard/racks/summary')])
      .then(([r, s]) => { setRacks(r.data.data.items); setTotalStored(s.data.data.total_stored_bag_count) })
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (preview) => {
    try {
      const res = await axiosInstance.post('/dashboard/processing/bundles', { bag_count: preview.bagCount })
      setSuccess(res.data.data)
    } catch (e) { console.error(e); alert('공정 투입 등록에 실패했습니다') }
  }

  return (
    <DashboardLayout onLogout={handleLogout} bgColor="#F0F3FA">
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
          <img src={side4} width="22" height="22" style={{ filter: activeFilter }} />
          <span style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
            공정 투입
          </span>
        </div>
      </div>

      {/* 요약 카드 - 구역별 적재 현황 */}
      <div style={{ padding: '28px 28px 0' }}>
        <p style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: '#111827' }}>전체 <span style={{ fontSize: '32px' }}>{totalStored}</span>자루 보관 중</p>
        {loading ? (
          <div style={{ display: 'flex', gap: '16px' }}>
            {[1, 2, 3, 4].map(i => <div key={i} style={{ flex: 1, height: '120px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {racks.map(rack => {
              const pct = Math.min((rack.current_count / rack.max_capacity) * 100, 100)
              return (
                <div key={rack.rack_code} style={{ flex: '1 1 0', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#111827' }}>{rack.rack_code}구역</p>
                      <p style={{ margin: 0, fontSize: '16px', color: '#9CA3AF' }}>{rack.current_count}/{rack.max_capacity}자루 적재 중</p>
                    </div>
                  </div>
                  <div style={{ height: '10px', backgroundColor: '#E5E7EB', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#0055FF', borderRadius: '5px' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 공정 투입 입력 */}
      <div style={{ marginTop: '40px', backgroundColor: '#fff', minHeight: '100vh', borderTopLeftRadius: '30px', borderTopRightRadius: '30px', overflow: 'hidden', boxShadow: '0 -6px 15px rgba(59, 130, 246, 0.10)' }}>
        <div style={{ padding: '20px 24px' }}>
          {loading ? <div style={{ textAlign: 'center', padding: '48px', color: '#9CA3AF' }}>불러오는 중...</div> :
            <Step1 onNext={handleSubmit} />}
        </div>
      </div>

      {success && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '32px', width: '320px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>✅</div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>공정 투입 대기 등록이<br/>완료되었습니다.</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#9CA3AF' }}>{success.bundle_id?.slice(0, 8).toUpperCase()}</p>
            <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
              <button onClick={() => navigate('/dashboard/status')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#fff', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>공정 현황 바로가기</button>
              <button onClick={() => setSuccess(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#0055FF', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>확인</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
