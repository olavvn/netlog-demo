import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import MapPage from './pages/MapPage'
import CheckerLoginPage from './pages/CheckerLoginPage'
import CheckerSignupPage from './pages/CheckerSignupPage'
import CheckerPage from './pages/CheckerPage'
import CompletePage from './pages/CompletePage'
import DashboardLoginPage from './pages/DashboardLoginPage'
import DashboardSignupPage from './pages/DashboardSignupPage'
import DashboardPage from './pages/DashboardPage'
import CollectionsPage from './pages/CollectionsPage'
import CollectionStep1Page from './pages/CollectionStep1Page'
import CollectionStep2Page from './pages/CollectionStep2Page'
import CollectionStep3Page from './pages/CollectionStep3Page'
import StoragePage from './pages/StoragePage'
import ProcessingPage from './pages/ProcessingPage'
import StatusPage from './pages/StatusPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 공개 */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/map" element={<MapPage />} />

        {/* 검수자 */}
        <Route path="/checker/login" element={<CheckerLoginPage />} />
        <Route path="/checker/signup" element={<CheckerSignupPage />} />
        <Route path="/checker" element={
          <ProtectedRoute role="checker"><CheckerPage /></ProtectedRoute>
        } />
        <Route path="/checker/complete" element={
          <ProtectedRoute role="checker"><CompletePage /></ProtectedRoute>
        } />

        {/* 관리자 */}
        <Route path="/dashboard/login" element={<DashboardLoginPage />} />
        <Route path="/dashboard/signup" element={<DashboardSignupPage />} />
        <Route path="/dashboard" element={
          <ProtectedRoute role="admin"><DashboardPage /></ProtectedRoute>
        } />
        <Route path="/dashboard/collections" element={
          <ProtectedRoute role="admin"><CollectionsPage /></ProtectedRoute>
        } />
        <Route path="/dashboard/collections/:collectionId/step1" element={
          <ProtectedRoute role="admin"><CollectionStep1Page /></ProtectedRoute>
        } />
        <Route path="/dashboard/collections/:collectionId/step2" element={
          <ProtectedRoute role="admin"><CollectionStep2Page /></ProtectedRoute>
        } />
        <Route path="/dashboard/collections/:collectionId/step3" element={
          <ProtectedRoute role="admin"><CollectionStep3Page /></ProtectedRoute>
        } />
        <Route path="/dashboard/storage" element={
          <ProtectedRoute role="admin"><StoragePage /></ProtectedRoute>
        } />
        <Route path="/dashboard/processing" element={
          <ProtectedRoute role="admin"><ProcessingPage /></ProtectedRoute>
        } />
        <Route path="/dashboard/status" element={
          <ProtectedRoute role="admin"><StatusPage /></ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App