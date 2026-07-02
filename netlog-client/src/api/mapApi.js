import axiosInstance from './axiosInstance'

/**
 * MAP API 1: 지도 마커 위치 목록 조회
 * GET /map/sites
 * → site_id, site_code, name, latitude, longitude
 */
export async function fetchMapSites() {
  const res = await axiosInstance.get('/map/sites')
  return res.data.data.sites // Array
}

/**
 * MAP API 2: 집하장 클릭 시 통계 조회
 * GET /map/sites/{site_id}/stats
 * → site_id, name, total_weight_kg, last_collected_date
 */
export async function fetchSiteStats(siteId) {
  const res = await axiosInstance.get(`/map/sites/${siteId}/stats`)
  return res.data.data // Object
}

/**
 * MAP API 3: SummaryPanel용 전체 수거 요약 (날짜 범위)
 * GET /map/summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * → total_weight_kg, last_collected_date
 */
export async function fetchMapSummary(startDate, endDate) {
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const res = await axiosInstance.get('/map/summary', {
    params: { start_date: fmt(startDate), end_date: fmt(endDate) },
  })
  return res.data.data // { total_weight_kg, last_collected_date }
}
