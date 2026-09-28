// Usuario de la sesión que llama a una Edge Function.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2"

// Se valida con la firma del token, sin ir al servidor de autenticación (más rápido). Si no se
// puede validar así, se le pregunta al servidor como respaldo.
export async function usuarioDeLaSesion(admin: SupabaseClient, authHeader: string): Promise<string | null> {
  const token = authHeader.replace(/^Bearer\s+/i, "")
  const { data } = await admin.auth.getClaims(token)
  if (data?.claims?.sub) return data.claims.sub
  const { data: respaldo } = await admin.auth.getUser(token)
  return respaldo.user?.id ?? null
}
