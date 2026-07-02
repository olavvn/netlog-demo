import axios from 'axios'

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
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