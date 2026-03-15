import { supabase } from './supabase'
import type { TransferAccount } from '@/types/transfer-account'

export async function fetchTransferAccounts(organizationId: string): Promise<TransferAccount[]> {
  const { data, error } = await supabase
    .from('transfer_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .order('nombre', { ascending: true })
  if (error) throw error
  return data || []
}

export async function insertTransferAccount(account: Omit<TransferAccount, 'id'> & { organization_id: string }): Promise<TransferAccount> {
  const { data, error } = await supabase
    .from('transfer_accounts')
    .insert([account])
    .select()
    .single()
  if (error) throw error
  return data
}
