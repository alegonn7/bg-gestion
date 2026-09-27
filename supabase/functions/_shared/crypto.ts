// Cifrado en reposo para los tokens OAuth de Mercado Pago (access_token/refresh_token de cada
// vendedor conectado). AES-256-GCM vía Web Crypto nativo de Deno -- sin dependencias nuevas.
// Mejora deliberada sobre AES-256-CBC (usado en un proyecto anterior del mismo autor,
// turnomio): GCM es cifrado autenticado, detecta manipulación del ciphertext con el mismo
// esfuerzo de implementación que CBC.
//
// Formato de salida: "<iv en base64>.<ciphertext+tag en base64>" -- un solo string de texto por
// columna; el tag de autenticación queda incluido en el ciphertext (comportamiento estándar de
// crypto.subtle.encrypt para AES-GCM, no hace falta separarlo a mano).
//
// La key (MP_TOKENS_ENCRYPTION_KEY) se genera una sola vez con `openssl rand -base64 32` y vive
// solo como secret de Edge Function -- ecomerse nunca la conoce ni desencripta nada.

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(keyB64)
  if (keyBytes.length !== 32) {
    throw new Error("MP_TOKENS_ENCRYPTION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)")
  }
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"])
}

export async function encryptSecret(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`
}

export async function decryptSecret(blob: string, keyB64: string): Promise<string> {
  const [ivB64, ciphertextB64] = blob.split(".")
  if (!ivB64 || !ciphertextB64) {
    throw new Error("Formato de secreto cifrado inválido")
  }
  const key = await importKey(keyB64)
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(ciphertextB64),
  )
  return new TextDecoder().decode(plaintext)
}

// HMAC-SHA256 en hex -- usado por mercadopago-webhook para validar la firma de Mercado Pago.
// Vive acá porque es la misma primitiva (Web Crypto, sin dependencias) que el cifrado de arriba.
export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("")
}
