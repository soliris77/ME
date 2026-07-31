import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Wrench } from "lucide-react";
import { LESSONS, lessonBySlug, lessonSectionId } from "@/data/parcoursContent";
import { LessonQuiz } from "@/components/LessonQuiz";
import { PositionCalculator } from "@/components/PositionCalculator";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useGetLearnProgress, useUpdateLearnProgress, getGetLearnProgressQueryKey, useGetPracticeStatuses, getGetPracticeStatusesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import NotFound from "@/pages/not-found";

/**
 * Leçon du parcours guidé « Apprendre à trader » : contenu court en français,
 * quiz 3–5 questions (score sauvegardé côté serveur), et bouton « Pratiquer »
 * qui ouvre le vrai outil de l'app correspondant à la leçon.
 */
export default function LessonDetail() {
  const [, params] = useRoute<{ slug: string }>("/apprendre/parcours/:slug");
  const lesson = params?.slug ? lessonBySlug(params.slug) : undefined;
  const [showCalc, setShowCalc] = useState(false);

  usePageMeta(
    lesson ? `${lesson.title} — Parcours guidé | Soliris Market` : "Leçon introuvable",
    lesson?.summary ?? "",
  );

  const queryClient = useQueryClient();
  const { data: progress } = useGetLearnProgress();
  // Statut d'exercice vérifié côté serveur — refetch au retour sur l'onglet,
  // pour que le badge apparaisse après avoir utilisé le vrai outil.
  const { data: practiceStatuses } = useGetPracticeStatuses({
    query: { queryKey: getGetPracticeStatusesQueryKey(), refetchOnWindowFocus: true, refetchOnMount: "always" },
  });
  const mark = useUpdateLearnProgress({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetLearnProgressQueryKey() }),
    },
  });

  if (!lesson) return <NotFound />;

  const sectionId = lessonSectionId(lesson.slug);
  const previous = (progress ?? []).find((p) => p.sectionId === sectionId);
  const lessonIndex = LESSONS.findIndex((l) => l.slug === lesson.slug);
  const nextLesson = LESSONS[lessonIndex + 1];

  const handleFinish = (score: number, total: number) => {
    mark.mutate({ sectionId, data: { completed: true, quizScore: score, quizTotal: total } });
  };

  const practice = lesson.practice;
  const practiceStatus = (practiceStatuses ?? []).find((s) => s.slug === lesson.slug);
  const practiceDone = !!practiceStatus?.done;
  const practiceCard = (
    <div className={`rounded-xl p-5 border ${practiceDone ? "bg-emerald-500/5 border-emerald-500/25" : "bg-primary/5 border-primary/20"}`}>
      <div className="flex items-start gap-3">
        <Wrench className={`w-5 h-5 shrink-0 mt-0.5 ${practiceDone ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold">🛠️ Pratiquer avec le vrai outil</p>
            {practiceDone && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> Exercice fait ✔
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{practice.description}</p>
          {practiceStatus && (
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              <span className="font-medium">Validation :</span> {practiceStatus.criteria}{" "}
              <span className={practiceDone ? "text-emerald-600 dark:text-emerald-400" : ""}>— {practiceStatus.detail}</span>
            </p>
          )}
          {practice.action === "calculator" ? (
            <button
              onClick={() => setShowCalc(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {practice.label} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Link
              href={practice.href!}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {practice.label} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl">
      {showCalc && (
        <PositionCalculator
          onClose={() => {
            setShowCalc(false);
            // Le calcul a pu enregistrer un événement de pratique — rafraîchir le badge.
            queryClient.invalidateQueries({ queryKey: getGetPracticeStatusesQueryKey() });
          }}
        />
      )}

      <Link href="/apprendre/parcours" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Retour au parcours
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold">{lesson.emoji} {lesson.title}</h1>
          {previous?.completed && (
            <span className="inline-flex items-center gap-1 text-xs gain font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Terminée — {previous.quizScore}/{previous.quizTotal}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{lesson.summary}</p>
        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Leçon {lessonIndex + 1}/{LESSONS.length} · ~{lesson.minutes} min de lecture
        </p>
      </div>

      <div className="space-y-5 mb-6">
        {lesson.sections.map((s) => (
          <div key={s.heading} className="bg-card border border-card-border rounded-xl p-5">
            <h2 className="text-sm font-bold mb-2">{s.heading}</h2>
            <div className="space-y-2 text-sm text-foreground/80 leading-relaxed">
              {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              {s.example && (
                <div className="bg-muted rounded-lg p-3 text-xs space-y-1 font-mono my-2">
                  {s.example.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}
              {s.bullets && (
                <ul className="list-disc list-inside space-y-1 ml-2">
                  {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {practiceCard}
        <LessonQuiz questions={lesson.quiz} previous={previous} onFinish={handleFinish} />
      </div>

      {nextLesson ? (
        <Link
          href={`/apprendre/parcours/${nextLesson.slug}`}
          className="mt-6 flex items-center justify-between gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:border-primary/40 transition-colors"
        >
          <div>
            <p className="text-xs text-muted-foreground">Leçon suivante</p>
            <p className="text-sm font-semibold">{nextLesson.emoji} {nextLesson.title}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-primary shrink-0" />
        </Link>
      ) : (
        <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm">
          🎓 C'est la dernière leçon du parcours. Continuez avec les onglets <Link href="/apprendre/chandeliers" className="text-primary font-medium">Chandeliers</Link> et <Link href="/apprendre/strategies" className="text-primary font-medium">Stratégies</Link>.
        </div>
      )}
    </div>
  );
}
