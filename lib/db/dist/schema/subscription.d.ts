import { z } from "zod/v4";
/**
 * État d'abonnement, tel que Whop le connaît.
 * ──────────────────────────────────────────────────────────────────────────
 * Cette table est la SEULE source de vérité côté application : le frontend ne
 * décide jamais s'il est premium, il le demande au serveur, qui le tient de
 * Whop. Auparavant l'unique vérification (`/api/whop/verify`) recevait
 * l'identifiant d'adhésion depuis le client — n'importe qui pouvait donc
 * revendiquer un abonnement. Rien ici ne vient du navigateur.
 *
 * `subject_id` prépare le passage multi-utilisateurs : aujourd'hui l'app est
 * mono-utilisateur (un seul mot de passe partagé, cf. app_settings), donc une
 * seule ligne existe, celle du propriétaire de l'instance. Le jour où une
 * table d'utilisateurs apparaît, `subject_id` référencera l'utilisateur et
 * tout le reste — middleware, hook, mur de paiement — continue de fonctionner
 * sans changement.
 */
export declare const subscriptionTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "subscription";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "subscription";
            dataType: "number";
            columnType: "PgSerial";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        subjectId: import("drizzle-orm/pg-core").PgColumn<{
            name: "subject_id";
            tableName: "subscription";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        membershipId: import("drizzle-orm/pg-core").PgColumn<{
            name: "membership_id";
            tableName: "subscription";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        planId: import("drizzle-orm/pg-core").PgColumn<{
            name: "plan_id";
            tableName: "subscription";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        productId: import("drizzle-orm/pg-core").PgColumn<{
            name: "product_id";
            tableName: "subscription";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "subscription";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        active: import("drizzle-orm/pg-core").PgColumn<{
            name: "active";
            tableName: "subscription";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        currentPeriodEnd: import("drizzle-orm/pg-core").PgColumn<{
            name: "current_period_end";
            tableName: "subscription";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        lastCheckedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_checked_at";
            tableName: "subscription";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        lastError: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_error";
            tableName: "subscription";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        raw: import("drizzle-orm/pg-core").PgColumn<{
            name: "raw";
            tableName: "subscription";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: Record<string, unknown>;
        }>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "subscription";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const insertSubscriptionSchema: z.ZodObject<{
    raw: z.ZodOptional<z.ZodNullable<z.ZodType<Record<string, unknown>, Record<string, unknown>, z.core.$ZodTypeInternals<Record<string, unknown>, Record<string, unknown>>>>>;
    active: z.ZodOptional<z.ZodBoolean>;
    status: z.ZodOptional<z.ZodString>;
    subjectId: z.ZodOptional<z.ZodString>;
    membershipId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    planId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    productId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    currentPeriodEnd: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    lastCheckedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    lastError: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, {
    out: {};
    in: {};
}>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionTable.$inferSelect;
/** Statuts Whop qui ouvrent l'accès premium. */
export declare const ACTIVE_SUBSCRIPTION_STATUSES: readonly ["active", "trialing", "completed"];
/** Statuts qui méritent un avertissement dans l'interface sans couper l'accès. */
export declare const WARNING_SUBSCRIPTION_STATUSES: readonly ["past_due", "unpaid"];
//# sourceMappingURL=subscription.d.ts.map