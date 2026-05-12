import { useEffect, useState } from "react";
import { listMemories, deleteMemory } from "../../services/memoryStore";
import { encodeMemoryUrl } from "../../services/shareLink";

/**
 * Memory gallery — grid of saved memories with open / share / delete.
 *
 * Plays a selected memory by handing the config back to the parent via
 * onOpen(config) — SurfaceRouter routes it through the reels surface
 * with a one-shot override so the user sees their reel immediately.
 */
export default function MemoryGallery({ onOpen, onCancel }) {
  const [memories, setMemories] = useState([]);
  const [copied, setCopied] = useState(null);

  useEffect(() => { setMemories(listMemories()); }, []);

  const handleDelete = (savedId) => {
    if (!window.confirm("Delete this memory? This can't be undone.")) return;
    deleteMemory(savedId);
    setMemories(listMemories());
  };

  const handleShare = async (config, savedId) => {
    const enc = encodeMemoryUrl(config);
    if (!enc) return;
    const url = `${window.location.origin}${window.location.pathname}?surface=reels&memory=${enc}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(savedId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this share URL:", url);
    }
  };

  return (
    <div className="memories">
      <header className="memories-header">
        <h1 className="memories-title">My memories</h1>
        <button type="button" className="composer-cancel" onClick={onCancel} aria-label="Back to Atlas">×</button>
      </header>

      {memories.length === 0 ? (
        <div className="memories-empty">
          <p>No saved memories yet.</p>
          <p className="composer-hint">Compose one and hit Save to keep it here.</p>
        </div>
      ) : (
        <ul className="memories-grid">
          {memories.slice().reverse().map((m) => (
            <li key={m.savedId} className="memory-card">
              <div className="memory-card-body">
                <h3 className="memory-card-title">{m.config.title}</h3>
                <p className="memory-card-meta">
                  {(m.config.routes?.[0]?.waypoints?.length ?? 0)} points
                  {" · "}
                  {(m.config.landmarks?.length ?? 0)} landmarks
                  {" · "}
                  {new Date(m.savedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="memory-card-actions">
                <button type="button" className="composer-preview" onClick={() => onOpen?.(m.config)}>Open</button>
                <button type="button" className="memory-share" onClick={() => handleShare(m.config, m.savedId)}>
                  {copied === m.savedId ? "Copied!" : "Share"}
                </button>
                <button type="button" className="memory-delete" onClick={() => handleDelete(m.savedId)} aria-label="Delete memory">×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
