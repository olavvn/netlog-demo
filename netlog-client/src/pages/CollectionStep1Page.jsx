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
            {idx < steps.length - 1 && <div style={{ width: '120px', height: '2px', marginBottom: '18px', backgroundColor: done ? '#0055FF' : '#F3F4F6' }} />}
          </div>
        )
      })}
    </div>
  )
}

export default function CollectionStep1Page() {
  const navigate = useNavigate()
  const { collectionId } = useParams()

  const DRAFT_KEY = `draft_step1_${collectionId}`
  const DRAFT_STEP_KEY = `draft_step_${collectionId}`
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const [transferPerson, setTransferPerson] = useState(localStorage.getItem('manager_name') || '')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [siteWeights, setSiteWeights] = useState({})

  const handleLogout = () => { localStorage.removeItem('admin_token'); navigate('/dashboard/login') }

  const completedCount = [
    transferPerson && vehicleNumber,
    Object.values(siteWeights).every(v => v > 0) && Object.keys(siteWeights).length > 0,
  ].filter(Boolean).length

  useEffect(() => {
    axiosInstance.get(`/dashboard/collection-records/${collectionId}`)
      .then(res => {
        const data = res.data.data
        setRecord(data)

        // 임시저장 복원 시도
        const saved = localStorage.getItem(DRAFT_KEY)
        if (saved) {
          try {
            const draft = JSON.parse(saved)
            if (draft.transferPerson) setTransferPerson(draft.transferPerson)
            if (draft.vehicleNumber) setVehicleNumber(draft.vehicleNumber)
            if (draft.siteWeights) setSiteWeights(draft.siteWeights)
            setDraftRestored(true)
            setTimeout(() => setDraftRestored(false), 3000)
          } catch {
            // 파싱 실패 시 무시
          }
        } else {
          // 임시저장 없으면 서버값으로 초기화
          const init = {}
          data.sites.forEach(s => { init[s.detail_id] = s.weight_kg || '' })
          setSiteWeights(init)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [collectionId])

  // 입력값 변경 시 자동 임시저장
  useEffect(() => {
    if (loading) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ transferPerson, vehicleNumber, siteWeights }))
  }, [transferPerson, vehicleNumber, siteWeights])

  const handleSubmit = async () => {
    if (!transferPerson || !vehicleNumber) { setError('운반 담당자와 차량 번호를 입력해주세요'); return }
    if (Object.values(siteWeights).some(v => !v || v <= 0)) { setError('모든 집하장의 계근 무게를 입력해주세요'); return }
    setSubmitting(true)
    setError('')
    try {
      await axiosInstance.patch(`/dashboard/collection-records/${collectionId}/info`, {
        transfer_person_name: transferPerson,
        vehicle_number: vehicleNumber,
        sites: record.sites.map(s => ({ detail_id: s.detail_id, weight_kg: parseFloat(siteWeights[s.detail_id]) }))
      })
      // 정식 제출 성공 시 임시저장 관련 키 모두 삭제
      localStorage.removeItem(DRAFT_KEY)
      localStorage.removeItem(DRAFT_STEP_KEY)
      navigate(`/dashboard/collections/${collectionId}/step2`)
    } catch (e) { setError('저장에 실패했습니다. 다시 시도해주세요'); console.error(e) }
    finally { setSubmitting(false) }
  }

  const handleSaveDraft = () => {
    // transferPerson/vehicleNumber/siteWeights는 이미 자동저장되므로 localStorage 데이터는 유지
    // 임시저장 스텝 마크만 갱신
    localStorage.setItem(DRAFT_STEP_KEY, '1')
    navigate('/dashboard/collections')
  }

  if (loading) return <DashboardLayout onLogout={handleLogout}><div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF' }}>불러오는 중...</div></DashboardLayout>

  const inputStyle = { width: '100%', padding: '12px 16px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '15px', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box', color: '#111827' }
  const labelStyle = { fontSize: '13px', color: '#6B7280', marginBottom: '6px', display: 'block' }

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

      <div style={{ maxWidth: '720px', width: '100%', margin: '0 auto', padding: '0 24px 120px' }}>
        <Stepper current={1} />

        {record?.sites.map(site => (
          <div key={site.site_id} style={{ backgroundColor: '#EFF6FF', borderRadius: '12px', border: '2px solid #BFDBFE', padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>{site.site_name}</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6B7280' }}>{site.site_code}{site.address ? ` · ${site.address}` : ''}</p>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#EF4444' }}>{site.bag_count}자루</span>
          </div>
        ))}

        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: transferPerson && vehicleNumber ? '#10B981' : '#0055FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>
              {transferPerson && vehicleNumber ? '✓' : '1'}
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>운반 정보</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>운반 담당자</label>
              <input style={inputStyle} placeholder="운반 담당자 이름을 입력하세요." value={transferPerson} onChange={e => setTransferPerson(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>차량 번호</label>
              <input style={inputStyle} placeholder="차량 번호를 입력하세요" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: '#F3F4F6', marginBottom: '24px' }} />

        {record?.sites.map((site, idx) => (
          <div key={site.detail_id} style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: siteWeights[site.detail_id] > 0 ? '#10B981' : '#0055FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>
                {siteWeights[site.detail_id] > 0 ? '✓' : idx + 2}
              </div>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>계근 무게 — {site.site_name}</span>
            </div>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle, paddingRight: '48px' }} type="number" placeholder="총 무게를 입력하세요."
                value={siteWeights[site.detail_id] || ''} onChange={e => setSiteWeights(prev => ({ ...prev, [site.detail_id]: e.target.value }))} />
              <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: '14px' }}>kg</span>
            </div>
          </div>
        ))}

        {error && <p style={{ color: '#EF4444', fontSize: '13px', textAlign: 'center', marginBottom: '16px' }}>{error}</p>}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: window.innerWidth >= 768 ? '56px' : 0, right: 0, backgroundColor: '#fff', borderTop: '1px solid #F3F4F6', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <button onClick={() => navigate(-1)} style={{ padding: '12px 20px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#fff', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>← 이전</button>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>{completedCount} / 3 입력완료</span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSaveDraft} disabled={submitting} style={{ padding: '12px 20px', borderRadius: '10px', border: '1.5px solid #6B7280', backgroundColor: '#fff', fontSize: '14px', color: '#6B7280', fontWeight: 600, cursor: 'pointer' }}>
            {submitting ? '저장 중...' : '💾 임시저장'}
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', backgroundColor: '#0055FF', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            {submitting ? '저장 중...' : '보관 장소 입력 →'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}