// pages/report.js — 리포트 v2 (탭/평균/최근/피드백 표시)
import { useEffect, useMemo, useState } from 'react'

export default function Report() {
  const [rows, setRows] = useState([])
  const [kind, setKind] = useState('speaking') // 'speaking' | 'writing'
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState(null)

  useEffect(() => { init() }, [kind])

  async function init() {
    setLoading(true)
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }
    setEmail(session.user.email)

    const uid = session.user.id
    const { data, error } = await supabase
      .from('auto_scores')
      .select('created_at, score, feedback_md, kind')
      .eq('user_id', uid)
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) console.error(error)
    setRows(data || [])
    setLoading(false)
  }

  const metrics = useMemo(() => {
    if (!rows.length) return { avg: null, latest: null, trend: null }
    const nums = rows.map(r => r.score?.overall).filter(n => typeof n === 'number')
    const avg = nums.length ? Math.round(nums.reduce((s,n)=>s+n,0)/nums.length) : null
    const latest = rows[0]
    // 아주 단순한 추세: 최근 5개 평균 vs 그 전 5개 평균
    const first5 = nums.slice(0,5), next5 = nums.slice(5,10)
    const avgA = first5.length ? (first5.reduce((s,n)=>s+n,0)/first5.length) : null
    const avgB = next5.length ? (next5.reduce((s,n)=>s+n,0)/next5.length) : null
    const trend = (avgA && avgB) ? Math.round(avgA - avgB) : null
    return { avg, latest, trend }
  }, [rows])

  function renderFeedback(md) {
    if (!md) return null
    // 아주 가볍게 마크다운 불릿만 처리
    const lines = String(md).split('\n').map(s=>s.trim()).filter(Boolean)
    return (
      <ul style={{ marginTop: 6 }}>
        {lines.map((line, i) => {
          const text = line.replace(/^[-*]\s?/, '')
          return <li key={i} style={{ marginLeft: 18 }}>{text}</li>
        })}
      </ul>
    )
  }

  return (
    <main style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>나의 리포트</h1>
      <div style={{opacity:.8, fontSize:13, marginBottom:8}}>로그인: {email || '-'}</div>

      {/* 탭 */}
      <div style={{ display:'flex', gap:8, margin:'8px 0 16px' }}>
        <button
          onClick={()=>setKind('speaking')}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ccc',
                   background: kind==='speaking' ? '#eef5ff' : 'white' }}
        >스피킹</button>
        <button
          onClick={()=>setKind('writing')}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ccc',
                   background: kind==='writing' ? '#eef5ff' : 'white' }}
        >라이팅</button>
        <a href="/today" style={{ marginLeft:'auto', textDecoration:'none'
