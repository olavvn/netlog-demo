import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import DashboardLayout, { activeFilter } from '../components/DashboardLayout'
import side5 from '../assets/side5.svg'

function StatusBadge({ status }) {
  const map = {
    ready: { label: '대기', color: '#F59E0B', bg: '#FFFBEB' },
    in_progress: { label: '진행중', color: '#3B82F6', bg: '#EFF6FF' },
    completed: { label: '완료', color: '#10B981', bg: '#ECFDF5' },
  }
  const s = map[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' }
  return <span style={{ fontSize: '12px', fontWeight: 600, color: s.color, backgroundColor: s.bg, padding: '6px 4px', borderRadius: '999px', textAlign: 'center', display: 'block' }}>{s.label}</span>
}

export default function StatusPage() {
  const navigate = useNavigate()
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBundle, setSelectedBundle] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [filterRacks, setFilterRacks] = useState([])

  const handleLogout = () => { localStorage.removeItem('admin_token'); navigate('/dashboard/login') }

  const fetchBundles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axiosInstance.get('/dashboard/processing/bundles')
      setBundles(res.data.data.items)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBundles() }, [fetchBundles])

  const handleStatusUpdate = async (bundleId, newStatus) => {
    setUpdating(true)
    try {
      await axiosInstance.patch(`/dashboard/processing/bundles/${bundleId}/status`, { status: newStatus })
      await fetchBundles()
      const updated = bundles.find(b => b.bundle_id === bundleId)
      if (updated) setSelectedBundle({ ...updated, status: newStatus })
    } catch (e) { console.error(e); alert('상태 변경에 실패했습니다') }
    finally { setUpdating(false) }
  }

  const toggleRackFilter = (rack) => {
    setFilterRacks(prev => prev.includes(rack) ? prev.filter(r => r !== rack) : [...prev, rack])
  }

  const nextStatus = (s) => s === 'ready' ? 'in_progress' : s === 'in_progress' ? 'completed' : null
  const nextStatusLabel = (s) => s === 'ready' ? '공정 시작' : s === 'in_progress' ? '공정 완료' : null

  return (
    <DashboardLayout onLogout={handleLogout}>
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
          <img src={side5} width="22" height="22" style={{ filter: activeFilter }} />
          <span style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
            공정 현황
          </span>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: selectedBundle ? '1fr 1fr' : '1fr', gap: '20px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #F3F4F6', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 160px 80px', padding: '12px 20px', backgroundColor: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
            {['공정 투입일', '자루 수', '무게', '공정 ID', '상태'].map(h => <span key={h} style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>{h}</span>)}
          </div>
          {loading ? [...Array(3)].map((_, i) => <div key={i} style={{ height: '56px', borderBottom: '1px solid #F9FAFB' }} />) :
            bundles.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>공정 데이터가 없습니다.</div> :
              bundles.map(bundle => (
                <div key={bundle.bundle_id} onClick={() => setSelectedBundle(selectedBundle?.bundle_id === bundle.bundle_id ? null : bundle)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 160px 80px', padding: '14px 20px', borderBottom: '1px solid #F9FAFB', backgroundColor: selectedBundle?.bundle_id === bundle.bundle_id ? '#EFF6FF' : '#fff', cursor: 'pointer', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{bundle.processed_at ? new Date(bundle.processed_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'}</span>
                  <span style={{ fontSize: '13px', color: '#111827' }}>{bundle.bag_count}자루</span>
                  <span style={{ fontSize: '13px', color: '#111827' }}>{(bundle.bag_count * 40).toLocaleString()}kg</span>
                  <span style={{ fontSize: '12px', color: '#6B7280' }}>{bundle.bundle_id?.slice(0, 8).toUpperCase()}</span>
                  <StatusBadge status={bundle.status} />
                </div>
              ))
          }
        </div>

        {selectedBundle ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #F3F4F6', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#111827' }}>{selectedBundle.bundle_id?.slice(0, 8).toUpperCase()}</p>
              <StatusBadge status={selectedBundle.status} />
            </div>
            <div style={{ backgroundColor: '#F9FAFB', borderRadius: '10px', padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div><p style={{ margin: 0, fontSize: '12px', color: '#9CA3AF' }}>총 자루 수</p><p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 700, color: '#111827' }}>{selectedBundle.bag_count}자루</p></div>
              <div><p style={{ margin: 0, fontSize: '12px', color: '#9CA3AF' }}>총 무게</p><p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 700, color: '#111827' }}>{(selectedBundle.bag_count * 40).toLocaleString()}kg</p></div>
            </div>
            {selectedBundle.rack_breakdown && Object.keys(selectedBundle.rack_breakdown).length > 0 && (
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#111827' }}>구역 별 투입 자루 수</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(selectedBundle.rack_breakdown).map(([rack, count]) => (
                    <span key={rack} style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: '#EFF6FF', color: '#0055FF', fontSize: '12px', fontWeight: 600 }}>{rack}구역 : {count}자루</span>
                  ))}
                </div>
                <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '8px' }}>
                  {Object.entries(selectedBundle.rack_breakdown).map(([rack, count], i) => {
                    const colors = ['#0055FF', '#10B981', '#F59E0B', '#EF4444']
                    return <div key={rack} style={{ width: `${(count / selectedBundle.bag_count) * 100}%`, backgroundColor: colors[i % colors.length] }} />
                  })}
                </div>
              </div>
            )}
            {selectedBundle.site_breakdown && Object.keys(selectedBundle.site_breakdown).length > 0 && (
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#111827' }}>집하장별 투입 자루 수</p>
                {Object.entries(selectedBundle.site_breakdown).map(([site, count]) => (
                  <div key={site} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F9FAFB' }}>
                    <span style={{ fontSize: '13px', color: '#6B7280' }}>{site}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{count}자루</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div><p style={{ margin: 0, fontSize: '12px', color: '#9CA3AF' }}>투입 시작일</p><p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: '#111827' }}>{selectedBundle.processed_at ? new Date(selectedBundle.processed_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'}</p></div>
              <div><p style={{ margin: 0, fontSize: '12px', color: '#9CA3AF' }}>공정 완료일</p><p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: '#111827' }}>{selectedBundle.status === 'completed' ? new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'}</p></div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#111827' }}>자루 개별 정보</p>
                {/* 렉 필터 버튼 */}
                {(() => {
                  const racks = [...new Set((selectedBundle.bags || []).map(b => b.rack_code).filter(Boolean))].sort()
                  if (racks.length === 0) return null
                  return (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {racks.map(rack => (
                        <button
                          key={rack}
                          onClick={() => toggleRackFilter(rack)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: `2px solid ${filterRacks.includes(rack) ? '#0055FF' : '#E5E7EB'}`,
                            backgroundColor: filterRacks.includes(rack) ? '#EFF6FF' : '#fff',
                            color: filterRacks.includes(rack) ? '#0055FF' : '#6B7280',
                          }}
                        >
                          {rack}렉
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 50px 100px 120px 80px', gap: '8px', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                {['자루 ID', '렉', '집하장', '적재 일시', '수거 ID'].map(h => <span key={h} style={{ fontSize: '12px', color: '#9CA3AF' }}>{h}</span>)}
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {(selectedBundle.bags || []).filter(bag => filterRacks.length === 0 || filterRacks.includes(bag.rack_code)).map(bag => {
                  const shortCollectionId = bag.collection_id ? bag.collection_id.slice(0, 8).toUpperCase() : '-'
                  const dateStr = bag.stored_at ? new Date(bag.stored_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'
                  return (
                    <div key={bag.bag_id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 50px 100px 120px 80px', gap: '8px', padding: '8px 0', borderBottom: '1px solid #F9FAFB', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#111827' }}>{bag.serial_number}</span>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>{bag.rack_code}</span>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>{bag.site_name}</span>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>{dateStr}</span>
                      <span style={{ fontSize: '11px', color: '#4B5563' }} title={bag.collection_id}>
                        {shortCollectionId}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            {nextStatus(selectedBundle.status) && (
              <button onClick={() => handleStatusUpdate(selectedBundle.bundle_id, nextStatus(selectedBundle.status))} disabled={updating}
                style={{ padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#0055FF', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: updating ? 0.7 : 1 }}>
                {updating ? '처리 중...' : nextStatusLabel(selectedBundle.status)}
              </button>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #F3F4F6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '8px' }}>
            <span style={{ fontSize: '32px' }}>⚙️</span>
            <p style={{ color: '#9CA3AF', fontSize: '14px', textAlign: 'center' }}>공정 ID를 클릭하면<br />상세 정보가 표시됩니다.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}