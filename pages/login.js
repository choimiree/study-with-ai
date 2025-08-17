export default function Login() {
  return (
    <main style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>로그인</h1>
      <p>Google 계정으로 로그인하면 오늘의 미션을 볼 수 있어요.</p>
      <button
        onClick={async () => {
          const { supabase } = await import('../utils/sb')
          await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/today' },
          })
        }}
        style={{ padding: '10px 14px', fontSize: 16 }}
      >
        Google로 계속하기
      </button>
    </main>
  )
}
