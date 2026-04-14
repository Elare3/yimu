import useSWR from 'swr';


export function useProjects(status?: string, clientId?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (clientId) params.set('clientId', clientId);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/projects?${params.toString()}`,
  );

  return {
    projects: data?.data?.items || [],
    total: data?.data?.total || 0,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useProject(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/projects/${id}` : null,
  );

  return {
    project: data?.data || null,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useKanban(completedSearch?: string) {
  const params = completedSearch ? `?completedSearch=${encodeURIComponent(completedSearch)}` : '';
  const { data, error, isLoading, mutate } = useSWR(
    `/api/projects/kanban${params}`,
  );

  return {
    columns: data?.data?.columns || data?.data || {},
    completedTotal: data?.data?.completedTotal ?? 0,
    isLoading,
    isError: error,
    mutate,
  };
}
