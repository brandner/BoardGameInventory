import { useState, useRef, useEffect } from 'react';

type DraftGame = { id: string; title: string; publisher?: string };
type ShelfOverview = { id: string; name: string; photo_url: string; game_count: number; created_at: string };

export default function AdminPanel({ pin }: { pin: string }) {
  const [shelfName, setShelfName] = useState('');
  const [aiHints, setAiHints] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [loadingShelves, setLoadingShelves] = useState(true);
  
  const [stage, setStage] = useState<'dashboard' | 'upload' | 'review' | 'success'>('dashboard');
  const [shelves, setShelves] = useState<ShelfOverview[]>([]);
  const [draftGames, setDraftGames] = useState<DraftGame[]>([]);
  const [totalBoxes, setTotalBoxes] = useState<number>(0);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState('');
  const [insertedCount, setInsertedCount] = useState(0);
  const [serverWarning, setServerWarning] = useState('');

  // Modal State
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [viewingGamesShelfId, setViewingGamesShelfId] = useState<string | null>(null);
  const [shelfGames, setShelfGames] = useState<any[]>([]);
  const [loadingShelfGames, setLoadingShelfGames] = useState(false);
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === 'dashboard') {
      fetchShelves();
    }
  }, [stage]);

  useEffect(() => {
    if (viewingGamesShelfId) {
      setLoadingShelfGames(true);
      fetch(`/api/admin/shelves/${viewingGamesShelfId}/games`, { headers: { 'x-app-pin': pin } })
        .then(res => res.json())
        .then(data => setShelfGames(data.games || []))
        .catch(console.error)
        .finally(() => setLoadingShelfGames(false));
    } else {
      setShelfGames([]);
    }
  }, [viewingGamesShelfId, pin]);

  const fetchShelves = async () => {
    setLoadingShelves(true);
    try {
      const res = await fetch(`/api/admin/shelves`, { headers: { 'x-app-pin': pin } });
      const data = await res.json();
      if (data.shelves) setShelves(data.shelves);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingShelves(false);
    }
  };

  const handleWipeInventory = async () => {
    const totalGames = shelves.reduce((sum, s) => sum + (s.game_count || 0), 0);
    const typed = window.prompt(
      `🚨 CRITICAL WARNING 🚨\n\nThis will permanently delete ${shelves.length} shelves and ${totalGames} games. This cannot be undone.\n\nType WIPE (all caps) to confirm.`
    );
    if (typed === null) return;
    if (typed !== 'WIPE') {
      alert('Confirmation text did not match "WIPE". Wipe cancelled.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/reset`, { method: 'POST', headers: { 'x-app-pin': pin } });
      if (res.ok) {
        alert("Inventory successfully wiped.");
        fetchShelves();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to wipe database.");
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/admin/export`, { headers: { 'x-app-pin': pin } });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bgi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to export backup.');
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetch(`/api/admin/export.csv`, { headers: { 'x-app-pin': pin } });
      if (!res.ok) throw new Error('Export failed');
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bgi-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to export CSV.');
    }
  };

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;

    let parsed;
    try {
      parsed = JSON.parse(await selected.text());
    } catch {
      alert('That file is not valid JSON.');
      return;
    }

    if (!Array.isArray(parsed.shelves)) {
      alert('That file does not look like a BoardGameInventory backup.');
      return;
    }

    const gameCount = parsed.shelves.reduce((sum: number, s: any) => sum + (s.games?.length || 0), 0);
    const typed = window.prompt(
      `🚨 RESTORE WARNING 🚨\n\nThis will REPLACE your current inventory with the backup:\n${parsed.shelves.length} shelves, ${gameCount} games.\n\nEverything currently in the database will be deleted first. This cannot be undone.\n\nType RESTORE (all caps) to confirm.`
    );
    if (typed === null) return;
    if (typed !== 'RESTORE') {
      alert('Confirmation text did not match "RESTORE". Import cancelled.');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`/api/admin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-pin': pin },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (data.success) {
        alert(`Restored ${data.shelfCount} shelves and ${data.gameCount} games.`);
        fetchShelves();
      } else {
        alert(data.error || 'Import failed');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to import backup.');
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedUrl = URL.createObjectURL(e.target.files[0]);
      setFile(e.target.files[0]);
      setPreviewUrl(selectedUrl);
    }
  };

  const analyzeShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !shelfName) return;
    
    setLoadingAnalyze(true);
    setServerWarning('');

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('shelf_name', shelfName);
    formData.append('ai_hints', aiHints);

    try {
      const res = await fetch(`/api/admin/analyze-shelf`, {
        method: 'POST',
        headers: { 'x-app-pin': pin },
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        setUploadedPhotoUrl(data.photoUrl);
        setDraftGames(data.draftGames || []);
        if (data.totalBoxes) setTotalBoxes(data.totalBoxes);
        if (data.warning) setServerWarning(data.warning);
        setStage('review');
      } else {
        alert(data.error || 'Failed to analyze shelf');
      }
    } catch (e) {
      console.error(e);
      alert('Error communicating with server');
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const commitShelf = async () => {
    if (!uploadedPhotoUrl || !shelfName) return;
    
    setLoadingCommit(true);
    try {
      const res = await fetch(`/api/admin/commit-shelf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-pin': pin
        },
        body: JSON.stringify({
          shelfName,
          photoUrl: uploadedPhotoUrl,
          games: draftGames
        })
      });
      const data = await res.json();
      if (data.success) {
        setInsertedCount(data.count);
        setStage('success');
      } else {
        alert(data.error || 'Commit failed');
      }
    } catch (e) {
      console.error(e);
      alert('Error communicating with server');
    } finally {
      setLoadingCommit(false);
    }
  };

  const updateDraft = (id: string, field: keyof DraftGame, value: string) => {
    setDraftGames(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const removeDraft = (id: string) => {
    setDraftGames(prev => prev.filter(g => g.id !== id));
  };

  const addManualGame = () => {
    setDraftGames(prev => [...prev, { id: crypto.randomUUID(), title: '', publisher: '' }]);
  };

  const resetFlow = () => {
    setShelfName('');
    setAiHints('');
    setFile(null);
    setPreviewUrl('');
    setDraftGames([]);
    setTotalBoxes(0);
    setUploadedPhotoUrl('');
    setInsertedCount(0);
    setServerWarning('');
    setStage('dashboard');
  };

  return (
    <div className="w-full max-w-5xl flex flex-col items-center animate-fade-in gap-6 pb-20">
      
      <div className="text-center w-full flex items-center justify-between border-b border-[var(--border)] pb-4">
        {(stage === 'upload' || stage === 'review') && (
           <button onClick={() => setStage('dashboard')} className="text-sm border border-[var(--border)] px-4 py-2 rounded hover:bg-[var(--border)] transition-colors">
             ← Dashboard
           </button>
        )}
        <h2 className="text-3xl font-bold text-[var(--text-h)] flex-grow">
          {stage === 'dashboard' ? 'Admin Dashboard' : 'Cataloger'}
        </h2>
        {(stage === 'upload' || stage === 'review') && <div className="w-24 opacity-0">spacer</div>}
      </div>

      {stage === 'dashboard' && (
        <div className="w-full flex flex-col gap-6 animate-slide-up">
          <div className="flex justify-between items-center bg-[var(--social-bg)] p-6 rounded-2xl border border-[var(--accent-border)]">
            <div>
              <div className="text-2xl font-bold text-[var(--text-h)]">{shelves.length} Shelves Logged</div>
              <div className="opacity-80">Administrative tabular breakdown</div>
            </div>
            <button 
              onClick={() => setStage('upload')}
              className="px-6 py-4 rounded-xl font-bold shadow-md bg-[var(--accent)] text-white hover:brightness-110 active:scale-95 transition-all text-lg"
            >
              + Catalog New Shelf
            </button>
          </div>

          {loadingShelves ? (
            <div className="py-20 text-center opacity-60">Loading inventory data...</div>
          ) : shelves.length === 0 ? (
            <div className="py-20 text-center px-4 rounded-2xl border border-dashed border-[var(--border)] opacity-70">
               No shelves found. Start by clicking 'Catalog New Shelf' to take a photo!
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--code-bg)] shadow-sm">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-sm uppercase opacity-70 bg-black/10">
                    <th className="p-4 font-medium">Shelf Name</th>
                    <th className="p-4 font-medium hidden sm:table-cell">Date Logged</th>
                    <th className="p-4 font-medium text-center">Games</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shelves.map(shelf => (
                    <tr key={shelf.id} className="border-b border-[var(--border)] hover:bg-white/5 transition-colors group">
                      <td className="p-4 font-bold text-[var(--text-h)]">{shelf.name}</td>
                      <td className="p-4 text-sm opacity-80 hidden sm:table-cell">{new Date(shelf.created_at).toLocaleDateString()}</td>
                      <td className="p-4 text-center">
                        <span className="bg-[var(--accent-bg)] text-[var(--accent)] font-bold px-3 py-1 rounded-full text-xs">
                          {shelf.game_count}
                        </span>
                      </td>
                      <td className="p-4 flex gap-3 justify-end items-center">
                        <button 
                          onClick={() => setViewingPhotoUrl(shelf.photo_url)} 
                          className="text-sm font-medium border border-[var(--border)] px-4 py-2 rounded hover:border-[var(--accent)] transition-colors"
                        >
                          📷 Photo
                        </button>
                        <button 
                          onClick={() => setViewingGamesShelfId(shelf.id)} 
                          className="text-sm font-medium px-4 py-2 rounded bg-[var(--accent)] text-white hover:brightness-110 transition-colors shadow"
                        >
                          📋 List
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-between items-center gap-4 pt-8 border-t border-[var(--border)]">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExport}
                className="px-6 py-2 border border-[var(--border)] rounded font-medium hover:bg-[var(--border)] transition-colors"
              >
                ⬇️ Export Backup
              </button>
              <button
                onClick={handleExportCsv}
                className="px-6 py-2 border border-[var(--border)] rounded font-medium hover:bg-[var(--border)] transition-colors"
              >
                📄 Export CSV
              </button>
              <button
                onClick={() => importFileInputRef.current?.click()}
                disabled={importing}
                className="px-6 py-2 border border-[var(--border)] rounded font-medium hover:bg-[var(--border)] transition-colors disabled:opacity-50"
              >
                {importing ? 'Restoring...' : '⬆️ Import / Restore'}
              </button>
              <input
                ref={importFileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportFileSelected}
              />
            </div>
            <button
              onClick={handleWipeInventory}
              className="px-6 py-2 border border-red-500/30 text-red-500 rounded font-medium hover:bg-red-500 hover:text-white transition-colors"
            >
              ⚠️ Wipe Inventory
            </button>
          </div>
        </div>
      )}

      {stage === 'upload' && (
        <form onSubmit={analyzeShelf} className="w-full max-w-2xl mt-4 flex flex-col gap-6 text-left">
          
          <label className="flex flex-col gap-2 font-medium">
            Shelf Location / Name
            <input 
              required 
              placeholder="e.g. Hallway Top Shelf"
              className="p-3 border border-[var(--border)] rounded-md bg-[var(--code-bg)] focus:border-[var(--accent)] outline-none"
              value={shelfName}
              onChange={e => setShelfName(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2 font-medium">
            Hints for AI (Optional)
            <input 
              placeholder="e.g. 'Look closely for Stonemaier games'"
              className="p-3 border border-[var(--border)] rounded-md bg-[var(--social-bg)] focus:border-[var(--accent)] outline-none"
              value={aiHints}
              onChange={e => setAiHints(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-2 font-medium">
            Photo of the Shelf
            <div 
              className="w-full h-64 border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center p-4 cursor-pointer hover:bg-[var(--social-bg)] transition-colors relative overflow-hidden group"
              onClick={() => fileInputRef.current?.click()}
            >
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                  <div className="relative z-10 bg-black/50 text-white px-4 py-2 rounded shadow backdrop-blur-md">Change Photo</div>
                </>
              ) : (
                <span className="opacity-80 text-sm">Click to open camera or select photo</span>
              )}
              <input 
                required={!previewUrl}
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                onChange={handleFileChange}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loadingAnalyze || !file || !shelfName}
            className="w-full py-4 rounded-xl font-bold shadow-md bg-[var(--accent)] text-white hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {loadingAnalyze ? 'Processing via Gemini...' : 'Analyze Photo'}
          </button>
        </form>
      )}

      {stage === 'review' && (
        <div className="w-full flex flex-col lg:flex-row gap-8 mt-4 animate-slide-up">
          <div className="lg:w-1/3 flex flex-col gap-4">
             <div className="font-medium text-[var(--text-h)] pb-2 border-b border-[var(--border)]">Reference Image</div>
             <img src={previewUrl} alt="Analyzed Shelf" className="w-full h-auto rounded-lg shadow border border-[var(--border)]" />
             <div className="text-sm bg-[var(--code-bg)] p-3 rounded">
               <strong>Shelf:</strong> {shelfName}
             </div>
          </div>

          <div className="lg:w-2/3 flex flex-col gap-4">
            <div className="font-medium text-[var(--text-h)] pb-2 border-b border-[var(--border)] flex justify-between items-center">
              <span>Review Draft ({draftGames.length})</span>
              <button onClick={addManualGame} className="text-xs font-bold text-[var(--accent)] px-3 py-1 bg-[var(--accent-bg)] rounded hover:brightness-110 transition-colors">
                + Add Missing Game
              </button>
            </div>
            
            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {totalBoxes > 0 && totalBoxes !== draftGames.length && (
                 <div className="p-3 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 text-sm flex items-center justify-between shadow-sm">
                   <span><strong>🔍 QC Scan:</strong> Gemini counted ~{totalBoxes} boxes on the shelf but only confidently extracted {draftGames.length} titles.</span>
                 </div>
              )}
              
              {draftGames.length === 0 && (
                <div className="p-4 bg-yellow-500/10 text-yellow-600 rounded border border-yellow-500/20 text-sm">
                  Gemini didn't detect any games. Please add them manually below.
                </div>
              )}
              
              {serverWarning && (
                <div className="p-4 bg-red-500/10 text-red-500 rounded border border-red-500/20 text-sm font-medium">
                  {serverWarning}
                </div>
              )}
              
              {draftGames.map((game, i) => (
                <div key={game.id} className="flex gap-2 items-start p-3 bg-white/5 border border-[var(--border)] rounded shadow-sm hover:border-[var(--accent-border)] transition-colors">
                  <div className="text-sm flex-shrink-0 pt-2 opacity-50 w-6 text-center">{i+1}</div>
                  <div className="flex-grow grid gap-2">
                    <input 
                      placeholder="Game Title" 
                      value={game.title} 
                      onChange={e => updateDraft(game.id, 'title', e.target.value)}
                      className="w-full p-2 bg-transparent border-b border-[var(--border)] focus:border-[var(--accent)] outline-none font-bold text-[var(--text-h)] transition-colors"
                    />
                    <input 
                      placeholder="Publisher (Optional)" 
                      value={game.publisher || ''} 
                      onChange={e => updateDraft(game.id, 'publisher', e.target.value)}
                      className="w-full p-2 bg-transparent text-sm outline-none opacity-80"
                    />
                  </div>
                  <button onClick={() => removeDraft(game.id)} className="p-2 text-red-400 hover:bg-red-400/10 rounded ml-2 transition-colors">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-4 mt-4 pt-4 border-t border-[var(--border)]">
              <button 
                onClick={() => setStage('upload')}
                className="px-6 py-3 border border-[var(--border)] rounded font-medium hover:bg-[var(--border)] transition-colors"
              >
                Go Back
              </button>
              <button 
                onClick={commitShelf}
                disabled={loadingCommit}
                className="flex-grow py-3 bg-[var(--text-h)] text-[var(--bg)] rounded font-bold hover:opacity-90 shadow-lg disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {loadingCommit ? 'Saving...' : 'Confirm & Save Shelf'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'success' && (
        <div className="max-w-md w-full mt-8 p-8 rounded-2xl border border-[var(--accent-border)] bg-gradient-to-b from-[var(--accent-bg)] to-transparent text-center animate-slide-up shadow-sm">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold text-[var(--text-h)] mb-2">Shelf Committed!</h3>
          <p className="opacity-90 mb-6">Successfully logged <strong>{insertedCount}</strong> games to '{shelfName}'.</p>
          
          <button 
            onClick={resetFlow}
            className="px-8 py-4 bg-[var(--accent)] text-white font-bold rounded-xl shadow-md hover:brightness-110 active:scale-95 transition-all text-lg"
          >
            Done
          </button>
        </div>
      )}

      {viewingPhotoUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewingPhotoUrl(null)}>
           <div className="relative max-w-4xl max-h-screen">
             <img src={`${viewingPhotoUrl}?pin=${pin}`} alt="Shelf" className="w-full h-auto max-h-[90vh] object-contain rounded-xl shadow-2xl" />
             <button title="Close" className="absolute top-4 right-4 bg-black/50 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
           </div>
        </div>
      )}

      {viewingGamesShelfId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewingGamesShelfId(null)}>
           <div className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
             <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--social-bg)]">
                <h3 className="font-bold text-xl text-[var(--text-h)]">Live Inventory</h3>
                <button onClick={() => setViewingGamesShelfId(null)} className="text-xl opacity-60 hover:text-red-500 transition-colors px-2">✕</button>
             </div>
             <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                {loadingShelfGames ? (
                   <div className="text-center py-8 opacity-60">Pulling records...</div>
                ) : shelfGames.length === 0 ? (
                   <div className="text-center py-8 text-yellow-500">No games found mapped to this shelf ID.</div>
                ) : (
                   shelfGames.map((g, i) => (
                     <div key={g.id} className="p-3 border border-[var(--border)] rounded-lg bg-[var(--code-bg)] flex justify-between items-center">
                        <div className="flex flex-col">
                           <span className="font-bold text-[var(--text-h)]">{g.title}</span>
                           {g.publisher && <span className="text-xs opacity-60 mt-0.5">{g.publisher}</span>}
                        </div>
                        <div className="text-xs opacity-40 font-mono">#{i + 1}</div>
                     </div>
                   ))
                )}
             </div>
           </div>
        </div>
      )}

    </div>
  );
}
