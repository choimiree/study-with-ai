export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'})
  // TODO: 모델 연동하여 자동 채점
  return res.json({ ok: true, fakeScore: { overall: 75 } })
}