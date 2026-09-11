/**
 * Redirige TOUS les tests vers une base de donnees dediee.
 *
 * Les tests d'integration ecrivaient dans la base de production : on y a
 * retrouve un compte "test-discipline-account" et une ligne risk_settings
 * en mode live. Ce fichier rend cela impossible.
 */
function deriveTestUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/me_test";
  return parsed.toString();
}

const prodUrl = process.env.DATABASE_URL ?? "";
const testUrl = process.env.TEST_DATABASE_URL ?? (prodUrl ? deriveTestUrl(prodUrl) : "");

if (!testUrl) {
  throw new Error("Aucune base de test : definis TEST_DATABASE_URL ou DATABASE_URL.");
}
if (prodUrl && testUrl === prodUrl) {
  throw new Error("La base de test est identique a la base de production. Tests interrompus.");
}

process.env.DATABASE_URL = testUrl;
