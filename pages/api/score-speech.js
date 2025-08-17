// pages/api/score-speech.js
// 스피킹 제출(녹음 파일) → 전사 → 채점(JSON 보장) → auto_scores 저장
export const config = { api: { bodyParser: true } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { submissionId } = req.body || {}
    if (!submissionId) return res.status(400).json({ ok: false, error: 'submissionId required' })

    // ---- Supabase(Admin) ----
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 제출에서 사용자/파일 경로 조회
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('user_id, audio_url')
      .eq('id', submissionId)
      .maybeSingle()
    if (subErr || !sub?.audio_url) return res.status(400).json({ ok: false, error: 'no-audio' })

    // 서명 URL 생성 → 파일 다운로드
    const { data: signed, error: signErr } = await supabase
      .storage.from('speaking-audio')
      .createSignedUrl(sub.audio_url, 60 * 10) // 10분 유효
    if (signErr) return res.status(500).json({ ok: false, error: 'signed-url-failed' })

    const audioResp = await fetch(signed.signedUrl)
    const audioArrayBuf = await audioResp.arrayBuffer()
    const audioBuffer = Buffer.from(audioArrayBuf)

    // ---- OpenAI: 전사 ----
    // Audio API /audio/transcriptions — 모델: gpt-4o(-mini)-transcribe 또는 whisper-1
    // Docs: https://platform.openai.com/docs/guides/audio
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // OpenAI SDK는 Node Readable/File 객체를 기대 → Buffer를 Blob로 감싸 전달
    const transcriptResp = await client.audio.transcriptions.create({
      file: new File([audioBuffer], 'speech.webm', { type: 'audio/webm' }),
      model: 'gpt-4o-mini-transcribe', // 필요시 'whisper-1'
      // language: 'en'  // 영어 위주면 명시 가능
    })
    const transcript = transcriptResp.text || ''  // { text: "..." } 형태

    // ---- OpenAI: 채점(Structured Output) ----
    // JSON 스키마에 맞춰 안전하게 채점값을 받기
    // Docs(Structured Outputs): https://platform.openai.com/docs/guides/structured-outputs
    const scoringSchema = {
      type: 'object',
      properties: {
        pronunciation: { type: 'integer', minimum: 0, maximum: 100 },
        fluency:       { type: 'integer', minimum: 0, maximum: 100 },
        grammar:       { type: 'integer', minimum: 0, maximum: 100 },
        lexical:       { type: 'integer', minimum: 0, maximum: 100 },
        overall:       { type: 'integer', minimum: 0, maximum: 100 },
        feedback_md:   { type: 'string' }
      },
      required: ['pronunciation','fluency','grammar','lexical','overall','feedback_md'],
      additionalProperties: false
    }

    const resp = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content:
            'You are an English speaking coach. Score the user speaking at CEFR B1 target and OPIC IH baseline. ' +
            'Return concise, actionable feedback in Markdown (2-4 bullets).'
        },
        {
          role: 'user',
          content:
            `Transcript:\n${transcript}\n\n` +
            'Criteria: pronunciation, fluency, grammar, lexical variety. ' +
            'Return 0-100 for each and overall. Keep feedback positive, specific, and short.'
        }
      ],
      // Structured Outputs (JSON schema hard guarantee)
      response_format: { type: 'json_schema', json_schema: { name: 'SpeakingScore', schema: scoringSchema } }
    })

    const parsed = JSON.parse(resp.output[0].content[0].text) // SDK v4 Responses 구조
    // 혹시 overall이 없으면 평균으로 보정
    const overall = Number.isFinite(parsed.overall)
      ? parsed.overall
      : Math.round((parsed.pronunciation + parsed.fluency + parsed.grammar + parsed.lexical) / 4)

    // ---- 저장 ----
    await supabase.from('auto_scores').insert({
      submission_id: submissionId,
      user_id: sub.user_id,
      kind: 'speaking',
      score: {
        pronunciation: parsed.pronunciation,
        fluency: parsed.fluency,
        grammar: parsed.grammar,
        lexical: parsed.lexical,
        overall
      },
      feedback_md: parsed.feedback_md
    })

    return res.status(200).json({ ok: true, transcript, score: { ...parsed, overall } })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false, error: 'score-failed' })
  }
}
