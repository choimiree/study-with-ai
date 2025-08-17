// pages/api/upload-audio.js
// 클라이언트에서 보낸 녹음 데이터(바이너리)를 Supabase Storage에 업로드
export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    // 헤더에서 값 받기
    const userId = req.headers['x-user-id']
    const duration = parseInt(req.headers['x-duration'] || '0', 10) || null
    const filename = req.headers['x-filename'] || `audio.webm`
    if (!userId) return res.status(400).json({ error: 'x-user-id header required' })

    // 바디를 버퍼로 읽기
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // Supabase Admin 클라이언트
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 고유 경로: speaking-audio/<userId>/<timestamp>_<filename>
    const timestamp = Date.now()
    const objectPath = `${userId}/${timestamp}_${filename}`

    const { error: uploadErr } = await supabase.storage
      .from('speaking-audio')
      .upload(objectPath, buffer, {
        contentType: 'audio/webm', // 브라우저 녹음 기본
        upsert: false
      })
    if (uploadErr) throw uploadErr

    // 다운로드용 서명 URL(선택): 필요할 때만 생성
    // const { data: signed } = await supabase.storage
    //   .from('speaking-audio').createSignedUrl(objectPath, 60 * 60)

    return res.status(200).json({
      ok: true,
      path: objectPath,
      contentType: 'audio/webm',
      durationSeconds: duration
      // signedUrl: signed?.signedUrl
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'upload-failed' })
  }
}
