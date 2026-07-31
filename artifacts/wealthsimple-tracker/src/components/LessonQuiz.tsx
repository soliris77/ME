import { useState } from "react";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import type { QuizQuestion } from "@/data/learnContent";
import type { LearnProgress } from "@workspace/api-client-react";

/**
 * Quiz réutilisable de la section « Apprendre » — utilisé par les onglets de
 * Learn.tsx et par les leçons du parcours guidé. Affiche le score précédent
 * (progression serveur), corrige chaque question avec explication, et remonte
 * le score final via onFinish.
 */
export function LessonQuiz({
  questions,
  previous,
  onFinish,
}: {
  questions: QuizQuestion[];
  previous?: LearnProgress;
  onFinish: (score: number, total: number) => void;
}) {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  function start() {
    setActive(true);
    setIdx(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  }

  function choose(i: number) {
    if (selected !== null) return;
    setSelected(i);
    if (i === questions[idx].correctIndex) setScore((s) => s + 1);
  }

  function next() {
    if (idx + 1 < questions.length) {
      setIdx((v) => v + 1);
      setSelected(null);
    } else {
      setFinished(true);
      onFinish(score, questions.length);
    }
  }

  if (!active) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-5 text-center">
        {previous?.completed && (
          <p className="text-xs gain font-medium mb-2 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Quiz complété — score : <span className="font-mono">{previous.quizScore}/{previous.quizTotal}</span>
          </p>
        )}
        <p className="text-sm font-semibold mb-1">🧠 Testez vos connaissances</p>
        <p className="text-xs text-muted-foreground mb-3">{questions.length} questions rapides sur cette leçon.</p>
        <button
          onClick={start}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {previous?.completed ? <RotateCcw className="w-3.5 h-3.5" /> : null}
          {previous?.completed ? "Refaire le quiz" : "Commencer le quiz"}
        </button>
      </div>
    );
  }

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="bg-card border border-card-border rounded-xl p-5 text-center">
        <p className={`text-2xl font-bold font-mono ${pct >= 70 ? "gain" : pct >= 40 ? "" : "loss"}`}>{score}/{questions.length}</p>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
          {pct >= 70 ? "Excellent travail ! Vous maîtrisez cette leçon. 🎉" : pct >= 40 ? "Pas mal, mais relisez les points manqués avant de continuer." : "Reprenez le contenu ci-dessus puis retentez le quiz."}
        </p>
        <button
          onClick={start}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Refaire le quiz
        </button>
      </div>
    );
  }

  const q = questions[idx];
  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground">Question {idx + 1}/{questions.length}</span>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < idx ? "bg-primary" : i === idx ? "bg-primary/50" : "bg-muted"}`} />
          ))}
        </div>
      </div>
      <p className="text-sm font-semibold mb-3">{q.question}</p>
      <div className="space-y-2 mb-3">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correctIndex;
          const isSelected = i === selected;
          let cls = "border-border hover:bg-muted/50";
          if (selected !== null) {
            if (isCorrect) cls = "border-[color:var(--gain,#16A34A)] bg-[rgba(22,163,74,0.08)]";
            else if (isSelected) cls = "border-[color:var(--loss,#DC2626)] bg-[rgba(220,38,38,0.08)]";
            else cls = "border-border opacity-60";
          }
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={selected !== null}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${cls}`}
            >
              <span className={isCorrect && selected !== null ? "gain font-medium" : isSelected && !isCorrect ? "loss font-medium" : ""}>{opt}</span>
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="bg-muted/50 rounded-lg p-3 mb-3">
          <p className="text-xs text-foreground/80 leading-relaxed">💡 {q.explanation}</p>
        </div>
      )}
      {selected !== null && (
        <button
          onClick={next}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {idx + 1 < questions.length ? "Question suivante" : "Voir mon résultat"} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
