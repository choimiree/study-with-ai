import Link from 'next/link'

export default function Home() {
  return (
    <main style={{padding:20,fontFamily:'system-ui'}}>
      <h1>Study with AI</h1>
      <p>영어 학습을 시작해 볼까요?</p>
      <ul>
        <li><Link href="/today">오늘의 미션</Link></li>
        <li><Link href="/settings">설정</Link></li>
      </ul>
    </main>
  )
}