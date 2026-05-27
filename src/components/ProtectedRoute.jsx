import { Navigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'

/**
 * Wraps a route and redirects to / if the required access level isn't met.
 * requiredLevel: 'member' | 'leadership'
 */
export default function ProtectedRoute({ children, requiredLevel }) {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <p style={{ color: '#a1a1aa' }}>Verifying access…</p>
      </div>
    )
  }

  if (requiredLevel === 'member' && !user?.isFactionMember) {
    return <Navigate to="/" replace />
  }

  if (requiredLevel === 'leadership' && !user?.isLeader) {
    return <Navigate to="/" replace />
  }

  return children
}
