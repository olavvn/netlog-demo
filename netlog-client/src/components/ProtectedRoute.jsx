import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children, role }) {
  const token = localStorage.getItem(
    role === 'admin' ? 'admin_token' : 'checker_token'
  )
  if (!token) return <Navigate to={
    role === 'admin' ? '/dashboard/login' : '/checker/login'
  } replace />
  return children
}