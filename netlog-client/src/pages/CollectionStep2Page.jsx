import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import DashboardLayout from '../components/DashboardLayout'
import side3 from '../assets/side3.svg'
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

export default function CollectionStep2Page() {
  const navigate = useNavigate()
  const { collectionId } = useParams()

  const DRAFT_KEY = `draft_step2_${collectionId}`
  const DRAFT_STEP_KEY = `draft_step_${collectionId}`
  const [record, setRecord] = useState(null)
  const [racks, setRacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [rackInputs, setRackInputs] = useState({})
  const [draftRestored, setDraftRestored] = useState(false)

  const handleLogout = () => { localStorage.removeItem('admin_token'); navigate('/dashboard/login') }

  useEffect(() => {
    Promise.all([
      axiosInstance.get(`/dashboard/collection-records/${collectionId}`),
      axiosInstance.get('/dashboard/racks')
    ]).then(([recordRes, racksRes]) => {
      const rec = recordRes.data.data
      setRecord(rec)
      setRacks(racksRes.data.data.items)

      // 임시저장 복원 시도
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        try {
          const draft = JSON.parse(saved)
          setRackInputs(draft)
          setDraftRestored(true)
          setTimeout(() => setDraftRestored(false), 3000)
        } catch (e) {
          // 파싱 실패 시 기본값으로
          const init = {}
          rec.sites.forEach(s => { init[s.detail_id] = { A: '', B: '', C: '', D: '' } })
          setRackInputs(init)
        }
      } else {
        const init = {}
        rec.sites.forEach(s => { init[s.detail_id] = { A: '', B: '', C: '', D: '' } })
        setRackInputs(init)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [collectionId])

  // 입력값 변경 시 자동 임시저장
  useEffect(() => {
    if (loading || Object.keys(rackInputs).length === 0) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rackInputs))
  }, [rackInputs])

  const getRack = (code) => racks.find(r => r.rack_code === code) || { current_count: 0, max_capacity: 50 }
  const getSiteTotal = (detailId) => Object.values(rackInputs[detailId] || {}).reduce((sum, v) => sum + (parseInt(v) || 0), 0)
  const totalAll = record?.sites.reduce((sum, s) => sum + getSiteTotal(s.detail_id), 0) || 0
  const canSubmit = totalAll > 0 && !submitting

  const handleRackInput = (detailId, rackCode, value) => {
    setRackInputs(prev => ({ ...prev, [detailId]: { ...prev[detailId], [rackCode]: value } }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const sites = record.sites.map(site => ({
        detail_id: site.detail_id, site_id: site.site_id,
        racks: Object.entries(rackInputs[site.detail_id] || {}).filter(([, v]) => parseInt(v) > 0).map(([rack_code, bag_count]) => ({ rack_code, bag_count: parseInt(bag_count) }))
      }))
      await axiosInstance.post(`/dashboard/collection-records/${collectionId}/stacking`, { sites })
      // 정식 제출 성공 시 임시저장 관련 키 모두 삭제
      localStorage.removeItem(DRAFT_KEY)
      localStorage.removeItem(DRAFT_STEP_KEY)
      navigate(`/dashboard/collections/${collectionId}/step3`)
    } catch (e) {
      const detail = e.response?.data?.detail
      setError(typeof detail === 'object' && detail?.message ? detail.message : '저장에 실패했습니다')
      console.error(e)
    } finally { setSubmitting(false) }
  }

const handleSaveDraft = () => {
  // rackInputs는 이미 자동저장되므로 localStorage 데이터는 유지
  // 임시저장 스텝 마크만 갱신
  localStorage.setItem(DRAFT_STEP_KEY, '2')
  navigate('/dashboard/collections')
}

if (loading) return <DashboardLayout onLogout={handleLogout}><div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF' }}>불러오는 중...</div></DashboardLayout>

const RACK_CODES = ['A', 'B', 'C', 'D']

return (
  <DashboardLayout onLogout={handleLogout} bgColor="#F9FAFB">

    {/* 임시저장 복원 토스트 */}
    {draftRestored && (
      <div style={{
        position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: '#1D4ED8', color: '#fff',
        padding: '10px 20px', borderRadius: '10px',
        fontSize: '13px', fontWeight: 600, zIndex: 100,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        💾 이전에 입력하던 내용을 불러왔습니다
      </div>
    )}

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

    <div style={{ maxWidth: '900px', width: '100%', margin: '0 auto', padding: '0 32px 120px' }}>
      <Stepper current={2} />

      {record?.sites.map(site => {
        const siteTotal = getSiteTotal(site.detail_id)
        return (
          <div key={site.detail_id} style={{ marginBottom: '32px' }}>
            <div style={{ backgroundColor: '#EFF6FF', borderRadius: '14px', border: '2px solid #BFDBFE', padding: '20px 24px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>{site.site_name}</p>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6B7280' }}>{site.site_code}{site.address ? ` · ${site.address}` : ''}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#6B7280' }}>계획: {site.bag_count}자루</span>
                {siteTotal > 0 && <p style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700, color: '#0055FF' }}>실제 적재: {siteTotal}자루</p>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {RACK_CODES.map(code => {
                const rack = getRack(code)
                const inputVal = parseInt(rackInputs[site.detail_id]?.[code]) || 0
                const afterCount = rack.current_count + inputVal
                const afterPct = Math.min((afterCount / rack.max_capacity) * 100, 100)
                const isRackOver = afterCount > rack.max_capacity
                const hasInput = inputVal > 0
                return (
                  <div key={code} style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1.5px solid ${isRackOver ? '#FCA5A5' : hasInput ? '#BFDBFE' : '#F3F4F6'}`, padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: hasInput ? '#0055FF' : '#F3F4F6', color: hasInput ? '#fff' : '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>{code}</div>
                        <div>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#111827' }}>{code}구역</p>
                          <p style={{ margin: 0, fontSize: '12px', color: '#9CA3AF' }}>{rack.current_count}/{rack.max_capacity}자루 적재 중</p>
                        </div>
                      </div>
                      {hasInput && <span style={{ fontSize: '13px', fontWeight: 600, color: isRackOver ? '#EF4444' : '#0055FF' }}>→ 합계 {afterCount}자루</span>}
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#F3F4F6', borderRadius: '4px', marginBottom: '16px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '4px', backgroundColor: isRackOver ? '#EF4444' : '#0055FF', width: `${afterPct}%`, transition: 'width 0.2s ease' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#6B7280', whiteSpace: 'nowrap' }}>이번 배분 :</span>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input type="number" min="0" value={rackInputs[site.detail_id]?.[code] || ''} onChange={e => handleRackInput(site.detail_id, code, e.target.value)}
                          style={{ width: '100%', padding: '10px 40px 10px 12px', border: `1.5px solid ${isRackOver ? '#FCA5A5' : '#E5E7EB'}`, borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', backgroundColor: isRackOver ? '#FEF2F2' : '#fff', color: '#111827' }} />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9CA3AF' }}>자루</span>
                      </div>
                    </div>
                    {isRackOver && <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#EF4444' }}>용량 초과! (최대 {rack.max_capacity - rack.current_count}자루 추가 가능)</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {error && <p style={{ color: '#EF4444', fontSize: '13px', textAlign: 'center', padding: '12px', backgroundColor: '#FEF2F2', borderRadius: '8px', marginBottom: '16px' }}>{error}</p>}
    </div>

    <div style={{ position: 'fixed', bottom: 0, left: window.innerWidth >= 768 ? '56px' : 0, right: 0, backgroundColor: '#fff', borderTop: '1px solid #F3F4F6', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
      <button onClick={() => navigate(-1)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#fff', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>← 이전</button>
      <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>총 {totalAll}자루 적재</span>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={handleSaveDraft} style={{ padding: '12px 24px', borderRadius: '10px', border: '1.5px solid #6B7280', backgroundColor: '#fff', fontSize: '14px', color: '#6B7280', fontWeight: 600, cursor: 'pointer' }}>
          💾 임시저장
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit} style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', backgroundColor: canSubmit ? '#0055FF' : '#E5E7EB', color: canSubmit ? '#fff' : '#9CA3AF', fontSize: '14px', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {submitting ? '저장 중...' : '수거 완료 →'}
        </button>
      </div>
    </div>
  </DashboardLayout>
)
}