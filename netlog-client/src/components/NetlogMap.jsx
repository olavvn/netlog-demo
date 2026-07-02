import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import './NetlogMap.css'
import GuideOverlay from './GuideOverlay'
import dadaepoImg from '../assets/dadaepo.png'
import minrakImg from '../assets/minrak.png'
import idongImg from '../assets/idong.png'
import jeongjaImg from '../assets/jeongja.png'
import { fetchMapSites, fetchSiteStats, fetchMapSummary } from '../api/mapApi'

const SITES = {
  dadaepo: { name: '다대포항', image: dadaepoImg, siteCode: 'DADAEPO' },
  minrak:  { name: '민락항',   image: minrakImg,  siteCode: 'MINRAK'  },
  idong:   { name: '이동항',   image: idongImg,   siteCode: 'GIJANG'  },
  jeongja: { name: '정자항',   image: jeongjaImg, siteCode: 'JEONGJA' },
}

function useAnimatedProgress(active, target, duration = 2500) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!active) { setProgress(0); return }
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const t = Math.min((ts - start) / duration, 1)
      setProgress((1 - Math.pow(1 - t, 3)) * target)
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [active, target, duration])
  return progress
}

function DateRangePicker({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(2026)
  const [viewMonth, setViewMonth] = useState(4)
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const fmt = (d) => d ? `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.` : '날짜 선택'
  const handleDayClick = (day) => {
    const date = new Date(viewYear, viewMonth, day)
    if (!startDate || (startDate && endDate)) onChange(date, null)
    else { if (date < startDate) onChange(date, startDate); else onChange(startDate, date); setOpen(false) }
  }
  const isInRange = (day) => { if (!startDate || !endDate) return false; const d = new Date(viewYear, viewMonth, day); return d > startDate && d < endDate }
  const isStart = (day) => startDate && new Date(viewYear, viewMonth, day).toDateString() === startDate.toDateString()
  const isEnd = (day) => endDate && new Date(viewYear, viewMonth, day).toDateString() === endDate.toDateString()
  const mn = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="date-badge" onClick={() => setOpen(o => !o)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(15,45,74,0.5)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        <span>{fmt(startDate)}</span><span style={{ color: 'rgba(15,45,74,0.3)' }}>–</span><span>{fmt(endDate)}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(15,45,74,0.5)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      </div>
      {open && (
        <div className="calendar-dropdown">
          <div className="calendar-nav">
            <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }}>‹</button>
            <span>{viewYear}년 {mn[viewMonth]}</span>
            <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }}>›</button>
          </div>
          <div className="calendar-hint">{!startDate || (startDate && endDate) ? '시작일 선택' : '종료일 선택'}</div>
          <div className="calendar-grid">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d} className="cal-header">{d}</div>)}
            {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day = i + 1, s = isStart(day), e = isEnd(day), r = isInRange(day)
              return <div key={day} onClick={() => handleDayClick(day)} className={`cal-day${s ? ' cal-start' : ''}${e ? ' cal-end' : ''}${r ? ' cal-range' : ''}`}>{day}</div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const CarSVG = ({ filled }) => {
  const [hovered, setHovered] = useState(false)
  const col = filled ? (hovered ? '#FF6A6D' : '#F8A09B') : 'rgba(15,45,74,0.1)'
  return (
    <svg className={`car-icon${filled ? ' filled' : ''}`} width="30" height="18" viewBox="0 0 30 18"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <path d="M4 10h22M4 10L7 4h16l3 6M4 10v4M26 10v4M4 14H2v-2M26 14h2v-2M4 14h22"
        stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="8.5" cy="14" r="2" fill={col} />
      <circle cx="21.5" cy="14" r="2" fill={col} />
    </svg>
  )
}

const BatterySVG = ({ pct, flash }) => (
  <div style={{ position: 'relative', width: '48px', height: '22px' }} className={flash ? 'battery-flash' : ''}>
    <svg width="48" height="22" viewBox="0 0 48 22">
      <rect x="1" y="3" width="40" height="16" rx="3" stroke="rgba(15,45,74,0.35)" strokeWidth="1.5" fill="none" />
      <rect x="41" y="7.5" width="5" height="7" rx="1.5" fill="rgba(15,45,74,0.35)" />
      <rect x="3" y="5" width={Math.round(36 * pct / 100)} height="12" rx="2"
        fill={pct > 60 ? '#47D26A' : pct > 30 ? '#6EC99A' : '#D25A46'} />
    </svg>
    {pct >= 100 && (
      <svg style={{ position: 'absolute', top: 2, left: 14 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
        <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )}
  </div>
)

const TreeSVG = ({ filled, popped }) => (
  <svg className={`tree-icon${popped ? ' popped' : ''}`} width="20" height="24" viewBox="0 0 20 24" fill="none">
    <polygon points="10,1 19,12 1,12" fill={filled ? '#94BE64' : 'rgba(15,45,74,0.12)'} />
    <polygon points="10,7 18,16 2,16" fill={filled ? '#759F00' : 'rgba(15,45,74,0.08)'} />
    <rect x="8" y="16" width="4" height="7" rx="1.2" fill={filled ? '#0F4C6B' : 'rgba(15,45,74,0.10)'} />
  </svg>
)

const BIG_NUM = (color = '#0F2D4A') => ({ color, fontSize: '38px', fontWeight: 800, lineHeight: '1', letterSpacing: '-0.03em' })
const MED_NUM = (color = '#0F2D4A') => ({ color, fontSize: '38px', fontWeight: 800, lineHeight: '1', letterSpacing: '-0.03em' })
const LABEL = { color: 'rgba(15,45,74,0.60)', fontSize: '14px', fontWeight: 500, letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: '5px' }
const UNIT = { color: 'rgba(15,45,74,0.45)', fontSize: '16px', fontWeight: 400 }
const SUB = { color: 'rgba(15,45,74,0.45)', fontSize: '12px' }

// 날짜 문자열(YYYY-MM-DD)을 한국어로 포맷
function fmtKoDate(dateStr) {
  if (!dateStr) return '-'
  const [y, m, d] = dateStr.split('-')
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
}

function SummaryPanel({ visible, onClose }) {
  const [startDate, setStartDate] = useState(new Date(2026, 4, 6))
  const [endDate, setEndDate] = useState(() => new Date())

  // 서버에서 받아온 실제 수거량과 마지막 수거일
  const [totalWeight, setTotalWeight] = useState(0)
  const [lastCollectedDate, setLastCollectedDate] = useState(null)
  const [loading, setLoading] = useState(false)

  // 날짜가 완성될 때마다 API 호출
  useEffect(() => {
    if (!startDate || !endDate) return
    setLoading(true)
    fetchMapSummary(startDate, endDate)
      .then(data => {
        setTotalWeight(data.total_weight_kg ?? 0)
        setLastCollectedDate(data.last_collected_date ?? null)
      })
      .catch(err => console.error('SummaryPanel fetch error:', err))
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  // totalWeight를 타깃으로 삼아 애니메이션
  const waste = Math.round(useAnimatedProgress(visible, totalWeight, 2500))
  const co2 = Math.round(useAnimatedProgress(visible, totalWeight * 2.72, 2500))
  const charge = Math.round(useAnimatedProgress(visible, totalWeight * 360, 2500))
  const pine = Math.round(useAnimatedProgress(visible, totalWeight * 0.0096, 2500))
  const battPct = Math.min(100, Math.round(useAnimatedProgress(visible, 100, 2500)))
  const cars = Math.min(8, Math.round(useAnimatedProgress(visible, totalWeight / 156.25, 2500)))
  const trees = Math.min(12, Math.round(useAnimatedProgress(visible, totalWeight / 104.2, 2500)))

  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (battPct >= 100 && visible) { setFlash(true); const t = setTimeout(() => setFlash(false), 700); return () => clearTimeout(t) }
  }, [battPct, visible])

  return (
    <div id="ui-panel-summary" className={`ui-panel${visible ? '' : ' hidden'}`}>
      <div className="panel-body">
        <div className="date-section">
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e) }} />
        </div>
        <div className="stat-card">
          <div style={LABEL}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0055A0" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /><line x1="19.07" y1="4.93" x2="4.93" y2="19.07" /></svg>
            누적 폐어망 수거량
          </div>
          <div className="stat-value-group">
            <span style={BIG_NUM('#0F2D4A')}>{loading ? '…' : waste.toLocaleString()}</span>
            <span style={UNIT}>kg</span>
          </div>
          <div style={{ height: '8px', backgroundColor: 'rgba(0,85,160,0.12)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: '#0055A0', borderRadius: '4px', width: `${totalWeight > 0 ? (waste / totalWeight) * 100 : 0}%` }} />
          </div>
          <div style={SUB}>마지막 수거일: {loading ? '…' : fmtKoDate(lastCollectedDate)}</div>
        </div>
        <div className="stat-card">
          <div style={LABEL}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6A6D" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
            누적 이산화탄소 감축량
          </div>
          <div className="stat-value-group">
            <span style={BIG_NUM('#0F2D4A')}>{loading ? '…' : co2.toLocaleString()}</span>
            <span style={UNIT}>kg</span>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
            {Array(8).fill(null).map((_, i) => <CarSVG key={i} filled={i < cars} />)}
          </div>
          <div style={{ ...SUB, color: '#0F2D4A', fontWeight: 600 }}>소형차 {cars}대 분량 탄소 감축</div>
        </div>
        <div className="stat-card">
          <div style={LABEL}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#47D26A" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            누적 스마트폰 완충 횟수
          </div>
          <div className="stat-value-group">
            <span style={MED_NUM('#0F2D4A')}>{loading ? '…' : charge.toLocaleString()}</span>
            <span style={UNIT}>회</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
            <BatterySVG pct={battPct} flash={flash} />
            <div style={{ flex: 1, height: '8px', backgroundColor: 'rgba(76,175,125,0.15)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: '#47D26A', width: `${battPct}%`, borderRadius: '4px' }} />
            </div>
            <span style={{ fontSize: '14px', color: '#47D26A', fontWeight: 800 }}>{battPct}%</span>
          </div>
        </div>
        <div className="stat-card">
          <div style={LABEL}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F4C6B" strokeWidth="2.5"><path d="M12 22V12" /><path d="M12 12 8 8M12 12l4-4" /><line x1="5" y1="20" x2="19" y2="20" /></svg>
            소나무 1그루 흡수 기간
          </div>
          <div className="stat-value-group">
            <span style={BIG_NUM('#0F2D4A')}>{loading ? '…' : pine}</span>
            <span style={UNIT}>개월</span>
          </div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '5px' }}>
            {Array(12).fill(null).map((_, i) => <TreeSVG key={i} filled={i < trees} popped={i < trees} />)}
          </div>
          <div style={{ ...SUB, color: '#0F4C6B', fontWeight: 600 }}>소나무 {trees}그루 1년 흡수량</div>
        </div>
      </div>
      <button className="close-button" onClick={onClose}>닫기</button>
    </div>
  )
}

// 집하장 패널 (마커 클릭 시 표시)
function SitePanel({ visible, onClose, site, siteId }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible || !siteId) return
    setLoading(true)
    setStats(null)
    fetchSiteStats(siteId)
      .then(data => setStats(data))
      .catch(err => console.error('SitePanel fetch error:', err))
      .finally(() => setLoading(false))
  }, [visible, siteId])

  const totalWeightKg = stats?.total_weight_kg ?? 0
  const lastCollected = stats?.last_collected_date ?? null
  const co2 = Math.round(totalWeightKg * 2.72)
  const charge = Math.round(totalWeightKg * 360)

  return (
    <div id="ui-panel-site" className={`ui-panel${visible ? '' : ' hidden'}`}>
      <div className="panel-header">
        <img src={site?.image} alt={site?.name} />
        <div className="badge-port">{site?.name ?? '집하장'}</div>
      </div>
      <div className="panel-body">
        <div className="stat-card">
          <div style={LABEL}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#47D26A" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /><line x1="19.07" y1="4.93" x2="4.93" y2="19.07" /></svg>
            누적 수거량
          </div>
          <div className="stat-value-group">
            <span style={BIG_NUM('#0F2D4A')}>{loading ? '…' : totalWeightKg.toLocaleString()}</span>
            <span style={UNIT}>kg</span>
          </div>
          <div style={SUB}>마지막 수거일: {loading ? '…' : fmtKoDate(lastCollected)}</div>
        </div>
        <div className="env-title">환경지표</div>
        <div className="stat-card">
          <div style={LABEL}>이산화탄소 감축량</div>
          <div className="stat-value-group">
            <span style={MED_NUM('#0F2D4A')}>{loading ? '…' : co2.toLocaleString()}</span>
            <span style={UNIT}>kg</span>
          </div>
        </div>
        <div className="stat-card">
          <div style={LABEL}>스마트폰 완충 횟수</div>
          <div className="stat-value-group">
            <span style={MED_NUM('#0F2D4A')}>{loading ? '…' : charge.toLocaleString()}</span>
            <span style={UNIT}>회</span>
          </div>
        </div>
      </div>
      <button className="close-button" onClick={onClose}>닫기</button>
    </div>
  )
}

export default function NetlogMap() {
  const canvasRef = useRef(null)
  const [activeSite, setActiveSite] = useState('dadaepo')
  const [activeSiteId, setActiveSiteId] = useState(null)
  const [siteVisible, setSiteVisible] = useState(false)
  const [summaryVisible, setSummaryVisible] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [bubbleAnchors, setBubbleAnchors] = useState({})
  const showGuideRef = useRef(true)
  useEffect(() => { showGuideRef.current = showGuide }, [showGuide])

  // site_code → site_id 매핑 테이블 (API 로드 후 채움)
  const siteMapRef = useRef({}) // { MINRAK: 'uuid-...', GIJANG: 'uuid-...' }

  // 마운트 시 /map/sites 호출 → site_code:site_id 매핑 구성
  useEffect(() => {
    fetchMapSites()
      .then(sites => {
        const map = {}
        sites.forEach(s => { map[s.site_code] = s.site_id })
        siteMapRef.current = map
      })
      .catch(err => console.error('fetchMapSites error:', err))
  }, [])

  const yoActionRef = useRef(null)
  const cube43ActionRef = useRef(null)
  const isYoForwardRef = useRef(true)
  const isColorToggledRef = useRef(false)

  const handleSummaryClose = () => {
    if (yoActionRef.current && yoActionRef.current.timeScale > 0) {
      yoActionRef.current.paused = false
      yoActionRef.current.timeScale = -1
      yoActionRef.current.play()
      isYoForwardRef.current = true
    }
    if (cube43ActionRef.current && !cube43ActionRef.current.isRunning()) {
      cube43ActionRef.current.reset().play()
    }
    isColorToggledRef.current = false
    setSummaryVisible(false)
  }

  const openSitePanelRef = useRef(null)
  openSitePanelRef.current = (siteKey) => {
    const siteCode = SITES[siteKey]?.siteCode
    setActiveSite(siteKey)
    setActiveSiteId(siteCode ? (siteMapRef.current[siteCode] ?? null) : null)
    setSiteVisible(true)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const TARGET_ASPECT = 1170 / 2532
    const BLENDER_ORTHO_SCALE = 1.510
    const scene = new THREE.Scene()
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    let camera, mixer
    const clock = new THREE.Clock()
    let shipAction, storageAction
    let armature001Action, armature002Action, armature003Action, armature004Action
    let facAction, textAction
    let facTimeout = null, uiTimeout = null, summaryTimeout = null
    let isFacPlaying = false
    let zoomLevel = 1, panOffset = { x: 0, y: 0 }, baseRenderWidth = 0, baseRenderHeight = 0

    const emissionColors = [
      { name: 'sea', mat: null, base: new THREE.Color('#57B5C5'), target: new THREE.Color('#000000') },
      { name: 'blue', mat: null, base: new THREE.Color('#417DDA'), target: new THREE.Color('#317238') },
      { name: 'blue_er', mat: null, base: new THREE.Color('#5C8CEF'), target: new THREE.Color('#4A9A51') },
      { name: 'blue_est', mat: null, base: new THREE.Color('#8EB5FF'), target: new THREE.Color('#71BB6A') },
      { name: 'letter', mat: null, base: new THREE.Color('#3F3F3F'), target: new THREE.Color('#C7C9CC') },
    ]
    const dynamicLights = {
      'lightpath_1': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null },
      'lightpath_2': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null },
      'lightpath_3': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null },
      'lightpath_4': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null },
    }

    const triggerLight = (n) => {
      const l = dynamicLights[n]
      if (l?.mat) {
        l.target.copy(l.highlight)
        if (l.timeout) clearTimeout(l.timeout)
        l.timeout = setTimeout(() => l.target.copy(l.base), 1000)
      }
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let clickStartPos = { x: 0, y: 0 }, isDragging = false, previousPointer = { x: 0, y: 0 }, previousPinchDistance = null
    const MAX_ZOOM = 4

    function updateCameraView() {
      if (!camera?.isOrthographicCamera) return
      const zw = baseRenderWidth / zoomLevel, zh = baseRenderHeight / zoomLevel
      panOffset.x = THREE.MathUtils.clamp(panOffset.x, -(baseRenderWidth - zw) / 2, (baseRenderWidth - zw) / 2)
      panOffset.y = THREE.MathUtils.clamp(panOffset.y, -(baseRenderHeight - zh) / 2, (baseRenderHeight - zh) / 2)
      camera.left = -zw / 2 + panOffset.x; camera.right = zw / 2 + panOffset.x
      camera.top = zh / 2 + panOffset.y; camera.bottom = -zh / 2 + panOffset.y
      camera.updateProjectionMatrix()
      updateBubbleAnchors()
    }

    const ANCHOR_GROUPS = {
      cubeT: ['Cube011_3'],
      a4T: ['Cube043_1', 'Cube043_3', 'Cube043_2'],
      site3T: ['Cube039_1', 'Cube039_2'],
    }
    const anchorWorldPositions = {}

    function projectToScreen(worldPos) {
      if (!camera || !worldPos) return null
      const v = worldPos.clone().project(camera)
      const rect = canvas.getBoundingClientRect()
      return {
        x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
      }
    }

    function updateBubbleAnchors() {
      if (!camera || !showGuideRef.current) return
      const result = {}
      Object.keys(anchorWorldPositions).forEach(key => {
        result[key] = projectToScreen(anchorWorldPositions[key])
      })
      setBubbleAnchors(result)
    }

    function calculateBaseBounds() {
      const w = canvas.clientWidth, h = canvas.clientHeight, sa = w / h
      renderer.setSize(w, h)
      const bw = BLENDER_ORTHO_SCALE, bh = BLENDER_ORTHO_SCALE / TARGET_ASPECT
      if (sa > TARGET_ASPECT) { baseRenderWidth = bw; baseRenderHeight = bw / sa }
      else { baseRenderHeight = bh; baseRenderWidth = bh * sa }
      updateCameraView()
    }

    function checkIntersection(cx, cy) {
      if (!camera || !mixer || isFacPlaying) return
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((cx - rect.left) / rect.width) * 2 - 1
      pointer.y = -((cy - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      console.log('[click] hits:', hits.slice(0, 6).map(i => i.object.name))
      if (!hits.length) return

      const shipT = ['Cylinder025', 'Cylinder025_1', 'Cylinder_025', 'Cylinder_025_1']
      const storT = ['storage001', 'Cube004', 'storage_2']
      const cubeT = ['Cube011_3']
      const a1T = ['storage003', 'Cube008_1', 'Cube008']
      const a2T = ['Cube039_1', 'Cube039_2', 'Cube039']
      const a3T = ['Cube041_2', 'storage007', 'Cube041_1']
      const a4T = ['Cube043_1', 'Cube043_3', 'Cube043_2']

      const hit = hits.find(i => [...shipT, ...storT, ...cubeT, ...a1T, ...a2T, ...a3T, ...a4T].includes(i.object.name))
      if (!hit) return

      if (uiTimeout) clearTimeout(uiTimeout)
      if (summaryTimeout) clearTimeout(summaryTimeout)

      if (shipT.includes(hit.object.name)) {
        shipAction?.reset().play()
      }
      else if (storT.includes(hit.object.name)) {
        storageAction?.reset().play()
        triggerLight('lightpath_3')
        uiTimeout = setTimeout(() => openSitePanelRef.current('minrak'), 1200)
      }
      else if (cubeT.includes(hit.object.name)) {
        setSiteVisible(false)
        setSummaryVisible(false)
        if (cube43ActionRef.current && !cube43ActionRef.current.isRunning()) cube43ActionRef.current.reset().play()
        if (yoActionRef.current) {
          yoActionRef.current.paused = false
          yoActionRef.current.timeScale = isYoForwardRef.current ? 1 : -1
          yoActionRef.current.play()
          isYoForwardRef.current = !isYoForwardRef.current
        }
        isColorToggledRef.current = !isColorToggledRef.current
      }
      else if (a2T.includes(hit.object.name)) {
        armature002Action?.reset().play()
        triggerLight('lightpath_1')
        uiTimeout = setTimeout(() => openSitePanelRef.current('jeongja'), 1200)
      }
      else if (a1T.includes(hit.object.name)) {
        armature001Action?.reset().play()
        triggerLight('lightpath_4')
        uiTimeout = setTimeout(() => openSitePanelRef.current('dadaepo'), 1200)
      }
      else if (a3T.includes(hit.object.name)) {
        armature003Action?.reset().play()
        triggerLight('lightpath_2')
        uiTimeout = setTimeout(() => openSitePanelRef.current('idong'), 1200)
      }
      else if (a4T.includes(hit.object.name)) {
        armature004Action?.reset().play()
        if (facAction) {
          if (facTimeout) clearTimeout(facTimeout)
          facTimeout = setTimeout(() => {
            isFacPlaying = true
            facAction.reset().play()
            textAction?.reset().play()
          }, 1000)
        }
      }
    }

    const applyPanDelta = (dx, dy) => {
      panOffset.x -= (dx / canvas.clientWidth) * (baseRenderWidth / zoomLevel)
      panOffset.y += (dy / canvas.clientHeight) * (baseRenderHeight / zoomLevel)
      updateCameraView()
    }

    const onMouseDown = (e) => { if (e.target.closest('.ui-panel,.calendar-dropdown,.guide-overlay')) return; isDragging = true; previousPointer = { x: e.clientX, y: e.clientY }; clickStartPos = { x: e.clientX, y: e.clientY } }
    const onMouseMove = (e) => { if (!isDragging) return; applyPanDelta(e.clientX - previousPointer.x, e.clientY - previousPointer.y); previousPointer = { x: e.clientX, y: e.clientY } }
    const onMouseUp = (e) => { isDragging = false; if (e.target.closest('.ui-panel,.calendar-dropdown,.guide-overlay')) return; if (Math.hypot(e.clientX - clickStartPos.x, e.clientY - clickStartPos.y) < 5) checkIntersection(e.clientX, e.clientY) }
    const onWheel = (e) => { if (e.target.closest('.ui-panel,.guide-overlay')) return; zoomLevel = THREE.MathUtils.clamp(zoomLevel - e.deltaY * 0.002, 1, MAX_ZOOM); updateCameraView() }
    const onTouchStart = (e) => { if (e.target.closest('.ui-panel,.guide-overlay')) return; if (e.touches.length === 1) { isDragging = true; previousPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY }; clickStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY } } else if (e.touches.length === 2) { isDragging = false; previousPinchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) } }
    const onTouchMove = (e) => { if (e.target.closest('.ui-panel,.guide-overlay')) return; e.preventDefault(); if (isDragging && e.touches.length === 1) { applyPanDelta(e.touches[0].clientX - previousPointer.x, e.touches[0].clientY - previousPointer.y); previousPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY } } else if (e.touches.length === 2 && previousPinchDistance) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); zoomLevel = THREE.MathUtils.clamp(zoomLevel + (d - previousPinchDistance) * 0.01, 1, MAX_ZOOM); updateCameraView(); previousPinchDistance = d } }
    const onTouchEnd = (e) => { isDragging = false; previousPinchDistance = null; if (e.target.closest('.ui-panel,.guide-overlay')) return; if (e.cancelable) e.preventDefault(); if (e.changedTouches.length === 1) { const t = e.changedTouches[0]; if (Math.hypot(t.clientX - clickStartPos.x, t.clientY - clickStartPos.y) < 15) checkIntersection(t.clientX, t.clientY) } }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mouseleave', () => isDragging = false)
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: false })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: false })
    window.addEventListener('resize', calculateBaseBounds)

    new GLTFLoader().load('/models/netlog_nla_netspa222222.glb', (gltf) => {
      scene.add(gltf.scene)

      gltf.scene.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach(m => {
            const n = m.name.split('.')[0]
            const cfg = emissionColors.find(c => c.name === n)
            if (cfg) { cfg.mat = m; cfg.mat.emissive.copy(cfg.base) }
            if (dynamicLights[n]) { dynamicLights[n].mat = m; dynamicLights[n].base.copy(m.emissive); dynamicLights[n].target.copy(m.emissive) }
          })
        }
      })

      camera = gltf.cameras?.[0]
      if (!camera) { console.error('카메라 없음'); return }

      mixer = new THREE.AnimationMixer(gltf.scene)

      mixer.addEventListener('finished', (e) => {
        if (e.action === yoActionRef.current && yoActionRef.current.timeScale > 0) {
          summaryTimeout = setTimeout(() => setSummaryVisible(true), 150)
        }
        if (e.action === facAction) isFacPlaying = false
      })

      const BLENDER_FPS = 24
      const clips = gltf.animations
      const loadClip = (name, sub) => {
        const clip = THREE.AnimationClip.findByName(clips, name)
        if (!clip) return null
        const action = mixer.clipAction(sub ? THREE.AnimationUtils.subclip(clip, name, ...sub, BLENDER_FPS) : clip)
        action.setLoop(THREE.LoopOnce)
        action.clampWhenFinished = true
        return action
      }

      shipAction = loadClip('Empty.002Action', ['ship_action_1_60', 1, 130])
      storageAction = loadClip('ArmatureAction')
      cube43ActionRef.current = loadClip('Cube.043Action')
      yoActionRef.current = loadClip('yo')
      armature002Action = loadClip('ArmatureAction.002')
      armature001Action = loadClip('ArmatureAction.001')
      armature003Action = loadClip('ArmatureAction.003')
      armature004Action = loadClip('ArmatureAction.004')
      facAction = loadClip('fac')
      textAction = loadClip('text')

      camera.updateMatrixWorld()
      gltf.scene.updateMatrixWorld(true)
      Object.entries(ANCHOR_GROUPS).forEach(([key, names]) => {
        const box = new THREE.Box3()
        let found = false
        names.forEach(n => {
          const obj = scene.getObjectByName(n)
          if (obj) { box.expandByObject(obj); found = true }
        })
        if (found) anchorWorldPositions[key] = box.getCenter(new THREE.Vector3())
      })
      calculateBaseBounds()
    })

    let animFrameId
    const animate = () => {
      animFrameId = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      mixer?.update(delta)
      const ls = 4.0 * delta
      emissionColors.forEach(c => { if (c.mat) c.mat.emissive.lerp(isColorToggledRef.current ? c.target : c.base, ls) })
      Object.values(dynamicLights).forEach(l => { if (l.mat) l.mat.emissive.lerp(l.target, ls) })
      if (camera) renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animFrameId)
        ;[facTimeout, uiTimeout, summaryTimeout].forEach(t => t && clearTimeout(t))
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('resize', calculateBaseBounds)
      renderer.dispose()
    }
  }, [])

  return (
    <div className="netlog-map-root">
      <canvas ref={canvasRef} id="webgl-canvas" />
      {showGuide && <GuideOverlay onDismiss={() => setShowGuide(false)} anchors={bubbleAnchors} />}
      <SitePanel site={SITES[activeSite]} siteId={activeSiteId} visible={siteVisible} onClose={() => setSiteVisible(false)} />
      <SummaryPanel visible={summaryVisible} onClose={handleSummaryClose} />
    </div>
  )
}