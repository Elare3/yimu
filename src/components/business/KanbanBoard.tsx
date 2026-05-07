'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import ProjectCard from './ProjectCard';
import {
  PROJECT_STATUS_LABELS as STATUS_LABELS,
  PROJECT_STATUS_TRANSITIONS as STATUS_TRANSITIONS,
} from '@/lib/constants';
import { Modal } from '@/components/ui/Modal';

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  priority: string;
  totalAmount: number;
  paidAmount: number;
  deadline?: string | null;
  completedAt?: string | null;
  notes: string;
  tags?: string[];
  client?: { id: string; name: string } | null;
}

interface KanbanBoardProps {
  columns: Record<string, ProjectItem[]>;
  onStatusChange: (projectId: string, newStatus: string) => Promise<void>;
  onProjectClick: (projectId: string) => void;
  completedTotal?: number;
  onShowCompleted?: () => void;
}

const COLUMN_STYLES: Record<string, { bg: string; dot: string; header: string }> = {
  quoted: { bg: 'bg-[#FDF5ED]/50', dot: '#C47D3F', header: '#C47D3F' },
  in_progress: { bg: 'bg-[#EDF5ED]/50', dot: '#5B8C5A', header: '#5B8C5A' },
  review: { bg: 'bg-[#FFF8E8]/50', dot: '#D4940E', header: '#B87F0A' },
};

const KANBAN_STATUSES = ['quoted', 'in_progress', 'review'];

function SortableProjectCard({
  project,
  onClick,
  onMobileMove,
}: {
  project: ProjectItem;
  onClick: () => void;
  onMobileMove: (project: ProjectItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* 桌面端：整张卡片可拖拽 */}
      <div className="hidden md:block" {...attributes} {...listeners}>
        <ProjectCard project={project} onClick={onClick} isDragging={isDragging} />
      </div>
      {/* 移动端：不启用拖拽，改为显式"换列"按钮 */}
      <div className="md:hidden">
        <ProjectCard project={project} onClick={onClick} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMobileMove(project);
          }}
          aria-label="更换状态"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 border border-cream-300 shadow-sm flex items-center justify-center text-brown-500 active:bg-cream-100"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  projects,
  onProjectClick,
  onMobileMove,
}: {
  status: string;
  projects: ProjectItem[];
  onProjectClick: (id: string) => void;
  onMobileMove: (project: ProjectItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const style = COLUMN_STYLES[status] || COLUMN_STYLES.quoted;

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col min-w-0 md:min-w-[280px] md:max-w-[320px] flex-1 rounded-[16px] p-3',
        style.bg,
        isOver ? 'ring-2 ring-caramel/30' : '',
        'transition-all duration-200',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="relative flex items-center justify-center">
          <span className="absolute w-4 h-4 rounded-full opacity-20" style={{ backgroundColor: style.dot }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: style.dot }} />
        </span>
        <h3 className="font-semibold text-sm" style={{ color: style.header }}>
          {STATUS_LABELS[status] || status}
        </h3>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: style.dot + '15', color: style.header }}>
          {projects.length}
        </span>
      </div>

      <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2.5 flex-1 min-h-[100px]">
          {projects.map((project) => (
            <SortableProjectCard
              key={project.id}
              project={project}
              onClick={() => onProjectClick(project.id)}
              onMobileMove={onMobileMove}
            />
          ))}
          {projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-brown-300">
              <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-xs">拖拽项目到这里</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function KanbanBoard({ columns, onStatusChange, onProjectClick, completedTotal = 0, onShowCompleted }: KanbanBoardProps) {
  const [activeProject, setActiveProject] = useState<ProjectItem | null>(null);
  const [movingProject, setMovingProject] = useState<ProjectItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const projectId = event.active.id as string;
    for (const status of KANBAN_STATUSES) {
      const found = columns[status]?.find((p) => p.id === projectId);
      if (found) { setActiveProject(found); break; }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProject(null);
    if (!over) return;

    const projectId = active.id as string;
    const overId = over.id as string;

    let targetStatus: string | null = null;
    if (KANBAN_STATUSES.includes(overId)) {
      targetStatus = overId;
    } else {
      for (const status of KANBAN_STATUSES) {
        if (columns[status]?.find((p) => p.id === overId)) { targetStatus = status; break; }
      }
    }
    if (!targetStatus) return;

    let sourceStatus: string | null = null;
    for (const status of KANBAN_STATUSES) {
      if (columns[status]?.find((p) => p.id === projectId)) { sourceStatus = status; break; }
    }
    if (sourceStatus === targetStatus) return;

    await onStatusChange(projectId, targetStatus);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-4 md:min-h-[400px]">
        {KANBAN_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            projects={columns[status] || []}
            onProjectClick={onProjectClick}
            onMobileMove={setMovingProject}
          />
        ))}

        {/* 已完成列 — 固定入口卡片 */}
        <div className="flex flex-col min-w-0 md:min-w-[280px] md:max-w-[320px] flex-1 rounded-[16px] p-3 bg-[#F3F1ED]/50">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="relative flex items-center justify-center">
              <span className="absolute w-4 h-4 rounded-full opacity-20" style={{ backgroundColor: '#8BA88B' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#8BA88B' }} />
            </span>
            <h3 className="font-semibold text-sm" style={{ color: '#6B8A6B' }}>
              {STATUS_LABELS['completed'] || '已完成'}
            </h3>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#8BA88B15', color: '#6B8A6B' }}>
              {completedTotal}
            </span>
          </div>

          <div className="flex flex-col gap-2.5 flex-1 min-h-[100px]">
            <div
              onClick={onShowCompleted}
              className="bg-white rounded-card border-[1.5px] border-cream-300 p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_12px_32px_rgba(44,36,32,0.06)] hover:border-caramel/25"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-4 h-4 text-olive flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="font-semibold text-brown-800 text-sm leading-snug">
                  查看全部已完成
                </h4>
              </div>
              <p className="text-brown-300 text-xs">
                共 {completedTotal} 个项目
              </p>
            </div>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeProject ? (
          <div className="w-[80vw] md:w-[300px]">
            <ProjectCard project={activeProject} isDragging />
          </div>
        ) : null}
      </DragOverlay>

      {/* 移动端更换状态 */}
      <Modal
        isOpen={!!movingProject}
        onClose={() => setMovingProject(null)}
        title="更换项目状态"
        size="sm"
      >
        {movingProject && (
          <div className="space-y-2">
            <p className="text-sm text-brown-500 mb-3">
              <span className="font-semibold text-brown-800">{movingProject.name}</span>
              <span className="text-brown-300 ml-2">当前：{STATUS_LABELS[movingProject.status] || movingProject.status}</span>
            </p>
            {(STATUS_TRANSITIONS[movingProject.status] || []).length === 0 ? (
              <p className="text-sm text-brown-300 py-4 text-center">当前状态不可再变更</p>
            ) : (
              (STATUS_TRANSITIONS[movingProject.status] || []).map((next) => (
                <button
                  key={next}
                  type="button"
                  onClick={async () => {
                    const target = movingProject;
                    setMovingProject(null);
                    await onStatusChange(target.id, next);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-[12px] border border-cream-300 hover:border-caramel hover:bg-cream-50 active:bg-cream-100 transition-colors text-left"
                >
                  <span className="text-sm text-brown-800">{STATUS_LABELS[next] || next}</span>
                  <svg className="w-4 h-4 text-brown-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))
            )}
          </div>
        )}
      </Modal>
    </DndContext>
  );
}
