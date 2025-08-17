// pages/settings.js — 관심사/약점/알림 채널 저장
import { useEffect, useState } from 'react'

const INTEREST_OPTIONS = ['AI','media','tech','travel','business','movies']
const WEAK_OPTIONS = ['speaking','listening','writing','vocab','grammar','pronunciation']
const NOTIFY_OPTIONS = ['email','push','none']

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState(null)
  const [interests, setInterests] = useState([])
  const [weakAreas, setWeakAreas] = useState([])
  const [notify, setNotify] = useState('email')

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }
    setEmail(session.user.email)
    const uid = session.user.id
    const { data } = await supabase.from('user_settings')
      .select('interests, weak_areas, notify_channel')
      .eq('user_id', uid).maybeSingle()
    if (data) {
      setInterests(data.interests || [])
      setWeakAreas(data.weak_areas || [])
      setNotify(data.notify_channel || 'email')
    }
    setLoading(false)
  }

  function toggle(list, value, setter) {
    if (list.includes(value)) setter(list.filter(v => v !== value))
    else setter([...list, value])
  }

  async function save() {
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { alert('로그인이 필요합니다.'); return }
    const { error } = await supabase.from('user_settings').upsert({
      user_id: uid,
      interests,
      weak_areas: weakAreas,
      notify_channel: notify,
      updated_at: new Date().toISOString()
    })
    if (error) { console.error(error); alert('저장 실패'); return }
    alert('저장 완료! 오늘의 미션 추천에 반영됩니다.')
  }

  return (
    <main style={{ padding:20, fontFamily:'system-ui' }}>
      <h1>설정</h1>
      <div style={{opacity:.7, fontSize:13}}>로그인: {email || '-'}</div>
      {loading ? <p>불러오는 중…</p> : (
        <>
          <section style={{marginTop:12}}>
            <h3>관심사</h3>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {INTEREST_OPTIONS.map(opt => (
                <label key={opt} style={{border:'1px solid #ccc', padding:'6px 10px', borderRadius:8}}>
                  <input type="checkbox"
                    checked={interests.includes(opt)}
                    onChange={() => toggle(interests, opt, setInterests)}
                    style={{marginRight:6}} />
                  {opt}
                </label>
              ))}
            </div>
          </section>

          <section style={{marginTop:12}}>
            <h3>약점</h3>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {WEAK_OPTIONS.map(opt => (
                <label key={opt} style={{border:'1px solid #ccc', padding:'6px 10px', borderRadius:8}}>
                  <input type="checkbox"
                    checked={weakAreas.includes(opt)}
                    onChange={() => toggle(weakAreas, opt, setWeakAreas)}
                    style={{marginRight:6}} />
                  {opt}
                </label>
              ))}
            </div>
          </section>

          <section style={{marginTop:12}}>
            <h3>알림 채널</h3>
            <select value={notify} onChange={(e)=>setNotify(e.target.value)}>
              {NOTIFY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </section>

          <div style={{marginTop:16}}>
            <button onClick={save}>저장</button>
            <a href="/today" style={{marginLeft:8, textDecoration:'none'}}>
              <button>오늘의 미션으로</button>
            </a>
          </div>
        </>
      )}
    </main>
  )
}
