import { useState } from "react";
import { StickyNote, Trash2, X } from "lucide-react";

export interface ChartNoteItem {
  id: number;
  symbol: string;
  candleDate: string;
  text: string;
  createdAt: string;
}

interface NoteModalProps {
  symbol: string;
  candleDate: string;
  displayDate: string;
  existingNote: ChartNoteItem | null;
  onSave: (text: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
}

export default function NoteModal({
  displayDate,
  existingNote,
  onSave,
  onDelete,
  onClose,
}: NoteModalProps) {
  const [text, setText] = useState(existingNote?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave(text.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingNote) return;
    setDeleting(true);
    try {
      await onDelete(existingNote.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl animate-fadeUp"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px hsl(var(--primary)/0.1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-primary/70" />
            <span className="text-[13px] font-semibold text-foreground">
              {existingNote ? "Note — " : "Ajouter une note — "}
              <span className="text-primary font-mono">{displayDate}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Text area */}
        <textarea
          className="w-full rounded-xl border border-card-border bg-muted/30 text-[13px] text-foreground placeholder:text-muted-foreground/50 px-4 py-3 resize-none focus:outline-none focus:border-primary/40 transition-colors"
          rows={3}
          maxLength={200}
          placeholder="ex : surveiller ce niveau, résistance clé…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="text-[10px] text-muted-foreground/50 text-right mt-1 mb-4">
          {text.length}/200
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {existingNote && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-red-500 text-[12px] hover:bg-red-500/10 transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Suppression…" : "Supprimer"}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-border text-muted-foreground text-[12px] hover:bg-muted transition-all"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!text.trim() || saving}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-all disabled:opacity-40"
          >
            {saving ? "Enregistrement…" : existingNote ? "Mettre à jour" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
