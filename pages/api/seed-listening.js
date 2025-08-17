export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const rows = [
      { title:'AI Daily — Short briefing', audio_url:'https://cdn.pixabay.com/download/audio/2021/08/04/audio_96c3.mp3?filename=short-notice.mp3', script:'Today we discuss...', tags:['AI','tech'] },
      { title:'Travel Tips — Packing light', audio_url:'https://cdn.pixabay.com/download/audio/2022/02/23/audio_e0a1.mp3?filename=tips.mp3', script:'When you travel...', tags:['travel'] }
    ]
    const { error } = await s.from('listening_materials').insert(rows)
    if (error) return res.status(500).json({ ok:false, error:String(error.message || error) })
    return res.status(200).json({ ok:true })
  } catch (e) { return res.status(500).json({ ok:false, error:String(e.message || e) }) }
}
