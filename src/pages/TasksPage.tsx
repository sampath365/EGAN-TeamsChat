import { useMemo, useState } from 'react';
import {
  CalendarDays, Check, ChevronDown, Filter, GripVertical, KanbanSquare, Plus, Search, Tag, Trash2, User as UserIcon, X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { TaskItem } from '@/lib/types';
import { cn, dueLabel, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Modal } from '@/components/ui';

const COLUMNS: { key: TaskItem['status']; label: string; tone: string }[] = [
  { key: 'todo', label: 'To do', tone: 'bg-ink-400' },
  { key: 'in_progress', label: 'In progress', tone: 'bg-brand-500' },
  { key: 'review', label: 'In review', tone: 'bg-violet-500' },
  { key: 'done', label: 'Done', tone: 'bg-emerald-500' },
];

const PRIORITIES: TaskItem['priority'][] = ['low', 'medium', 'high', 'critical'];

export function TasksPage() {
  const { tasks, members, user, createTask, updateTask, deleteTask, can, toast } = useApp();
  const [query, setQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return tasks.filter((t) => {
      if (assigneeFilter === 'mine' && t.assigneeId !== user?.id) return false;
      if (assigneeFilter === 'unassigned' && t.assigneeId) return false;
      if (assigneeFilter !== 'all' && assigneeFilter !== 'mine' && assigneeFilter !== 'unassigned' && t.assigneeId !== assigneeFilter) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
    });
  }, [tasks, query, assigneeFilter, user?.id]);

  const byStatus = useMemo(() => {
    const map: Record<string, TaskItem[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of filtered) (map[t.status] ||= []).push(t);
    return map;
  }, [filtered]);

  const onDrop = async (status: TaskItem['status']) => {
    setDropCol(null);
    if (!dragId) return;
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || task.status === status) return;
    try {
      await updateTask(task.id, { status });
    } catch (e: any) {
      toast({ title: 'Could not move task', body: e.message, tone: 'error' });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4 bordered">
        <div className="flex items-center gap-2">
          <KanbanSquare size={17} className="text-brand-600 dark:text-brand-300" />
          <h1 className="text-[15px] font-extrabold">Tasks</h1>
          <Badge tone="brand">{tasks.filter((t) => t.status !== 'done').length} open</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input h-8 w-40 pl-7 text-[12px] sm:w-52" placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="relative">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="input h-8 cursor-pointer py-0 text-[12px]"
              aria-label="Filter by assignee"
            >
              <option value="all">Everyone</option>
              <option value="mine">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
            </select>
          </div>
          {can('task.manage') && (
            <button type="button" className="btn-primary h-8 px-3 text-[12px]" onClick={() => setCreating(true)}>
              <Plus size={13} /> New task
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
        <div className="flex h-full min-w-max gap-3">
          {COLUMNS.map((col) => {
            const items = byStatus[col.key] || [];
            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setDropCol(col.key); }}
                onDragLeave={() => setDropCol((c) => (c === col.key ? null : c))}
                onDrop={() => void onDrop(col.key)}
                className={cn(
                  'flex h-full w-[278px] shrink-0 flex-col rounded-2xl border bg-[rgb(var(--surface-2))] transition bordered',
                  dropCol === col.key && 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10',
                )}
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className={cn('h-2 w-2 rounded-full', col.tone)} />
                  <h2 className="text-[12.5px] font-bold">{col.label}</h2>
                  <span className="rounded-full bg-[rgb(var(--surface-3))] px-1.5 text-[10.5px] font-bold text-muted">{items.length}</span>
                  <div className="flex-1" />
                  {can('task.manage') && (
                    <IconButton label={`Add to ${col.label}`} className="h-6 w-6" onClick={() => { setEditing({ status: col.key } as TaskItem); setCreating(true); }}>
                      <Plus size={13} />
                    </IconButton>
                  )}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      members={members}
                      draggable={can('task.manage')}
                      onDragStart={() => setDragId(t.id)}
                      onClick={() => { setEditing(t); setCreating(false); }}
                      onDelete={can('task.manage') ? async () => { await deleteTask(t.id); toast({ title: 'Task deleted', tone: 'success' }); } : undefined}
                    />
                  ))}
                  {items.length === 0 && (
                    <p className="rounded-xl border border-dashed px-3 py-6 text-center text-[11.5px] text-muted bordered">Drop tasks here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskModal
        open={creating || !!editing}
        task={editing}
        isNew={creating}
        members={members}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSave={async (payload) => {
          try {
            if (creating) await createTask({ ...payload, title: payload.title || 'Untitled task' });
            else if (editing?.id) await updateTask(editing.id, payload);
            setCreating(false);
            setEditing(null);
            toast({ title: creating ? 'Task created' : 'Task updated', tone: 'success' });
          } catch (e: any) {
            toast({ title: 'Could not save task', body: e.message, tone: 'error' });
          }
        }}
      />
    </div>
  );
}

function TaskCard({
  task, members, draggable, onDragStart, onClick, onDelete,
}: {
  task: TaskItem;
  members: ReturnType<typeof useApp>['members'];
  draggable: boolean;
  onDragStart: () => void;
  onClick: () => void;
  onDelete?: () => Promise<void>;
}) {
  const assignee = members.find((m) => m.userId === task.assigneeId)?.user;
  const due = dueLabel(task.dueDate);
  const doneChecks = task.checklist?.filter((c) => c.done).length || 0;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'group cursor-pointer rounded-xl border bg-[rgb(var(--surface))] p-2.5 shadow-soft transition hover:border-brand-300 hover:shadow-lift bordered',
        task.status === 'done' && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className={cn('text-[12.5px] font-bold leading-snug', task.status === 'done' && 'line-through')}>{task.title}</p>
        {onDelete && (
          <button
            type="button"
            aria-label="Delete task"
            onClick={(e) => { e.stopPropagation(); void onDelete(); }}
            className="shrink-0 text-muted opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {task.description && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{task.description}</p>}

      {task.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[9.5px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <Tag size={8} />{tag}
            </span>
          ))}
        </div>
      )}

      {task.checklist?.length > 0 && (
        <div className="mt-1.5">
          <div className="h-1 overflow-hidden rounded-full bg-ink-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneChecks / task.checklist.length) * 100}%` }} />
          </div>
          <p className="mt-0.5 text-[9.5px] text-muted">{doneChecks}/{task.checklist.length} done</p>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-1">
        <span className={cn(
          'inline-flex items-center gap-1 text-[10px] font-semibold',
          due.tone === 'danger' ? 'text-rose-500' : due.tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-muted',
        )}>
          <CalendarDays size={10} />{due.text}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', task.priority === 'critical' ? 'bg-rose-500' : task.priority === 'high' ? 'bg-amber-500' : task.priority === 'medium' ? 'bg-brand-500' : 'bg-ink-400')} title={`${task.priority} priority`} />
          {assignee ? <Avatar name={assignee.name} color={assignee.avatarColor} size={20} /> : <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed text-muted bordered"><UserIcon size={10} /></span>}
        </span>
      </div>
    </div>
  );
}

function TaskModal({
  open, task, isNew, members, onClose, onSave,
}: {
  open: boolean;
  task: TaskItem | null;
  isNew: boolean;
  members: ReturnType<typeof useApp>['members'];
  onClose: () => void;
  onSave: (payload: Partial<TaskItem> & { title: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskItem['status']>('todo');
  const [priority, setPriority] = useState<TaskItem['priority']>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState('');
  const [checklist, setChecklist] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [checkDraft, setCheckDraft] = useState('');
  const [hydrated, setHydrated] = useState<string | null>(null);

  const key = `${open}-${task?.id || 'new'}`;
  if (open && hydrated !== key) {
    setHydrated(key);
    setTitle(task?.title || '');
    setDescription(task?.description || '');
    setStatus(task?.status || 'todo');
    setPriority(task?.priority || 'medium');
    setAssigneeId(task?.assigneeId || '');
    setDueDate(task?.dueDate || '');
    setTags((task?.tags || []).join(', '));
    setChecklist(task?.checklist || []);
    setCheckDraft('');
  }
  if (!open && hydrated !== null) setHydrated(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'New task' : 'Edit task'}
      subtitle={isNew ? 'Assign it, date it, tag it.' : 'Changes save to everyone instantly.'}
      wide
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!title.trim()}
            onClick={() => void onSave({
              title: title.trim(),
              description,
              status,
              priority,
              assigneeId: assigneeId || null,
              dueDate: dueDate || null,
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              checklist,
            })}
          >
            <Check size={15} /> {isNew ? 'Create task' : 'Save changes'}
          </button>
        </>
      }
    >
      <label className="label">Title</label>
      <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" />

      <label className="label mt-3">Description</label>
      <textarea className="input min-h-[74px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add context, links or acceptance criteria" />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TaskItem['status'])}>
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as TaskItem['priority'])}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Assignee</label>
          <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <label className="label mt-3">Tags (comma separated)</label>
      <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="payments, urgent" />

      <label className="label mt-3">Checklist</label>
      <div className="space-y-1">
        {checklist.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 bordered">
            <input
              type="checkbox"
              checked={c.done}
              onChange={() => setChecklist((prev) => prev.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
              className="h-3.5 w-3.5 rounded"
            />
            <span className={cn('flex-1 text-[12px]', c.done && 'text-muted line-through')}>{c.text}</span>
            <button type="button" aria-label="Remove item" onClick={() => setChecklist((prev) => prev.filter((x) => x.id !== c.id))} className="text-muted hover:text-rose-500"><X size={12} /></button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <input
            className="input h-8 text-[12px]"
            value={checkDraft}
            onChange={(e) => setCheckDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && checkDraft.trim()) {
                e.preventDefault();
                setChecklist((prev) => [...prev, { id: Math.random().toString(36).slice(2), text: checkDraft.trim(), done: false }]);
                setCheckDraft('');
              }
            }}
            placeholder="Add a step and press Enter"
          />
          <button
            type="button"
            className="btn-outline h-8 px-2.5 text-[12px]"
            onClick={() => {
              if (!checkDraft.trim()) return;
              setChecklist((prev) => [...prev, { id: Math.random().toString(36).slice(2), text: checkDraft.trim(), done: false }]);
              setCheckDraft('');
            }}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
      {task?.updatedAt && !isNew && <p className="mt-3 text-[10.5px] text-muted">Last updated {timeAgo(task.updatedAt)}</p>}
    </Modal>
  );
}
