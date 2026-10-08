import { useState } from 'react'
import LoginPage from './pages/LoginPage.jsx'
import MainPage from './pages/MainPage.jsx'

export default function App() {
  const [user, setUser] = useState(null)

  if (!user) return <LoginPage onLogin={setUser} />
  return <MainPage user={user} onLogout={() => setUser(null)} />
}
