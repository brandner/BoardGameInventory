import { useState, useEffect } from 'react';

export default function UserSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  
  // Manual entry state
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualPublisher, setManualPublisher] = useState('');
  const [manualShelf, setManualShelf] = useState('');
  const [isNewShelf, setIsNewShelf] = useState(false);
  const [shelves, setShelves] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    if (showManual && shelves.length === 0) {
      fetch(`/api/games/shelves`)
        .then(res => res.json())
        .then(data => {
          if (data.shelves && data.shelves.length > 0) {
            setShelves(data.shelves);
            setManualShelf(data.shelves[0].name);
          } else {
            setIsNewShelf(true);
          }
        })
        .catch(console.error);
    }
  }, [showManual, shelves.length]);

  const search = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query) return;

    setLoading(true);
    setSearched(true);
    setShowManual(false);

    try {
      const res = await fetch(`/api/games/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const submitManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualShelf) return;

    await fetch(`/api/games/manual-entry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: manualTitle,
        publisher: manualPublisher,
        shelf_name: manualShelf
      })
    });

    setShowManual(false);
    setQuery(manualTitle);
    await search();
  };

  return (
    <div className="w-full max-w-3xl flex flex-col items-center animate-fade-in gap-8">
      <div className="text-center">
        <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-[var(--text-h)] to-[var(--accent)] drop-shadow-sm pb-2">
          Find your game.
        </h2>
        <p className="text-lg opacity-80 mt-2">Search your shelves by title or publisher.</p>
      </div>

      <form onSubmit={search} className="w-full relative shadow-[var(--shadow)] rounded-full overflow-hidden flex bg-[var(--code-bg)] focus-within:ring-2 ring-[var(--accent)] transition-all">
        <input 
          type="text" 
          placeholder="e.g. Catan..." 
          className="flex-grow p-4 md:p-5 bg-transparent border-none outline-none text-[var(--text-h)] text-lg placeholder-gray-400"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="submit" className="px-6 md:px-8 bg-[var(--accent)] text-white font-bold hover:brightness-110 transition-all">
          Search
        </button>
      </form>

      {loading && <div className="spinner my-8">Loading...</div>}

      {!loading && searched && results.length > 0 && (
        <div className="w-full flex flex-col gap-4">
          <h3 className="font-semibold text-lg text-left">Results ({results.length})</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {results.map((game, i) => (
              <div key={i} className="p-4 border border-[var(--border)] rounded-xl bg-white/5 backdrop-blur shadow-sm hover:shadow-[var(--shadow)] transition-shadow text-left flex flex-col justify-between group">
                <div>
                  <h4 className="font-bold text-[var(--text-h)] text-xl group-hover:text-[var(--accent)] transition-colors">{game.title}</h4>
                  <div className="text-sm opacity-80 mt-1">{game.publisher || 'Unknown Publisher'}</div>
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-bg)] text-[var(--accent)] font-medium text-sm">
                    Location: {game.shelf_name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && searched && results.length === 0 && !showManual && (
        <div className="w-full text-center p-8 border border-[var(--border)] rounded-2xl bg-[var(--social-bg)]">
          <h3 className="text-xl font-bold text-[var(--text-h)] mb-2">No results found</h3>
          <p className="mb-4">We couldn't find "{query}" on your shelves.</p>
          <button 
            onClick={() => { setShowManual(true); setManualTitle(query); }}
            className="text-[var(--accent)] font-medium underline underline-offset-4 hover:brightness-125"
          >
            If you end up finding it, log it here!
          </button>
        </div>
      )}

      {showManual && (
        <form onSubmit={submitManualEntry} className="w-full p-6 border border-[var(--accent-border)] rounded-2xl bg-[var(--accent-bg)] flex flex-col gap-4 text-left animate-slide-up">
          <div className="flex justify-between items-center">
             <div>
               <h3 className="font-bold text-lg text-[var(--text-h)]">Log missing game</h3>
               <p className="text-sm">Help the system remember where this game lives.</p>
             </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 mt-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Title
              <input required value={manualTitle} onChange={e=>setManualTitle(e.target.value)} className="p-2 border border-[var(--border)] rounded bg-white/10" />
            </label>
            
            <div className="flex flex-col gap-1 text-sm font-medium">
              <div className="flex justify-between">
                <span>Location / Shelf</span>
                {shelves.length > 0 && (
                  <button 
                    type="button" 
                    onClick={() => { setIsNewShelf(!isNewShelf); setManualShelf(''); }}
                    className="text-[var(--accent)] text-xs underline"
                  >
                    {isNewShelf ? 'Select Existing' : '+ New Location'}
                  </button>
                )}
              </div>
              
              {!isNewShelf && shelves.length > 0 ? (
                <select 
                  required 
                  value={manualShelf} 
                  onChange={e=>setManualShelf(e.target.value)}
                  className="p-2 border border-[var(--border)] rounded bg-[var(--code-bg)] text-white"
                >
                  <option value="" disabled>Select a shelf...</option>
                  {shelves.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <input 
                  required 
                  value={manualShelf} 
                  onChange={e=>setManualShelf(e.target.value)} 
                  placeholder="e.g. Shelf 3" 
                  className="p-2 border border-[var(--border)] rounded bg-white/10" 
                />
              )}
            </div>
            
            <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
              Publisher (Optional)
              <input value={manualPublisher} onChange={e=>setManualPublisher(e.target.value)} className="p-2 border border-[var(--border)] rounded bg-white/10" />
            </label>
          </div>
          
          <div className="flex gap-4 mt-2">
            <button type="submit" className="flex-1 bg-[var(--accent)] text-white font-bold py-2 rounded shadow hover:brightness-110 transition text-center">
              Save Location
            </button>
            <button type="button" onClick={() => setShowManual(false)} className="px-4 border border-[var(--border)] rounded hover:bg-[var(--border)] transition-colors cursor-pointer">
              Cancel
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
