import useSWR from 'swr';


export function useQuotes(status?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/quotes?${params.toString()}`,
  );

  return {
    quotes: data?.data?.items || [],
    total: data?.data?.total || 0,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useQuote(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/quotes/${id}` : null,
  );

  return {
    quote: data?.data || null,
    isLoading,
    isError: error,
    mutate,
  };
}
