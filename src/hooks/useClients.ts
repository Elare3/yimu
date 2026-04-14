import useSWR from 'swr';


export function useClients(search?: string, status?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/clients?${params.toString()}`,
  );

  return {
    clients: data?.data?.items || [],
    total: data?.data?.total || 0,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useClient(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/clients/${id}` : null,
  );

  return {
    client: data?.data || null,
    isLoading,
    isError: error,
    mutate,
  };
}
