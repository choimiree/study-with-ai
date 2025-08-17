// pages/api/score-speech.js
// 안정 버전: Supabase에서 파일 읽기 → OpenAI REST(whisper-1)로 직접 전사 → 채점(JSON) → 저장
export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ==== 환경 변수 체크 ====
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!OPENAI_API_KEY) return res.status(500).json({ ok: false, error: 'missing-openai-key' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      return res.status(500).json({ ok: false, error: 'missing-supabase-env' });

    const { submissionId } = req.body || {};
    if (!submissionId) return res.status(400).json({ ok: false, error: 'submissionId-required' });

    // ==== Supabase(Admin) ====
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 제출 레코드 조회(파일 경로)
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('user_id, audio_url, duration_seconds')
      .eq('id', submissionId)
      .maybeSingle();

    if (subErr) return res.status(500).json({ ok: false, error: 'db-read-failed', details: String(subErr.message || subErr) });
    if (!sub?.audio_url) return res.status(400).json({ ok: false, error: 'no-audio' });

    // 서명 URL 생성 → 파일 다운로드
    const { data: signed, error: signErr } = await supabase
      .storage.from('speaking-audio')
      .createSignedUrl(sub.audio_url, 60 * 10);
    if (signErr) return res.status(500).json({ ok: false, error: 'signed-url-failed', details: String(signErr.message || signErr) });

    const audioResp = await fetch(signed.signedUrl);
    if (!audioResp.ok) return res.status(500).json({ ok: false, error: 'audio-download-failed', details: String(audioResp.status) });

    const audioArrayBuf = await audioResp.arrayBuffer();
    if (!audioArrayBuf || audioArrayBuf.byteLength < 512) {
      return res.status(400).json({ ok: false, error: 'audio-empty-or-too-small' });
    }
    const blob = new Blob([audioArrayBuf], { type: 'audio/webm' });

    // ==== OpenAI: 전사 (REST 직접 호출) ====
    let transcript = '';
    try {
      const form = new FormData();
      form.append('file', blob, 'speech.webm');
      form.append('model', 'whisper-1'); // 호환성 높음
      // form.append('language', 'en'); // 영어만이라면 명시 가능

      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form
      });

      const data = await resp.json();
      if (!resp.ok) {
        return res.status(500).json({ ok: false, error: 'transcription-failed', details: JSON.stringify(data) });
      }
      transcript = data.text || '';
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'transcription-failed', details: String(e.message || e) });
    }

    // ==== OpenAI: 채점(JSON) ====
    let parsed;
    try {
      const chatResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system',
              content: 'You are an English speaking coach. Score the user at CEFR B1 target (OPIC IH baseline).'
            },
            { role: 'user',
              content:
                `Transcript:\n${transcript}\n\n` +
                'Return strict JSON with keys: pronunciation, fluency, grammar, lexical, overall (0-100 integers),' +
                ' and feedback_md (2-4 bullet Markdown). Keep feedback positive and specific.'
            }
          ]
        })
      });
      const j = await chatResp.json();
      if (!chatResp.ok) {
        return res.status(500).json({ ok: false, error: 'scoring-failed', details: JSON.stringify(j) });
      }
      parsed = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'json-parse-failed', details: String(e.message || e) });
    }

    const p = Number(parsed.pronunciation ?? 0);
    const f = Number(parsed.fluency ?? 0);
    const g = Number(parsed.grammar ?? 0);
    const l = Number(parsed.lexical ?? 0);
    const overall = Number.isFinite(parsed.overall) ? Number(parsed.overall) : Math.round((p + f + g + l) / 4);

    // ==== 저장 ====
    const { error: insErr } = await supabase.from('auto_scores').insert({
      submission_id: submissionId,
      user_id: sub.user_id,
      kind: 'speaking',
      score: { pronunciation: p, fluency: f, grammar: g, lexical: l, overall },
      feedback_md: String(parsed.feedback_md || '')
    });
    if (insErr) return res.status(500).json({ ok: false, error: 'db-insert-failed', details: String(insErr.message || insErr) });

    return res.status(200).json({ ok: true, score: { pronunciation: p, fluency: f, grammar: g, lexical: l, overall } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'score-failed', details: String(e.message || e) });
  }
}
