// pages/api/daily-picks.js
// 한국시간 기준으로 유저의 "오늘 추천"을 만들고(없으면) 반환합니다.
// - Listening 1개 (관심사 태그 우선, 없으면 랜덤)
// - Vocab N개 (관심사 태그 우선, 부족하면 전체에서 채움)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { userId, vocabLimit = 5 } = req.body || {}
    if (!userId) return res.status(400).json({ ok:false, error:'userId-required' })

    const { createClient } = await import('@supabase/supabase-js')
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 한국시간(Asia/Seoul) yyyy-mm-dd
    const now = new Date()
    const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    const day = kst.toISOString().slice(0,10)

    // 이미 오늘 것이 있으면 그대로 반환
    const existing = await s
      .from('user_daily_picks')
      .select('id, day, listening_id, vocab_ids, interests_snapshot')
      .eq('user_id', userId).eq('day', day).maybeSingle()

    if (existing.data) {
      const payload = await inflatePayload(s, existing.data)
      return res.status(200).json({ ok:true, day, ...payload })
    }

    // 관심사 1순위 태그(소문자) 가져오기
    const us = await s.from('user_settings').select('interests').eq('user_id', userId).maybeSingle()
    const tag = (us.data?.interests?.[0] || '').toString().toLowerCase() || null

    // --- Listening 1개 뽑기 ---
    let listeningId = null
    if (tag) {
      const q1 = await s.from('listening_materials')
        .select('id').contains('tags', [tag]).order('id', { ascending: false })
      const list = q1.data || []
      listeningId = list.length ? list[Math.floor(Math.random() * list.length)].id : null
    }
    if (!listeningId) {
      const qAny = await s.from('listening_materials').select('id').order('id', { ascending: false })
      const all = qAny.data || []
      listeningId = all.length ? all[Math.floor(Math.random() * all.length)].id : null
    }

    // --- Vocab N개 뽑기 ---
    let vocabIds = []
    if (tag) {
      const v1 = await s.from('daily_vocab')
        .select('id').contains('tags', [tag]).order('id', { ascending: false })
      const rows = v1.data || []
      shuffle(rows)
      vocabIds = rows.slice(0, vocabLimit).map(r => r.id)
    }
    if (vocabIds.length < vocabLimit) {
      const need = vocabLimit - vocabIds.length
      const vAny = await s.from('daily_vocab').select('id').order('id', { ascending: false })
      const pool = (vAny.data || []).filter(r => !vocabIds.includes(r.id))
      shuffle(pool)
      vocabIds.push(...pool.slice(0, need).map(r => r.id))
    }

    // upsert (하루 1행 보장)
    const ins = await s.from('user_daily_picks').insert({
      user_id: userId,
      day,
      listening_id: listeningId,
      vocab_ids: vocabIds,
      interests_snapshot: tag ? [tag] : []
    }).select('id, day, listening_id, vocab_ids, interests_snapshot').single()

    if (ins.error) return res.status(500).json({ ok:false, error:'insert-failed', details: String(ins.error.message || ins.error) })

    const payload = await inflatePayload(s, ins.data)
    return res.status(200).json({ ok:true, day, ...payload })
  } catch (e) {
    return res.status(500).json({ ok:false, error:'server-error', details:String(e.message || e) })
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

// id들로 실제 콘텐츠를 불러와서 리턴 형태를 정리
async function inflatePayload(s, row) {
  const out = { listening: null, vocab: [] }

  if (row.listening_id) {
    const lm = await s.from('listening_materials').select('id, title, audio_url, script, tags').eq('id', row.listening_id).maybeSingle()
    if (lm.data) out.listening = lm.data
  }

  if (row.vocab_ids?.length) {
    const vv = await s.from('daily_vocab').select('id, word, meaning, example, tags').in('id', row.vocab_ids)
    out.vocab = vv.data || []
    // 원래 순서대로 정렬(선택)
    const order = new Map(row.vocab_ids.map((id, i) => [id, i]))
    out.vocab.sort((a,b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }

  return out
}
