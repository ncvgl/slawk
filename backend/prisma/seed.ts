import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const USERS = [
  { name: 'Alice Nguyen',  email: 'alice@slawk.dev',  password: 'password123', bio: "Frontend wizard", status: 'online' },
  { name: 'Bob Martinez',  email: 'bob@slawk.dev',    password: 'password123', bio: "Backend engineer, coffee addict", status: 'online' },
  { name: 'Carol Smith',   email: 'carol@slawk.dev',  password: 'password123', bio: "Product designer • she/her", status: 'away' },
  { name: 'Dave Kim',      email: 'dave@slawk.dev',   password: 'password123', bio: "DevOps & infra nerd", status: 'offline' },
  { name: 'Eve Johnson',   email: 'eve@slawk.dev',    password: 'password123', bio: "QA lead — bug hunter", status: 'online' },
  { name: 'Frank Lee',     email: 'frank@slawk.dev',  password: 'password123', bio: "Full-stack & open source", status: 'online' },
  { name: 'Grace Park',    email: 'grace@slawk.dev',  password: 'password123', bio: "Data science & ML", status: 'away' },
  { name: 'Hank Torres',   email: 'hank@slawk.dev',   password: 'password123', bio: "Startup founder, serial builder", status: 'online' },
];

const CHANNELS = [
  { name: 'general',       isPrivate: false },
  { name: 'random',        isPrivate: false },
  { name: 'engineering',   isPrivate: false },
  { name: 'design',        isPrivate: false },
  { name: 'announcements', isPrivate: false },
  { name: 'secret-ops',    isPrivate: true  },
];

// [authorIndex, content, minsAgo]
type MsgTuple = [number, string, number];

const MESSAGES: Record<string, MsgTuple[]> = {
  general: [
    [0, "Good morning everyone! Hope you all had a great weekend!", 2880],
    [1, "Morning Alice! Ready to crush this week", 2870],
    [2, "Hey team, don't forget we have the design review at 2pm today", 2860],
    [3, "Thanks for the reminder Carol! I'll be there", 2855],
    [0, "Has anyone tried the new VS Code extension for Prisma? It's actually really good", 1440],
    [4, "Not yet, which one?", 1435],
    [0, "It's called Prisma by Prisma — auto-complete for schema files works great", 1430],
    [5, "Installed it. Yep, absolutely worth it", 1425],
    [6, "I use Zed now so can't confirm :)", 1420],
    [1, "How's everyone feeling about the Q1 goals?", 720],
    [2, "Feeling good! Design system is on track", 710],
    [3, "Infra migration is 60% done", 700],
    [4, "Feature coverage climbing, target is 80% by EOQ", 695],
    [7, "Sales pipeline is healthy, onboarded 3 new customers this week!", 690],
    [0, "That's awesome Hank!", 685],
    [1, "Big congrats to the sales team", 680],
    [5, "Standing ovation", 675],
    [0, "Quick question: anyone know if we support bulk CSV imports yet?", 60],
    [1, "Not yet — it's on the roadmap for Q2", 55],
    [0, "Cool, I'll tell the customer to hold on", 50],
  ],
  random: [
    [2, "Does anyone else spend way too long picking a font? Asking for a friend", 4320],
    [0, "Every. Single. Time.", 4310],
    [5, "Monospace for life", 4300],
    [6, "Inter is always the answer", 4290],
    [7, "Helvetica has entered the chat", 4285],
    [3, "Comic Sans is the pinnacle of human typography and I will not take questions", 4280],
    [1, "Dave no", 4275],
    [4, "Dave YES", 4270],
    [1, "I found the best coffee shop in the city, sending location", 2160],
    [0, "ooh where??", 2155],
    [1, "Third Wave Coffee on 5th — cold brew is incredible", 2150],
    [2, "Added to my list, ty Bob!", 2145],
    [5, "Friday deploy went smooth, no incidents! Team is amazing", 1440],
    [3, "No incidents?? Screenshot that for the history books", 1435],
    [4, "Smooth deploys are a skill issue. Wait... good skill issue", 1430],
    [0, "Anyone else watching the F1 race this weekend?", 480],
    [7, "Obviously! Max is unstoppable", 475],
    [5, "Lando Norris ftw", 470],
    [6, "I don't follow F1 but I enjoy watching you all get passionate about it", 465],
  ],
  engineering: [
    [1, "PR #142 is ready for review — adds rate limiting to the auth endpoints", 2880],
    [5, "On it, will review this afternoon", 2870],
    [3, "Also added monitoring alerts for when the queue depth > 1000", 2860],
    [0, "Nice! What's the alert channel — PagerDuty?", 2855],
    [3, "Slack webhook first, escalates to PD after 5 min if unacknowledged", 2850],
    [1, "PR #142 merged! Thanks Frank!", 2400],
    [5, "Clean code, easy review", 2395],
    [0, "Starting work on the file upload refactor today. Anyone have context on why we chose S3 over GCS?", 1440],
    [1, "Historical: we were on AWS originally. GCS migration is planned but not scheduled", 1435],
    [3, "GCS is cheaper for egress at our scale tbh", 1430],
    [0, "Good to know, I'll abstract the storage layer so we can swap easily", 1425],
    [5, "Smart move Alice", 1420],
    [4, "Regression tests are failing on CI for the message search feature. Looking into it now", 720],
    [1, "Related to the Postgres upgrade?", 715],
    [4, "Yep, tsvector syntax changed slightly in v16. Fix is simple", 710],
    [4, "Fix pushed, CI is green again!", 700],
    [0, "You're a lifesaver Eve!", 695],
    [6, "The model training pipeline finished — 94% accuracy on the spam classifier!", 360],
    [1, "That's production ready, ship it!", 355],
    [6, "Will open a PR tomorrow after final eval runs", 350],
  ],
  design: [
    [2, "New component library is live in Figma! Link in the doc", 4320],
    [0, "It looks SO good Carol", 4310],
    [7, "Love the updated colour palette", 4300],
    [2, "Thanks! The purple is #5C2D91 if devs need it", 4295],
    [5, "Already stealing that for the dark mode", 4290],
    [2, "Sharing the onboarding redesign mockups — would love feedback", 2880],
    [0, "The empty state illustrations are chef's kiss", 2870],
    [7, "Step 3 feels a bit long, could we split it?", 2865],
    [2, "Great point Hank, I'll break it into 3a and 3b", 2860],
    [4, "The contrast ratio on the secondary button might be too low — ran it through WCAG checker", 2855],
    [2, "Good catch Eve! Will bump it to AAA", 2850],
    [0, "Quick poll: rounded corners or sharp corners for the new card component?", 1440],
    [2, "Rounded, always rounded", 1435],
    [5, "Sharp for the brutalist aesthetic", 1430],
    [7, "Rounded +1", 1425],
    [3, "I like sharp but I'm an engineer so my opinion doesn't count", 1420],
    [6, "Rounded wins on accessibility too, easier to distinguish boundaries", 1415],
  ],
  announcements: [
    [7, "Welcome to Slawk! This is where company-wide updates will be posted.", 10080],
    [7, "All hands meeting this Friday at 3pm UTC. Agenda will be shared by EOD Thursday.", 4320],
    [7, "v2.0 ships next Tuesday! Huge milestone for the team — thank you all for the incredible work. Details in the engineering channel.", 2880],
    [7, "Reminder: the office is closed Monday for the public holiday. Enjoy the long weekend!", 1440],
    [7, "Q1 business review deck is now available in the shared drive. Strong numbers all around!", 720],
  ],
  'secret-ops': [
    [7, "This channel is for ops leads only", 4320],
    [3, "Agreed, keeping infra decisions here", 4310],
    [1, "Database migration plan v2 is ready for review", 2880],
    [3, "Reviewed, looks solid. Let's run the dry-run this weekend", 2870],
    [7, "Will monitor personally during the run", 2860],
  ],
};

// [channelName, parentMsgIndex, authorIndex, content]
const THREAD_REPLIES: Array<[string, number, number, string]> = [
  ['engineering', 0, 3, "Reviewed! Left a couple nits but overall LGTM"],
  ['engineering', 0, 1, "Thanks Dave, addressed the nits"],
  ['engineering', 0, 0, "Looks good to me too, merging!"],
  ['engineering', 7, 3, "The abstraction layer idea is solid — maybe look at how tus.io handles this"],
  ['engineering', 7, 0, "Good ref, will check it out"],
  ['general',     0, 5, "Same! Great weekend"],
  ['general',     0, 6, "Morning all from the west coast!"],
  ['random',      5, 2, "I cannot believe Dave said Comic Sans seriously"],
  ['random',      5, 4, "Dave is built different"],
  ['design',      5, 7, "The step 2 to 3 flow is really clean now"],
  ['design',      5, 2, "Thanks! Took 3 iterations to get there"],
];

// [channelName, msgIndex, authorIndex, emoji]
const REACTIONS: Array<[string, number, number, string]> = [
  ['general',       6,  1, '+1'],
  ['general',       6,  2, '+1'],
  ['general',       6,  3, 'fire'],
  ['general',      13,  0, 'tada'],
  ['general',      13,  1, 'tada'],
  ['general',      13,  4, 'clinking_glasses'],
  ['general',      13,  5, 'confetti_ball'],
  ['random',        2,  0, 'joy'],
  ['random',        2,  3, 'joy'],
  ['random',        3,  1, '100'],
  ['random',       11,  0, 'fire'],
  ['random',       11,  2, 'pray'],
  ['engineering',   5,  0, 'white_check_mark'],
  ['engineering',   5,  2, 'rocket'],
  ['engineering',  17,  0, 'tada'],
  ['engineering',  17,  1, 'tada'],
  ['engineering',  17,  5, 'star-struck'],
  ['design',        0,  0, 'art'],
  ['design',        0,  5, 'fire'],
  ['design',        0,  7, 'heart'],
  ['announcements', 2,  0, 'rocket'],
  ['announcements', 2,  1, 'rocket'],
  ['announcements', 2,  4, 'tada'],
];

// Pinned messages: [channelName, msgIndex]
const PINNED: Array<[string, number]> = [
  ['announcements', 2],
  ['engineering',   0],
  ['general',      13],
];

// DMs: [fromIndex, toIndex, content, minsAgo]
const DMS: Array<[number, number, string, number]> = [
  [0, 1, "Hey Bob, do you have 10 min to pair on the upload refactor?", 480],
  [1, 0, "Sure! Jumping on a call in 15?", 475],
  [0, 1, "Perfect, I'll send a link", 470],
  [1, 0, "Got it, see you there", 468],
  [2, 0, "Alice, love the abstraction idea. Can you add a Figma handoff link to the PR?", 360],
  [0, 2, "Great idea, will do!", 355],
  [3, 1, "Bob, the DB dry-run is scheduled for Saturday 2am UTC. You available to standby?", 300],
  [1, 3, "I'll be online. Set up the alerts and I'll monitor", 295],
  [3, 1, "Perfect. I'll ping you when we kick off", 290],
  [4, 0, "Hey Alice! The CI tests are green now. Mind re-running the suite?", 240],
  [0, 4, "Already triggered it — all good!", 235],
  [4, 0, "Amazing, thanks!!", 230],
  [7, 2, "Carol, the new mockups are stunning. The board loved them!", 120],
  [2, 7, "That means everything, thank you Hank!!", 115],
  [5, 6, "Grace, want to co-author the spam classifier PR?", 90],
  [6, 5, "Would love that! Let's sync tomorrow", 85],
];

function minsAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60 * 1000);
}

async function main() {
  console.log('Seeding database...\n');

  // Wipe existing data (FK order)
  await prisma.reaction.deleteMany();
  await prisma.file.deleteMany();
  await prisma.directMessage.deleteMany();
  await prisma.channelRead.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  console.log('  Cleared existing data');

  // Users
  const users = await Promise.all(
    USERS.map(u =>
      prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          password: bcrypt.hashSync(u.password, 10),
          bio: u.bio,
          status: u.status,
          lastSeen: u.status === 'offline' ? minsAgo(300) : minsAgo(5),
        },
      })
    )
  );
  console.log(`  Created ${users.length} users`);

  // Channels
  const channels = await Promise.all(
    CHANNELS.map(c => prisma.channel.create({ data: { name: c.name, isPrivate: c.isPrivate } }))
  );
  console.log(`  Created ${channels.length} channels`);

  const channelMap = Object.fromEntries(channels.map(c => [c.name, c]));
  const publicChannels = channels.filter(c => !c.isPrivate);
  const privateChannel = channels.find(c => c.isPrivate)!;

  // Memberships
  for (const ch of publicChannels) {
    await prisma.channelMember.createMany({
      data: users.map(u => ({ userId: u.id, channelId: ch.id })),
    });
  }
  await prisma.channelMember.createMany({
    data: [7, 3, 1].map(i => ({ userId: users[i].id, channelId: privateChannel.id })),
  });
  console.log('  Added channel memberships');

  // Messages
  const createdMessages: Record<string, any[]> = {};
  for (const [chName, msgs] of Object.entries(MESSAGES)) {
    const ch = channelMap[chName];
    if (!ch) continue;
    const dbMsgs = [];
    for (const [authorIdx, content, mins] of msgs) {
      const msg = await prisma.message.create({
        data: {
          content,
          userId: users[authorIdx].id,
          channelId: ch.id,
          createdAt: minsAgo(mins),
          updatedAt: minsAgo(mins),
        },
      });
      dbMsgs.push(msg);
    }
    createdMessages[chName] = dbMsgs;
  }
  const totalMsgs = Object.values(createdMessages).reduce((s, a) => s + a.length, 0);
  console.log(`  Created ${totalMsgs} messages`);

  // Thread replies
  let replyCount = 0;
  for (const [chName, parentIdx, authorIdx, content] of THREAD_REPLIES) {
    const ch = channelMap[chName];
    const parent = createdMessages[chName]?.[parentIdx];
    if (!ch || !parent) continue;
    const parentMins = MESSAGES[chName][parentIdx][2] as number;
    await prisma.message.create({
      data: {
        content,
        userId: users[authorIdx].id,
        channelId: ch.id,
        threadId: parent.id,
        createdAt: minsAgo(Math.max(1, parentMins - 30 - replyCount * 5)),
        updatedAt: new Date(),
      },
    });
    replyCount++;
  }
  console.log(`  Created ${replyCount} thread replies`);

  // Pinned messages
  let pinCount = 0;
  for (const [chName, msgIdx] of PINNED) {
    const msg = createdMessages[chName]?.[msgIdx];
    if (!msg) continue;
    await prisma.message.update({
      where: { id: msg.id },
      data: { isPinned: true, pinnedBy: users[7].id, pinnedAt: new Date() },
    });
    pinCount++;
  }
  console.log(`  Pinned ${pinCount} messages`);

  // Reactions
  let rxnCount = 0;
  for (const [chName, msgIdx, authorIdx, emoji] of REACTIONS) {
    const msg = createdMessages[chName]?.[msgIdx];
    if (!msg) continue;
    try {
      await prisma.reaction.create({
        data: { emoji, userId: users[authorIdx].id, messageId: msg.id },
      });
      rxnCount++;
    } catch {
      // skip duplicate
    }
  }
  console.log(`  Created ${rxnCount} reactions`);

  // DMs
  for (const [fromIdx, toIdx, content, mins] of DMS) {
    await prisma.directMessage.create({
      data: {
        content,
        fromUserId: users[fromIdx].id,
        toUserId: users[toIdx].id,
        createdAt: minsAgo(mins),
        updatedAt: minsAgo(mins),
        readAt: mins > 200 ? minsAgo(mins - 5) : null,
      },
    });
  }
  console.log(`  Created ${DMS.length} direct messages`);

  // Channel reads
  for (const ch of publicChannels) {
    const msgs = createdMessages[ch.name] ?? [];
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg) continue;
    for (const user of users) {
      await prisma.channelRead.upsert({
        where: { userId_channelId: { userId: user.id, channelId: ch.id } },
        update: { lastReadMessageId: lastMsg.id },
        create: { userId: user.id, channelId: ch.id, lastReadMessageId: lastMsg.id },
      });
    }
  }
  console.log('  Updated channel read states');

  console.log('\nSeed complete!\n');
  console.log('Test accounts (password: password123):');
  for (const u of USERS) {
    console.log(`  ${u.email.padEnd(25)} ${u.name} (${u.status})`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
