import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Home() {
  const [email, setEmail] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('../utils/sb')
        const { data: { session } } = await supabase.auth.getSession()
        setEmail(session?.user?.email || null)
      } catch {}
    })()
  }, [])

  return (
    <main style={{padding:20,fontFamily:'system-ui'}}>
      <h1>Study with AI</h1>
      <p>영어 학습을 시작해 볼까요?</p>
      <p style={{opacity:.8}}>로그인: {email ? email : '미로그인'}</p>
      <ul>
        <li><Link href="/today">오늘의 미션</Link></li>
        <li><Link href="/settings">설정</Link></li>
        {!email && <li><Link href="/login">로그인</Link></li>}
      </ul>
    </main>
  )
}
