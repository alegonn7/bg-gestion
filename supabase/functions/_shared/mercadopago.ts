// Utilidades compartidas de Mercado Pago -- usado por mercadopago-checkout y mercadopago-refund.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2"
import { decryptSecret, encryptSecret } from "./crypto.ts"

const REFRESH_BUFFER_MS = 15 * 24 * 60 * 60 * 1000 // 15 días de margen antes de que venza

export class MercadoPagoNotConnectedError extends Error {
  constructor() {
    super("mercadopago_not_connected")
  }
}

// Carga las credenciales OAuth del vendedor, las desencripta, y si el access_token está a
// menos de 15 días de vencer lo refresca primero (grant_type=refresh_token) y persiste el par
// nuevo. Un solo lugar para esta lógica -- la usan mercadopago-checkout y mercadopago-refund,
// nunca dos implementaciones separadas del mismo refresh. El access_token de Mercado Pago dura
// ~180 días, así que en la práctica esto refresca muy poco -- on-demand con buffer, no cron (no
// existe pg_cron ni ninguna Edge Function programada en este proyecto).
export async function getValidSellerAccessToken(
  adminSupabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data: creds } = await adminSupabase
    .from("store_mercadopago_credentials")
    .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (!creds) {
    throw new MercadoPagoNotConnectedError()
  }

  const encryptionKey = Deno.env.get("MP_TOKENS_ENCRYPTION_KEY")!
  const expiresAt = new Date(creds.token_expires_at).getTime()
  const needsRefresh = expiresAt - Date.now() < REFRESH_BUFFER_MS

  if (!needsRefresh) {
    return decryptSecret(creds.access_token_encrypted, encryptionKey)
  }

  const refreshToken = await decryptSecret(creds.refresh_token_encrypted, encryptionKey)

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MP_CLIENT_ID")!,
      client_secret: Deno.env.get("MP_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  const tokenData = await response.json().catch(() => null)

  if (!response.ok || !tokenData?.access_token) {
    throw new Error(`No se pudo refrescar el token de Mercado Pago: ${JSON.stringify(tokenData)}`)
  }

  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  await adminSupabase
    .from("store_mercadopago_credentials")
    .update({
      access_token_encrypted: await encryptSecret(tokenData.access_token, encryptionKey),
      refresh_token_encrypted: await encryptSecret(tokenData.refresh_token, encryptionKey),
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)

  return tokenData.access_token
}
