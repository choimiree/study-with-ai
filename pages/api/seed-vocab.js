export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const rows = [
      { word:'prototype', meaning:'초기 시제품', example:'We built a quick prototype for user testing.', tags:['tech'] },
      { word:'iterate', meaning:'개선하며 반복하다', example:'Let’s iterate on the email copy.', tags:['business','tech'] },
      { word:'leverage', meaning:'지렛대처럼 활용하다', example:'Leverage your strengths in the meeting.', tags:['business'] },
      { word:'latency', meaning:'지연', example:'High latency hurts user experience.', tags:['tech'] },
      { word:'broadcast', meaning:'방송하다', example:'The company will broadcast the keynote.', tags:['media'] }
    ]
    const { error } = await s.from('daily_vocab').insert(rows)
    if (error) return res.status(500).json({ ok:false, error:String(error.message || error) })
    return res.status(200).json({ ok:true })
  } catch (e) { return res.status(500).json({ ok:false, error:String(e.message || e) }) }
}
