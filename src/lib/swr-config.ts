import { SWRConfiguration } from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('请求失败') as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export const swrConfig: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false,       // 切tab不重复请求
  revalidateOnReconnect: false,    // 断网恢复不重复请求
  dedupingInterval: 5000,          // 5秒内同key去重
  keepPreviousData: true,          // 切换参数时保留旧数据，避免闪烁
  errorRetryCount: 2,              // 错误最多重试2次
};
