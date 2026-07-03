import { useState, useEffect } from 'react';
import UserSearch from './components/UserSearch';
import AdminPanel from './components/AdminPanel';
import Auth from './components/Auth';

function App() {
  const [pin, setPin] = useState(localStorage.getItem('app_pin') || '');
  // Optimistic: if a PIN is already stored, assume it's still valid until /auth/verify says otherwise.
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(!!pin);
  const [view, setView] = useState<'search' | 'admin'>('search');

  // Verify PIN on startup or change (only gates the Admin view — Search is public)
  useEffect(() => {
    if (!pin) return;
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsAdminAuthenticated(true);
          localStorage.setItem('app_pin', pin);
        } else {
          setIsAdminAuthenticated(false);
          localStorage.removeItem('app_pin');
          setPin('');
        }
      })
      .catch(() => setIsAdminAuthenticated(false));
  }, [pin]);

  const handleLogout = () => {
    setPin('');
    setIsAdminAuthenticated(false);
    localStorage.removeItem('app_pin');
    setView('search');
  };

  if (view === 'admin' && !isAdminAuthenticated) {
    return <Auth onAuth={setPin} onCancel={() => setView('search')} />;
  }

  return (
    <div className="min-h-screen flex flex-col w-full bg-[var(--bg)] text-[var(--text)] font-sans">
      <header className="flex justify-between items-center p-4 border-b border-[var(--border)]">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-h)]">
          BoardGame<span className="text-[var(--accent)]">Inventory</span>
        </h1>
        <nav className="flex gap-4">
          <button
            className={`font-medium transition-colors ${view === 'search' ? 'text-[var(--accent)]' : 'hover:text-[var(--text-h)]'}`}
            onClick={() => setView('search')}
          >
            Search
          </button>
          <button
            className={`font-medium transition-colors ${view === 'admin' ? 'text-[var(--accent)]' : 'hover:text-[var(--text-h)]'}`}
            onClick={() => setView('admin')}
          >
            Admin
          </button>
          {isAdminAuthenticated && (
            <button
              className="text-sm border border-[var(--border)] px-3 py-1 rounded hover:bg-[var(--border)] transition-colors"
              onClick={handleLogout}
            >
              Logout
            </button>
          )}
        </nav>
      </header>

      <main className="flex-grow p-4 md:p-8 flex flex-col items-center">
        {view === 'search'
          ? <UserSearch pin={isAdminAuthenticated ? pin : undefined} />
          : <AdminPanel pin={pin} />}
      </main>
    </div>
  );
}

export default App;
