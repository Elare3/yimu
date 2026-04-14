'use client';

import { useState } from 'react';
import { useClients } from '@/hooks/useClients';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import ClientForm from '@/components/business/ClientForm';
import ClientCard from '@/components/business/ClientCard';
import { toast } from '@/stores/toastStore';

interface ClientItem {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  wechat: string;
  tags: string[];
  totalRevenue: number;
  projectCount: number;
}

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { clients, total, isLoading, mutate } = useClients(search);

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('客户创建成功');
        mutate();
        setShowForm(false);
      } else {
        toast.error(result.error || '创建失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!editingId) return;
    try {
      const res = await fetch(`/api/clients/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('客户更新成功');
        mutate();
        setEditingId(null);
      } else {
        toast.error(result.error || '更新失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast.success('客户已归档');
        mutate();
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  return (
    <div className="space-y-6">
      {/* 搜索栏 + 新建按钮 */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="搜索客户名称、联系人、电话..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setShowForm(true)}>
          + 新建客户
        </Button>
      </div>

      {/* 统计 */}
      <p className="text-brown-300 text-sm">共 {total} 位客户</p>

      {/* 加载状态 — 骨架屏代替转圈 */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* 客户列表 */}
      {!isLoading && clients.length === 0 && (
        <div className="text-center py-16 text-brown-300">
          <p className="text-4xl mb-4">👥</p>
          <p className="text-lg mb-2">还没有客户</p>
          <p className="text-sm">点击「新建客户」添加你的第一个客户</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client: ClientItem) => (
          <ClientCard
            key={client.id}
            client={client}
            onEdit={(id) => setEditingId(id)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* 新建客户 Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="新建客户" size="lg">
        <ClientForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </Modal>

      {/* 编辑客户 Modal */}
      <Modal isOpen={!!editingId} onClose={() => setEditingId(null)} title="编辑客户" size="lg">
        <ClientForm
          clientId={editingId || undefined}
          onSubmit={handleUpdate}
          onCancel={() => setEditingId(null)}
        />
      </Modal>
    </div>
  );
}
