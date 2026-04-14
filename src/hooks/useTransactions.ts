import useSWR from 'swr';


export function useTransactions(type?: string, month?: string) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (month) params.set('month', month);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/transactions?${params.toString()}`,
  );

  return {
    transactions: data?.data?.items || [],
    total: data?.data?.total || 0,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useSummary(month?: string) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/transactions/summary?${params.toString()}`,
  );

  return {
    summary: data?.data || null,
    isLoading,
    isError: error,
    mutate,
  };
}
