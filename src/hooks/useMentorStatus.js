import { useState, useEffect } from 'react'
import { useSession } from './useSession'
import { API_BASE_URL } from '../config/api'

// Leaders always get full access — short-circuits without a network call.
// Non-leaders may still be a mentor (a row in the mentors table, independent
// of Torn faction position), which needs a live check since mentor status
// isn't baked into the JWT.
export function useMentorStatus() {
  const { user } = useSession()
  const [status, setStatus] = useState({ isLeader: false, isMentor: false, mentorId: null, loading: true })

  useEffect(() => {
    if (!user) { setStatus({ isLeader: false, isMentor: false, mentorId: null, loading: false }); return }
    if (user.isLeader) { setStatus({ isLeader: true, isMentor: false, mentorId: null, loading: false }); return }

    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/mentoring/my-access`, { headers: { Authorization: token } })
      .then(r => r.json())
      .then(data => setStatus({ isLeader: !!data.isLeader, isMentor: !!data.isMentor, mentorId: data.mentorId ?? null, loading: false }))
      .catch(() => setStatus({ isLeader: false, isMentor: false, mentorId: null, loading: false }))
  }, [user?.tornUserId, user?.isLeader])

  return status
}
