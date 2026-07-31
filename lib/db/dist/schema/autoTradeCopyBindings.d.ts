import { z } from "zod/v4";
export declare const autoTradeCopyBindingsTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "auto_trade_copy_bindings";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "auto_trade_copy_bindings";
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
        ruleId: import("drizzle-orm/pg-core").PgColumn<{
            name: "rule_id";
            tableName: "auto_trade_copy_bindings";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        followedTraderId: import("drizzle-orm/pg-core").PgColumn<{
            name: "followed_trader_id";
            tableName: "auto_trade_copy_bindings";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        enabled: import("drizzle-orm/pg-core").PgColumn<{
            name: "enabled";
            tableName: "auto_trade_copy_bindings";
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
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "auto_trade_copy_bindings";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
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
export declare const insertAutoTradeCopyBindingSchema: z.ZodObject<{
    followedTraderId: z.ZodInt;
    enabled: z.ZodOptional<z.ZodBoolean>;
    ruleId: z.ZodInt;
}, {
    out: {};
    in: {};
}>;
export type InsertAutoTradeCopyBinding = z.infer<typeof insertAutoTradeCopyBindingSchema>;
export type AutoTradeCopyBinding = typeof autoTradeCopyBindingsTable.$inferSelect;
//# sourceMappingURL=autoTradeCopyBindings.d.ts.map