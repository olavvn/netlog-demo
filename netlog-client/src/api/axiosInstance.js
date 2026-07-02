import axios from 'axios'

const axiosInstance = axios.create({
  // ?? (not ||) so an explicit empty string ("" = same-origin, relative URLs)
  // isn't overridden by the local-dev fallback. Only a truly unset build arg
  // (undefined) falls back to the local FastAPI dev server.
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
})

axiosInstance.interceptors.request.use((config) => {
  // 대시보드 API면 admin_token, 아니면 checker_token
  const isAdmin = config.url?.startsWith('/dashboard')
  const token = isAdmin
    ? localStorage.getItem('admin_token')
    : localStorage.getItem('checker_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default axiosInstance