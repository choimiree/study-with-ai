
// 2) pages/api/score.js — 자리표시자 자동 채점 API
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { submissionId, kind } = req.body || {}
    if (!submissionId) return res.status(400).json({ ok: false, error: 'submissionId required' })

    // 서버 측 Supabase(Admin) 클라이언트
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 제출의 user_id 가져오기
    const { data: sub } = await supabase.from('submissions').select('user_id').eq('id', submissionId).maybeSingle()

    // 임시 점수 + 피드백 저장
    await supabase.from('auto_scores').insert({
      submission_id: submissionId,
      user_id: sub?.user_id || null,
      kind: kind || 'writing',
      score: { overall: 75, pronunciation: 72, fluency: 74, grammar: 73, lexical: 76 },
      feedback_md: '**Overall 75**\n- Good clarity, improve variety.\n- Try using transition words (however, moreover).'
    })

    return res.json({ ok: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false })
  }
}
