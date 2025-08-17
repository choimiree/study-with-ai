// pages/review.js — submissions 기반 SRS 복습 v1 (경로 수정 완료)
import { useEffect, useMemo, useState } from 'react'

export default function Review() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState(null)
  const [rows, setRows] = useState([])
  const [idx, setIdx] = useState(0)

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    // ✅ 클라이언트에서 사용할 땐 동적 import + 경로는 한 단계만 올라감
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }
    setEmail(session.user.email)

    const uid = session.user.id
    const today = new Date().toISOString().slice(0,10)

    const { data, error } = await supabase
      .from('submissions')
      .select('id, kind, created_at, text_answer, audio_url, meta, next_review_date, ease_factor, interval_days, review_status, duration_seconds')
      .eq('user_id', uid)
      .in('kind', ['vocab','speaking','writing'])
      .or(`next_review_date.is.null,next_review_date.lte.${today}`)
      .order('next_review_date', { ascending: true, nullsFirst: true })
      .limit(30)

    if (error) console.error(error)
    setRows(data || [])
    setIdx(0)
    setLoading(false)
  }

  const leftCount = useMemo(() => Math.max(0, rows.length - idx), [rows, idx])
  const cur = rows[idx] || null

  function kindLabel(k) {
    if (k === 'vocab') return 'Vocab'
    if (k === 'speaking') return 'Speaking'
    if (k === 'writing') return 'Writing'
    return k
  }

  function previewFor(item) {
    if (!item) return null
    if (item.kind === 'writing') {
      const t = (item.text_answer || '').trim()
      return t ? (t.length > 140 ? t.slice(0,140) + '…' : t) : '— (작성 내용 없음)'
    }
    if (item.kind === 'vocab') {
      const ids = item?.meta?.vocab_ids
      if (Array.isArray(ids) && ids.length) return `오늘 단어 ${ids.length}개`
      return '단어 목록(메타) 없음'
    }
    if (item.kind === 'speaking') {
      const dur = item?.duration_seconds ? ` · ${item.duration_seconds}s` : ''
      return `녹음 제출${dur}`
    }
    return ''
  }

  async function grade(g) {
    if (!cur) return
    try {
      const res = await fetch('/api/review-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: cur.id, rating: g }) // 'again' | 'hard' | 'good' | 'easy'
      })
      const j = await res.json()
      if (!j.ok) {
        alert('저장 실패: ' + (j.error?.message || j.error || 'unknown'))
        return
      }
      const next = idx + 1
      if (next >= rows.length) {
        alert('오늘 복습 완료!')
        init()
      } else {
        setIdx(next)
      }
    } catch (e) {
      console.error(e)
      alert('네트워크 오류로 저장 실패')
    }
  }

  return (
    <main style={{ padding:20, fontFamily:'system-ui' }}>
      <h1>복습 (SRS)</h1>
      <div style={{opacity:.7,fontSize:13}}>로그인: {email || '-'}</div>

      {loading ? (
        <p>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <>
          <p>오늘 복습할 항목이 없어요.</p>
          <div style={{display:'flex', gap:8}}>
            <a href="/today" style={{textDecoration:'none'}}><button>오늘의 미션으로</button></a>
            <a href="/report" style={{textDecoration:'none'}}><button>리포트 보기</button></a>
          </div>
        </>
      ) : (
        <>
          <div style={{margin:'12px 0'}}>남은 카드: <b>{leftCount}</b> / {rows.length}</div>

          <div style={{border:'1px solid #ddd', borderRadius:12, padding:16, maxWidth:720}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:12, opacity:.7}}>
                {cur?.next_review_date ? `다음 복습일: ${cur.next_review_date}` : '첫 복습 스케줄 미설정'}
                {typeof cur?.ease_factor !== 'undefined' && <> · EF {Number(cur.ease_factor || 2.5).toFixed(2)}</>}
                {typeof cur?.interval_days !== 'undefined' && <> · 간격 {cur.interval_days || 1}d</>}
              </div>
              <div style={{fontWeight:600}}>{kindLabel(cur?.kind)}</div>
            </div>

            <div style={{marginTop:8, fontSize:16, whiteSpace:'pre-wrap'}}>
              {previewFor(cur)}
            </div>

            {cur?.kind === 'speaking' && (
              <div style={{marginTop:6, fontSize:12, opacity:.7}}>
                음성은 보안 저장소에 있어 이 화면에서 바로 재생하지 않아요. 상세 피드백은 <a href="/report">리포트</a>에서 확인하세요.
              </div>
            )}

            <div style={{display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:8, marginTop:12}}>
              <button onClick={()=>grade('again')}>❌ Again</button>
              <button onClick={()=>grade('hard')}>😐 Hard</button>
              <button onClick={()=>grade('good')}>🙂 Good</button>
              <button onClick={()=>grade('easy')}>🤩 Easy</button>
            </div>
          </div>

          <div style={{marginTop:12, display:'flex', gap:8}}>
            <button onClick={()=>setIdx(Math.max(0, idx-1))} disabled={idx===0}>이전</button>
            <button onClick={()=>setIdx(Math.min(rows.length-1, idx+1))} disabled={idx>=rows.length-1}>다음</button>
            <a href="/today" style={{marginLeft:'auto', textDecoration:'none'}}><button>오늘의 미션으로</button></a>
          </div>
        </>
      )}
    </main>
  )
}
