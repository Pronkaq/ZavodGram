import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import AuthPage from './pages/AuthPage';
import ChatApp from './components/ChatApp';
import AdminPage from './pages/AdminPage';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0C0E13' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #E03A4E, #7A0C18)', borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, fontFamily: 'monospace', color: '#fff', marginBottom: 16, animation: 'pulse 1.5s infinite' }}>Z</div>
          <div style={{ color: '#4A5060', fontSize: 14 }}>Загрузка...</div>
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }`}</style>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (window.location.pathname.startsWith('/admin')) {
    return <AdminPage />;
  }

  return (
    <ChatProvider>
      <ChatApp />
    </ChatProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
