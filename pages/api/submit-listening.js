// pages/api/submit-listening.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { userId, materialId } = req.body || {}
    if (!userId || !materialId) return res.status(400).json({ ok:false, error:'bad-request' })

    const { createClient } = await import('@supabase/supabase-js')
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const today = new Date().toISOString().slice(0,10)
    const { data, error } = await s.from('submissions').insert({
      user_id: userId,
      kind: 'listening',
      date: today,
      meta: { material_id: materialId }
    }).select('id').single()

    if (error) return res.status(500).json({ ok:false, error:'insert-failed', details:String(error.message || error) })
    return res.status(200).json({ ok:true, submissionId: data.id })
  } catch (e) {
    return res.status(500).json({ ok:false, error:'server-error', details:String(e.message || e) })
  }
}
