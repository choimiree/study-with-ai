// pages/api/score-speech.js
export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: 'missing-openai-key' });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return res.status(500).json({ ok: false, error: 'missing-supabase-env' });
    }

    const { submissionId } = req.body || {};
    if (!submissionId) return res.status(400).json({ ok: false, error: 'submissionId-required' });

    // ---- Supabase(Admin) ----
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 제출 조회
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('user_id, audio_url')
      .eq('id', submissionId)
      .maybeSingle();

    if (subErr) return res.status(500).json({ ok: false, error: 'db-read-failed', details: String(subErr.message || subErr) });
    if (!sub?.audio_url) return res.status(400).json({ ok: false, error: 'no-audio' });

    // 서명 URL → 파일 다운로드
    const { data: signed, error: signErr } = await supabase
      .storage.from('speaking-audio')
      .createSignedUrl(sub.audio_url, 60 * 10);
    if (signErr) return res.status(500).json({ ok: false, error: 'signed-url-failed', details: String(signErr.message || signErr) });

    const audioResp = await fetch(signed.signedUrl);
    if (!audioResp.ok) return res.status(500).json({ ok: false, error: 'audio-download-failed', details: String(audioResp.status) });
    const audioArrayBuf = await audioResp.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuf);

    // ---- 전사 (whisper-1) ----
    const OpenAI = (await import('openai')).default;
    const { toFile } = await import('openai/uploads');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let transcript = '';
    try {
      const file = await toFile(audioBuffer, 'speech.webm', { type: 'audio/webm' });
      const transcriptResp = await client.audio.transcriptions.create({
        file, model: 'whisper-1'
      });
      transcript = transcriptResp.text || '';
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'transcription-failed', details: String(e.message || e) });
    }

    // ---- 채점(JSON) ----
    let parsed;
    try {
      const chat = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an English speaking coach. Score the user at CEFR B1 target (OPIC IH baseline).' },
          { role: 'user', content:
              `Transcript:\n${transcript}\n\n` +
              'Return strict JSON with keys: pronunciation, fluency, grammar, lexical, overall (0-100 integers),' +
              ' and feedback_md (2-4 bullet Markdown). Keep feedback positive and specific.'
          }
        ]
      });
      const content = chat.choices?.[0]?.message?.content || '{}';
      parsed = JSON.parse(content);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'scoring-failed', details: String(e.message || e) });
    }

    const p = Number(parsed.pronunciation ?? 0);
    const f = Number(parsed.fluency ?? 0);
    const g = Number(parsed.grammar ?? 0);
    const l = Number(parsed.lexical ?? 0);
    const overall = Number.isFinite(parsed.overall) ? Number(parsed.overall) : Math.round((p + f + g + l) / 4);

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
