import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '../api/axiosInstance'
import Calendar from 'react-calendar'
// import 'react-calendar/dist/Calendar.css'
import checkIcon from '../assets/check_icon.png'
import logo from '../assets/logo_small.png'
import camera from '../assets/cam.png'
import camera1 from '../assets/cam1.png'
import toggle from '../assets/toggle.png'
import extract_button from '../assets/extract_button.png'
import no_file from '../assets/no_file.png'

export default function CheckerPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const siteName = localStorage.getItem('site_name') || ''
  const siteCode = localStorage.getItem('site_code') || ''

  const [activeTab, setActiveTab] = useState('register')

  // 수거 등록 상태
  const [vesselName, setVesselName] = useState('')
  const [vesselConfirmed, setVesselConfirmed] = useState(false)
  const [bagCount, setBagCount] = useState(0)
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 집하 정보 상태
  const [stats, setStats] = useState(null)
  const [records, setRecords] = useState([])
  const [vessels, setVessels] = useState([])
  const [selectedVessels, setSelectedVessels] = useState([])
  const [dateRange, setDateRange] = useState([null, null])
  const [showVesselFilter, setShowVesselFilter] = useState(false)
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [tempDateRange, setTempDateRange] = useState([null, null])
  const [expandedRecords, setExpandedRecords] = useState(new Set())

  // 엑셀 추출
  // const [exporting, setExporting] = useState(false)

  const isReady = vesselConfirmed && image && bagCount > 0

  const fetchFilteredData = async (vesselList, dates) => {
    const params = {}
    if (vesselList.length > 0) params.vessel_ids = vesselList.join(',')
    if (dates[0]) params.date_from = dates[0].toISOString().split('T')[0]
    if (dates[1]) params.date_to = dates[1].toISOString().split('T')[0]

    try {
      const [statsRes, recordsRes] = await Promise.all([
        axiosInstance.get('/inspection/stats', { params }),
        axiosInstance.get('/inspection/records', { params })
      ])
      setStats(statsRes.data.data)
      setRecords(recordsRes.data.data.items)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    if (activeTab === 'info') {
      const fetchVessels = async () => {
        try {
          const res = await axiosInstance.get('/inspection/vessels')
          setVessels(res.data.data.vessels)
        } catch (e) { console.error(e) }
      }
  
      const fetchInitialData = async () => {
        try {
          const [statsRes, recordsRes] = await Promise.all([
            axiosInstance.get('/inspection/stats'),
            axiosInstance.get('/inspection/records')
          ])
          setStats(statsRes.data.data)
          setRecords(recordsRes.data.data.items)
        } catch (e) { console.error(e) }
      }
  
      fetchVessels()
      fetchInitialData()
    }
  }, [activeTab])

  const handleLogout = () => {
    localStorage.clear()
    navigate('/checker/login')  // 랜딩 페이지 대신 검수자 로그인이 나을 듯
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImage(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async () => {
    if (!vesselConfirmed) { setError('선박명을 확인해주세요'); return }
    if (!image) { setError('사진을 촬영해주세요'); return }
    if (bagCount <= 0) { setError('마대자루 개수를 입력해주세요'); return }
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('vessel_name', vesselName)
      formData.append('bag_count', bagCount)
      formData.append('image', image)
      const res = await axiosInstance.post('/inspection/record', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      navigate('/checker/complete', { state: { result: res.data.data, siteName } })
    } catch {
      setError('제출에 실패했습니다. 다시 시도해주세요')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!dateRange[0] || !dateRange[1]) {
      alert('날짜 필터를 먼저 설정해주세요')
      return
    }
    try {
      const start = dateRange[0].toISOString().split('T')[0]
      const end = dateRange[1].toISOString().split('T')[0]
      const params = { start_date: start, end_date: end }
      if (selectedVessels.length > 0) params.vessel_ids = selectedVessels.join(',')  // ← 추가
      const res = await axiosInstance.get('/inspection/export', {
        params,
        responseType: 'blob'
      })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `검수기록_${siteName}_${start}_${end}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('다운로드에 실패했습니다')
    } 
  }

  const groupByDate = (items) => {
    const groups = {}
    items.forEach(item => {
      const date = new Date(item.inspected_at)
      const today = new Date()
      const yesterday = new Date()
      yesterday.setDate(today.getDate() - 1)
      let label = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`
      if (date.toDateString() === today.toDateString()) label += ' (오늘)'
      else if (date.toDateString() === yesterday.toDateString()) label += ' (어제)'
      if (!groups[label]) groups[label] = []
      groups[label].push(item)
    })
    return groups
  }

  const grouped = groupByDate(records)

  const formatDateChip = (dates) => {
    if (!dates[0]) return null
    const fmt = (d) => `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
    return dates[1] ? `${fmt(dates[0])} ~ ${fmt(dates[1])}` : fmt(dates[0])
  }

  const vesselChipLabel = () => {
    if (selectedVessels.length === 0) return null
    const first = vessels.find(v => v.vessel_id === selectedVessels[0])?.name
    return selectedVessels.length > 1 ? `${first} 외 ${selectedVessels.length - 1}척` : first
  }

  const hasFilter = selectedVessels.length > 0 || dateRange[0]

  const clearFilters = () => {
    setSelectedVessels([])
    setDateRange([null, null])
    fetchFilteredData([], [null, null])
  }

  return (
    <div className="min-h-screen bg-[#F0F3FA] flex flex-col overflow-y-auto">

      {/* 헤더 */}
      <div className="bg-white px-5 pt-10 pb-0 shadow-sm">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="flex items-center gap-1 text-blue-500 text-xs font-semibold mb-1">
              <img src={logo} alt="" className="w-4 h-4 object-contain" />
              <span>NETLOG</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{siteName}</h1>
            <p className="text-gray-400 text-xs mt-0.5">{siteCode}</p>
          </div>
          <button onClick={handleLogout} className="text-gray-400 text-sm mt-1">로그아웃</button>
        </div>

        {/* 탭 */}
        <div className="flex">
          <button
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'register' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400'}`}
            onClick={() => setActiveTab('register')}
          >수거 등록</button>
          <button
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'info' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400'}`}
            onClick={() => setActiveTab('info')}
          >집하 정보</button>
        </div>
      </div>

      {/* 수거 등록 탭 */}
      {activeTab === 'register' && (
        <>
          <div className="flex flex-col gap-4 px-5 py-5 flex-1">

            {/* 1. 선박명 입력 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-500 text-white text-sm font-bold flex items-center justify-center">1</span>
                  <span className="font-semibold text-gray-800">선박명 입력</span>
                </div>
                {vesselConfirmed && (
                  <span className="text-green-500 text-sm font-medium bg-green-50 px-2 py-0.5 rounded-full">✓ 완료</span>
                )}
              </div>
              <div className="flex h-13 rounded-xl bg-gray-100 overflow-hidden">
                <input
                  className="flex-1 min-w-0 px-4 bg-gray-100 text-gray-800 outline-none text-base placeholder:text-gray-400"
                  placeholder="선박명을 입력해주세요."
                  value={vesselName}
                  onChange={(e) => { setVesselName(e.target.value); setVesselConfirmed(false) }}
                />
                <button
                  className={`shrink-0 px-5 text-sm font-semibold ${vesselConfirmed ? 'bg-gray-300 text-gray-500' : 'bg-[#D1FCDC] text-[#2B9F48]'}`}
                  onClick={() => { if (vesselName) setVesselConfirmed(!vesselConfirmed) }}
                >
                  {vesselConfirmed ? '수정' : '확인'}
                </button>
              </div>
            </div>

            {/* 2. 수거 사진 촬영 */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-500 text-white text-sm font-bold flex items-center justify-center">2</span>
                  <span className="font-semibold text-gray-800">수거 사진 촬영</span>
                </div>
                {image && (
                  <span className="text-green-500 text-sm font-medium bg-green-50 px-2 py-0.5 rounded-full">✓ 완료</span>
                )}
              </div>
              <div className="bg-[#FFFBEB] px-5 py-2.5 flex items-center gap-2">
                <span className="text-[#92400E] text-sm">⚠︎</span>
                <span className="text-[#92400E] text-sm font-medium">마대 자루가 모두 보이게 찍어주세요.</span>
              </div>
              <div
                className="relative w-full h-52 bg-blue-50 flex flex-col items-center justify-center overflow-hidden cursor-pointer"
                onClick={() => fileInputRef.current.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} className="w-full h-full object-cover" alt="preview" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                      <img src={camera} alt="" className="w-6 h-6 object-contain" />
                    </div>
                    <p className="text-blue-500 font-semibold text-sm">사진 촬영</p>
                    <p className="text-gray-400 text-xs">탭하여 카메라 열기 또는 사진 선택</p>
                  </div>
                )}
                {image && (
                  <button
                    className="absolute right-4 bottom-4 flex items-center gap-1 bg-[#4B4A4A] text-white text-sm px-3 py-1.5 rounded-xl"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current.click() }}
                  >
                    <img src={camera1} alt="" className="w-5 h-5 object-contain" />재촬영
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageChange} />
            </div>

            {/* 3. 마대자루 개수 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-blue-500 text-white text-sm font-bold flex items-center justify-center">3</span>
                <span className="font-semibold text-gray-800">마대자루 개수 입력</span>
              </div>
              <p className="text-center text-gray-400 text-sm mb-4">수거한 마대자루 수를 입력해 주세요</p>
              <div className="flex items-center justify-center gap-8">
                <button
                  className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-2xl active:scale-95 transition-transform"
                  onClick={() => setBagCount(prev => Math.max(0, Number(prev) - 1))}
                >−</button>
                <div className="flex flex-col items-center">
                  <span className="text-5xl font-bold text-gray-900">{bagCount}</span>
                  <span className="text-gray-400 text-sm mt-1">자루</span>
                </div>
                <button
                  className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-2xl active:scale-95 transition-transform"
                  onClick={() => setBagCount(prev => Number(prev) + 1)}
                >+</button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          </div>

          {/* 하단 버튼 */}
          <div className="px-5 pb-8 pt-2 flex flex-col gap-2">
            {vesselConfirmed && bagCount > 0 && (
              <button className="w-full py-4 rounded-2xl bg-blue-500 text-white font-bold text-base flex items-center justify-between px-5 active:scale-95 transition-transform">
                <span>{vesselName} | {bagCount} 자루</span>
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white text-sm">✓</span>
                </div>
              </button>
            )}
            <button
              className={`w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-95 ${isReady ? 'bg-blue-500' : 'bg-gray-300'}`}
              onClick={handleSubmit}
              disabled={loading || !isReady}
            >
              {loading ? '제출 중...' : (
                <>
                  <img src={checkIcon} alt="" className="w-5 h-5 object-contain" />
                  제출하기
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* 집하 정보 탭 */}
      {activeTab === 'info' && (
        <div className="flex flex-col flex-1">

          {/* 통계 */}
          {stats && (
            <div className="bg-white px-5 py-4 border-b border-gray-100">
              <div className="grid grid-cols-3 divide-x divide-gray-100">
                <div className="flex flex-col items-start py-1 pr-4">
                  <span className="text-[#4A5568] text-xs mb-1">총 자루</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900">{stats.total_bag_count}</span>
                    <span className="text-[#4A5568] text-xs">자루</span>
                  </div>
                </div>
                <div className="flex flex-col items-start py-1 px-4">
                  <span className="text-[#4A5568] text-xs mb-1">수거 선박</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-900">{stats.vessel_count}</span>
                    <span className="text-[#4A5568] text-xs">척</span>
                  </div>
                </div>
                <div className="flex flex-col items-start py-1 pl-4">
                  <span className="text-[#4A5568] text-xs mb-1">최근 수거일</span>
                  <span className="text-2xl font-bold text-gray-900">{stats.last_inspected_at}</span>
                </div>
              </div>
            </div>
          )}

          {/* 필터 칩 */}
          <div className="bg-white px-4 py-3 flex items-center gap-2 border-b border-gray-100">
            {/* 선박 필터 */}
            <button
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border transition-colors ${selectedVessels.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500 bg-white'}`}
              onClick={() => setShowVesselFilter(true)}
            >
              <span className="font-medium">{vesselChipLabel() || '수거 선박'}</span>
              <span className="text-gray-400 text-[10px]">▾</span>
            </button>

            {/* 날짜 필터 */}
            <button
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border transition-colors ${dateRange[0] ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500 bg-white'}`}
              onClick={() => { setTempDateRange(dateRange); setShowDateFilter(true) }}
            >
              <span className="font-medium">{formatDateChip(dateRange) || '날짜'}</span>
              <span className="text-gray-400 text-[10px]">▾</span>
            </button>

            {/* 오른쪽: 초기화 + 추출 */}
            <div className="ml-auto flex items-center gap-2">
              {hasFilter && (
                <button className="text-gray-400 text-sm" onClick={clearFilters}>✕</button>
              )}
              <button
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-blue-200 bg-[#0055FF] text-white font-medium"
                onClick={handleExport}
              >
                <img src={extract_button} alt="" className="w-5 h-5 object-contain" /> 추출
              </button>
            </div>
          </div>

          {/* 목록 */}
          <div className="flex flex-col gap-3 px-5 py-4">
            {Object.entries(grouped).length > 0 ? (
              Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <p className="text-gray-400 text-xs mb-2">{date}</p>
                  <div className="flex flex-col gap-2">
                  {items.map(item => (
                    <div key={item.record_id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      {/* 헤더 행 */}
                      <div
                        className="px-5 py-4 flex justify-between items-center cursor-pointer"
                        onClick={() => {
                          setExpandedRecords(prev => {
                            const next = new Set(prev)
                            if (next.has(item.record_id)) {
                              next.delete(item.record_id)
                            } else {
                              next.add(item.record_id)
                            }
                            return next
                          })
                        }}
                      >
                        <span className="font-semibold text-[#0D1526] text-lg">{item.vessel_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500 font-semibold text-lg">{item.bag_count}자루</span>
                          <span className="text-gray-400 text-sm">
                          <img
                            src={toggle}
                            alt=""
                            className={`w-5 h-5 object-contain transition-transform duration-100 ${
                              expandedRecords.has(item.record_id) ? "rotate-180" : "rotate-0"
                            }`}
                          />
                          </span>
                        </div>
                      </div>

                      {/* 펼쳐지는 내용 */}
                      {expandedRecords.has(item.record_id) && (
                        <div className="px-5 pb-5 flex flex-col gap-3 border-t border-gray-50">
                          <p className="text-gray-400 text-sm mt-3">
                            {new Date(item.inspected_at).toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          {item.bag_image_url && (
                            <img
                              src={item.bag_image_url}
                              alt="마대 사진"
                              className="w-full rounded-xl object-cover"
                              style={{ maxHeight: '240px' }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center mt-24 gap-3">
                <span className="text-5xl"><img src={no_file} alt="" className="w-10 h-10 object-contain" /></span>
                <p className="text-[#8A96B0] text-base">조건에 맞는 수거 내역이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 선박 필터 오버레이 */}
      {showVesselFilter && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowVesselFilter(false)} />
          <div className="relative bg-white rounded-t-3xl px-6 pt-6 pb-10 z-10">
            <h3 className="text-lg font-bold text-gray-900 mb-5">수거 선박 선택</h3>
            <div className="flex flex-wrap gap-2 mb-8">
              {vessels.map(vessel => (
                <button
                  key={vessel.vessel_id}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${selectedVessels.includes(vessel.vessel_id) ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-200 text-gray-700 bg-white'}`}
                  onClick={() => {
                    setSelectedVessels(prev =>
                      prev.includes(vessel.vessel_id)
                        ? prev.filter(id => id !== vessel.vessel_id)
                        : [...prev, vessel.vessel_id]
                    )
                  }}
                >
                  {vessel.name}
                </button>
              ))}
            </div>
            <button
              className="w-full py-4 rounded-2xl bg-blue-500 text-white font-bold text-base"
              onClick={() => {
                setShowVesselFilter(false)
                fetchFilteredData(selectedVessels, dateRange)
              }}
            >
              적용
            </button>
          </div>
        </div>
      )}

      {/* 날짜 필터 오버레이 */}
      {showDateFilter && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDateFilter(false)} />
          <div className="relative bg-white rounded-t-3xl px-6 pt-6 pb-10 z-10">
            <h3 className="text-lg font-bold text-gray-900 mb-4">조회 날짜 선택</h3>
            <Calendar
              onChange={(val) => setTempDateRange(Array.isArray(val) ? val : [val, null])}
              value={tempDateRange[0] ? tempDateRange : null}
              selectRange={true}
              locale="ko-KR"
              formatDay={(locale, date) => date.getDate()}
              prev2Label={null}
              next2Label={null}
              prevLabel="‹"
              nextLabel="›"
              showNeighboringMonth={false}
              className="w-full border-none shadow-none netlog-calendar"
            />
            <div className="mt-3 py-3 text-center text-gray-500 text-sm border-t border-gray-100">
              {tempDateRange[0]
                ? formatDateChip(tempDateRange) || '날짜를 선택하세요.'
                : '날짜를 선택하세요.'
              }
            </div>
            <button
              className="w-full py-4 rounded-2xl bg-blue-500 text-white font-bold text-base mt-3"
              onClick={() => {
                setDateRange(tempDateRange)
                setShowDateFilter(false)
                fetchFilteredData(selectedVessels, tempDateRange)
              }}
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  )
}