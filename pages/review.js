// pages/review.js — SRS 복습(최대 30개), 간단 SM-2 변형
import { useEffect, useState } from 'react'

export default function Review() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState(null)
  const [cards, setCards] = useState([])   // [{id, front, back, due_on, ease_factor, interval_days, reps}]
  const [idx, setIdx] = useState(0)

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }
    setEmail(session.user.email)
    const uid = session.user.id

    // 오늘/기한 지난 카드 30개
    const today = new Date().toISOString().slice(0,10)
    const { data, error } = await supabase
      .from('srs_reviews')
      .select('id, front, back, due_on, ease_factor, interval_days, reps')
      .eq('user_id', uid)
      .lte('due_on', today)
      .order('due_on', { ascending: true })
      .limit(30)
    if (error) console.error(error)
    setCards(data || [])
    setIdx(0)
    setLoading(false)
  }

  async function grade(g) {
    // g: 1=Again, 2=Hard, 3=Good, 4=Easy
    const cur = cards[idx]; if (!cur) return
    const res = await fetch('/api/srs-next', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: cur.id, grade: g })
    })
    const j = await res.json()
    if (!j.ok) { alert('스케줄 저장 실패'); return }
    // 다음 카드로
    const next = idx + 1
    if (next >= cards.length) {
      alert('오늘 복습 완료!')
      init() // 목록 갱신
    } else {
      setIdx(next)
    }
  }

  async function seed() {
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { alert('로그인이 필요합니다.'); return }
  
    const res = await fetch('/api/seed-srs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid })
    })
    let j; try { j = await res.json() } catch { j = { ok:false, error:'invalid-json' } }
    if (j.ok) {
      await init()
    } else {
      alert('시드 추가 실패: ' + (j.error || 'unknown') + (j.details ? `\n- ${j.details}` : ''))
    }
  }

  const cur = cards[idx]

  return (
    <main style={{ padding:20, fontFamily:'system-ui' }}>
      <h1>복습(SRS)</h1>
      <div style={{opacity:.7,fontSize:13}}>로그인: {email || '-'}</div>

      {loading ? <p>불러오는 중…</p> : (
        <>
          <div style={{margin:'12px 0'}}>오늘 복습 카드: <b>{cards.length - idx}</b> / {cards.length}</div>

          {!cur ? (
            <>
              <p>오늘 복습할 카드가 없어요.</p>
              <button onClick={seed}>샘플 단어 12개 추가</button>
              <a href="/today" style={{ marginLeft:8, textDecoration:'none' }}>
                <button>오늘의 미션으로</button>
              </a>
            </>
          ) : (
            <div style={{border:'1px solid #ddd', borderRadius:12, padding:16, maxWidth:600}}>
              <div style={{fontSize:12,opacity:.7}}>Due: {cur.due_on} · EF {cur.ease_factor?.toFixed?.(2)} · Int {cur.interval_days}d · Rep {cur.reps}</div>
              <div style={{fontSize:28, fontWeight:700, marginTop:6}}>{cur.front}</div>
              <details style={{marginTop:8}}>
                <summary>정답 보기</summary>
                <div style={{marginTop:8, fontSize:16, whiteSpace:'pre-wrap'}}>{cur.back}</div>
              </details>

              <div style={{display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:8, marginTop:12}}>
                <button onClick={()=>grade(1)}>Again</button>
                <button onClick={()=>grade(2)}>Hard</button>
                <button onClick={()=>grade(3)}>Good</button>
                <button onClick={()=>grade(4)}>Easy</button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
