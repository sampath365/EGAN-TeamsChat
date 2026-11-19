import { db, id, now, hashPassword, flush } from './store.mjs';

const AVATAR_COLORS = ['#3665ff', '#7c5cff', '#22d3ee', '#fbbf24', '#fb7185', '#a3e635', '#f97316', '#14b8a6'];

export function pickColor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    title: u.title || '',
    position: u.position || u.title || '',
    department: u.department || '',
    employeeId: u.employeeId || '',
    managerId: u.managerId || null,
    phone: u.phone || '',
    location: u.location || '',
    timezone: u.timezone || '',
    bio: u.bio || '',
    joinedAt: u.joinedAt || u.createdAt,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl || null,
    status: u.status || 'offline',
    statusText: u.statusText || '',
    isBot: !!u.isBot,
    createdAt: u.createdAt,
  };
}

function user(name, email, title, password = 'pulse1234') {
  return {
    id: id('u'),
    name,
    email,
    title,
    avatarColor: pickColor(email),
    avatarUrl: null,
    passwordHash: hashPassword(password),
    status: 'offline',
    statusText: '',
    isBot: false,
    createdAt: now(),
  };
}

const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();

export function seedDemo() {
  if (db.users.length > 0) return;

  const owner = user('Aarav Mehta', 'aarav@egan.in', 'Founder & CEO');
  const priya = user('Priya Nair', 'priya@egan.in', 'Head of Operations');
  const rohit = user('Rohit Verma', 'rohit@egan.in', 'Lead Engineer');
  const sana = user('Sana Iqbal', 'sana@egan.in', 'Product Designer');
  const karthik = user('Karthik Rao', 'karthik@egan.in', 'Support Lead');
  const meera = user('Meera Joshi', 'meera@egan.in', 'Marketing Manager');
  const pulseBot = { ...user('Pulse Bot', 'bot@egan.in', 'Automation'), isBot: true };

  const org = (u, position, department, employeeId, managerId, extra = {}) =>
    Object.assign(u, { position, department, employeeId, managerId, ...extra });

  org(owner, 'Founder & CEO', 'Leadership', 'EGN-0001', null, {
    phone: '+91 90000 00001',
    location: 'Hyderabad, India',
    timezone: 'Asia/Kolkata',
    bio: 'Started EGAN to make everyday home services reliable. Still reviews every customer complaint personally.',
    joinedAt: '2021-04-01T00:00:00.000Z',
  });
  org(priya, 'Head of Operations', 'Operations', 'EGN-0002', owner.id, {
    phone: '+91 90000 00002',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    bio: 'Runs branch operations and the service-person network across 111 cities.',
    joinedAt: '2021-09-15T00:00:00.000Z',
  });
  org(rohit, 'Lead Engineer', 'Engineering', 'EGN-0003', priya.id, {
    phone: '+91 90000 00003',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    bio: 'Owns the platform: catalogue, payments and realtime. Believes most bugs are missing tests.',
    joinedAt: '2022-01-10T00:00:00.000Z',
  });
  org(sana, 'Product Designer', 'Design', 'EGN-0004', rohit.id, {
    phone: '+91 90000 00004',
    location: 'Pune, India',
    timezone: 'Asia/Kolkata',
    bio: 'Designs the customer app end to end. Ships prototypes before specs.',
    joinedAt: '2022-06-20T00:00:00.000Z',
  });
  org(karthik, 'Support Lead', 'Customer Support', 'EGN-0005', priya.id, {
    phone: '+91 90000 00005',
    location: 'Hyderabad, India',
    timezone: 'Asia/Kolkata',
    bio: 'First responder on escalations. Keeps the refund macro honest.',
    joinedAt: '2023-02-01T00:00:00.000Z',
  });
  org(meera, 'Marketing Manager', 'Marketing', 'EGN-0006', priya.id, {
    phone: '+91 90000 00006',
    location: 'Mumbai, India',
    timezone: 'Asia/Kolkata',
    bio: 'Runs launches and the brand system. Writes the newsletter nobody skips.',
    joinedAt: '2023-05-08T00:00:00.000Z',
  });
  org(pulseBot, 'Automation', 'Engineering', 'EGN-BOT', rohit.id, { timezone: 'UTC' });

  db.users.push(owner, priya, rohit, sana, karthik, meera, pulseBot);

  const team = {
    id: id('t'),
    name: 'EGAN Technologies',
    slug: 'egan',
    description: 'The whole company — announcements, ops and everything in between.',
    avatarColor: '#3665ff',
    ownerId: owner.id,
    createdAt: now(),
  };
  db.teams.push(team);

  const roles = [
    [owner, 'owner'],
    [priya, 'admin'],
    [rohit, 'member'],
    [sana, 'member'],
    [karthik, 'member'],
    [meera, 'member'],
    [pulseBot, 'bot'],
  ];
  for (const [u, role] of roles) {
    db.memberships.push({
      id: id('m'),
      teamId: team.id,
      userId: u.id,
      role,
      joinedAt: now(),
      permissions: [],
    });
  }

  const mkChannel = (name, topic, kind = 'public', extra = {}) => {
    const ch = {
      id: id('c'),
      teamId: team.id,
      name,
      topic,
      kind,
      isPrivate: kind === 'private',
      createdBy: owner.id,
      createdAt: now(),
      archived: false,
      ...extra,
    };
    db.channels.push(ch);
    return ch;
  };

  const general = mkChannel('general', 'Company-wide announcements and watercooler talk.');
  const engineering = mkChannel('engineering', 'Ship it. Then ship it again.');
  const design = mkChannel('design', 'Screens, specs and pixel arguments.');
  const support = mkChannel('support', 'Customer escalations and wins.');
  const marketing = mkChannel('marketing', 'Campaigns, launches and content.');
  const leadership = mkChannel('leadership', 'Leads only.', 'private');

  db.channelMembers.push(
    ...db.users.map((u) => ({ id: id('cm'), channelId: general.id, userId: u.id })),
  );
  for (const u of [rohit, sana, owner, pulseBot]) {
    db.channelMembers.push({ id: id('cm'), channelId: engineering.id, userId: u.id });
  }
  for (const u of [sana, meera, owner]) {
    db.channelMembers.push({ id: id('cm'), channelId: design.id, userId: u.id });
  }
  for (const u of [karthik, priya, owner]) {
    db.channelMembers.push({ id: id('cm'), channelId: support.id, userId: u.id });
  }
  for (const u of [meera, sana, owner]) {
    db.channelMembers.push({ id: id('cm'), channelId: marketing.id, userId: u.id });
  }
  for (const u of [owner, priya]) {
    db.channelMembers.push({ id: id('cm'), channelId: leadership.id, userId: u.id });
  }

  const say = (channel, author, text, mins, extra = {}) => {
    const m = {
      id: id('msg'),
      channelId: channel.id,
      teamId: team.id,
      authorId: author.id,
      body: text,
      parentId: null,
      attachments: [],
      mentions: [],
      editedAt: null,
      deletedAt: null,
      createdAt: ago(mins),
      ...extra,
    };
    db.messages.push(m);
    return m;
  };

  say(general, owner, 'Welcome to **EGAN Pulse** 🎉 This is where the whole company talks. Try `Ctrl+K` to jump anywhere.', 240);
  say(general, priya, 'Reminder: the quarterly all-hands is on Friday at 4pm. I have created a meeting in the *Meetings* tab — screen sharing will be on.', 210);
  say(general, meera, 'New brand guidelines are in the Design channel Files tab 📁', 180);
  const standup = say(engineering, rohit, 'Daily standup notes:\n- Payments retry shipped ✅\n- WebSocket reconnect fixed ✅\n- Next: meeting recording', 150);
  say(engineering, sana, 'Nice work on the reconnect — the flapping was painful.', 145, { parentId: standup.id });
  say(engineering, rohit, 'Thanks! Turned out to be a missing `visibilitychange` handler.', 140, { parentId: standup.id });
  say(engineering, pulseBot, 'Deployment **#482** succeeded in 41s. 0 errors.', 120);
  say(design, sana, 'Posted 3 directions for the new onboarding. Vote with reactions 👇', 100);
  say(design, meera, 'Direction 2 feels the most on-brand to me.', 95);
  say(support, karthik, 'Escalation from Bengaluru: booking assignment failing for 2 users. Investigating with @Rohit Verma.', 70, {
    mentions: [rohit.id],
  });
  say(support, priya, 'Thanks for the quick turnaround. Let us add a task so it does not slip.', 65);
  say(marketing, meera, 'Launch week content calendar is ready. 6 posts, 2 reels, 1 newsletter.', 50);
  say(leadership, owner, 'Numbers look good this month. Let us keep hiring focused on support.', 40);

  db.reactions.push(
    { id: id('r'), messageId: db.messages[0].id, userId: priya.id, emoji: '🎉' },
    { id: id('r'), messageId: db.messages[0].id, userId: rohit.id, emoji: '🎉' },
    { id: id('r'), messageId: db.messages[0].id, userId: sana.id, emoji: '👋' },
    { id: id('r'), messageId: standup.id, userId: sana.id, emoji: '🚀' },
  );

  const mkTask = (title, description, status, priority, assigneeId, dueInDays, tags = []) => ({
    id: id('task'),
    teamId: team.id,
    channelId: engineering.id,
    title,
    description,
    status,
    priority,
    assigneeId,
    createdBy: owner.id,
    dueDate: new Date(Date.now() + dueInDays * 86400000).toISOString().slice(0, 10),
    tags,
    checklist: [],
    createdAt: now(),
    updatedAt: now(),
  });

  db.tasks.push(
    mkTask('Ship payment retry logic', 'Retry failed card payments up to 3 times with backoff.', 'done', 'high', rohit.id, -1, ['payments']),
    mkTask('Fix WebSocket reconnect flapping', 'Reconnect should back off and resume on visibilitychange.', 'done', 'critical', rohit.id, -2, ['realtime']),
    mkTask('Design onboarding v2', 'Three directions, pick one with the team.', 'in_progress', 'medium', sana.id, 3, ['design']),
    mkTask('Write launch newsletter', 'Cover the new meetings feature and screen sharing.', 'todo', 'medium', meera.id, 5, ['marketing']),
    mkTask('Add meeting recording', 'Record room audio and store in channel files.', 'todo', 'high', rohit.id, 9, ['meetings']),
    mkTask('Review support macros', 'Tighten the refund macro wording.', 'review', 'low', karthik.id, 2, ['support']),
  );

  db.notes.push(
    {
      id: id('n'),
      teamId: team.id,
      channelId: engineering.id,
      title: 'Engineering runbook',
      body: '# Deploy checklist\n\n1. `npm run build`\n2. Run the smoke test\n3. Announce in #general\n\n## On-call\nRohit → Priya → Aarav',
      createdBy: rohit.id,
      updatedAt: now(),
      createdAt: now(),
    },
    {
      id: id('n'),
      teamId: team.id,
      channelId: general.id,
      title: 'Company handbook',
      body: '# Welcome to EGAN\n\nWe are a single-provider home-services company. Everything we build exists to make one customer’s day easier.\n\n- **Working hours** 9:30 – 18:30 IST\n- **Standups** 10:00 daily\n- **All-hands** Every Friday',
      createdBy: priya.id,
      updatedAt: now(),
      createdAt: now(),
    },
  );

  db.calls.push({
    id: id('call'),
    teamId: team.id,
    channelId: general.id,
    title: 'Quarterly all-hands',
    hostId: priya.id,
    status: 'scheduled',
    scheduledAt: new Date(Date.now() + 2 * 3600000).toISOString(),
    createdAt: now(),
    participants: [],
  });

  db.notifications.push({
    id: id('notif'),
    userId: owner.id,
    kind: 'mention',
    title: 'Karthik Rao mentioned you',
    body: 'Escalation from Bengaluru: booking assignment failing…',
    link: `#/channel/${support.id}`,
    read: false,
    createdAt: ago(70),
  });

  for (const u of db.users) {
    db.presence.push({ id: id('p'), userId: u.id, status: u.isBot ? 'online' : 'offline', lastSeen: now() });
  }

  db.users[0].status = 'online';
  db.users[1].status = 'online';
  db.users[2].status = 'online';

  flush();
}
