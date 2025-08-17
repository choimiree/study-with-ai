// pages/today.js
import { useEffect, useState } from 'react'

export default function Today() {
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [missions, setMissions] = useState([])
  const [user, setUser] = useState(null)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      // 로그인 안 되어 있으면 /login 으로
      window.location.href = '/login'
      return
    }
    setUser(session.user)
    await loadMissions()
  }

  async function loadMissions() {
    setLoading(true)
    const { supabase } = await import('../utils/sb')
    const today = new Date().toISOString().slice(0, 10)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id

    const { data, error } = await supabase
      .from('missions')
      .select('*')
      .eq('user_id', uid)
      .eq('date', today)
      .order('id', { ascending: true })

    if (error) console.error(error)
    setMissions(data || [])
    setLoading(false)
  }

  async function ensureProfile(uid) {
    const { supabase } = await import('../utils/sb')
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, interests')
      .eq('user_id', uid)
      .maybeSingle()

    if (!profile) {
      await supabase.from('profiles').insert({
        user_id: uid,
        current_level: 'OPIC IH',
        strengths: ['Reading'],
        weaknesses: ['speaking', 'grammar', 'listening'],
        interests: ['AI', 'media', 'tech'],
        locale_ui: 'ko',
        explanation_lang: 'ko>en'
      })
      return ['AI', 'media', 'tech']
    }
    return profile.interests?.length ? profile.interests : ['tech']
  }

  async function createMissions() {
    setCreating(true)
    try {
      const { supabase } = await import('../utils/sb')
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      const today = new Date().toISOString().slice(0, 10)

      // 오늘 것이 이미 있으면 생성 안 함
      const { data: exist } = await supabase
        .from('missions').select('id')
        .eq('user_id', uid).eq('date', today)

      if (exist && exist.length) {
        alert('오늘의 미션이 이미 생성되어 있어요!')
        await loadMissions()
        return
      }

      const interests = await ensureProfile(uid)
      const topic = interests[0] || 'tech'

      const rows = [
        {
          user_id: uid, date: today, kind: 'speaking', difficulty: 'B1',
          prompt: `Talk for 60–90 seconds about ${topic}. Aim for CEFR B1. Use connectors like first, then, because.`
        },
        {
          user_id: uid, date: today, kind: 'writing', difficulty: 'B1',
          prompt: `Write a 130–150 word business-casual email about ${topic}. Keep it clear and friendly.`
        },
        {
          user_id: uid, date: today, kind: 'listening', difficulty: 'B1',
          prompt: `Watch a short talk on ${topic} (TED/Khan Academy allowed). Note 3 key points in English.`
        },
        {
          user_id: uid, date: today, kind: 'vocab', difficulty: 'B1',
          prompt: `Practice 10 NGSL words related to ${topic}. Make two example sentences for each.`
        }
      ]

      const { error } = await supabase.from('missions').insert(rows)
      if (error) throw error

      alert('오늘의 미션을 생성했어요!')
      await loadMissions()
    } catch (e) {
      console.error(e)
      alert('미션 생성 중 문제가 발생했습니다. (콘솔 확인)')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>오늘의 미션</h1>
      <div style={{ margin: '12px 0' }}>
        <button onClick={createMissions} disabled={creating} style={{ padding: '10px 14px', fontSize: 16 }}>
          {creating ? '생성 중…' : '오늘의 미션 자동 생성'}
        </button>
        <button
          onClick={async () => { const { supabase } = await import('../utils/sb'); await supabase.auth.signOut(); window.location.href = '/' }}
          style={{ marginLeft: 8, padding: '10px 14px' }}
        >
          로그아웃
        </button>
      </div>

      {loading ? (
        <p>불러오는 중…</p>
      ) : missions.length === 0 ? (
        <p>아직 미션이 없어요. 위 버튼을 눌러 생성해 보세요.</p>
      ) : (
        <ul>
          {missions.map(m => (
            <li key={m.id} style={{ margin: '12px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ fontSize: 12, opacity: .7 }}>{m.kind.toUpperCase()} · {m.difficulty}</div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{m.prompt}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
