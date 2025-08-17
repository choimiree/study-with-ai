import { supabase } from '../../utils/sb'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { submissionId, rating } = req.body // rating: 'again' | 'hard' | 'good' | 'easy'

  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  if (error || !data) return res.status(400).json({ ok:false, error })

  let { ease_factor, interval_days } = data
  if (rating === 'again') {
    interval_days = 1
    ease_factor = Math.max(1.3, ease_factor - 0.2)
  } else if (rating === 'hard') {
    interval_days = Math.max(1, Math.floor(interval_days * 1.2))
    ease_factor -= 0.15
  } else if (rating === 'good') {
    interval_days = Math.floor(interval_days * ease_factor)
  } else if (rating === 'easy') {
    interval_days = Math.floor(interval_days * (ease_factor + 0.15))
    ease_factor += 0.1
  }
  const next_review_date = new Date()
  next_review_date.setDate(next_review_date.getDate() + interval_days)

  const { error: upErr } = await supabase
    .from('submissions')
    .update({ ease_factor, interval_days, next_review_date, review_status: rating })
    .eq('id', submissionId)

  if (upErr) return res.status(400).json({ ok:false, error: upErr })
  return res.json({ ok:true, next_review_date })
}
