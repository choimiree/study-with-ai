
// 1) pages/today.js — 제출 UI + 임시 채점 버튼 추가 버전
import { useEffect, useState, useRef } from 'react'

export default function Today() {
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [missions, setMissions] = useState([])
  const [user, setUser] = useState(null)
  const [answers, setAnswers] = useState({}) // missionId -> text

  useEffect(() => { init() }, [])

  async function init() {
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }
    setUser(session.user)
    await loadMissions()
  }

  async function loadMissions() {
    setLoading(true)
    const { supabase } = await import('../utils/sb')
    const today = new Date().toISOString().slice(0, 10)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id

    const { data, error } = await supabase
      .from('missions')
      .select('*')
      .eq('user_id', uid)
      .eq('date', today)
      .order('id', { ascending: true })

    if (error) console.error(error)
    setMissions(data || [])
    setLoading(false)
  }

  async function ensureProfile(uid) {
    const { supabase } = await import('../utils/sb')
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, interests')
      .eq('user_id', uid)
      .maybeSingle()
    if (!profile) {
      await supabase.from('profiles').insert({
        user_id: uid,
        current_level: 'OPIC IH',
        strengths: ['Reading'],
        weaknesses: ['speaking','grammar','listening'],
        interests: ['AI','media','tech'],
        locale_ui: 'ko',
        explanation_lang: 'ko>en'
      })
      return ['AI','media','tech']
    }
    return profile.interests?.length ? profile.interests : ['tech']
  }

  async function createMissions() {
    setCreating(true)
    try {
      const { supabase } = await import('../utils/sb')
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      const today = new Date().toISOString().slice(0, 10)

      const { data: exist } = await supabase
        .from('missions').select('id')
        .eq('user_id', uid).eq('date', today)
      if (exist && exist.length) { alert('오늘의 미션이 이미 생성되어 있어요!'); await loadMissions(); return }

      const interests = await ensureProfile(uid)
      const topic = interests[0] || 'tech'
      const rows = [
        { user_id: uid, date: today, kind: 'speaking', difficulty: 'B1', prompt: `Talk for 60–90 seconds about ${topic}. Aim for CEFR B1.` },
        { user_id: uid, date: today, kind: 'writing',  difficulty: 'B1', prompt: `Write a 130–150 word business-casual email about ${topic}. Keep it clear and friendly.` },
        { user_id: uid, date: today, kind: 'listening',difficulty: 'B1', prompt: `Watch a short talk on ${topic} and note 3 key points.` },
        { user_id: uid, date: today, kind: 'vocab',    difficulty: 'B1', prompt: `Practice 10 NGSL words related to ${topic}.` }
      ]
      const { error } = await supabase.from('missions').insert(rows)
      if (error) throw error
      alert('오늘의 미션을 생성했어요!')
      await loadMissions()
    } catch (e) { console.error(e); alert('미션 생성 중 문제가 발생했습니다.') } finally { setCreating(false) }
  }

  async function submitWriting(missionId) {
    const text = answers[missionId]?.trim()
    if (!text) { alert('작성한 내용이 없어요.'); return }
  
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
  
    // 🔁 제출 + 제출ID 반환
    const { data: inserted, error } = await supabase
      .from('submissions')
      .insert({
        mission_id: missionId,
        user_id: uid,
        kind: 'writing',
        text_answer: text
      })
      .select('id')
      .single()
  
    if (error || !inserted?.id) { console.error(error); alert('제출 실패'); return }
  
    // 🤖 즉시 자동 채점(기존 임시 채점 API 재사용)
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: inserted.id, kind: 'writing' })
      })
      const j = await res.json()
      if (j.ok) alert('제출 + 자동 채점 완료! 리포트에서 확인하세요.')
      else alert('제출은 성공했지만 채점 실패: ' + (j.error || 'unknown'))
    } catch (e) {
      alert('제출은 성공했지만 채점 호출 실패')
    }
  }

  async function fakeScore(missionId) {
    // 가장 최근 제출을 찾아 채점(자리표시자)
    const { supabase } = await import('../utils/sb')
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id

    const { data: subs } = await supabase
      .from('submissions')
      .select('id')
      .eq('mission_id', missionId)
      .eq('user_id', uid)
      .order('id', { ascending: false })
      .limit(1)

    const submissionId = subs?.[0]?.id
    if (!submissionId) { alert('먼저 제출부터 해주세요.'); return }

    const res = await fetch('/api/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, kind: 'writing' })
    })
    const j = await res.json()
    if (j.ok) alert('임시 점수 저장 완료! 리포트에서 확인해 보세요.')
    else alert('채점 API 실패')
  }

  return (
    <main style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>오늘의 미션</h1>
      <div style={{ margin: '12px 0' }}>
        <button onClick={createMissions} disabled={creating} style={{ padding: '10px 14px', fontSize: 16 }}>
          {creating ? '생성 중…' : '오늘의 미션 자동 생성'}
        </button>
      </div>

      {loading ? (
        <p>불러오는 중…</p>
      ) : missions.length === 0 ? (
        <p>아직 미션이 없어요. 위 버튼을 눌러 생성해 보세요.</p>
      ) : (
        <ul>
          {missions.map(m => (
            <li key={m.id} style={{ margin: '12px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ fontSize: 12, opacity: .7 }}>{m.kind.toUpperCase()} · {m.difficulty}</div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{m.prompt}</div>

              {m.kind === 'writing' && (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={answers[m.id] || ''}
                    onChange={(e)=>setAnswers(prev=>({ ...prev, [m.id]: e.target.value }))}
                    placeholder="여기에 영어로 작성하세요"
                    style={{ width:'100%', minHeight: 120 }}
                  />
                  <div style={{ marginTop: 6, display:'flex', gap:8 }}>
                    <button onClick={()=>submitWriting(m.id)}>제출</button>
                  </div>
                </div>
              )}
              {m.kind === 'speaking' && (
                <div style={{ marginTop: 10 }}>
                  <MicRecorder missionId={m.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
// today.js 맨 아래의 MicRecorder 를 이 버전으로 교체
function MicRecorder({ missionId }) {
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [recording, setRecording] = useState(false)
  const [chunks, setChunks] = useState([])
  const [duration, setDuration] = useState(0)
  const timerRef = useRef(null)

  function getMime() {
    const preferred = 'audio/webm;codecs=opus'
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(preferred)) return preferred
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
    alert('이 브라우저는 음성 녹음(webm)을 지원하지 않아요. Chrome/Edge로 시도해주세요.')
    throw new Error('MediaRecorder not supported')
  }

  async function start() {
    try {
      setChunks([])
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: getMime(), audioBitsPerSecond: 128000 })
      mr.addEventListener('dataavailable', (e) => { if (e.data && e.data.size > 0) setChunks(prev => [...prev, e.data]) })
      mr.addEventListener('error', (e) => console.error('MediaRecorder error', e))
      mr.start(500) // 0.5초마다 chunk 수집
      setMediaRecorder(mr)
      setRecording(true)
      const startedAt = Date.now()
      timerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - startedAt) / 1000)), 200)
    } catch (e) {
      console.error(e)
      alert('마이크 권한을 허용해 주세요.')
    }
  }

  async function stop() {
    if (!mediaRecorder) return
    if (duration < 3) { alert('최소 3초 이상 녹음해 주세요.'); return }
    const stream = mediaRecorder.stream
    const done = new Promise(resolve => mediaRecorder.addEventListener('stop', () => resolve(), { once: true }))
    mediaRecorder.stop()
    setRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
    await done
    stream.getTracks().forEach(t => t.stop())
    await uploadCombined()
  }

  async function uploadCombined() {
    try {
      if (!chunks.length) { alert('녹음 데이터가 비어 있어요. 다시 시도해 주세요.'); return }
      const blob = new Blob(chunks, { type: 'audio/webm' })
      console.log('[MicRecorder] blob size:', blob.size, 'bytes, duration(s):', duration)

      const { supabase } = await import('../utils/sb')
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { alert('로그인이 필요합니다.'); return }

      // 1) 서버 API로 업로드 (Storage 저장)
      const res = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-user-id': uid,
          'x-duration': String(duration || 0),
          'x-filename': 'mic.webm'
        },
        body: await blob.arrayBuffer()
      })
      const j = await res.json()
      if (!j.ok) { alert('업로드 실패'); return }

      // 2) submissions에 기록 + ID 반환
      const { data: ins, error } = await supabase
        .from('submissions')
        .insert({
          mission_id: missionId,
          user_id: uid,
          kind: 'speaking',
          audio_url: j.path,
          duration_seconds: j.durationSeconds || null
        })
        .select('id')
        .single()

      if (error || !ins?.id) { console.error(error); alert('제출 기록 저장 실패'); return }

      // 3) 자동 채점 호출 (수동 버튼 없이 즉시 실행)
      try {
        const scoreRes = await fetch('/api/score-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId: ins.id })
        })
        let out; try { out = await scoreRes.json() } catch { out = { ok:false, error:'invalid-json' } }
        if (out.ok) {
          alert('녹음 제출 + 자동 채점 완료! 리포트에서 확인하세요.')
        } else {
          alert('녹음 제출은 성공, 채점 실패: ' + (out.error || 'unknown') + (out.details ? `\n- ${out.details}` : ''))
        }
      } catch (e) {
        alert('녹음 제출은 성공, 채점 호출 실패')
      }
    } catch (e) {
      console.error(e)
      alert('업로드 중 오류가 발생했어요.')
    } finally {
      // 다음 녹음을 위해 초기화
      setChunks([])
      setDuration(0)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {!recording ? (
        <button onClick={start}>🎙️ 녹음 시작</button>
      ) : (
        <button onClick={stop}>⏹️ 녹음 종료</button>
      )}
      {recording && <span>{duration}s</span>}
    </div>
  )
}
