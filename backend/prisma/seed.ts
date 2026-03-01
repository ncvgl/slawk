import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const USERS = [
  {
    name: 'Alice Nguyen',
    email: 'alice@slawk.dev',
    password: 'password123',
    bio: 'Frontend lead • loves React + TypeScript • coffee → code',
    status: 'online',
    avatar: 'https://randomuser.me/api/portraits/women/47.jpg',
  },
  {
    name: 'Bob Martinez',
    email: 'bob@slawk.dev',
    password: 'password123',
    bio: 'Backend engineer • Rust & Go enthusiast • building the future one API at a time',
    status: 'online',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
  },
  {
    name: 'Carol Smith',
    email: 'carol@slawk.dev',
    password: 'password123',
    bio: 'Product designer • she/her • obsessed with design systems and user delight',
    status: 'away',
    avatar: 'https://randomuser.me/api/portraits/women/28.jpg',
  },
  {
    name: 'Dave Kim',
    email: 'dave@slawk.dev',
    password: 'password123',
    bio: 'DevOps & infra nerd • k8s wrangler • if it runs, I can break it',
    status: 'offline',
    avatar: 'https://randomuser.me/api/portraits/men/55.jpg',
  },
  {
    name: 'Eve Johnson',
    email: 'eve@slawk.dev',
    password: 'password123',
    bio: 'QA lead — professional bug hunter 🐛 • accessibility advocate',
    status: 'online',
    avatar: 'https://randomuser.me/api/portraits/women/68.jpg',
  },
  {
    name: 'Frank Lee',
    email: 'frank@slawk.dev',
    password: 'password123',
    bio: 'Full-stack + open source contributor • co-creator of 3 npm packages you\'ve definitely used',
    status: 'online',
    avatar: 'https://randomuser.me/api/portraits/men/12.jpg',
  },
  {
    name: 'Grace Park',
    email: 'grace@slawk.dev',
    password: 'password123',
    bio: 'ML engineer • PhD in NLP • turning research papers into production code',
    status: 'away',
    avatar: 'https://randomuser.me/api/portraits/women/17.jpg',
  },
  {
    name: 'Hank Torres',
    email: 'hank@slawk.dev',
    password: 'password123',
    bio: 'CEO & co-founder @Slawk • prev eng @ Stripe & Figma • building AI tools for devs',
    status: 'online',
    avatar: 'https://randomuser.me/api/portraits/men/78.jpg',
  },
  {
    name: 'Iris Chen',
    email: 'iris@slawk.dev',
    password: 'password123',
    bio: 'AI research lead • context windows, reasoning, and all the good stuff in between',
    status: 'online',
    avatar: 'https://randomuser.me/api/portraits/women/33.jpg',
  },
  {
    name: 'Jack Wilson',
    email: 'jack@slawk.dev',
    password: 'password123',
    bio: 'Product manager • previously @ Linear, Notion • obsessed with developer experience',
    status: 'online',
    avatar: 'https://randomuser.me/api/portraits/men/22.jpg',
  },
];

const CHANNELS = [
  { name: 'general',       isPrivate: false },
  { name: 'random',        isPrivate: false },
  { name: 'engineering',   isPrivate: false },
  { name: 'ml-research',   isPrivate: false },
  { name: 'product',       isPrivate: false },
  { name: 'design',        isPrivate: false },
  { name: 'devops',        isPrivate: false },
  { name: 'announcements', isPrivate: false },
  { name: 'founders',      isPrivate: true  },
];

// [authorIndex, content, minsAgo]
type MsgTuple = [number, string, number];

const MESSAGES: Record<string, MsgTuple[]> = {
  general: [
    [7, "Good morning everyone! Huge news — we just closed our Series A! 🎉 Details in all-hands today at 3pm UTC", 4320],
    [0, "WAIT WHAT?? 🎉🎉🎉", 4315],
    [1, "Let's gooooo Hank!! This is massive", 4312],
    [8, "Congrats to the whole team, this is the result of months of incredible work", 4310],
    [2, "I'm literally shaking with excitement right now 🥹", 4308],
    [5, "Ship. It. Time to scale this thing", 4305],
    [6, "Opening champagne remotely 🥂", 4300],
    [3, "Infra is ready for 10x load, just saying", 4295],
    [9, "Product roadmap is locked and loaded, we've been preparing for this", 4290],
    [4, "Already drafted the stress test plan for the new capacity", 4285],
    [7, "All of you made this happen. See you at 3pm!", 4280],
    [0, "Has anyone tried Claude's new extended thinking mode for code generation? The results are wild", 2880],
    [1, "Yes! I used it for refactoring our auth module. It caught edge cases I'd have missed", 2875],
    [8, "The reasoning trace is super helpful for debugging complex prompts", 2870],
    [5, "The token cost though 😅 watching our API bill climb in real-time", 2865],
    [6, "That's why we need the caching layer Bob's building", 2860],
    [1, "Exactly, semantic caching should cut costs 60-70% for repeated queries", 2855],
    [9, "Do we have a timeline on that? Several customers are asking about cost predictability", 2850],
    [1, "Targeting end of month. Alice, do you want to pair on the frontend cost dashboard?", 2845],
    [0, "Absolutely, let's schedule something", 2840],
    [7, "Quick reminder: the demo for Sequoia is Thursday 2pm PT. Everyone please test the latest build beforehand", 1440],
    [8, "The new streaming mode looks really impressive, going to be a strong demo", 1435],
    [0, "Rehearsed it twice, feels solid", 1430],
    [9, "Added the new customer logos to the deck, looks great", 1425],
    [2, "The UI is looking really polished for the demo", 1420],
    [3, "I'll monitor infra during the demo, we'll have zero downtime", 1415],
    [0, "Anyone know if we support multi-modal file inputs yet in the API?", 60],
    [1, "Image inputs yes, PDF parsing is in the next sprint", 55],
    [8, "The vision API hits 94% accuracy on code screenshots, good enough for GA", 50],
    [0, "Perfect, I'll tell the customer to hang tight for PDFs", 45],
  ],
  random: [
    [2, "Hot take: light mode is actually better for code review sessions", 5040],
    [5, "I'm calling the authorities", 5035],
    [0, "Light mode gang rise up (respectfully)", 5030],
    [1, "This conversation can only end badly", 5025],
    [3, "I use light mode in sunlight, dark mode at night, and I accept the consequences", 5020],
    [8, "Both are wrong. The only correct setting is high contrast", 5015],
    [4, "You're all wrong, it's whatever your CI dashboard uses", 5010],
    [6, "VS Code Dark+ for life, end of discussion", 5005],
    [9, "What about Solarized? Anyone? No? Just me?", 5000],
    [2, "Just discovered the Warp terminal and I can't go back to iTerm", 4320],
    [0, "Warp is SO good. The AI completions feel like magic", 4310],
    [5, "The block-based UI took 10 mins to get used to then I was converted", 4305],
    [3, "I'm a tmux guy, Warp's UX makes me feel attacked", 4300],
    [1, "Dave porting to tmux in 2025 is a vibe", 4295],
    [7, "If it works, don't fix it — Dave is living that philosophy", 4290],
    [8, "Friday vibes: what's everyone shipping this week?", 2160],
    [0, "Streaming tokens UI — looks so good with the shimmer effect", 2155],
    [1, "Semantic cache v1 is going into staging", 2150],
    [6, "Finally closing that annoying race condition in the WS reconnect logic", 2145],
    [4, "Load test suite with 50k concurrent users, wish me luck", 2140],
    [8, "The team is insane, seriously", 2135],
    [3, "No incidents this week, I'm suspicious", 2130],
    [5, "Dave is right to be suspicious, it's too quiet", 2125],
    [0, "Anyone watching the NBA playoffs?", 480],
    [9, "Yes! The Celtics series is unreal", 475],
    [5, "Knicks fan suffering in silence", 470],
    [7, "I have a policy of not watching sports during fundraising", 465],
    [8, "Hank was born during a fundraise, probably", 460],
  ],
  engineering: [
    [1, "PR #247 is up: semantic caching for LLM responses with vector similarity matching. Would love reviews from anyone working on the API layer", 5040],
    [5, "On it — this is the piece I've been waiting for", 5030],
    [0, "The vector embedding approach is really clever, using cosine similarity to detect near-duplicate prompts", 5020],
    [8, "What threshold are you using for 'similar enough to serve cached response'?", 5015],
    [1, "0.92 by default with a config flag. Tuning based on cache hit rate", 5010],
    [6, "I'd add a staleness TTL on top too — some LLM responses should expire even if similar", 5005],
    [1, "Great call, adding that now", 5000],
    [5, "Review done, left 3 nits but overall it's solid, merging tomorrow", 4990],
    [0, "We need to talk about our context window strategy", 2880],
    [8, "Agreed — customers are hitting the 128k limit on complex codebases", 2875],
    [6, "Smart chunking + retrieval is the answer but it's non-trivial to get right", 2870],
    [1, "I've been looking at how Cursor does it — they use AST-aware chunking which is much better than naive text splitting", 2865],
    [0, "AST-aware sounds promising. What's the implementation complexity?", 2860],
    [6, "Tree-sitter can parse most languages, we could build on that", 2855],
    [8, "Let's timebox a spike — 2 days, Frank and Alice?", 2850],
    [5, "I'm in", 2845],
    [0, "Calendared for next Monday", 2840],
    [3, "Kubernetes cluster autoscaler is tuned — we now scale from 5 to 200 pods in under 2 minutes", 1440],
    [4, "Just ran the load test. We held 47k req/s at p99 < 50ms. The new caching layer is doing work", 1435],
    [1, "47k? We're only promising 10k in the SLA haha", 1430],
    [3, "Good, that headroom makes me sleep better", 1425],
    [7, "Ship it 🚀", 1420],
    [8, "Reminder: the model eval harness PR is blocking our Q2 roadmap. Anyone have capacity to review?", 720],
    [6, "I'll take it — Iris already reviewed the ML side right?", 715],
    [8, "Yes, just needs the integration test review", 710],
    [5, "Review done, LGTM! Merging", 700],
    [4, "The regression test caught a serialization bug in the fine-tuned model response formatter. Nice catch!", 360],
    [6, "That would have been embarrassing in prod", 355],
    [8, "This is exactly why we invested in the eval harness", 350],
  ],
  'ml-research': [
    [8, "Sharing the results from our latest fine-tuning run on the code completion model 🧵", 7200],
    [8, "BLEU score improved 8 points vs baseline. More importantly, human eval shows 23% higher acceptance rate on suggestions", 7195],
    [8, "The key insight: training on PR diffs instead of raw file contents gives the model much better context about what constitutes a meaningful change", 7190],
    [6, "This is really exciting. The PR diff approach makes intuitive sense — it's how humans think about code changes", 7185],
    [8, "Exactly. Next experiment: include the PR description + issue title as part of the context during training", 7180],
    [1, "What's the training cost looking like for each run?", 7175],
    [8, "About $340 on H100s for the current model size. Will need to optimize before we scale", 7170],
    [3, "I can help with spot instance scheduling if we need to cut costs", 7165],
    [6, "The new GPT-4o pricing is actually interesting for our eval pipeline", 5040],
    [8, "We use Claude for eval, consistency is more important than cost for that use case", 5035],
    [6, "Fair point. What prompt are you using for the evaluator?", 5030],
    [8, "Pasting in the eval prompt in thread 👆", 5025],
    [0, "Question: are we planning to fine-tune on customer code? The privacy implications need design work", 4320],
    [8, "Great question — we need explicit opt-in, data isolation per customer, and the model weights must be customer-specific. This is on the Q3 roadmap", 4315],
    [9, "I can draft the privacy policy section for this, it'll need legal review too", 4310],
    [6, "The technical architecture: we'd use LoRA adapters per customer, base model stays shared", 4305],
    [1, "That's an elegant solution, minimal storage overhead per customer", 4300],
    [8, "Iris, can you draft the architecture doc? I want to share it with a few enterprise prospects", 4295],
    [8, "New paper dropped: 'CodeACT: Agentic Code Execution for Programming Tasks' - the benchmark results are wild", 2880],
    [6, "Reading it now. The tool use section is directly relevant to what we're building", 2875],
    [8, "Page 8 is the money shot — 61% pass rate on SWE-bench vs 43% for prior SOTA", 2870],
    [1, "What's their approach on sandboxing?", 2865],
    [8, "Docker containers per task, ephemeral. Same approach as ours but they use a custom runtime", 2860],
    [6, "Our iteration speed advantage comes from pre-warming containers — glad we went that route", 2855],
    [0, "Can we add this to the reading list doc?", 2850],
    [8, "Done, along with my annotations", 2845],
    [6, "The new Llama 3.1 405B is out — running evals now against our current stack", 1440],
    [8, "Excited to see this. OSS models at this scale are a game changer for self-hosted customers", 1435],
    [6, "Initial numbers: 87% on HumanEval vs 92% for Claude 3.5 Sonnet. Still a gap but closing fast", 1430],
    [1, "87% open source is incredible honestly", 1425],
    [8, "Add to eval dashboard and let's track over time", 1420],
  ],
  product: [
    [9, "Q2 roadmap is finalized. Sharing the north star: 'Make every developer 10x more productive in their first week'", 5040],
    [9, "Key bets: (1) IDE plugin for VSCode/JetBrains, (2) PR review automation, (3) codebase Q&A with semantic search", 5035],
    [7, "Love the framing. The first-week metric is testable and customer-aligned", 5030],
    [2, "I'll start on the design system for the IDE plugin, need to think about the constraints of that canvas", 5025],
    [0, "The codebase Q&A feature is the one I'm most excited about as a dev", 5020],
    [1, "That and PR review — those are the two highest-leverage features for our ICP", 5015],
    [9, "Exactly. Enterprise CTOs keep asking 'can it review our PRs automatically'", 5010],
    [9, "Customer interview recap from this week — big themes:", 2880],
    [9, "1. 'I want it to understand our coding conventions, not just generic best practices'", 2875],
    [9, "2. 'Integration with GitHub/GitLab is table stakes'", 2870],
    [9, "3. 'Need SSO + audit logs for enterprise procurement'", 2865],
    [8, "All of these are in scope. The SSO one is most urgent — blocking 3 enterprise deals", 2860],
    [1, "SSO is 2 weeks of work, I can start now", 2855],
    [9, "Please do. I'll set up the Okta test account", 2850],
    [2, "For the conventions point — I'm thinking a 'project context' onboarding flow where devs upload their style guide / CONTRIBUTING.md", 2845],
    [0, "Love that. Could also auto-detect from existing code patterns", 2840],
    [8, "Both, ideally. Manual upload for fast onboarding, auto-detect as a background process", 2835],
    [9, "New user research finding: developers spend 38% of their time understanding existing code, not writing new code", 1440],
    [9, "This validates the 'codebase Q&A' bet as the highest-leverage feature. Going to accelerate it", 1435],
    [0, "38% is wild. That number would drop to like 5% with good semantic search", 1430],
    [8, "This is the product thesis right there", 1425],
    [2, "Can we put this stat in the fundraising deck?", 1420],
    [7, "It's from Nielsen Norman Group, fully citable. Yes.", 1415],
    [9, "Launching NPS survey next week. Target: collect 50 responses from active users in 7 days", 720],
    [4, "I'll set up the event tracking to identify our most active users for targeting", 715],
    [9, "Great. I want NPS segmented by team size, language, and plan tier", 710],
    [2, "I'll design the survey so it's concise enough to actually get filled in", 705],
  ],
  design: [
    [2, "New design system v3 is live in Figma! Biggest update since we launched 🎨", 7200],
    [2, "Highlights: new token system (spacing, typography, color), dark mode support, and 40 new component variants", 7195],
    [0, "The dark mode is SO polished, the syntax highlighting palette is perfect", 7190],
    [7, "This is exactly the quality bar we need for enterprise customers. Well done Carol!", 7185],
    [5, "Already started implementing, the token system is a huge DX improvement", 7180],
    [4, "Running accessibility audit on the dark mode tokens, looks good so far", 7175],
    [2, "Thanks everyone 🥹 This took 3 months, very happy it's landing well", 7170],
    [2, "Sharing mockups for the new onboarding experience (v4) — would love feedback in the next 24hrs", 4320],
    [9, "The progressive disclosure approach is excellent — hiding advanced options until users are ready is exactly right", 4310],
    [0, "The 'connect your GitHub' step feels a bit abrupt. Can we add more context about why?", 4305],
    [2, "Good catch! Adding a value prop sentence: 'Slawk indexes your repos to give context-aware suggestions'", 4300],
    [7, "The empty states are beautiful — the illustration style is distinctive", 4295],
    [4, "Contrast on the CTA in step 4 is AAA compliant, excellent", 4290],
    [6, "The animation on the code completion demo in step 3 is going to win people over", 4285],
    [2, "That animation took a week alone 😅 glad it shows", 4280],
    [9, "One thought: can we show a 'before/after' in the demo? It makes the value more tangible", 4275],
    [2, "Love it, adding a before/after slider to step 3", 4270],
    [2, "Design critique for the IDE plugin UI. This is the hardest design challenge we've had — need to build full functionality into a tiny sidebar pane", 2880],
    [0, "The density is impressive but the font size in the suggestion preview needs to go up 1px", 2875],
    [2, "Bumped to 13px, agree it reads better", 2870],
    [5, "The hover states feel slightly off — too much opacity change. Can we try a solid background instead?", 2865],
    [2, "Updated, feels more intentional now", 2860],
    [9, "The skeleton loading state is much better than a spinner, matches how Copilot does it", 2855],
    [7, "This is going to make a strong impression in the demo", 2850],
  ],
  devops: [
    [3, "Migration from single-region to multi-region is complete ✅ US-East + EU-West + AP-Southeast all live", 7200],
    [3, "Latency for EU customers dropped from avg 340ms to 42ms. AP from 580ms to 67ms", 7195],
    [1, "That's a massive improvement. Customers in London were complaining, this'll fix it", 7190],
    [7, "Outstanding work Dave. This was months in the making", 7185],
    [4, "Running smoke tests across all three regions, all green so far", 7180],
    [3, "Monitoring is up, alerts configured per region. I'll post hourly updates for the first 24hrs", 7175],
    [3, "Kubernetes upgrade to v1.30 scheduled for this Saturday 2am UTC (low traffic window)", 4320],
    [4, "I'll run a full regression suite Friday evening to baseline before the upgrade", 4315],
    [1, "Any concerns about the new scheduler features in 1.30?", 4310],
    [3, "One thing: the topology spread constraint syntax changed slightly. I've already updated all our manifests", 4305],
    [1, "Nice catch, that would have been a nasty surprise at 2am", 4300],
    [3, "The whole Kubernetes changelog is my bedtime reading, no shame", 4295],
    [4, "Upgrade complete! All services healthy, zero downtime 🎉", 4270],
    [3, "Couldn't have gone smoother. Thanks Eve for the validation", 4265],
    [3, "GPU node pool is configured and ready for Iris's training jobs", 2880],
    [8, "Finally! Iris, you no longer need to use my personal account for H100 spot instances", 2875],
    [8, "The org billing is now set up with the proper budget alerts", 2870],
    [3, "Budget alert at 80% of monthly cap, auto-pause non-critical jobs at 90%", 2865],
    [8, "Perfect. No more surprise bills", 2860],
    [3, "Incident post-mortem: 14-min elevated latency last Tuesday. Root cause: a misconfigured HPA that briefly over-scaled the API pods, starving the GPU nodes", 1440],
    [3, "Fix deployed, added a guard to prevent HPA from scaling API pods beyond 60% of total node capacity", 1435],
    [4, "Added the HPA config as a check in our pre-deploy validation script", 1430],
    [1, "This is a great write-up Dave, can we add it to the runbook?", 1425],
    [3, "Already done, with the monitoring dashboard link", 1420],
  ],
  announcements: [
    [7, "🎉 Welcome to Slawk — the AI coding assistant built by developers, for developers. This channel is for company-wide updates.", 20160],
    [7, "We just hit 1,000 registered developers! This community is growing faster than we ever imagined. Thank you all for being early adopters 🚀", 10080],
    [7, "All-hands this Thursday at 3pm UTC. Agenda: Q1 results, product roadmap, and a surprise announcement. Don't miss it!", 7200],
    [7, "🚀 v2.0 ships TODAY! This is the biggest release in Slawk's history. New: streaming completions, multi-file context, PR review automation (beta), and a 3x faster inference engine. Details in #engineering.", 4320],
    [7, "We've been named one of YC's 'Top 10 AI Dev Tools' for 2025. Huge validation for the whole team. Full list in TechCrunch.", 2880],
    [7, "Reminder: security training required for all team members by Friday. Link in your email. This is mandatory per our SOC 2 compliance.", 1440],
    [7, "📣 We closed our Series A! $18M led by Benchmark, with participation from Sequoia and several incredible angels. We're going to use this to triple the team and ship the features you've been asking for. More details in all-hands.", 720],
    [7, "New team members joining next Monday: @Priya (ML Infra), @Marcus (Sales), @Yuki (Design). Please give them a warm welcome! 👋", 360],
  ],
  founders: [
    [7, "Board deck is ready for review. Key metrics: MRR $85k (+28% MoM), ARR run rate $1.02M, 127 paying teams, NPS 62", 7200],
    [7, "The growth curve is what Benchmark wants to see. We're on track for the Series A close next week", 7195],
    [8, "Iris, can you update slide 12 with the new model accuracy benchmarks?", 7190],
    [8, "Updated! Also added a competitor comparison table — we're ahead on 4 of 5 key metrics", 7185],
    [9, "I'd add CAC/LTV to the metrics slide — that's the question I always get from investors", 7180],
    [7, "Good call. CAC is $840, LTV at 24 months is $8,200 — 9.8x ratio is strong", 7175],
    [9, "That's a great story, it should be front and center", 7170],
    [7, "Closing call with Benchmark is Monday at 10am PT. Everyone on the founding team, please be available. This is it", 4320],
    [8, "Cleared my calendar", 4315],
    [9, "Ready. Should we do a mock Q&A Sunday evening?", 4310],
    [7, "Yes — Sunday 4pm PT at my place or Zoom. Bring your hardest questions", 4305],
    [7, "Deal closed! $18M, Benchmark leads, Matt Cohler is joining the board. This is the fuel we needed. Now let's execute.", 720],
    [8, "History made. Let's build something that outlasts all of us", 715],
    [9, "Proud to be building this with you both. Let's go 🚀", 710],
  ],
};

// [channelName, parentMsgIndex, authorIndex, content, minsAfterParent]
const THREAD_REPLIES: Array<[string, number, number, string, number]> = [
  // engineering: PR #247 review
  ['engineering', 0, 5, "One thing: the eviction policy for cache misses should be LRU not FIFO — hot prompts age out under FIFO", 20],
  ['engineering', 0, 1, "Great catch! Swapping to LRU now", 25],
  ['engineering', 0, 0, "Also consider adding a cache size limit config — embeddings take memory", 30],
  ['engineering', 0, 1, "Added: `CACHE_MAX_ENTRIES` env var, defaults to 10k", 40],
  // engineering: context window strategy
  ['engineering', 8, 6, "I prototyped AST-aware chunking with tree-sitter last week. Happy to share the POC", 10],
  ['engineering', 8, 0, "Please! That would save us days", 15],
  ['engineering', 8, 6, "Posting in the thread: github.com/slawk/tree-sitter-poc (internal)", 20],
  // ml-research: fine-tuning results
  ['ml-research', 0, 6, "The training methodology doc is in Notion if anyone wants the full breakdown", 15],
  ['ml-research', 0, 1, "What dataset size did you train on?", 20],
  ['ml-research', 0, 8, "118k PR diffs from permissive-license OSS repos", 25],
  ['ml-research', 0, 0, "Any filtering for quality? Low-quality diffs could hurt more than help", 30],
  ['ml-research', 0, 8, "Yes — filtered on: PR has description, >3 changed files, author has >50 contributions to repo", 35],
  // product: customer interview
  ['product', 7, 9, "Full interview notes are in Notion /customer-research if anyone wants the quotes", 10],
  ['product', 7, 2, "Can I get access to design from those? Verbatim quotes are gold for UX decisions", 15],
  ['product', 7, 9, "Adding you now!", 18],
  // general: caching conversation
  ['general', 15, 0, "The cache key will be the embedding of the prompt, right? Not the literal string?", 5],
  ['general', 15, 1, "Correct — embedding-based so near-synonymous prompts share a cache entry", 8],
  ['general', 15, 8, "Make sure the cache is per-customer isolated. We can't serve Customer A's cached responses to Customer B", 12],
  ['general', 15, 1, "Absolutely, the key is prefixed with the org_id", 15],
  // random: Warp terminal
  ['random', 9, 3, "Fine I'll try Warp. If I hate it this is on you Alice", 20],
  ['random', 9, 0, "You'll thank me in a week", 25],
  ['random', 9, 3, "Ok... I like it. I hate that I like it", 10080],
];

// [channelName, msgIndex, authorIndex, emoji]
const REACTIONS: Array<[string, number, number, string]> = [
  // general: Series A announcement
  ['general', 0, 0, 'tada'],
  ['general', 0, 1, 'tada'],
  ['general', 0, 2, 'tada'],
  ['general', 0, 4, 'rocket'],
  ['general', 0, 5, 'fire'],
  ['general', 0, 6, 'confetti_ball'],
  ['general', 0, 8, 'tada'],
  ['general', 0, 9, 'tada'],
  // general: Claude extended thinking
  ['general', 11, 0, 'mind_blown'],
  ['general', 11, 5, '+1'],
  ['general', 11, 8, 'fire'],
  // engineering: semantic cache PR
  ['engineering', 0, 0, '+1'],
  ['engineering', 0, 8, 'rocket'],
  ['engineering', 0, 3, '+1'],
  // engineering: 47k req/s load test
  ['engineering', 19, 0, 'exploding_head'],
  ['engineering', 19, 7, 'tada'],
  ['engineering', 19, 5, 'rocket'],
  ['engineering', 19, 6, 'fire'],
  // ml-research: fine-tuning results
  ['ml-research', 0, 0, 'tada'],
  ['ml-research', 0, 1, 'fire'],
  ['ml-research', 0, 5, '+1'],
  // ml-research: Llama 3.1 eval
  ['ml-research', 28, 7, 'exploding_head'],
  ['ml-research', 28, 1, '+1'],
  ['ml-research', 28, 5, 'rocket'],
  // announcements: v2.0 ships
  ['announcements', 3, 0, 'rocket'],
  ['announcements', 3, 1, 'rocket'],
  ['announcements', 3, 2, 'rocket'],
  ['announcements', 3, 4, 'tada'],
  ['announcements', 3, 5, 'fire'],
  ['announcements', 3, 6, 'confetti_ball'],
  ['announcements', 3, 8, 'tada'],
  ['announcements', 3, 9, 'tada'],
  // announcements: YC top 10
  ['announcements', 4, 0, 'trophy'],
  ['announcements', 4, 1, '+1'],
  ['announcements', 4, 2, 'heart'],
  ['announcements', 4, 5, 'tada'],
  // devops: multi-region complete
  ['devops', 0, 0, 'tada'],
  ['devops', 0, 1, 'rocket'],
  ['devops', 0, 7, 'white_check_mark'],
  // random
  ['random', 2, 1, 'joy'],
  ['random', 2, 4, 'joy'],
  ['random', 5, 0, 'joy'],
  ['random', 5, 8, '+1'],
];

// Pinned messages: [channelName, msgIndex, pinnedByIndex]
const PINNED: Array<[string, number, number]> = [
  ['announcements', 3, 7],   // v2.0 ships
  ['announcements', 6, 7],   // Series A
  ['engineering',   0, 7],   // semantic caching PR
  ['general',       20, 7],  // demo reminder
  ['ml-research',   0, 8],   // fine-tuning results
];

// DMs: [fromIndex, toIndex, content, minsAgo]
const DMS: Array<[number, number, string, number]> = [
  // Alice <-> Bob: pairing on feature
  [0, 1, "Hey Bob, want to pair on the context window spike? I have a few ideas about the chunk overlap strategy", 1440],
  [1, 0, "Yes! I was just reading about the tree-sitter approach Frank mentioned. Let's do it", 1435],
  [0, 1, "Free tomorrow at 2pm? I'll send a Tuple link", 1430],
  [1, 0, "Perfect. See you then", 1428],
  // Carol <-> Jack: design review
  [2, 9, "Jack, the new onboarding designs are ready for product review. Can you block 30min this week?", 720],
  [9, 2, "Absolutely! The progressive disclosure approach sounds interesting. Tuesday 4pm?", 715],
  [2, 9, "Tuesday works. I'll send a Figma link beforehand so you can preview", 710],
  [9, 2, "Perfect. I'll bring the user research quotes that are relevant", 705],
  // Dave <-> Bob: k8s upgrade
  [3, 1, "Bob, I need your sign-off on the k8s 1.30 upgrade plan before I schedule the maintenance window", 4320],
  [1, 3, "Read the plan, it's solid. One question: are we using the new scheduling gates feature?", 4315],
  [3, 1, "Not yet — saving that for 1.31 once it's stable. This upgrade is just version bump + topology fix", 4310],
  [1, 3, "Makes sense. You have my sign-off 👍", 4305],
  // Hank <-> Iris: investor prep
  [7, 8, "Iris, I want to feature your model accuracy results prominently in the Sequoia deck. Can you write 3 bullet points summarizing the improvement?", 2880],
  [8, 7, "On it! Here's a draft: (1) 23% higher dev acceptance rate vs baseline, (2) 8-point BLEU improvement on HumanEval, (3) Fine-tuned on 118k real-world PR diffs for production-grade suggestions", 2870],
  [7, 8, "These are perfect. Adding to slide 8 now", 2865],
  [8, 7, "Let me know if you need me in the room for technical questions", 2860],
  // Grace <-> Frank: ML research collaboration
  [6, 5, "Frank, I want to open source the eval harness after we clean it up. Would you co-author the blog post?", 1440],
  [5, 6, "Would love that! The OSS community would get a lot of value from it. I can write the implementation sections", 1435],
  [6, 5, "Great, I'll do the background and results. We should target a top-tier ML blog or maybe The Pragmatic Engineer", 1430],
  [5, 6, "Gergely's newsletter would be incredible distribution. Let's aim for that", 1425],
  // Eve <-> Alice: bug report
  [4, 0, "Alice, found a weird edge case in the streaming UI — when the token stream pauses for >2s and resumes, the cursor blinks in the wrong position", 360],
  [0, 4, "Ugh, I know exactly what that is — the cursor position state gets stale when the ReadableStream pauses. Fix is straightforward, on it", 355],
  [4, 0, "Amazing. Adding a regression test for this, what's a good observable to check?", 350],
  [0, 4, "Check that cursor is always at `content.length` after each token event, regardless of pauses", 345],
];

function minsAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60 * 1000);
}

async function main() {
  console.log('🌱 Seeding Slawk database...\n');

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
          avatar: u.avatar,
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

  // Memberships — all users in public channels
  for (const ch of publicChannels) {
    await prisma.channelMember.createMany({
      data: users.map(u => ({ userId: u.id, channelId: ch.id })),
    });
  }
  // Founders private channel: Hank (7), Iris (8), Jack (9)
  await prisma.channelMember.createMany({
    data: [7, 8, 9].map(i => ({ userId: users[i].id, channelId: privateChannel.id })),
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
  for (const [chName, parentIdx, authorIdx, content, minsAfterParent] of THREAD_REPLIES) {
    const ch = channelMap[chName];
    const parent = createdMessages[chName]?.[parentIdx];
    if (!ch || !parent) continue;
    const parentMins = MESSAGES[chName]?.[parentIdx]?.[2] as number ?? 60;
    await prisma.message.create({
      data: {
        content,
        userId: users[authorIdx].id,
        channelId: ch.id,
        threadId: parent.id,
        createdAt: minsAgo(Math.max(1, parentMins - minsAfterParent)),
        updatedAt: new Date(),
      },
    });
    replyCount++;
  }
  console.log(`  Created ${replyCount} thread replies`);

  // Pinned messages
  let pinCount = 0;
  for (const [chName, msgIdx, pinnedByIdx] of PINNED) {
    const msg = createdMessages[chName]?.[msgIdx];
    if (!msg) continue;
    await prisma.message.update({
      where: { id: msg.id },
      data: { isPinned: true, pinnedBy: users[pinnedByIdx].id, pinnedAt: new Date() },
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
      // skip duplicates
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

  // Channel reads — mark everyone as read on each public channel
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

  console.log('\n✅ Seed complete!\n');
  console.log('Test accounts (all passwords: password123):');
  for (const u of USERS) {
    console.log(`  ${u.email.padEnd(26)} ${u.name.padEnd(18)} (${u.status})`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
