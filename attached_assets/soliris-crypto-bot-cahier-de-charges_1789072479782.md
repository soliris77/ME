# Soliris — Ajout du trading crypto automatisé
## Cahier de charges pour l'agent Replit

> **Comment utiliser ce document.** Ne colle pas tout d'un coup. Colle d'abord la section **0 — Contexte et règles de travail**, puis **un seul lot à la fois**, dans l'ordre. Attends que l'agent finisse et que les critères d'acceptation du lot passent avant de lui donner le suivant. Un agent à qui on donne sept lots d'un coup en fait quatre à moitié.

---

## 0 — Contexte et règles de travail

Tu travailles sur **Soliris**, une application de trading algorithmique existante. Ne pars pas de zéro : le code est là et il fonctionne. Ton rôle est de l'étendre au marché crypto, chirurgicalement.

**Architecture actuelle**
- Monorepo avec packages partagés
- Frontend React + Vite, thème sombre avec accents or
- Backend Express, base PostgreSQL
- SnapTrade pour la connectivité courtier (Wealthsimple), en lecture et en exécution
- `yahoo-finance2` pour les données de marché actions
- Un auto-trader côté backend qui consomme une fonction d'analyse de signal
- Analyse technique déjà implémentée : RSI, MACD, ATR, détection de patterns de chandeliers, supports/résistances, niveaux de Fibonacci, divergences, structure de marché
- Un journal de trading avec simulateur papier

**Objectif final**
Permettre à l'auto-trader d'opérer sur les marchés crypto 24/7 via un exchange (Kraken en premier), en gardant intact le fonctionnement actions existant.

**Règles de travail — non négociables**

1. **Modifications chirurgicales.** Tu ne touches qu'à ce que le lot en cours nomme explicitement. Pas de refactor opportuniste, pas de renommage de fichiers non demandés, pas de mise à jour de dépendances non demandées.
2. **Le thème visuel ne change pas.** Sombre + or. Tu ne touches pas au design system, aux couleurs, aux animations.
3. **Aucun secret dans le code.** Toutes les clés (Kraken, SnapTrade) passent par les Replit Secrets et sont lues via `process.env`. Jamais de clé en dur, jamais de clé dans un commentaire, jamais de clé dans un fichier de test.
4. **Le chemin actions ne régresse pas.** À la fin de chaque lot, le flux SnapTrade/Wealthsimple doit fonctionner exactement comme avant.
5. **Un commit par lot**, avec un message qui décrit le lot.
6. **Tu écris des tests** pour chaque lot qui en demande, et tu les fais passer avant de déclarer le lot terminé.
7. **Si une consigne de ce document contredit ce que tu trouves dans le code, tu t'arrêtes et tu poses la question.** Tu ne devines pas.

**Ordre des lots** — cet ordre est délibéré, ne le change pas :

| Lot | Sujet | Pourquoi à cette place |
|---|---|---|
| 1 | Package `@workspace/indicators` | Trois implémentations divergentes du signal existent. Tant qu'elles divergent, tout ce qu'on branche dessus est faux. |
| 2 | Exécution réelle des stop-loss / take-profit | Configurés dans l'UI mais jamais exécutés. En 24/7 c'est le risque numéro un. |
| 3 | Abstraction `BrokerAdapter` | Rend le courtier interchangeable sans toucher à l'auto-trader. |
| 4 | Adaptateur Kraken via ccxt | Le crypto proprement dit. |
| 5 | Feed de données crypto + planificateur 24/7 | Les bougies temps réel et la fin des heures de marché. |
| 6 | Garde-fous et mode dry-run | Avant le moindre ordre réel. |
| 7 | Déploiement Reserved VM | Le worker qui ne dort pas. |

---

## Lot 1 — Package `@workspace/indicators`

### Problème

La fonction d'analyse de signal existe en trois versions divergentes dans le dépôt : une version allégée côté backend qui pilote l'auto-trader, une version riche côté frontend qui alimente les graphiques, et une troisième variante. Résultat : l'utilisateur voit un signal sur le graphique pendant que le bot en calcule un autre. C'est une divergence silencieuse — rien ne plante, les décisions sont juste fausses.

### Travail demandé

1. Crée le package `packages/indicators` dans le monorepo, publié sous le nom `@workspace/indicators`.
2. **Recense d'abord** les trois implémentations. Produis dans le chat un tableau : fichier, fonctions exportées, différences de calcul constatées (périodes par défaut, gestion des valeurs manquantes, arrondis, ordre des opérations).
3. La **version frontend riche est la source de vérité**, sauf là où le recensement montre qu'elle est objectivement fausse — dans ce cas tu signales et tu attends validation.
4. Le package expose des **fonctions pures** : entrée = tableau de bougies, sortie = valeurs. Aucun appel réseau, aucun accès base, aucune dépendance à React ou à Express.

```ts
// packages/indicators/src/types.ts
export interface Candle {
  timestamp: number;   // epoch ms, UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalResult {
  direction: 'long' | 'short' | 'neutral';
  confidence: number;              // 0..1
  reasons: string[];               // lisible par un humain, affichable dans l'UI
  indicators: {
    rsi?: number;
    macd?: { line: number; signal: number; histogram: number };
    atr?: number;
    supports: number[];
    resistances: number[];
    fibonacci?: Record<string, number>;
    patterns: string[];
    divergences: string[];
    marketStructure?: 'uptrend' | 'downtrend' | 'range';
  };
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
}

export interface AnalyzeOptions {
  rsiPeriod?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  atrPeriod?: number;
  atrStopMultiplier?: number;
}
```

```ts
// packages/indicators/src/index.ts
export * from './types';
export { analyzeSignal } from './analyze';
export { rsi, macd, atr, ema, sma } from './core';
export { detectSupportResistance, fibonacciLevels } from './levels';
export { detectCandlestickPatterns } from './patterns';
export { detectDivergences } from './divergences';
export { detectMarketStructure } from './structure';
```

5. Backend et frontend importent **tous les deux** `@workspace/indicators`. Tu supprimes les deux copies devenues mortes. Tu ne laisses aucun fichier orphelin « au cas où ».

### Critères d'acceptation

- Un test `packages/indicators/test/parity.test.ts` charge un jeu de bougies figé (fixture JSON de 500 bougies, commitée) et vérifie que `analyzeSignal` retourne exactement le même objet que la version frontend d'origine, à la tolérance flottante près (`1e-9`).
- Un `grep` du dépôt ne trouve plus qu'une seule définition de `analyzeSignal`, `rsi`, `macd` et `atr`.
- L'application démarre, les graphiques s'affichent, l'auto-trader tourne.

---

## Lot 2 — Exécution réelle des stop-loss et take-profit

### Problème

Les niveaux de stop-loss et de take-profit sont configurables dans l'interface, stockés, affichés — et **jamais transformés en ordres**. Aujourd'hui sur les actions c'est déjà un trou. En crypto, où le marché bouge la nuit pendant que personne ne regarde, c'est ce qui vide un compte.

### Principe directeur

**Les ordres de protection vivent chez le courtier, pas dans notre boucle.** Un stop-loss envoyé à Kraken se déclenche même si notre serveur est éteint, redémarre, ou perd le réseau. Un stop-loss surveillé par une boucle `setInterval` chez nous ne protège rien dès que le processus meurt. C'est la règle, et elle ne souffre pas d'exception.

### Travail demandé

1. Migration Postgres :

```sql
-- migrations/XXX_protective_orders.sql
CREATE TABLE protective_orders (
  id                BIGSERIAL PRIMARY KEY,
  account_id        TEXT        NOT NULL,
  position_symbol   TEXT        NOT NULL,
  parent_order_id   TEXT        NOT NULL,
  kind              TEXT        NOT NULL CHECK (kind IN ('stop_loss', 'take_profit')),
  trigger_price     NUMERIC(24,10) NOT NULL,
  quantity          NUMERIC(24,10) NOT NULL,
  broker_order_id   TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','placed','filled','cancelled','failed')),
  sibling_id        BIGINT      REFERENCES protective_orders(id),
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX protective_orders_open_idx
  ON protective_orders (account_id, status)
  WHERE status IN ('pending', 'placed');
```

2. Quand un ordre d'entrée est rempli (totalement ou partiellement), le service de protection place immédiatement les ordres correspondants :
   - un **stop-loss** en `reduce-only` sur la quantité remplie,
   - un **take-profit** sur la même quantité,
   - les deux liés par `sibling_id`.

3. **OCO émulé.** Beaucoup d'exchanges ne garantissent pas l'OCO natif sur toutes les paires. Tu vérifies d'abord la capacité native :

```ts
if (exchange.has['createOrderWithTakeProfitAndStopLoss']) {
  // chemin natif : un seul appel, l'exchange gère l'annulation mutuelle
} else {
  // chemin émulé : deux ordres + réconciliateur
}
```

   En mode émulé, un **réconciliateur** tourne toutes les 30 secondes : pour chaque paire de `protective_orders` dont l'un est passé à `filled`, il annule le frère et passe son statut à `cancelled`.

4. **Réconciliation au démarrage.** Au boot du worker, avant toute nouvelle décision, le service compare les positions ouvertes chez le courtier avec les `protective_orders` en base. Toute position ouverte sans protection active déclenche le placement immédiat des ordres manquants, et une notification. C'est ce qui rattrape un crash au mauvais moment.

5. Si le placement d'un ordre de protection échoue trois fois de suite, l'auto-trader **ferme la position au marché** plutôt que de la laisser nue. Ce comportement est journalisé et notifié.

### Critères d'acceptation

- Test d'intégration avec un courtier simulé : un ordre d'entrée rempli produit deux lignes `protective_orders` en statut `placed`.
- Test : le remplissage du stop-loss fait passer le take-profit frère à `cancelled`.
- Test : au démarrage, une position ouverte sans protection en base déclenche le placement.
- Test : trois échecs consécutifs de placement déclenchent la fermeture au marché.

---

## Lot 3 — Abstraction `BrokerAdapter`

### Problème

SnapTrade est appelé directement depuis l'auto-trader. Impossible de brancher un exchange crypto sans dupliquer la logique de décision.

### Travail demandé

Crée le package `packages/broker` (`@workspace/broker`) contenant l'interface et les implémentations.

```ts
// packages/broker/src/types.ts
export type AssetClass = 'equity' | 'crypto';

export interface Balance {
  currency: string;
  free: number;
  total: number;
}

export interface Position {
  symbol: string;          // symbole interne normalisé
  quantity: number;        // négatif = short
  averagePrice: number;
}

export interface MarketLimits {
  minQuantity: number;
  quantityStep: number;
  priceStep: number;
  minNotional?: number;
}

export interface OrderRequest {
  accountId: string;
  symbol: string;                       // interne : 'AAPL' ou 'BTC-USD'
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  limitPrice?: number;
  reduceOnly?: boolean;
  clientOrderId: string;                // idempotence — obligatoire
  protection?: {
    stopLoss?: number;
    takeProfit?: number;
  };
}

export type OrderStatus =
  | 'pending' | 'open' | 'partially_filled'
  | 'filled' | 'cancelled' | 'rejected';

export interface OrderResult {
  brokerOrderId: string;
  clientOrderId: string;
  status: OrderStatus;
  filledQuantity: number;
  averagePrice?: number;
  raw: unknown;
}

export interface BrokerAdapter {
  readonly id: string;
  readonly assetClass: AssetClass;

  /** true si le courtier accepte des ordres conditionnels qui survivent à notre downtime */
  supportsExchangeSideProtection(): boolean;

  getBalances(accountId: string): Promise<Balance[]>;
  getPositions(accountId: string): Promise<Position[]>;
  getMarketLimits(symbol: string): Promise<MarketLimits>;

  placeOrder(req: OrderRequest): Promise<OrderResult>;
  cancelOrder(accountId: string, brokerOrderId: string): Promise<void>;
  getOrder(accountId: string, brokerOrderId: string): Promise<OrderResult>;
  listOpenOrders(accountId: string): Promise<OrderResult[]>;
}
```

**Contraintes**

- `SnapTradeAdapter` **enveloppe le code SnapTrade existant**. Tu ne réécris pas la logique SnapTrade, tu la déplaces derrière l'interface. Elle retourne `false` sur `supportsExchangeSideProtection()` sauf si tu vérifies dans la doc SnapTrade que les ordres conditionnels sont supportés pour le compte connecté — dans ce cas tu le signales avant de changer.
- L'auto-trader ne référence plus jamais SnapTrade ni ccxt directement. Il reçoit un `BrokerAdapter` par injection.
- Une fabrique choisit l'adaptateur :

```ts
// packages/broker/src/factory.ts
export function getAdapterForAccount(account: TradingAccount): BrokerAdapter {
  switch (account.provider) {
    case 'snaptrade': return new SnapTradeAdapter(account);
    case 'ccxt':      return new CcxtAdapter(account.id, {
      exchangeId: account.exchangeId,
      apiKey:     requireEnv(`${account.secretPrefix}_API_KEY`),
      secret:     requireEnv(`${account.secretPrefix}_API_SECRET`),
    });
    default: throw new Error(`Fournisseur inconnu: ${account.provider}`);
  }
}
```

- **Normalisation des symboles.** Un module `symbols.ts` traduit dans les deux sens entre le format interne (`BTC-USD`) et le format du courtier (`BTC/USD` pour ccxt). Toute la base et toute l'UI utilisent le format interne, exclusivement.

### Critères d'acceptation

- `grep -r "snaptrade" packages/auto-trader src/server/auto-trader` ne retourne rien.
- Un test fait tourner l'auto-trader complet contre un `FakeAdapter` en mémoire, sans réseau.
- Le flux Wealthsimple fonctionne comme avant : connexion, soldes, passage d'ordre.

---

## Lot 4 — Adaptateur Kraken via ccxt

### Travail demandé

1. Ajoute la dépendance `ccxt` au backend uniquement. **Pas** au frontend — la librairie est lourde et n'a rien à faire dans le bundle client.

2. Implémentation :

```ts
// packages/broker/src/adapters/ccxt-adapter.ts
import ccxt, { Exchange } from 'ccxt';
import type {
  BrokerAdapter, Balance, Position, MarketLimits,
  OrderRequest, OrderResult,
} from '../types';
import { toBrokerSymbol, toInternalSymbol } from '../symbols';

export interface CcxtAdapterOptions {
  exchangeId: string;     // 'kraken'
  apiKey: string;
  secret: string;
}

export class CcxtAdapter implements BrokerAdapter {
  readonly assetClass = 'crypto' as const;
  private readonly exchange: Exchange;
  private marketsLoaded = false;

  constructor(readonly id: string, opts: CcxtAdapterOptions) {
    const ExchangeCtor = (ccxt as any)[opts.exchangeId];
    if (!ExchangeCtor) throw new Error(`Exchange ccxt inconnu: ${opts.exchangeId}`);

    this.exchange = new ExchangeCtor({
      apiKey: opts.apiKey,
      secret: opts.secret,
      enableRateLimit: true,               // obligatoire : évite le bannissement IP
      options: { adjustForTimeDifference: true },
    });
  }

  supportsExchangeSideProtection(): boolean {
    return true;
  }

  private async ensureMarkets(): Promise<void> {
    if (!this.marketsLoaded) {
      await this.exchange.loadMarkets();
      this.marketsLoaded = true;
    }
  }

  async getBalances(): Promise<Balance[]> {
    const raw = await this.exchange.fetchBalance();
    return Object.entries(raw.total ?? {})
      .filter(([, total]) => Number(total) > 0)
      .map(([currency, total]) => ({
        currency,
        total: Number(total),
        free: Number(raw.free?.[currency] ?? 0),
      }));
  }

  async getPositions(): Promise<Position[]> {
    // Sur un compte spot, une « position » est un solde non-quote.
    // Le prix moyen d'entrée vient de notre propre journal, pas de l'exchange.
    const balances = await this.getBalances();
    return balances
      .filter(b => b.currency !== 'USD' && b.currency !== 'CAD' && b.currency !== 'USDT')
      .map(b => ({
        symbol: toInternalSymbol(`${b.currency}/USD`),
        quantity: b.total,
        averagePrice: 0,      // renseigné par le journal de trading côté appelant
      }));
  }

  async getMarketLimits(symbol: string): Promise<MarketLimits> {
    await this.ensureMarkets();
    const market = this.exchange.market(toBrokerSymbol(symbol));
    return {
      minQuantity: Number(market.limits?.amount?.min ?? 0),
      quantityStep: Number(market.precision?.amount ?? 0),
      priceStep: Number(market.precision?.price ?? 0),
      minNotional: market.limits?.cost?.min != null
        ? Number(market.limits.cost.min)
        : undefined,
    };
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    await this.ensureMarkets();
    const brokerSymbol = toBrokerSymbol(req.symbol);

    // Arrondir AVANT d'envoyer : un ordre à la mauvaise précision est rejeté.
    const amount = Number(this.exchange.amountToPrecision(brokerSymbol, req.quantity));
    const price = req.limitPrice != null
      ? Number(this.exchange.priceToPrecision(brokerSymbol, req.limitPrice))
      : undefined;

    const params: Record<string, unknown> = { clientOrderId: req.clientOrderId };
    if (req.reduceOnly) params.reduceOnly = true;

    const order = await this.exchange.createOrder(
      brokerSymbol, req.type, req.side, amount, price, params,
    );

    return this.toOrderResult(order, req.clientOrderId);
  }

  async cancelOrder(_accountId: string, brokerOrderId: string): Promise<void> {
    await this.exchange.cancelOrder(brokerOrderId);
  }

  async getOrder(_accountId: string, brokerOrderId: string): Promise<OrderResult> {
    const order = await this.exchange.fetchOrder(brokerOrderId);
    return this.toOrderResult(order, String(order.clientOrderId ?? ''));
  }

  async listOpenOrders(): Promise<OrderResult[]> {
    const orders = await this.exchange.fetchOpenOrders();
    return orders.map(o => this.toOrderResult(o, String(o.clientOrderId ?? '')));
  }

  private toOrderResult(order: any, clientOrderId: string): OrderResult {
    return {
      brokerOrderId: String(order.id),
      clientOrderId,
      status: mapStatus(order.status, order.filled, order.amount),
      filledQuantity: Number(order.filled ?? 0),
      averagePrice: order.average != null ? Number(order.average) : undefined,
      raw: order,
    };
  }
}

function mapStatus(s: string | undefined, filled: number, amount: number) {
  if (s === 'closed') return 'filled' as const;
  if (s === 'canceled') return 'cancelled' as const;
  if (s === 'rejected') return 'rejected' as const;
  if (filled > 0 && filled < amount) return 'partially_filled' as const;
  return 'open' as const;
}
```

3. **Gestion d'erreurs.** Enveloppe chaque appel réseau dans une politique de reprise :
   - `ccxt.NetworkError` et `ccxt.RequestTimeout` → 3 tentatives avec backoff exponentiel (1 s, 2 s, 4 s).
   - `ccxt.RateLimitExceeded` → attendre `exchange.rateLimit` puis réessayer, une fois.
   - `ccxt.InsufficientFunds`, `ccxt.InvalidOrder`, `ccxt.AuthenticationError` → **pas de reprise**, remonter l'erreur et journaliser. Réessayer un ordre invalide ne fait qu'empiler les rejets.
   - Toute `AuthenticationError` déclenche le kill switch du lot 6.

4. **Idempotence.** Le `clientOrderId` est un UUID généré par nous et stocké **avant** l'envoi. Si un appel `createOrder` échoue en timeout, on ne renvoie jamais l'ordre à l'aveugle : on interroge `fetchOpenOrders` et `fetchClosedOrders` à la recherche de ce `clientOrderId` avant de décider. C'est ce qui évite d'acheter deux fois sur un simple hoquet réseau.

### Critères d'acceptation

- Test unitaire avec un `Exchange` mocké : `placeOrder` arrondit bien la quantité et le prix via `amountToPrecision` / `priceToPrecision`.
- Test : un timeout suivi d'une reprise ne crée pas de doublon (le `clientOrderId` déjà présent est détecté).
- Test : `InsufficientFunds` ne déclenche aucune reprise.
- Un script manuel `npm run kraken:smoke` lit les soldes en lecture seule et affiche les limites de marché de `BTC-USD`, sans passer d'ordre.

---

## Lot 5 — Données de marché crypto et planificateur 24/7

### Problème

`yahoo-finance2` ne couvre pas le crypto correctement, et tout le planificateur de l'auto-trader est construit autour des heures d'ouverture de la bourse. En crypto, il n'y a pas de fermeture.

### Travail demandé

1. **Interface de feed unifiée**, pour que l'auto-trader ne sache pas d'où viennent les bougies :

```ts
// packages/market-data/src/types.ts
import type { Candle } from '@workspace/indicators';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface MarketDataFeed {
  readonly assetClass: 'equity' | 'crypto';
  getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  subscribe(symbol: string, timeframe: Timeframe, onCandle: (c: Candle) => void): () => void;
}
```

2. `YahooFeed` enveloppe l'existant. `CcxtFeed` utilise `fetchOHLCV` en REST, et le WebSocket de l'exchange s'il est disponible, avec repli automatique sur du polling REST si le socket tombe.

3. **Fraîcheur des données.** Chaque bougie porte son `timestamp`. Avant toute décision de trading, l'auto-trader vérifie que la dernière bougie a moins de deux fois la durée du timeframe. Sinon il **refuse de décider** et journalise `stale_data`. Un bot qui trade sur des prix figés est pire qu'un bot arrêté.

4. **Fin du couplage aux heures de marché.** Remplace la vérification actuelle par :

```ts
// packages/scheduler/src/market-hours.ts
export function isTradeable(assetClass: AssetClass, now: Date = new Date()): boolean {
  if (assetClass === 'crypto') return true;          // 24/7, y compris week-ends et jours fériés
  return isEquityMarketOpen(now);                     // logique existante, inchangée
}
```

   Tu **ne supprimes pas** `isEquityMarketOpen`, tu le laisses intact et tu l'appelles depuis la nouvelle fonction.

5. Le planificateur crypto tourne à l'alignement des bougies : une évaluation à la clôture de chaque bougie du timeframe configuré, pas toutes les N secondes au hasard. Décider au milieu d'une bougie non close produit des signaux qui se contredisent d'une minute à l'autre.

### Critères d'acceptation

- Test : `isTradeable('crypto', <un dimanche 3h du matin>)` retourne `true`, `isTradeable('equity', <le même moment>)` retourne `false`.
- Test : une bougie plus vieille que deux périodes fait refuser la décision avec le motif `stale_data`.
- Test : la coupure du WebSocket bascule sur le polling REST sans perdre de bougie.

---

## Lot 6 — Garde-fous et mode dry-run

### Principe

Rien de ce qui précède ne passe un seul ordre réel tant que ce lot n'est pas terminé et testé.

### Travail demandé

1. Migration :

```sql
-- migrations/XXX_risk_settings.sql
CREATE TABLE risk_settings (
  account_id           TEXT PRIMARY KEY,
  mode                 TEXT NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','live')),
  max_position_pct     NUMERIC(6,3)  NOT NULL DEFAULT 5.0,    -- % du solde total par position
  max_daily_loss_pct   NUMERIC(6,3)  NOT NULL DEFAULT 3.0,    -- % du solde de début de journée
  max_orders_per_hour  INTEGER       NOT NULL DEFAULT 10,
  kill_switch_active   BOOLEAN       NOT NULL DEFAULT false,
  kill_switch_reason   TEXT,
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE order_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  account_id    TEXT        NOT NULL,
  client_order_id TEXT      NOT NULL,
  mode          TEXT        NOT NULL,
  decision      TEXT        NOT NULL,     -- 'allowed' | 'blocked' | 'adjusted'
  reason        TEXT,
  request       JSONB       NOT NULL,
  result        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_audit_log_account_time_idx
  ON order_audit_log (account_id, created_at DESC);
```

2. **`RiskGate` — point de passage obligatoire.** Aucun ordre ne part sans passer par lui.

```ts
// packages/risk/src/risk-gate.ts
export interface RiskDecision {
  allowed: boolean;
  reason?: string;
  adjustedQuantity?: number;
}

export class RiskGate {
  constructor(
    private readonly settings: RiskSettingsRepo,
    private readonly audit: AuditRepo,
  ) {}

  async evaluate(req: OrderRequest, ctx: {
    totalEquity: number;
    dayStartEquity: number;
    currentEquity: number;
    ordersLastHour: number;
    limits: MarketLimits;
    referencePrice: number;
  }): Promise<RiskDecision> {
    const s = await this.settings.get(req.accountId);

    if (s.kill_switch_active) {
      return this.block(req, `kill_switch: ${s.kill_switch_reason ?? 'activé'}`);
    }

    const dayLossPct =
      ((ctx.dayStartEquity - ctx.currentEquity) / ctx.dayStartEquity) * 100;
    if (dayLossPct >= s.max_daily_loss_pct) {
      await this.settings.activateKillSwitch(
        req.accountId, `perte quotidienne ${dayLossPct.toFixed(2)}%`,
      );
      return this.block(req, 'perte quotidienne maximale atteinte');
    }

    if (ctx.ordersLastHour >= s.max_orders_per_hour) {
      return this.block(req, 'plafond horaire d’ordres atteint');
    }

    // Plafonner la taille au lieu de refuser : on trade petit plutôt que pas du tout.
    const maxNotional = ctx.totalEquity * (s.max_position_pct / 100);
    const notional = req.quantity * ctx.referencePrice;
    let quantity = req.quantity;
    if (notional > maxNotional) {
      quantity = maxNotional / ctx.referencePrice;
    }

    if (quantity < ctx.limits.minQuantity) {
      return this.block(req, 'quantité sous le minimum du marché');
    }
    if (ctx.limits.minNotional && quantity * ctx.referencePrice < ctx.limits.minNotional) {
      return this.block(req, 'notionnel sous le minimum du marché');
    }

    const adjusted = quantity !== req.quantity ? quantity : undefined;
    await this.audit.record(req, adjusted ? 'adjusted' : 'allowed', undefined);
    return { allowed: true, adjustedQuantity: adjusted };
  }

  private async block(req: OrderRequest, reason: string): Promise<RiskDecision> {
    await this.audit.record(req, 'blocked', reason);
    return { allowed: false, reason };
  }
}
```

3. **Mode dry-run.** En `mode = 'dry_run'`, l'auto-trader fait tout — analyse, décision, passage par le `RiskGate`, calcul des stops — puis écrit l'ordre dans `order_audit_log` avec le prix de marché du moment **au lieu de l'envoyer au courtier**. Le reste du système (journal, notifications, UI) doit se comporter exactement pareil, avec un badge visible « DRY RUN » dans l'interface pour qu'aucune confusion ne soit possible.

4. **Kill switch dans l'UI.** Un bouton visible sur le tableau de bord, qui coupe l'auto-trader immédiatement. Il annule les ordres ouverts non protecteurs, garde les ordres de protection en place, et exige une réactivation manuelle explicite.

5. **Réparation de la couche notification.** Le lot 6 est le bon moment : le client email est un stub non fonctionnel et les notifications sont câblées en dur sur le SMS malgré des valeurs par défaut email dans le schéma. Un bot autonome sans notification fiable est un bot dont on découvre les problèmes trop tard. Rends le client email fonctionnel et fais respecter le canal choisi dans le schéma. Les événements qui **doivent** notifier : kill switch activé, échec de placement d'un ordre protecteur, erreur d'authentification courtier, données périmées pendant plus de 15 minutes.

### Critères d'acceptation

- Test : en `dry_run`, aucun appel réseau vers le courtier n'est émis, et une ligne apparaît dans `order_audit_log`.
- Test : une perte quotidienne dépassant le seuil active le kill switch et bloque l'ordre suivant.
- Test : une demande de taille excessive est ramenée au plafond, pas refusée.
- Test : une quantité sous le minimum du marché est refusée avec le bon motif.
- Test : le kill switch coupe l'auto-trader mais laisse les ordres de protection en vie.
- Test : chacun des quatre événements critiques produit une notification sur le canal configuré.

---

## Lot 7 — Déploiement Reserved VM

### Travail demandé

1. **Sépare le processus worker du serveur web.** Le serveur Express qui sert l'API et le frontend est une chose ; l'auto-trader qui tourne 24/7 en est une autre. Deux points d'entrée :

```jsonc
// package.json (extrait)
{
  "scripts": {
    "start:web":    "node dist/server/index.js",
    "start:worker": "node dist/worker/index.js"
  }
}
```

2. Le worker est publié en **Reserved VM Deployment configuré en background worker** — c'est le seul type de déploiement Replit qui ne s'endort jamais. Un déploiement Autoscale se réveille sur requête HTTP et se rendort : le planificateur ne tirerait pas. Ne propose pas Autoscale pour le worker.

3. **Secrets Replit à créer** (aucun ne doit apparaître dans le code) :

```
KRAKEN_API_KEY
KRAKEN_API_SECRET
DATABASE_URL
SNAPTRADE_CLIENT_ID
SNAPTRADE_CONSUMER_KEY
```

4. **Un seul worker à la fois.** Ajoute un verrou d'exclusion en base — un `SELECT ... FOR UPDATE` sur une ligne `worker_lock` avec un bail renouvelé toutes les 30 secondes. Deux instances du worker qui tournent en parallèle passeraient les ordres en double.

5. **Endpoint de santé** `/health/worker` qui expose : dernier cycle exécuté, âge de la dernière bougie reçue, état du kill switch, nombre d'ordres protecteurs en `pending`. C'est ce que tu regardes quand tu te demandes si le bot va bien.

### Critères d'acceptation

- `npm run start:worker` démarre l'auto-trader sans serveur web.
- Deux workers lancés simultanément : le second se met en attente et ne passe aucun ordre.
- `/health/worker` répond avec les quatre indicateurs.

---

## Séquence de mise en service

Ne saute aucune étape.

1. Lots 1 à 7 terminés, tous les tests au vert.
2. Clé API Kraken créée avec **trois permissions seulement** : consulter les soldes, consulter les ordres, créer et modifier des ordres. **Pas** la permission de retrait. Si la clé fuit, personne ne peut sortir les fonds.
3. `mode = 'dry_run'`, worker déployé, **deux à trois semaines** de fonctionnement sur données live sans envoyer un ordre. Tu compares chaque décision journalisée avec ce que le graphique affichait au même instant. C'est là qu'on attrape les divergences résiduelles, gratuitement.
4. Bascule en `live` avec un montant que tu es prêt à perdre entièrement, `max_position_pct` à 2 %, `max_daily_loss_pct` à 2 %, une seule paire (`BTC-USD`).
5. Un mois d'observation avant d'augmenter quoi que ce soit — le montant, le nombre de paires, ou les plafonds. Un seul paramètre à la fois.

## Ce que l'agent ne doit pas faire

- Ne pas modifier le thème visuel ni le design system.
- Ne pas toucher à l'intégration MetaApi CopyFactory existante.
- Ne pas ajouter de fonctionnalité multi-utilisateurs, de facturation, ni de gestion d'abonnés. Le projet est mono-utilisateur.
- Ne pas mettre à jour de dépendances qui ne sont pas nommées dans ce document.
- Ne pas écrire de clé API ailleurs que dans les Replit Secrets.
- Ne pas déclarer un lot terminé si un test échoue.
