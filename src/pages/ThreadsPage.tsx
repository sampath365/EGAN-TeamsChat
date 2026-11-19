import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hash, MessageSquare, Reply } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState } from '@/components/ui';
import { RichText } from '@/components/RichText';

export function ThreadsPage() {
  const { messages, channels, members, user } = useApp();

  const threads = useMemo(() => {
    const rows: { channelId: string; channelName: string; message: (typeof messages)[string][number] }[] = [];
    for (const [channelId, list] of Object.entries(messages)) {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) continue;
      for (const m of list) {
        if (m.replyCount > 0) rows.push({ channelId, channelName: channel.name, message: m });
      }
    }
    return rows.sort((a, b) => b.message.createdAt.localeCompare(a.message.createdAt));
  }, [messages, channels]);

  const mine = threads.filter((t) => t.message.mentions.includes(user?.id || '') || t.message.authorId === user?.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <h1 className="text-[20px] font-black">Threads</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">Conversations you are part of, newest first.</p>

        {threads.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              icon={<MessageSquare size={20} />}
              title="No threads yet"
              body="Reply to a message in any channel and the conversation shows up here."
            />
          </div>
        ) : (
          <>
            {mine.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted">Involving you</p>
                <div className="space-y-2">
                  {mine.map((t) => <ThreadRow key={t.message.id} {...t} members={members} />)}
                </div>
              </>
            )}
            <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted">All active threads</p>
            <div className="space-y-2">
              {threads.map((t) => <ThreadRow key={`all-${t.message.id}`} {...t} members={members} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ThreadRow({
  channelId, channelName, message, members,
}: {
  channelId: string;
  channelName: string;
  message: ReturnType<typeof useApp>['messages'][string][number];
  members: ReturnType<typeof useApp>['members'];
}) {
  const [expanded, setExpanded] = useState(false);
  const author = members.find((m) => m.userId === message.authorId)?.user || message.author;

  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <Hash size={11} />
        <Link to={`/channel/${channelId}`} className="font-semibold hover:text-brand-600">{channelName}</Link>
        <span>·</span>
        <span>{timeAgo(message.createdAt)}</span>
      </div>
      <div className="mt-1.5 flex gap-2">
        <Avatar name={author.name} color={author.avatarColor} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold">{author.name}</p>
          <RichText body={message.body} mentionNames={members.map((m) => m.user?.name || '')} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge tone="brand"><Reply size={10} /> {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}</Badge>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[11.5px] font-bold text-brand-600 dark:text-brand-300">
          {expanded ? 'Hide' : 'View thread'}
        </button>
        <Link to={`/channel/${channelId}`} className="text-[11.5px] font-semibold text-muted hover:text-brand-600">Open channel</Link>
      </div>
      {expanded && (
        <div className="mt-2 rounded-xl border bg-[rgb(var(--surface-2))] p-2.5 bordered">
          <p className="text-[11.5px] text-muted">Open the channel to read the full thread — replies stay in context with the conversation.</p>
        </div>
      )}
    </div>
  );
}
