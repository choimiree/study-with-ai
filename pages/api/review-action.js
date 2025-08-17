// pages/api/review-action.js — SRS 업데이트 (service role 사용)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { submissionId, rating } = req.body || {}
    if (!submissionId || !rating) return res.status(400).json({ ok:false, error:'bad-request' })

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 대상 제출 읽기
    const { data: sub, error: readErr } = await supabase
      .from('submissions')
      .select('id, user_id, ease_factor, interval_days')
      .eq('id', submissionId)
      .maybeSingle()
    if (readErr || !sub) return res.status(400).json({ ok:false, error:'not-found' })

    // 기본값
    let ef = Number(sub.ease_factor ?? 2.5)
    let interval = Number(sub.interval_days ?? 1)

    // 등급별 규칙 (간단 SM-2 변형)
    if (rating === 'again') {
      ef = Math.max(1.3, ef - 0.2)
      interval = 1
    } else if (rating === 'hard') {
      ef = Math.max(1.3, ef - 0.15)
      interval = Math.max(1, Math.round(interval * 1.2))
    } else if (rating === 'good') {
      interval = Math.max(1, Math.round(interval * ef))
    } else if (rating === 'easy') {
      ef = ef + 0.1
      interval = Math.max(1, Math.round(interval * (ef + 0.15)))
    } else {
      return res.status(400).json({ ok:false, error:'invalid-rating' })
    }

    const next = new Date(); next.setDate(next.getDate() + interval)
    const next_review_date = next.toISOString().slice(0,10)

    const { error: updErr } = await supabase
      .from('submissions')
      .update({
        ease_factor: ef,
        interval_days: interval,
        next_review_date,
        review_status: rating
      })
      .eq('id', submissionId)

    if (updErr) return res.status(500).json({ ok:false, error:'update-failed', details:String(updErr.message || updErr) })
    return res.status(200).json({ ok:true, next_review_date })
  } catch (e) {
    return res.status(500).json({ ok:false, error:'server-error', details:String(e.message || e) })
  }
}
