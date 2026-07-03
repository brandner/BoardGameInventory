import { useState } from 'react';

export default function Auth({ onAuth, onCancel }: { onAuth: (pin: string) => void; onCancel?: () => void }) {
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAuth(pin);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg)] text-[var(--text)] px-4">
      <div className="max-w-sm w-full p-8 rounded-xl bg-white/5 shadow-[var(--shadow)] border border-[var(--border)] backdrop-blur-md">
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm opacity-70 hover:opacity-100 mb-4 transition-opacity"
          >
            ← Back to Search
          </button>
        )}
        <h2 className="text-2xl font-bold text-[var(--text-h)] mb-6 text-center">
          BoardGame<span className="text-[var(--accent)]">Inventory</span>
        </h2>
        <p className="text-sm text-center mb-6">Enter Admin PIN to access</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            autoFocus
            className="p-3 bg-[var(--code-bg)] border border-[var(--border)] rounded text-center text-xl tracking-widest text-[var(--text-h)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="****"
          />
          <button 
            type="submit" 
            className="p-3 bg-[var(--accent)] text-white font-bold rounded shadow-lg hover:brightness-110 transition-all active:scale-95"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
