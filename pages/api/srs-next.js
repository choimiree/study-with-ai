// pages/api/srs-next.js — SRS 스케줄 계산 & 저장 (SM-2 변형)
// YAML 기본값: initial_interval_days=1, ease_factor=2.5, review_cap=30
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { cardId, grade } = req.body || {}
    if (!cardId || !grade) return res.status(400).json({ ok:false, error:'bad-request' })

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 현재 카드
    const { data: card, error: readErr } = await supabase
      .from('srs_reviews')
      .select('id, user_id, ease_factor, interval_days, reps')
      .eq('id', cardId).maybeSingle()
    if (readErr || !card) return res.status(400).json({ ok:false, error:'not-found' })

    // ---- SM-2 간략 규칙 ----
    const today = new Date()
    let ef = Number(card.ease_factor ?? 2.5)
    let reps = Number(card.reps ?? 0)
    let interval = Number(card.interval_days ?? 1)

    // EF 조정
    if (grade === 1) ef = Math.max(1.3, ef - 0.2)         // Again
    if (grade === 2) ef = Math.max(1.3, ef - 0.15)        // Hard
    if (grade === 3) ef = ef                              // Good
    if (grade === 4) ef = ef + 0.15                       // Easy

    // 반복/간격
    if (grade < 3) {
      reps = 0
      interval = 1
    } else {
      reps = (reps || 0) + 1
      if (reps === 1) interval = 1
      else if (reps === 2) interval = 6
      else interval = Math.max(1, Math.round(interval * ef))
    }

    const next = new Date(today); next.setDate(today.getDate() + interval)
    const due_on = next.toISOString().slice(0,10)

    const { error: updErr } = await supabase
      .from('srs_reviews')
      .update({
        ease_factor: ef,
        interval_days: interval,
        reps,
        last_grade: grade,
        due_on
      })
      .eq('id', cardId)

    if (updErr) return res.status(500).json({ ok:false, error:'update-failed' })
    return res.status(200).json({ ok:true, due_on, ef, interval, reps })
  } catch (e) {
    console.error(e); return res.status(500).json({ ok:false, error:'server-error' })
  }
}
