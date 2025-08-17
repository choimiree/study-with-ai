// pages/api/score-speech.js
// (안정 버전) 스피킹 제출 → 전사(whisper-1) → 채점(JSON) → auto_scores 저장
export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: 'missing-openai-key' });
    }

    const { submissionId } = req.body || {};
    if (!submissionId) return res.status(400).json({ ok: false, error: 'submissionId required' });

    // ---- Supabase(Admin) ----
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 제출에서 사용자/파일 경로 조회
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('user_id, audio_url')
      .eq('id', submissionId)
      .maybeSingle();

    if (subErr) return res.status(500).json({ ok: false, error: 'db-read-failed' });
    if (!sub?.audio_url) return res.status(400).json({ ok: false, error: 'no-audio' });

    // 서명 URL 생성 → 파일 다운로드
    const { data: signed, error: signErr } = await supabase
      .storage.from('speaking-audio')
      .createSignedUrl(sub.audio_url, 60 * 10);
    if (signErr) return res.status(500).json({ ok: false, error: 'signed-url-failed' });

    const audioResp = await fetch(signed.signedUrl);
    if (!audioResp.ok) return res.status(500).json({ ok: false, error: 'audio-download-failed' });
    const audioArrayBuf = await audioResp.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuf);

    // ---- OpenAI: 전사 (whisper-1 안정 버전) ----
    // toFile 헬퍼를 써서 Node Buffer -> File 변환
    const OpenAI = (await import('openai')).default;
    const { toFile } = await import('openai/uploads');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const file = await toFile(audioBuffer, 'speech.webm', { type: 'audio/webm' });

    const transcriptResp = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1', // 호환성이 좋아 안정적
      // language: 'en', // 영어만이라면 명시 가능
    });

    const transcript = transcriptResp.text || '';

    // ---- OpenAI: 채점(JSON) ----
    // SDK 버전과 상관없이 파싱 쉬운 json_object 모드로 요청
    const chat = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an English speaking coach. Score the user speaking with CEFR B1 target and OPIC IH baseline.'
        },
        {
          role: 'user',
          content:
            `Transcript:\n${transcript}\n\n` +
            'Return strict JSON with keys: pronunciation, fluency, grammar, lexical, overall (0-100 integers), ' +
            'and feedback_md (short Markdown with 2-4 bullet points). Keep feedback positive and specific.'
        }
      ]
    });

    let parsed;
    try {
      const content = chat.choices?.[0]?.message?.content || '{}';
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ ok: false, error: 'json-parse-failed' });
    }

    const p = Number(parsed.pronunciation ?? 0);
    const f = Number(parsed.fluency ?? 0);
    const g = Number(parsed.grammar ?? 0);
    const l = Number(parsed.lexical ?? 0);
    const overall = Number.isFinite(parsed.overall)
      ? Number(parsed.overall)
      : Math.round((p + f + g + l) / 4);

    // ---- 저장 ----
    const { error: insErr } = await supabase.from('auto_scores').insert({
      submission_id: submissionId,
      user_id: sub.user_id,
      kind: 'speaking',
      score: { pronunciation: p, fluency: f, grammar: g, lexical: l, overall },
      feedback_md: String(parsed.feedback_md || '')
    });
    if (insErr) return res.status(500).json({ ok: false, error: 'db-insert-failed' });

    return res.status(200).json({ ok: true, transcript, score: { pronunciation: p, fluency: f, grammar: g, lexical: l, overall } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'score-failed' });
  }
}
