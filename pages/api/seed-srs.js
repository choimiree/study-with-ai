// pages/api/seed-srs.js
// service_role로 SRS 샘플 12개 삽입 (RLS/권한 회피)
// 테이블이 없으면 "table-missing" 에러를 명시적으로 반환
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { userId } = req.body || {}
    if (!userId) return res.status(400).json({ ok:false, error:'userId-required' })

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 테이블 존재 여부 검사
    const probe = await supabase.from('srs_reviews').select('id').limit(1)
    if (probe.error && String(probe.error.message || probe.error).includes('does not exist')) {
      return res.status(400).json({ ok:false, error:'table-missing' })
    }

    const today = new Date().toISOString().slice(0,10)
    const items = [
      ['algorithm','A set of rules to solve a problem'],
      ['dataset','A collection of data used for analysis'],
      ['prototype','An early sample to test a concept'],
      ['iterate','To repeat to improve a result'],
      ['deploy','To release a product or feature'],
      ['outage','A period when a service is unavailable'],
      ['roadmap','A plan that shows goals and timelines'],
      ['leverage','To use something to get a better result'],
      ['broadcast','To send content to many people'],
      ['survey','A method of collecting opinions'],
      ['metric','A number used to measure performance'],
      ['latency','Delay before a transfer of data begins']
    ].map(([front, back]) => ({
      user_id: userId,
      front, back,
      ease_factor: 2.5,
      interval_days: 1,
      reps: 0,
      last_grade: null,
      due_on: today
    }))

    const { error } = await supabase.from('srs_reviews').insert(items)
    if (error) return res.status(500).json({ ok:false, error:'insert-failed', details:String(error.message || error) })

    return res.status(200).json({ ok:true })
  } catch (e) {
    return res.status(500).json({ ok:false, error:'server-error', details:String(e.message || e) })
  }
}
