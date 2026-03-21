import { TransferAccount } from '../types/transfer-account';
import { create } from 'zustand';
import { fetchTransferAccounts, insertTransferAccount } from '@/lib/transfer-accounts';
import { useAuthStore } from '@/store/auth';

interface TransferAccountState {
  accounts: TransferAccount[];
  loading: boolean;
  error: string | null;
  fetchAccounts: () => Promise<void>;
  addAccount: (account: Omit<TransferAccount, 'id'>) => Promise<void>;
  removeAccount: (id: string) => void;
  setGeneric: (id: string) => void;
}

export const useTransferAccounts = create<TransferAccountState>((set, get) => ({
  accounts: [
    {
      id: 'generica',
      nombre: 'Cuenta Genérica',
      generica: true,
    },
  ],
  loading: false,
  error: null,
  fetchAccounts: async () => {
    set({ loading: true, error: null })
    try {
      // Obtener organización actual
      const organizationId = useAuthStore.getState().organization?.id
      if (!organizationId) throw new Error('No hay organización seleccionada')
      const data = await fetchTransferAccounts(organizationId)
      // Siempre incluir la genérica
      set({ accounts: [
        {
          id: 'generica',
          nombre: 'Cuenta Genérica',
          generica: true,
        },
        ...data.filter(a => !a.generica)
      ], loading: false })
    } catch (e: any) {
      set({ error: e.message || 'Error al cargar cuentas', loading: false })
    }
  },
  addAccount: async (account) => {
    set({ loading: true, error: null })
    try {
      const organizationId = useAuthStore.getState().organization?.id
      if (!organizationId) throw new Error('No hay organización seleccionada')
      const newAcc = await insertTransferAccount({ ...account, organization_id: organizationId })
      set((state) => ({
        accounts: [
          ...state.accounts,
          newAcc
        ],
        loading: false
      }))
    } catch (e: any) {
      set({ error: e.message || 'Error al agregar cuenta', loading: false })
    }
  },
  removeAccount: (id) =>
    set((state) => ({
      accounts: state.accounts.filter((a) => a.id !== id),
    })),
  setGeneric: (id) =>
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, generica: true } : { ...a, generica: false }
      ),
    })),
}));
