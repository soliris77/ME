export * from "./generated/api";
export * from "./generated/types";
// Certains schémas zod de generated/api portent le même nom que les types
// générés — TS2308 exige une ré-exportation explicite pour lever l'ambiguïté :
// le *schéma zod* (valeur) vient de generated/api, le *type* de generated/types.
export type {
  RenameWatchlistListBody,
  ReorderWatchlistListsBody,
  UpdateWatchlistItemBody,
} from "./generated/types";
