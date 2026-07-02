import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import DashboardLayout, { activeFilter } from '../components/DashboardLayout'
import side2 from '../assets/side2.svg'
import truck from '../assets/truck.svg'
import toggle from '../assets/toggle.png'

function StatusBadge({ status }) {
  const map = {
    planned: { label: '대기', color: '#F59E0B', bg: '#FFFBEB' },
    in_progress: { label: '진행중', color: '#3B82F6', bg: '#EFF6FF' },
    completed: { label: '완료', color: '#10B981', bg: '#ECFDF5' },
    stacking_pending: { label: '적재대기', color: '#8B5CF6', bg: '#F5F3FF' },
    stacked: { label: '적재완료', color: '#6B7280', bg: '#F3F4F6' },
  }
  const s = map[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' }
  return <span style={{ fontSize: '12px', fontWeight: 600, color: s.color, backgroundColor: s.bg, padding: '2px 8px', borderRadius: '6px' }}>{s.label}</span>
}

export default function CollectionsPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [filterSite, setFilterSite] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('2026.05.20')
  const [filterDateTo, setFilterDateTo] = useState('2026.05.25')
  const [filterStatus, setFilterStatus] = useState([])
  const [filterDraftOnly, setFilterDraftOnly] = useState(false)

  const handleLogout = () => { localStorage.removeItem('admin_token'); navigate('/dashboard/login') }

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axiosInstance.get('/dashboard/collection-records')
      setRecords(res.data.data.items)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    axiosInstance.get('/dashboard/main/sites').then(res => setSites(res.data.data.items)).catch(console.error)
    fetchRecords()
  }, [fetchRecords])

  const toggleExpand = (id) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? [] : [id])
  }
  const toggleStatusFilter = (s) => {
    setFilterStatus(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s])
  }
  const handleStart = () => {
    if (selectedIds.length === 0) return
    const id = selectedIds[0]
    const record = records.find(r => r.collection_id === id)
    if (!record) return

    if (record.status === 'stacked') return

    if (record.status === 'completed' || record.status === 'stacking_pending') {
      navigate(`/dashboard/collections/${id}/step3`)
    } else {
      const draftStep = localStorage.getItem(`draft_step_${id}`)
      if (draftStep === '2') {
        navigate(`/dashboard/collections/${id}/step2`)
      } else {
        navigate(`/dashboard/collections/${id}/step1`)
      }
    }
  }

  const selectedRecord = records.find(r => r.collection_id === selectedIds[0])
  const canStart = selectedRecord && selectedRecord.status !== 'stacked'

  const filtered = records.filter(r => {
    if (filterSite && !r.sites.some(s => s.site_id === filterSite)) return false
    if (filterStatus.length > 0 && !filterStatus.includes(r.status)) return false
    if (filterDraftOnly && !localStorage.getItem(`draft_step_${r.collection_id}`)) return false
    return true
  })

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
          <img src={side2} width="22" height="22" style={{ filter: activeFilter }} />
          <span style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
            수거 관리
          </span>
        </div>
      </div>

      <div>
        {/* 필터 영역 */}
        <div style={{
          backgroundColor: '#F0F3FA',
          padding: '16px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          borderBottom: '1px solid #DDE2EF',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '60px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px', color: '#6B7280' }}>항구명:</span>
              <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
                style={{ border: '2px solid #E5E7EB', borderRadius: '8px', padding: '8px 18px', fontSize: '18px', color: '#111827', backgroundColor: '#fff', cursor: 'pointer', outline: 'none', appearance: 'none', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
                <option value="">전체 항구</option>
                {sites.map(s => <option key={s.site_id} value={s.site_id}>{s.site_name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px', color: '#6B7280' }}>날짜:</span>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '18px',
                  width: '150px',
                  outline: 'none',
                  color: '#111827',
                  backgroundColor: '#fff'
                }}
              />

              <span style={{ color: '#9CA3AF' }}>~</span>

              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '18px',
                  width: '150px',
                  outline: 'none',
                  color: '#111827',
                  backgroundColor: '#fff'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px', color: '#6B7280' }}>상태:</span>
              {[
                { key: 'planned', label: '대기' },
                { key: 'in_progress', label: '진행중' },
                /*{ key: 'completed', label: '완료' *},*/
                { key: 'stacking_pending', label: '적재대기' },
                { key: 'stacked', label: '적재완료' }
              ].map(({ key, label }) => (
                <button key={key} onClick={() => toggleStatusFilter(key)}
                  style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '18px', border: `2px solid ${filterStatus.includes(key) ? '#0055FF' : '#E5E7EB'}`, backgroundColor: filterStatus.includes(key) ? '#EFF6FF' : '#fff', color: filterStatus.includes(key) ? '#0055FF' : '#4A5568', cursor: 'pointer', fontWeight: filterStatus.includes(key) ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setFilterDraftOnly(prev => !prev)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                fontSize: '16px',
                border: `2px solid ${filterDraftOnly ? '#D97706' : '#E5E7EB'}`,
                backgroundColor: filterDraftOnly ? '#FFFBEB' : '#fff',
                color: filterDraftOnly ? '#D97706' : '#4A5568',
                cursor: 'pointer',
                fontWeight: filterDraftOnly ? 600 : 400,
              }}
            >
              💾 임시저장
            </button>

            <button
              onClick={handleStart}
              disabled={!canStart}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 20px',
                borderRadius: '10px',
                border: '1px solid #E5E7EB',
                backgroundColor: canStart ? '#0055FF' : '#fff',
                color: canStart ? '#fff' : '#4A5568',
                fontSize: '16px',
                fontWeight: 500,
                cursor: canStart ? 'pointer' : 'not-allowed'
              }}
            >
              <img src={truck} alt="" className="w-6 h-6" style={{ filter: canStart ? 'brightness(0) invert(1)' : undefined }} />
              {selectedRecord && (selectedRecord.status === 'completed' || selectedRecord.status === 'stacking_pending') ? '보관 장소 입력' : '수거 시작'}
            </button>
          </div>
        </div>

        {/* 목록 영역 */}
        <div style={{
          backgroundColor: '#fff',
          minHeight: 'calc(100vh - 132px)',
          padding: '20px 28px'
        }}>
          <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '12px' }}>총 {filtered.length}건</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading ? [...Array(3)].map((_, i) => <div key={i} style={{ height: '72px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #F3F4F6' }} />) :
              filtered.length === 0 ? <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #F3F4F6', padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>수거 기록이 없습니다.</div> :
                filtered.map(record => {
                  const selected = selectedIds.includes(record.collection_id)
                  const expanded = expandedIds.has(record.collection_id)
                  const siteName = record.sites.map(s => s.site_name).join(', ')
                  const siteCode = record.sites.map(s => s.site_code).join(', ')
                  const totalPlannedBags = record.sites.reduce((sum, s) => sum + (s.bag_count || 0), 0)
                  const totalActualBags = record.sites.reduce((sum, s) => {
                    const val = parseInt(s.actual_bag_count, 10)
                    return sum + (isNaN(val) ? 0 : val)
                  }, 0)
                  const draftStep = localStorage.getItem(`draft_step_${record.collection_id}`)
                  return (
                    <div key={record.collection_id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: `2px solid ${selected ? '#BFDBFE' : '#F3F4F6'}`, overflow: 'hidden' }}>
                      <div style={{ padding: '32px 20px', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: selected ? '#EFF6FF' : '#fff' }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleSelect(record.collection_id)} style={{ width: '16px', height: '16px', accentColor: '#0055FF', cursor: 'pointer' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>{siteName}</span>
                            <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{siteCode}</span>
                            {draftStep && (
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#D97706', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '6px', padding: '2px 7px' }}>
                                💾 임시저장 (Step{draftStep})
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '14px', color: '#9CA3AF', margin: '2px 0 0' }}>수거 계획 관리자 : {record.manager_name}</p>
                          <div style={{ display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {record.planned_at && (
                              <span style={{ fontSize: '14px', color: '#6B7280' }}>
                                수거 계획 등록일: <span style={{ color: '#111827', fontWeight: 500 }}>{new Date(record.planned_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                            )}
                            {record.collected_at && (
                              <span style={{ fontSize: '14px', color: '#6B7280' }}>
                                수거 완료일: <span style={{ color: '#0055FF', fontWeight: 600 }}>{new Date(record.collected_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ textAlign: 'right' }}>
                            {['completed', 'stacking_pending', 'stacked'].includes(record.status) ? (
                              <div>
                                <span style={{ fontSize: '16px', fontWeight: 600, color: '#4B5563' }}>
                                  실제 <span style={{ color: '#0055FF', fontWeight: 700 }}>{totalActualBags}</span>자루 <span style={{ color: '#D1D5DB', margin: '0 6px' }}>|</span> 계획 <span style={{ fontWeight: 700, color: '#111827' }}>{totalPlannedBags}</span>자루
                                </span>
                                {record.total_weight_kg != null && (
                                  <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px', textAlign: 'right' }}>
                                    총 계근: <span style={{ fontWeight: 600, color: '#374151' }}>{record.total_weight_kg.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{totalPlannedBags}</span>
                                <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: '2px' }}>자루 (계획)</span>
                              </div>
                            )}
                          </div>
                          <StatusBadge status={record.status} />
                          <button onClick={() => toggleExpand(record.collection_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                            <img src={toggle} alt="" width="14" height="14" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div style={{ borderTop: '1px solid #F3F4F6', padding: '16px 20px', backgroundColor: '#F9FAFB' }}>
                          {record.sites.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {record.sites.map(site => {
                                const isFinished = ['completed', 'stacking_pending', 'stacked'].includes(record.status)
                                return (
                                  <div key={site.site_id} style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #F3F4F6', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{site.site_name}</span>
                                      <span style={{ fontSize: '12px', color: '#9CA3AF', marginLeft: '8px' }}>{site.site_code}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                      {site.weight_kg != null && (
                                        <span style={{ fontSize: '13px', color: '#6B7280' }}>
                                          계근: <span style={{ fontWeight: 600, color: '#374151' }}>{site.weight_kg.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg</span>
                                        </span>
                                      )}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {isFinished && !isNaN(parseInt(site.actual_bag_count, 10)) ? (
                                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#4B5563' }}>
                                            실제 <span style={{ color: '#0055FF', fontWeight: 700 }}>{parseInt(site.actual_bag_count, 10)}</span>자루 <span style={{ color: '#E5E7EB', margin: '0 4px' }}>|</span> 계획 {site.bag_count}자루
                                          </span>
                                        ) : (
                                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{site.bag_count}자루 (계획)</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                              {record.planned_at && <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '4px 0 0' }}>수거 계획 등록일: {new Date(record.planned_at).toLocaleDateString('ko-KR')}</p>}
                            </div>
                          ) : (
                            <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '14px', margin: 0 }}>완료된 수거 내역이 없습니다.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
            }
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}