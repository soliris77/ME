import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { BookOpen, TrendingUp, BarChart2, ShieldAlert, Lightbulb, ChevronDown, ChevronUp, Search, CheckCircle2, ArrowRight, Clock, GraduationCap } from "lucide-react";
import { CANDLES, STRATEGIES, GLOSSAIRE, QUIZZES } from "@/data/learnContent";
import { LESSONS, lessonSectionId } from "@/data/parcoursContent";
import { LessonQuiz } from "@/components/LessonQuiz";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useGetLearnProgress, useUpdateLearnProgress, getGetLearnProgressQueryKey, type LearnProgress } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type Tab = "parcours" | "bases" | "chandeliers" | "strategies" | "risques" | "glossaire";

const TABS: { id: Tab; label: string; icon: typeof BookOpen; title: string; description: string }[] = [
  {
    id: "parcours",
    label: "Parcours guidé",
    icon: GraduationCap,
    title: "Parcours guidé pour apprendre à trader | Soliris Market",
    description: "Leçons courtes en français (plan de trade, taille de position, stop-loss, ratio risque/rendement, psychologie, journal, coupe-circuit), un quiz par leçon et un lien direct vers les vrais outils de l'app pour pratiquer.",
  },
  {
    id: "bases",
    label: "Bases du trading",
    icon: TrendingUp,
    title: "Bases du trading en bourse pour débutants | Soliris Market",
    description: "Comment fonctionne un marché boursier, lire un graphique, différence entre action/ETF/crypto, heures d'ouverture des bourses, et les 5 erreurs classiques des débutants.",
  },
  {
    id: "chandeliers",
    label: "Chandeliers japonais",
    icon: BarChart2,
    title: "Chandeliers japonais expliqués : marteau, doji, engulfing… | Soliris Market",
    description: "Guide visuel des principaux patterns de chandeliers japonais (marteau, étoile filante, doji, engulfing, étoiles du matin/soir) et comment les utiliser en trading.",
  },
  {
    id: "strategies",
    label: "Stratégies débutant",
    icon: Lightbulb,
    title: "Stratégies de trading pour débutants | Soliris Market",
    description: "Suivi de tendance, retournement sur support/résistance, cassure (breakout), DCA et bien d'autres — avantages, limites et étapes concrètes.",
  },
  {
    id: "risques",
    label: "Gestion des risques",
    icon: ShieldAlert,
    title: "Gestion des risques en trading : stop-loss, R:R, psychologie | Soliris Market",
    description: "La règle des 1-2% par position, comment placer un stop-loss, calculer son rapport risque/gain, et éviter les pièges psychologiques (FOMO, revenge trading).",
  },
  {
    id: "glossaire",
    label: "Glossaire complet",
    icon: BookOpen,
    title: "Glossaire du trading et de la bourse (A à Z) | Soliris Market",
    description: "Tous les termes essentiels de la bourse et du trading expliqués simplement : RSI, MACD, support, résistance, drawdown, levier, et plus.",
  },
];

const SECTION_ORDER: Tab[] = ["bases", "chandeliers", "strategies", "risques", "glossaire"];

// ── Accordion ────────────────────────────────────────────────────────────────
function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-left hover:bg-muted/50 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Quiz — composant partagé LessonQuiz (voir components/LessonQuiz.tsx)
function SectionQuizBlock({ sectionId, progress, onMarkComplete }: { sectionId: Exclude<Tab, "glossaire" | "parcours">; progress?: LearnProgress; onMarkComplete: (sectionId: string, score: number, total: number) => void }) {
  return (
    <LessonQuiz
      questions={QUIZZES[sectionId]}
      previous={progress}
      onFinish={(score, total) => onMarkComplete(sectionId, score, total)}
    />
  );
}


// ── Parcours guidé ───────────────────────────────────────────────────────────
function ParcoursTab({ progressBySection }: { progressBySection: Map<string, LearnProgress> }) {
  const doneCount = LESSONS.filter((l) => progressBySection.get(lessonSectionId(l.slug))?.completed).length;
  const nextLesson = LESSONS.find((l) => !progressBySection.get(lessonSectionId(l.slug))?.completed);

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-sm font-semibold text-primary mb-1">🎓 Le parcours du trader discipliné</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          {LESSONS.length} leçons courtes, dans l'ordre : chaque leçon se termine par un quiz et un exercice
          pratique avec le <strong>vrai outil</strong> de l'app (calculateur, alertes, Auto-Trader…).
          Votre progression est sauvegardée automatiquement.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-xs">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(doneCount / LESSONS.length) * 100}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground font-mono">{doneCount}/{LESSONS.length} leçons terminées</span>
        </div>
      </div>

      {nextLesson && doneCount > 0 && (
        <Link href={`/apprendre/parcours/${nextLesson.slug}`}>
          <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors">
            <p className="text-sm">👋 Reprendre : <strong>{nextLesson.emoji} {nextLesson.title}</strong></p>
            <ArrowRight className="w-4 h-4 text-primary shrink-0" />
          </div>
        </Link>
      )}

      {([
        { level: "fondations" as const, label: "Fondations" },
        { level: "avance" as const, label: "Avancé" },
      ]).map((group) => {
        const groupLessons = LESSONS.filter((l) => (l.level ?? "fondations") === group.level);
        if (groupLessons.length === 0) return null;
        return (
          <div key={group.level} className="space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold px-1">{group.label}</p>
            {groupLessons.map((l) => {
              const i = LESSONS.findIndex((x) => x.slug === l.slug);
              const prog = progressBySection.get(lessonSectionId(l.slug));
              const done = !!prog?.completed;
              return (
                <Link key={l.slug} href={`/apprendre/parcours/${l.slug}`}>
                  <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors ${done ? "border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10" : "border-border bg-card hover:border-primary/40"}`}>
                    <span className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{l.emoji} {l.title}</span>
                        {done && prog?.quizTotal != null && (
                          <span className="text-xs gain font-mono">{prog.quizScore}/{prog.quizTotal}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{l.summary}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {l.minutes} min
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab components ────────────────────────────────────────────────────────────

function BasesTab() {
  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-sm font-semibold text-primary mb-1">🎯 Par où commencer ?</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Le trading est l'achat et la vente d'actifs financiers pour générer un profit. Cette app vous donne tous les outils — mais la clé, c'est de comprendre <strong>pourquoi</strong> les prix bougent avant de chercher <strong>comment</strong> en profiter.
        </p>
      </div>

      <Accordion title="📈 Comment fonctionne un marché boursier ?" defaultOpen>
        <div className="space-y-2 text-sm text-foreground/80 leading-relaxed mt-2">
          <p>Un marché boursier est simplement un endroit où les gens s'échangent des parts d'entreprises (actions). Le prix d'une action est déterminé par <strong>l'offre et la demande</strong> :</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Plus de gens veulent acheter → prix monte</li>
            <li>Plus de gens veulent vendre → prix descend</li>
            <li>Les nouvelles, bénéfices, événements mondiaux influencent cette demande</li>
          </ul>
          <p className="mt-2">Les marchés canadiens (TSX) ferment de 9h30 à 16h00 HNE. Les marchés US ferment aux mêmes heures.</p>
        </div>
      </Accordion>

      <Accordion title="🕯️ Comment lire un graphique de chandeliers ?">
        <div className="space-y-2 text-sm text-foreground/80 leading-relaxed mt-2">
          <p>Chaque chandelier représente une période (1 heure, 1 jour, etc.) et montre 4 informations :</p>
          <div className="bg-muted rounded-lg p-3 my-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>🟢 <strong>Ouverture</strong> : prix au début de la période</div>
              <div>🔴 <strong>Clôture</strong> : prix à la fin</div>
              <div>⬆️ <strong>Haut</strong> : plus haut atteint (mèche haute)</div>
              <div>⬇️ <strong>Bas</strong> : plus bas atteint (mèche basse)</div>
            </div>
          </div>
          <p>Une bougie <span className="gain font-semibold">verte</span> = clôture &gt; ouverture (le prix a monté). Une bougie <span className="loss font-semibold">rouge</span> = clôture &lt; ouverture.</p>
        </div>
      </Accordion>

      <Accordion title="📊 Quelle est la différence entre une action, un ETF, et une crypto ?">
        <div className="space-y-3 text-sm text-foreground/80 mt-2">
          <div className="flex gap-3 bg-muted/40 rounded-lg p-3">
            <span className="text-lg">🏢</span>
            <div><strong>Action</strong> : Part d'une entreprise unique. Plus risqué (une seule société), mais potentiel de gain élevé. Ex : AAPL, SHOP.TO.</div>
          </div>
          <div className="flex gap-3 bg-muted/40 rounded-lg p-3">
            <span className="text-lg">🧺</span>
            <div><strong>ETF/FNB</strong> : Panier de nombreuses actions. Moins risqué car diversifié. XEQT.TO = 10 000 actions mondiales dans un seul produit.</div>
          </div>
          <div className="flex gap-3 bg-muted/40 rounded-lg p-3">
            <span className="text-lg">🪙</span>
            <div><strong>Crypto</strong> : Actif numérique très volatile. Bitcoin peut bouger ±10% en une journée. Réservez une petite partie du portefeuille.</div>
          </div>
        </div>
      </Accordion>

      <Accordion title="⏰ Quand les marchés sont-ils ouverts ?">
        <div className="space-y-2 text-sm mt-2">
          {[
            { flag: "🇨🇦", name: "Bourse de Toronto (TSX)", hours: "9h30 – 16h00 HNE (lun–ven)" },
            { flag: "🇺🇸", name: "NYSE / NASDAQ", hours: "9h30 – 16h00 HNE (lun–ven)" },
            { flag: "🇬🇧", name: "Bourse de Londres (LSE)", hours: "8h00 – 16h30 GMT" },
            { flag: "🇩🇪", name: "Bourse de Francfort (DAX)", hours: "9h00 – 17h30 CET" },
            { flag: "🇯🇵", name: "Bourse de Tokyo (Nikkei)", hours: "9h00 – 15h30 JST (fermé 11h30–12h30)" },
            { flag: "🪙", name: "Cryptomonnaies", hours: "24h/24, 7j/7" },
          ].map((m) => (
            <div key={m.name} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2">
                <span>{m.flag}</span>
                <span className="font-medium text-xs">{m.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{m.hours}</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2 italic">En dehors des heures, les prix dans cette app peuvent afficher la dernière clôture ou des échanges pre/after-market.</p>
        </div>
      </Accordion>

      <Accordion title="❌ Les 5 erreurs les plus communes des débutants">
        <div className="space-y-2 mt-2">
          {[
            { no: "1", error: "FOMO — acheter parce que tout le monde achète", fix: "Analysez toujours avant d'agir. Si vous avez raté une hausse, il y en aura d'autres." },
            { no: "2", error: "Pas de stop-loss", fix: "Chaque position doit avoir un niveau de perte maximum. Sans stop, une petite erreur devient une catastrophe." },
            { no: "3", error: "Sur-diversification (trop d'actifs)", fix: "Mieux vaut 5 positions bien comprises que 20 positions mal suivies." },
            { no: "4", error: "Trader contre la tendance", fix: "La tendance est votre amie. Ne pariez pas contre le marché sans signal clair de retournement." },
            { no: "5", error: "Investir de l'argent qu'on ne peut pas se permettre de perdre", fix: "N'investissez que l'argent que vous seriez à l'aise de perdre entièrement dans le pire scénario." },
          ].map((e) => (
            <div key={e.no} className="flex gap-3 bg-red-500/5 border border-red-500/15 rounded-lg p-3">
              <span className="loss font-bold text-sm shrink-0">#{e.no}</span>
              <div>
                <div className="text-sm font-semibold text-foreground">{e.error}</div>
                <div className="text-xs text-muted-foreground mt-0.5">✅ {e.fix}</div>
              </div>
            </div>
          ))}
        </div>
      </Accordion>
    </div>
  );
}

function ChandeliersTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Les chandeliers japonais sont le langage visuel du marché. Chaque pattern raconte l'histoire de la lutte entre acheteurs et vendeurs sur une période donnée. Apprenez à les lire et vous aurez un avantage réel.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CANDLES.map((c) => (
          <Link key={c.slug} href={`/apprendre/chandeliers/${c.slug}`}>
          <div className={`border rounded-xl p-4 cursor-pointer hover:border-primary/40 transition-colors ${
            c.signal === "haussier" ? "border-emerald-500/20 bg-emerald-500/5" :
            c.signal === "baissier" ? "border-red-500/20 bg-red-500/5" :
            "border-border bg-muted/20"
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-16 shrink-0 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: c.svg }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-bold">{c.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                    c.signal === "haussier" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                    c.signal === "baissier" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{c.signal === "haussier" ? "🟢 Haussier" : c.signal === "baissier" ? "🔴 Baissier" : "⚪ Neutre"}</span>
                </div>
                <p className="text-xs text-foreground/70 leading-relaxed mb-1.5">{c.description}</p>
                <div className="bg-background/60 rounded-lg px-2 py-1.5">
                  <p className="text-xs font-medium text-primary">💡 Comment l'utiliser :</p>
                  <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{c.howToUse}</p>
                </div>
              </div>
            </div>
          </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StrategiesTab() {
  const [levelFilter, setLevelFilter] = useState("Tous");
  const levels = ["Tous", ...Array.from(new Set(STRATEGIES.map((s) => s.level)))];
  const filtered = levelFilter === "Tous" ? STRATEGIES : STRATEGIES.filter((s) => s.level === levelFilter);

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm">
        <strong>⚠️ Important :</strong> Aucune stratégie ne fonctionne 100% du temps. L'objectif est d'avoir une <strong>espérance mathématique positive</strong> sur le long terme — gagner plus que vous ne perdez en moyenne.
      </div>

      <div className="flex flex-wrap gap-1.5">
        {levels.map((l) => (
          <button
            key={l}
            onClick={() => setLevelFilter(l)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${levelFilter === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {filtered.map((s) => (
        <Link key={s.slug} href={`/apprendre/strategies/${s.slug}`}>
        <div className={`border rounded-xl p-5 ${s.bg} border-current/20 cursor-pointer hover:opacity-90 transition-opacity`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className={`font-bold text-base ${s.color}`}>{s.name}</h3>
            <span className="text-xs bg-background/60 px-2 py-1 rounded-full font-medium shrink-0">{s.level}</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed mb-3">{s.description}</p>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Étapes</p>
            <div className="space-y-1.5">
              {s.steps.map((step, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  <span className={`${s.color} font-bold shrink-0`}>{i + 1}.</span>
                  <span className="text-foreground/80 leading-relaxed">{step}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-500/10 rounded-lg p-2">
              <span className="font-semibold gain">✅ Avantages</span>
              <p className="text-foreground/70 mt-0.5">{s.pros}</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2">
              <span className="font-semibold loss">⚠️ Limites</span>
              <p className="text-foreground/70 mt-0.5">{s.cons}</p>
            </div>
          </div>
        </div>
        </Link>
      ))}

      {filtered.length === 0 && (
        <p className="text-sm text-center text-muted-foreground py-6">Aucune stratégie pour ce niveau</p>
      )}
    </div>
  );
}

function RisquesTab() {
  return (
    <div className="space-y-4">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <p className="text-sm font-bold loss mb-1">La règle n°1 du trading</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          <strong>Ne perdez jamais plus que vous ne pouvez vous permettre.</strong> Même les meilleurs traders au monde perdent régulièrement. La différence, c'est qu'ils contrôlent leurs pertes pour que les gains les dépassent sur le long terme.
        </p>
      </div>

      <Accordion title="📐 La règle des 1-2% par position" defaultOpen>
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-2">
          <p>Ne risquez jamais plus de <strong>1 à 2% de votre capital total</strong> sur une seule trade. Exemple :</p>
          <div className="bg-muted rounded-lg p-3 text-xs space-y-1 font-mono">
            <div>Capital total : 5 000 $</div>
            <div>Risque max par trade (1%) : <strong className="gain">50 $</strong></div>
            <div>Stop-loss à 5% sous le prix d'entrée</div>
            <div>Taille de position : 50 ÷ 5% = <strong className="text-primary">1 000 $</strong></div>
          </div>
          <p>Avec cette règle, même 10 mauvaises trades consécutives ne vous coûtent que 10% de votre capital.</p>
        </div>
      </Accordion>

      <Accordion title="🛡️ Comment placer un stop-loss efficace">
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-2">
          <p>Votre stop-loss doit être placé à un niveau <strong>logique</strong>, pas arbitraire :</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Juste en dessous d'un support identifié</li>
            <li>Sous la mèche basse du chandelier d'entrée</li>
            <li>Sous la MM20 ou MM50 si vous tradez la tendance</li>
          </ul>
          <p>Ne jamais déplacer son stop-loss <em>vers le bas</em> pour éviter d'être stoppé. C'est la cause #1 des grosses pertes.</p>
        </div>
      </Accordion>

      <Accordion title="⚖️ Calculer son rapport risque/gain (R:R)">
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-2">
          <p>Avant d'entrer dans une trade, calculez toujours :</p>
          <div className="bg-muted rounded-lg p-3 text-xs space-y-1 font-mono">
            <div>Prix d'entrée : 100 $</div>
            <div>Stop-loss : 95 $ → Risque = <strong className="loss">5 $</strong></div>
            <div>Objectif : 115 $ → Gain potentiel = <strong className="gain">15 $</strong></div>
            <div>R:R = 15/5 = <strong className="text-primary">3:1</strong> ✅ Excellent</div>
          </div>
          <p>Visez toujours un minimum de <strong>2:1</strong> (gagner au moins 2 $ pour chaque 1 $ risqué).</p>
        </div>
      </Accordion>

      <Accordion title="🧠 Psychologie du trading">
        <div className="text-sm text-foreground/80 leading-relaxed mt-2 space-y-3">
          {[
            { title: "FOMO (Fear Of Missing Out)", desc: "Peur de rater une opportunité. Pousse à acheter au plus haut, souvent juste avant un retournement." },
            { title: "Revenge trading", desc: "Après une perte, on prend des trades impulsifs pour 'récupérer'. C'est l'erreur la plus coûteuse." },
            { title: "Confirmation bias", desc: "On cherche uniquement les informations qui confirment ce qu'on veut croire. Cherchez activement les arguments contre votre position." },
            { title: "Overconfidence", desc: "Après quelques succès, on prend trop de risques. Restez discipliné même quand tout va bien." },
          ].map((p) => (
            <div key={p.title} className="border-l-2 border-primary/40 pl-3">
              <div className="font-semibold text-foreground">{p.title}</div>
              <div className="text-muted-foreground text-xs mt-0.5">{p.desc}</div>
            </div>
          ))}
        </div>
      </Accordion>
    </div>
  );
}

function GlossaireTab({ progress, onVisited }: { progress?: LearnProgress; onVisited: () => void }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Tous");
  const markedRef = useRef(false);

  useEffect(() => {
    if (!markedRef.current && progress && !progress.completed) {
      markedRef.current = true;
      onVisited();
    }
  }, [progress, onVisited]);

  const categories = ["Tous", ...Array.from(new Set(GLOSSAIRE.map((g) => g.category)))];
  const filtered = GLOSSAIRE.filter((g) => {
    const matchSearch = !search || g.term.toLowerCase().includes(search.toLowerCase()) || g.definition.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "Tous" || g.category === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-card border border-card-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Rechercher un terme..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${catFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-0 bg-card border border-card-border rounded-xl overflow-hidden divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center text-muted-foreground">Aucun terme trouvé</div>
        ) : (
          filtered.map((g) => (
            <Link key={g.slug} href={`/apprendre/glossaire/${g.slug}`}>
            <div className="px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-foreground">{g.term}</span>
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{g.category}</span>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed">{g.definition}</p>
            </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default function Learn() {
  const [, params] = useRoute<{ tab?: string }>("/apprendre/:tab?");
  const tab = (TABS.find((t) => t.id === params?.tab)?.id ?? "parcours") as Tab;
  const activeTab = TABS.find((t) => t.id === tab)!;

  usePageMeta(activeTab.title, activeTab.description);

  const queryClient = useQueryClient();
  const { data: progress } = useGetLearnProgress();
  const progressBySection = new Map((progress ?? []).map((p) => [p.sectionId, p]));

  const mark = useUpdateLearnProgress({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetLearnProgressQueryKey() }),
    },
  });

  const handleMarkComplete = (sectionId: string, score: number, total: number) => {
    mark.mutate({ sectionId, data: { completed: true, quizScore: score, quizTotal: total } });
  };

  const handleGlossaryVisited = () => {
    mark.mutate({ sectionId: "glossaire", data: { completed: true } });
  };

  const completedCount = SECTION_ORDER.filter((id) => progressBySection.get(id)?.completed).length;
  const nextIncomplete = SECTION_ORDER.find((id) => !progressBySection.get(id)?.completed);
  const showResumeBanner = !params?.tab && completedCount > 0 && nextIncomplete && nextIncomplete !== "bases";

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Apprendre à trader</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Guide complet pour débutants — des bases aux stratégies avancées, en français</p>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-xs">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(completedCount / SECTION_ORDER.length) * 100}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground font-mono">{completedCount}/{SECTION_ORDER.length} sections complétées</span>
        </div>
      </div>

      {showResumeBanner && (
        <Link href={`/apprendre/${nextIncomplete}`}>
          <div className="mb-6 flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors">
            <p className="text-sm">
              👋 Reprendre où vous étiez : <strong>{TABS.find((t) => t.id === nextIncomplete)?.label}</strong>
            </p>
            <ArrowRight className="w-4 h-4 text-primary shrink-0" />
          </div>
        </Link>
      )}

      <div className="flex flex-wrap gap-1 mb-6 border-b border-border pb-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={`/apprendre/${id}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {progressBySection.get(id)?.completed && <CheckCircle2 className="w-3 h-3 gain" />}
          </Link>
        ))}
      </div>

      {tab === "parcours" && <ParcoursTab progressBySection={progressBySection} />}
      {tab === "bases" && (
        <div className="space-y-4">
          <BasesTab />
          <SectionQuizBlock sectionId="bases" progress={progressBySection.get("bases")} onMarkComplete={handleMarkComplete} />
        </div>
      )}
      {tab === "chandeliers" && (
        <div className="space-y-4">
          <ChandeliersTab />
          <SectionQuizBlock sectionId="chandeliers" progress={progressBySection.get("chandeliers")} onMarkComplete={handleMarkComplete} />
        </div>
      )}
      {tab === "strategies" && (
        <div className="space-y-4">
          <StrategiesTab />
          <SectionQuizBlock sectionId="strategies" progress={progressBySection.get("strategies")} onMarkComplete={handleMarkComplete} />
        </div>
      )}
      {tab === "risques" && (
        <div className="space-y-4">
          <RisquesTab />
          <SectionQuizBlock sectionId="risques" progress={progressBySection.get("risques")} onMarkComplete={handleMarkComplete} />
        </div>
      )}
      {tab === "glossaire" && <GlossaireTab progress={progressBySection.get("glossaire")} onVisited={handleGlossaryVisited} />}
    </div>
  );
}
