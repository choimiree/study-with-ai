
// 3) pages/report.js — 간단 리포트(평균/최근/약점 Top3)
import { useEffect, useState } from 'react'

export default function Report() {
  const [rows, setRows] = useState([])
  const [avg, setAvg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }
    const uid = session.user.id

    const { data } = await supabase
      .from('auto_scores')
      .select('created_at, score')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)

    setRows(data || [])
    if (data && data.length) {
      const nums = data.map(r => r.score?.overall).filter(Boolean)
      const a = Math.round(nums.reduce((s, n) => s + n, 0) / nums.length)
      setAvg(a)
    }
  }

  function topWeakness() {
    // 매우 단순: 마지막 점수에서 가장 낮은 서브 스코어 1~3개
    if (!rows.length) return []
    const last = rows[0].score || {}
    const pairs = Object.entries(last).filter(([k]) => k !== 'overall')
    return pairs.sort((a,b)=>a[1]-b[1]).slice(0,3).map(([k,v])=>`${k}: ${v}`)
  }

  return (
    <main style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>나의 리포트</h1>
      {!rows.length ? (
        <p>아직 점수가 없어요. Today에서 제출 후 임시 채점을 눌러보세요.</p>
      ) : (
        <>
          <p>최근 채점 개수: {rows.length} / 평균 Overall: {avg}</p>
          <p>취약 영역 TOP3(최근 제출 기준): {topWeakness().join(', ')}</p>
          <h3 style={{marginTop:16}}>최근 점수</h3>
          <ul>
            {rows.map((r, i) => (
              <li key={i}>
                {new Date(r.created_at).toLocaleString()} — Overall {r.score?.overall}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
