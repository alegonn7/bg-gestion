import { supabase } from '@/lib/supabase'

export async function fetchTransferAccountById(id: string) {
  if (!id) return null
  const { data, error } = await supabase
    .from('transfer_accounts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}
