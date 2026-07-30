/**
 * Page : Continuité des tâches d'agents IA
 * ─────────────────────────────────────────────────────────────────────────────
 * Permet de voir les tâches démarrées par des agents précédents, leur avancement,
 * les étapes complétées, les prochaines étapes, et les notes de reprise.
 * Un nouvel agent (dans un remix) consulte cette page pour continuer là où
 * l'ancien s'est arrêté.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Play,
  AlertCircle,
  ListChecks,
  ArrowRight,
  StickyNote,
} from "lucide-react";

const BASE_API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AgentTask {
  id: number;
  title: string;
  description: string;
  status: "in_progress" | "paused" | "completed" | "cancelled";
  stepsCompleted: string[];
  nextSteps: string[];
  checkpointNotes: string;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

const STATUS_CONFIG = {
  in_progress: {
    label: "En cours",
    icon: Play,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
  paused: {
    label: "En pause",
    icon: PauseCircle,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  completed: {
    label: "Terminée",
    icon: CheckCircle2,
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
    badge: "bg-green-500/20 text-green-300 border-green-500/30",
  },
  cancelled: {
    label: "Annulée",
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    badge: "bg-red-500/20 text-red-300 border-red-500/30",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskCard({ task, onRefresh }: { task: AgentTask; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(task.status === "paused" || task.status === "in_progress");
  const { toast } = useToast();
  const qc = useQueryClient();

  const updateTask = useMutation({
    mutationFn: async (patch: Partial<AgentTask>) => {
      const r = await fetch(`${BASE_API}/api/agent-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-tasks"] });
      onRefresh();
    },
    onError: () => toast({ title: "Erreur de mise à jour", variant: "destructive" }),
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE_API}/api/agent-tasks/${task.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-tasks"] });
      toast({ title: "Tâche supprimée" });
    },
    onError: () => toast({ title: "Erreur de suppression", variant: "destructive" }),
  });

  const cfg = STATUS_CONFIG[task.status];
  const Icon = cfg.icon;

  return (
    <Card className={`border transition-all duration-200 ${cfg.bg}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <button
            className="flex items-center gap-3 flex-1 text-left"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded
              ? <ChevronDown className="w-4 h-4 text-foreground/50 flex-shrink-0 mt-0.5" />
              : <ChevronRight className="w-4 h-4 text-foreground/50 flex-shrink-0 mt-0.5" />
            }
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-semibold">{task.title}</CardTitle>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${cfg.badge}`}>
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </span>
              </div>
              <p className="text-xs text-foreground/50 mt-1">
                Démarré le {formatDate(task.startedAt)}
                {task.pausedAt && ` · Mis en pause le ${formatDate(task.pausedAt)}`}
                {task.completedAt && ` · Terminé le ${formatDate(task.completedAt)}`}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            {task.status === "in_progress" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
                onClick={() => updateTask.mutate({ status: "paused" })}
                disabled={updateTask.isPending}
              >
                <PauseCircle className="w-3.5 h-3.5 mr-1" />
                Pause
              </Button>
            )}
            {task.status === "paused" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300"
                onClick={() => updateTask.mutate({ status: "in_progress" })}
                disabled={updateTask.isPending}
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                Reprendre
              </Button>
            )}
            {(task.status === "in_progress" || task.status === "paused") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-green-400 hover:text-green-300"
                onClick={() => updateTask.mutate({ status: "completed" })}
                disabled={updateTask.isPending}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Terminer
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive/70 hover:text-destructive"
              onClick={() => deleteTask.mutate()}
              disabled={deleteTask.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Description */}
          <div className="text-sm text-foreground/70 bg-background/40 rounded-lg p-3 border border-foreground/10">
            {task.description}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Étapes complétées */}
            {task.stepsCompleted.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-400 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Étapes complétées ({task.stepsCompleted.length})
                </div>
                <ul className="space-y-1.5">
                  {task.stepsCompleted.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                      <CheckCircle2 className="w-3 h-3 text-green-500/70 flex-shrink-0 mt-0.5" />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Prochaines étapes */}
            {task.nextSteps.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-2">
                  <ArrowRight className="w-3.5 h-3.5" />
                  Prochaines étapes ({task.nextSteps.length})
                </div>
                <ul className="space-y-1.5">
                  {task.nextSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                      <ArrowRight className="w-3 h-3 text-amber-500/70 flex-shrink-0 mt-0.5" />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Notes de checkpoint */}
          {task.checkpointNotes && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/60 mb-2">
                <StickyNote className="w-3.5 h-3.5" />
                Notes de reprise
              </div>
              <div className="text-xs text-foreground/60 bg-background/40 rounded-lg p-3 border border-foreground/10 whitespace-pre-wrap font-mono">
                {task.checkpointNotes}
              </div>
            </div>
          )}

          {/* Dernière mise à jour */}
          <p className="text-xs text-foreground/35">
            Dernière mise à jour : {formatDate(task.updatedAt)}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function NewTaskForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepsCompleted, setStepsCompleted] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [checkpointNotes, setCheckpointNotes] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const createTask = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE_API}/api/agent-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          stepsCompleted: stepsCompleted.trim()
            ? stepsCompleted.split("\n").map((s) => s.trim()).filter(Boolean)
            : [],
          nextSteps: nextSteps.trim()
            ? nextSteps.split("\n").map((s) => s.trim()).filter(Boolean)
            : [],
          checkpointNotes: checkpointNotes.trim(),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-tasks"] });
      onCreated();
      setOpen(false);
      setTitle(""); setDescription(""); setStepsCompleted(""); setNextSteps(""); setCheckpointNotes("");
      toast({ title: "Tâche créée avec succès" });
    },
    onError: () => toast({ title: "Erreur lors de la création", variant: "destructive" }),
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="w-4 h-4" />
        Enregistrer une tâche
      </Button>
    );
  }

  return (
    <Card className="border border-foreground/15 bg-card/80">
      <CardHeader>
        <CardTitle className="text-sm">Nouvelle tâche d'agent</CardTitle>
        <p className="text-xs text-foreground/50">
          Enregistre l'état d'une tâche en cours pour qu'un prochain agent puisse reprendre.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-xs font-medium text-foreground/60 mb-1 block">Titre *</label>
          <Input
            placeholder="Ex: Ajout du système de continuité des tâches"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60 mb-1 block">Instructions d'origine *</label>
          <Textarea
            placeholder="Colle ici les instructions exactes données à l'agent précédent…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm min-h-[80px]"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground/60 mb-1 block">Étapes complétées (une par ligne)</label>
            <Textarea
              placeholder="Créé le schéma DB&#10;Ajouté la route API&#10;…"
              value={stepsCompleted}
              onChange={(e) => setStepsCompleted(e.target.value)}
              className="text-sm min-h-[80px]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60 mb-1 block">Prochaines étapes (une par ligne)</label>
            <Textarea
              placeholder="Créer la page frontend&#10;Faire la migration DB&#10;…"
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              className="text-sm min-h-[80px]"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60 mb-1 block">Notes techniques de reprise</label>
          <Textarea
            placeholder="Contexte important pour reprendre : fichiers modifiés, décisions prises, problèmes rencontrés…"
            value={checkpointNotes}
            onChange={(e) => setCheckpointNotes(e.target.value)}
            className="text-sm min-h-[80px] font-mono"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => createTask.mutate()}
            disabled={createTask.isPending || !title.trim() || !description.trim()}
          >
            {createTask.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentTasksPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery<AgentTask[]>({
    queryKey: ["agent-tasks"],
    queryFn: () =>
      fetch(`${BASE_API}/api/agent-tasks`).then((r) => {
        if (!r.ok) throw new Error("Erreur API");
        return r.json();
      }),
    refetchInterval: 30_000,
  });

  const active = tasks.filter((t) => t.status === "in_progress" || t.status === "paused");
  const archived = tasks.filter((t) => t.status === "completed" || t.status === "cancelled");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Continuité des tâches d'agent</h1>
          </div>
          <p className="text-sm text-foreground/60 max-w-xl">
            Quand un agent atteint sa limite d'utilisation, il enregistre ici son état d'avancement.
            Dans un remix, le nouvel agent consulte cette page pour reprendre exactement là où
            l'ancien s'était arrêté.
          </p>
        </div>
        <NewTaskForm onCreated={() => qc.invalidateQueries({ queryKey: ["agent-tasks"] })} />
      </div>

      {/* Bannière d'instruction pour les agents */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <AlertCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-xs text-foreground/70 space-y-1">
          <p className="font-semibold text-foreground/85">Note pour les agents IA :</p>
          <p>
            Avant de commencer à travailler, consulte cette page via <code className="bg-background/60 px-1 rounded text-primary text-[11px]">GET /api/agent-tasks</code>.
            Si une tâche est en statut <strong>paused</strong>, reprends-la à partir des <em>prochaines étapes</em> et des <em>notes de reprise</em>.
            Mets à jour la tâche au fur et à mesure (PATCH) et marque-la <strong>completed</strong> quand c'est terminé.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-foreground/40 text-sm">Chargement…</div>
      ) : (
        <>
          {/* Tâches actives */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="w-4 h-4 text-foreground/50" />
              <h2 className="text-sm font-semibold text-foreground/70">
                Tâches actives
                {active.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold">
                    {active.length}
                  </span>
                )}
              </h2>
            </div>

            {active.length === 0 ? (
              <div className="text-center py-8 rounded-xl border border-dashed border-foreground/15 text-foreground/35 text-sm">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Aucune tâche en cours.
                <br />
                <span className="text-xs">
                  Les agents enregistrent leur progression ici avant d'atteindre leur limite.
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {active.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onRefresh={() => qc.invalidateQueries({ queryKey: ["agent-tasks"] })}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Tâches archivées */}
          {archived.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-foreground/35" />
                <h2 className="text-sm font-semibold text-foreground/40">
                  Historique ({archived.length})
                </h2>
              </div>
              <div className="space-y-3 opacity-60">
                {archived.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onRefresh={() => qc.invalidateQueries({ queryKey: ["agent-tasks"] })}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
