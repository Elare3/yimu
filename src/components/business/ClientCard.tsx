'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { formatAmount } from '@/lib/utils';

interface ClientCardProps {
  client: {
    id: string;
    name: string;
    contactPerson: string;
    phone: string;
    email: string;
    wechat: string;
    tags: string[];
    totalRevenue: number;
    projectCount: number;
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ClientCard({ client, onEdit, onDelete }: ClientCardProps) {
  const router = useRouter();

  return (
    <Card
      className="p-5 cursor-pointer"
      onClick={() => router.push(`/clients/${client.id}`)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-brown-800">{client.name}</h3>
          {client.contactPerson && (
            <p className="text-brown-500 text-sm mt-0.5">{client.contactPerson}</p>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(client.id); }}
            className="p-1.5 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-caramel transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(client.id); }}
            className="p-1.5 rounded-lg hover:bg-danger-light text-brown-300 hover:text-danger transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tags */}
      {client.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {client.tags.map((tag) => (
            <span key={tag} className="bg-caramel-bg text-caramel text-xs px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Contact info */}
      <div className="space-y-1 text-sm text-brown-500">
        {client.phone && <p>📱 {client.phone}</p>}
        {client.email && <p>✉️ {client.email}</p>}
        {client.wechat && <p>💬 {client.wechat}</p>}
      </div>

      {/* Revenue / project count */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-cream-200">
        <span className="font-serif text-base font-bold text-brown-800">
          {formatAmount(client.totalRevenue)}
        </span>
        <span className="text-brown-300 text-xs">
          {client.projectCount} 个项目
        </span>
      </div>
    </Card>
  );
}
