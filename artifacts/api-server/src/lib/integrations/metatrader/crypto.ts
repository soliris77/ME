/**
 * Chiffrement AES-256-GCM pour le stockage sécurisé des identifiants MetaTrader.
 *
 * Clé : variable d'environnement ENCRYPTION_KEY (64 caractères hex = 32 octets).
 * Génération d'une clé : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Format du texte chiffré (base64) : <iv_hex>:<authTag_hex>:<ciphertext_hex>
 * Jamais de texte en clair dans les logs ni dans les réponses réseau.
 */
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY doit être une chaîne hex de 64 caractères (32 octets). " +
      "Génère-la avec : node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      "et ajoute-la comme secret Replit.",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Chiffre un texte clair et retourne une chaîne base64 contenant IV + tag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96 bits pour GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format : iv_hex:authTag_hex:ciphertext_hex
  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

/**
 * Déchiffre une chaîne produite par encrypt().
 * Lève une erreur si le format est invalide ou si l'intégrité est compromise.
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Format de données chiffrées invalide.");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
