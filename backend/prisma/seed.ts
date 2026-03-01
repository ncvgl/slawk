import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const USERS = [
  {
    name: 'Nathan Cavaglione',
    email: 'alice@slawk.dev',
    password: 'password123',
    bio: 'Frontend lead • loves React + TypeScript • coffee → code',
    status: 'online',
    avatar: 'http://localhost:5173/ncavaglione.png',
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
    bio: "Full-stack + open source contributor • co-creator of 3 npm packages you've definitely used",
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
    [7, "🎉 Huge news — we just closed our **Series A**! $18M led by Benchmark, with Sequoia participating. Details in all-hands today at **3pm UTC**", 4320],
    [0, "WAIT WHAT 🎉🎉🎉", 4315],
    [1, "Let's gooooo!! This is massive", 4312],
    [8, "Congrats to the whole team — this is the result of months of incredible work from every single one of you", 4310],
    [2, "I'm literally shaking with excitement 🥹", 4308],
    [5, "Ship. It. Time to scale this thing 🚀", 4305],
    [6, "Opening champagne remotely 🥂", 4300],
    [3, "Infra is ready for 10x load, just saying 😎", 4295],
    [9, "Product roadmap is locked and loaded, we've been preparing for this", 4290],
    [4, "Already drafted the stress test plan for the new capacity 💪", 4285],
    [7, "All of you made this happen. See you at 3pm!", 4280],
    [0, "Has anyone tried Claude's new extended thinking mode for code generation? The results are *wild*\n\nI ran it on the auth refactor and it caught three edge cases I'd completely missed. The reasoning trace is incredibly detailed", 2880],
    [1, "Yes! I used it for the cache layer.\n\nKey thing I noticed: if you ask it to *reason about performance characteristics* before writing code, the output quality jumps significantly. Also the `code_execution` tool integration is a game changer", 2875],
    [8, "The reasoning trace is super helpful for debugging complex prompts — you can see exactly *why* it made a particular architectural choice", 2870],
    [5, "The token cost though 😅 watching our API bill climb in real-time lol", 2865],
    [6, "That's why we need the [semantic caching layer](https://github.com/slawk/semantic-cache) Bob's building", 2860],
    [1, "Exactly, semantic caching should cut costs **60-70%** for repeated queries. The key insight is using cosine similarity on embeddings rather than exact string matching", 2855],
    [9, "Do we have a timeline on that? Several customers are asking about cost predictability", 2850],
    [1, "Targeting **end of month**. Nathan, do you want to pair on the frontend cost dashboard?", 2845],
    [0, "Absolutely, let's schedule something 👍", 2840],
    [7, "Quick reminder: the demo for Sequoia is **Thursday 2pm PT**. Everyone please test the latest build beforehand 🙏", 1440],
    [8, "The new streaming mode looks really impressive, going to be a strong demo", 1435],
    [0, "Rehearsed it twice, feels solid", 1430],
    [9, "Added the new customer logos to the deck, looks great", 1425],
    [2, "The UI is looking really polished for the demo ✨", 1420],
    [3, "I'll monitor infra during the demo, we'll have zero downtime", 1415],
    [0, "Anyone know if we support multi-modal file inputs yet in the API?", 60],
    [1, "Image inputs yes, PDF parsing is in the next sprint", 55],
    [8, "The vision API hits **94% accuracy** on code screenshots, good enough for GA", 50],
    [0, "Perfect, I'll tell the customer to hang tight for PDFs", 45],
  ],
  random: [
    [2, "Hot take: light mode is actually better for code review sessions", 5040],
    [5, "I'm calling the authorities", 5035],
    [0, "Light mode gang rise up (respectfully) ☀️", 5030],
    [1, "This conversation can only end badly", 5025],
    [3, "I use light mode in sunlight, dark mode at night, and I accept the consequences", 5020],
    [7, "Solarized Dark. End of discussion. I will not elaborate", 5010],
    [6, "VS Code Dark+ for life", 5005],
    [9, "Okay but has anyone tried [Catppuccin Macchiato](https://catppuccin.com)? It changed my life", 5000],
    [2, "Just discovered the Warp terminal and I can't go back to iTerm", 4320],
    [0, "Warp is SO good. The AI completions feel like magic — especially the natural language history search", 4310],
    [5, "The block-based UI took 10 mins to get used to then I was converted", 4305],
    [3, "I'm a tmux guy. `tmux` sessions go brrr", 4300],
    [1, "Dave porting to tmux in 2025 is a vibe tbh", 4295],
    [7, "If it works, don't fix it 🤷", 4290],
    [8, "Friday vibes: what's everyone shipping this week?", 2160],
    [0, "Streaming tokens UI — the shimmer effect on in-progress tokens looks 🔥", 2155],
    [1, "Semantic cache v1 is going into staging. Early numbers: **67% cache hit rate** on our test corpus", 2150],
    [5, "Finally closing that race condition in the WS reconnect logic. Only took 3 days of `console.log` archaeology", 2145],
    [4, "Load test suite with **50k concurrent users** — wish me luck 🙏", 2140],
    [7, "The team is insane, seriously", 2135],
    [3, "No incidents this week, I'm deeply suspicious", 2130],
    [0, "Anyone watching the NBA playoffs? 🏀", 480],
    [9, "The Celtics series is unreal", 475],
    [5, "Knicks fan suffering in silence here", 470],
    [7, "I have a strict policy of not watching sports during fundraising rounds lol", 465],
    [8, "Hank was born during a fundraise, probably", 460],
  ],
  engineering: [
    [1, "PR #247 is up: **semantic caching for LLM responses** using vector similarity matching\n\nThe approach: embed each prompt with `text-embedding-3-small`, store in a local HNSW index, serve cached responses for queries with cosine similarity > 0.92\n\nWould love reviews from anyone on the API layer 🙏", 5040],
    [5, "On it — this is the piece I've been waiting for. The HNSW index choice is interesting, why not pgvector?", 5030],
    [1, "pgvector is great for persistence but HNSW in-memory gives us **sub-millisecond** lookup times. We persist to Redis on a background job every 5 mins", 5020],
    [8, "Smart. What threshold are you using for 'similar enough'?", 5015],
    [1, "`0.92` by default with a config flag `CACHE_SIMILARITY_THRESHOLD`. Also adding an LRU eviction + staleness TTL based on Frank's suggestion", 5010],
    [5, "Review done, left 3 nits but overall it's solid — merging tomorrow 🚀", 5000],
    [0, "We need to talk about our **context window strategy**.\n\nCustomers are hitting the 128k limit on complex codebases. I've been researching approaches:\n\n1. *AST-aware chunking* — split by function/class boundaries, not arbitrary token counts\n2. *Hierarchical summarization* — compress old context while preserving key symbols\n3. *Retrieval-augmented* — embed the whole repo, retrieve relevant chunks per query\n\nLeaning towards (3) as the most scalable", 2880],
    [8, "Option 3 is what Cursor does. The tricky part is deciding *what's relevant* — a naive BM25 search misses semantic relationships", 2875],
    [5, "Agreed. We should use a hybrid: sparse (BM25) + dense (embeddings) retrieval, then re-rank with a cross-encoder. There's a good [Hugging Face blog post](https://huggingface.co/blog/hybrid-search) on this", 2870],
    [1, "I prototyped this with `tree-sitter` last week — happy to share the POC. AST-aware chunking alone improved eval scores by **12 points**", 2865],
    [0, "Please! That would save us days", 2860],
    [3, "Kubernetes cluster autoscaler is tuned — we now scale from **5 to 200 pods** in under 2 minutes. p99 latency dropped from 340ms to 42ms for EU customers", 1440],
    [4, "Just ran the load test at 47k req/s, p99 < 50ms. The caching layer is doing serious work 💪", 1435],
    [1, "47k?? We're only promising 10k in the SLA haha", 1430],
    [3, "Good, that headroom makes me sleep better 😴", 1425],
    [7, "Ship it 🚀", 1420],
    [8, "Reminder: the model eval harness PR is blocking Q2 roadmap. Anyone have capacity to review?", 720],
    [5, "I'll take it — Iris already reviewed the ML side right?", 715],
    [8, "Yes, just needs the integration test review", 710],
    [5, "Review done, LGTM! Merging ✅", 700],
    [4, "The regression test caught a `SerializationError` in the fine-tuned model response formatter. Nice catch!", 360],
    [5, "That would have been embarrassing in prod 😬", 355],
    [8, "This is exactly why we invested in the eval harness", 350],
  ],
  'ml-research': [
    [8, "Sharing the results from our latest fine-tuning run on the code completion model 🧵\n\n**tl;dr:** BLEU score +8 points vs baseline, human eval shows **23% higher acceptance rate** on suggestions", 7200],
    [8, "The key insight: training on *PR diffs* instead of raw file contents gives the model much better context about what constitutes a meaningful change.\n\nWe filter on: PR has description, >3 changed files, author has >50 contributions to repo\n\nDataset: **118k PR diffs** from permissive-license OSS repos", 7195],
    [6, "This is really exciting. The PR diff approach makes intuitive sense — it's how humans *think* about code changes, not how IDEs display them", 7185],
    [8, "Exactly. Next experiment: include the PR description + issue title as part of the context during training. Should help the model understand *intent*, not just syntax", 7180],
    [1, "What's the training cost looking like per run?", 7175],
    [8, "About **$340 on H100s** for the current model size. Will need to optimize before we scale — probably LoRA fine-tuning would get us to < $50 per run", 7170],
    [3, "I can help with spot instance scheduling. AWS p4d.24xlarge spot is currently 40% cheaper than on-demand", 7165],
    [6, "The new GPT-4o pricing is actually interesting for our eval pipeline", 5040],
    [8, "We use Claude for eval — consistency matters more than cost for that use case. Claude gives us more detailed reasoning traces in the evals", 5035],
    [0, "Question: are we planning to fine-tune on *customer code*? The privacy implications need careful design\n\nWe'd need: explicit opt-in, per-customer data isolation, and customer-specific model weights", 4320],
    [8, "Exactly right — the technical architecture is LoRA adapters per customer, base model stays shared. **Zero cross-contamination** between customer adapters.\n\nIris is drafting the architecture doc for enterprise prospects", 4315],
    [6, "LoRA adapters are the right call. ~10MB per customer vs full fine-tune which would be 7GB+ per customer. Totally different operational cost", 4305],
    [8, "New paper dropped: [*CodeACT: Agentic Code Execution for Programming Tasks*](https://arxiv.org/abs/2402.01030)\n\nThe benchmark results are **wild**: 61% pass rate on SWE-bench vs 43% for prior SOTA", 2880],
    [6, "The tool use section on page 8 is directly relevant to what we're building. Their sandboxing approach is worth stealing 👀", 2875],
    [1, "What's their approach on sandboxing?", 2865],
    [8, "Docker containers per task, ephemeral. Similar to ours but they use a custom runtime that pre-warms containers in parallel. Worth benchmarking against our approach", 2860],
    [6, "Our iteration speed advantage comes from pre-warming — glad we went that route early", 2855],
    [6, "Llama 3.1 405B eval results are in:\n\n| Model | HumanEval | MBPP | SWE-bench |\n|-------|-----------|------|-----------|\n| Llama 3.1 405B | 87% | 84% | 31% |\n| Claude 3.5 Sonnet | 92% | 91% | 49% |\n| GPT-4o | 90% | 89% | 38% |\n\nStill a gap but it's **closing fast**. OSS models at this scale are a game changer for self-hosted customers", 1440],
    [1, "87% on HumanEval for an open source model is incredible. 18 months ago SOTA was 48%", 1425],
    [8, "Adding to eval dashboard, tracking over time 📊", 1420],
  ],
  product: [
    [9, "Q2 roadmap is finalized 🎯\n\n**North star**: *Make every developer 10x more productive in their first week*\n\n**Key bets:**\n1. IDE plugin for VSCode + JetBrains\n2. PR review automation\n3. Codebase Q&A with semantic search", 5040],
    [7, "Love the framing. The first-week metric is testable and customer-aligned", 5030],
    [2, "I'll start on the IDE plugin design system. The canvas constraints are fascinating — you have maybe 350px of width and need to show completions, explanations, and actions", 5025],
    [0, "The codebase Q&A feature is the one I'm most excited about as a dev. Imagine being able to ask `why does the auth middleware skip OPTIONS requests` and get a precise answer", 5020],
    [1, "That and PR review — those are the two highest-leverage features for our ICP", 5015],
    [9, "Customer interview recap from this week — **big themes:**\n\n1. *\"I want it to understand our coding conventions, not just generic best practices\"*\n2. *\"Integration with GitHub/GitLab is table stakes\"*\n3. *\"Need SSO + audit logs for enterprise procurement\"*\n\nThe SSO one is most urgent — blocking **3 enterprise deals**", 2880],
    [1, "SSO is **2 weeks of work** max, I can start now. Already have the Okta OIDC integration half-done from a previous project", 2855],
    [2, "For the conventions point — I'm thinking a *project context* onboarding flow where devs upload their `CONTRIBUTING.md` or style guide. We chunk it and inject relevant sections into the system prompt", 2845],
    [0, "Love that. Could also *auto-detect* conventions from existing code patterns — build a style profile by analyzing the last 500 commits", 2840],
    [7, "Both, ideally. Manual upload for fast onboarding, auto-detect as a background job. Make it feel magical ✨", 2835],
    [9, "New user research finding: developers spend **38% of their time** understanding existing code, not writing new code\n\nThis is from Nielsen Norman Group research. Fully citable.\n\nThis validates the 'codebase Q&A' bet as the **#1 highest-leverage feature**", 1440],
    [0, "38% is wild. That drops to like 5% with good semantic search over the codebase", 1430],
    [7, "This is the product thesis right there 🎯", 1425],
    [9, "Launching NPS survey next week. Target: **50 responses** from active users in 7 days. I want results segmented by team size, language, and plan tier", 720],
    [4, "I'll set up the event tracking to identify most active users for targeting", 715],
    [2, "I'll design the survey to be concise — max 5 questions. Completion rate tanks after 5", 705],
  ],
  design: [
    [2, "**Design system v3 is live in Figma!** 🎨\n\nBiggest update since we launched:\n- New token system (spacing, typography, color)\n- Full dark mode support  \n- 40 new component variants\n- `@slawk/design-tokens` npm package for devs\n\n[Figma link →](https://figma.com/slawk-design-system)", 7200],
    [0, "The dark mode is SO polished. The syntax highlighting palette is *chef's kiss* 👨‍🍳", 7190],
    [7, "This is exactly the quality bar we need for enterprise customers. Well done Carol!", 7185],
    [5, "Already implementing — the token system is a **massive** DX improvement. No more hardcoded hex values in the codebase 🙏", 7180],
    [4, "Running accessibility audit on the dark mode tokens — all critical text is WCAG AAA compliant ✅", 7175],
    [2, "Sharing mockups for the new onboarding flow (v4) — would love feedback in the next 24hrs 🙏\n\nKey changes:\n- *Progressive disclosure* — hide advanced options until users are ready\n- **Before/after slider** in the demo step\n- Clearer value prop on the GitHub connect step", 4320],
    [9, "The progressive disclosure approach is excellent — hiding advanced options is exactly right for our user profile", 4310],
    [0, "The before/after slider on step 3 is going to win people over. It makes the value *immediately tangible*", 4305],
    [4, "Contrast on the CTA in step 4 is AAA compliant 👍", 4290],
    [7, "The empty states are beautiful — the illustration style is distinctive and memorable", 4285],
    [2, "IDE plugin design is the **hardest design challenge** we've had 🧠\n\nConstraints: 350px max width, 600px max height, needs to show: completion, explanation, action buttons, diff view, and not block the code\n\nFirst concepts attached. Would love brutal feedback", 2880],
    [0, "The density is impressive but font size in the suggestion preview needs to go up 1px — maybe 13px → 14px", 2875],
    [5, "The hover states feel slightly off — too much opacity change. Solid background would feel more intentional", 2865],
    [2, "Both updated ✅ Feels much better now", 2860],
    [9, "The skeleton loading state is much better than a spinner — matches how GitHub Copilot handles it, feels familiar", 2855],
    [7, "This is going to make a strong impression in the demo 💪", 2850],
  ],
  devops: [
    [3, "**Multi-region migration complete** ✅\n\nUS-East + EU-West + AP-Southeast all live\n\nLatency improvements:\n- 🇪🇺 EU: 340ms → **42ms** avg\n- 🌏 AP: 580ms → **67ms** avg\n\nCustomers in London and Singapore will be very happy", 7200],
    [1, "That's a massive improvement. Customers in London were complaining, this will fix it 🙌", 7190],
    [7, "Outstanding work Dave. This was months in the making 👏", 7185],
    [4, "Running smoke tests across all three regions — all green so far ✅", 7180],
    [3, "Monitoring is up, per-region alerts configured. I'll post hourly updates for the first 24hrs", 7175],
    [3, "k8s upgrade to **v1.30** scheduled for Saturday 2am UTC (low-traffic window)\n\nKey changes in this version:\n- Topology spread constraint syntax update (already patched in our manifests)\n- New `SchedulingGates` feature (deferring to 1.31)\n- CRI-O runtime update\n\nFull changelog: [kubernetes.io/changelog](https://kubernetes.io/releases/)", 4320],
    [4, "I'll run a full regression suite Friday evening to baseline before the upgrade", 4315],
    [1, "Good catch on the topology syntax — that would have been a nasty surprise at 2am", 4300],
    [4, "Upgrade complete! All services healthy, zero downtime 🎉", 4270],
    [3, "Couldn't have gone smoother. Thanks Eve for the overnight validation 🙏", 4265],
    [3, "GPU node pool is configured and ready for Iris's training jobs.\n\n**Specs:**\n- 8x H100 80GB nodes\n- Spot instance with auto-fallback to on-demand\n- Budget alerts at 80% of monthly cap\n- Auto-pause non-critical jobs at 90%", 2880],
    [7, "Finally! Iris no longer needs to use my personal account for H100 spot instances 😅", 2875],
    [3, "**Incident post-mortem:** 14-min elevated latency last Tuesday\n\n**Root cause:** Misconfigured HPA briefly over-scaled API pods, starving GPU nodes of memory\n\n**Fix:** Guard in HPA config — API pods cannot exceed 60% of total node capacity\n\n**Prevention:** Added check to pre-deploy validation script", 1440],
    [4, "Added the HPA config as a check in the pre-deploy validation script ✅", 1430],
    [1, "Great write-up Dave, added to the runbook with the dashboard link", 1425],
  ],
  announcements: [
    [7, "🎉 Welcome to Slawk — the AI coding assistant built by developers, for developers. This channel is for company-wide updates.", 20160],
    [7, "We just hit **1,000 registered developers**! This community is growing faster than we ever imagined. Thank you all for being early adopters 🚀", 10080],
    [7, "All-hands this **Thursday at 3pm UTC**. Agenda: Q1 results, product roadmap, and a surprise announcement. Don't miss it!", 7200],
    [7, "🚀 **v2.0 ships TODAY!** This is the biggest release in Slawk's history.\n\nNew in v2.0:\n- ⚡ Streaming completions\n- 📁 Multi-file context (up to 20 files)\n- 🔍 PR review automation (beta)\n- 🏎️ 3x faster inference engine\n\nDetails in #engineering. Thank you team!", 4320],
    [7, "We've been named one of **YC's 'Top 10 AI Dev Tools' for 2025** 🏆\n\nFull list in TechCrunch. Huge validation for the whole team.", 2880],
    [7, "Reminder: **security training** required for all team members by Friday. Link in your email. This is mandatory per our SOC 2 compliance.", 1440],
    [7, "📣 **We closed our Series A!** $18M led by Benchmark, with participation from Sequoia and several incredible angels.\n\nWe're going to use this to triple the team and ship the features you've been asking for. More details in all-hands.", 720],
    [7, "New team members joining next Monday: *@Priya* (ML Infra), *@Marcus* (Sales), *@Yuki* (Design). Please give them a warm welcome! 👋", 360],
  ],
  founders: [
    [7, "Board deck is ready for review.\n\nKey metrics: MRR **$85k** (+28% MoM), ARR run rate **$1.02M**, 127 paying teams, NPS 62", 7200],
    [7, "The growth curve is what Benchmark wants to see. We're on track for the Series A close next week", 7195],
    [8, "Iris, can you update slide 12 with the new model accuracy benchmarks?", 7190],
    [8, "Updated! Also added a competitor comparison table — we're ahead on **4 of 5** key metrics", 7185],
    [9, "I'd add CAC/LTV to the metrics slide — that's the question I always get from investors", 7180],
    [7, "Good call. CAC is **$840**, LTV at 24 months is **$8,200** — 9.8x ratio is strong", 7175],
    [9, "That's a great story, it should be front and center on the metrics slide", 7170],
    [7, "Closing call with Benchmark is **Monday at 10am PT**. Everyone on the founding team, please be available. This is it 🤞", 4320],
    [8, "Cleared my calendar", 4315],
    [9, "Ready. Should we do a mock Q&A Sunday evening?", 4310],
    [7, "Yes — Sunday 4pm PT at my place or Zoom. Bring your hardest questions", 4305],
    [7, "**Deal closed!** $18M, Benchmark leads, Matt Cohler joining the board. This is the fuel we needed. Now let's execute 🚀", 720],
    [8, "History made. Let's build something that outlasts all of us 🙏", 715],
    [9, "Proud to be building this with you both. Let's go 🚀", 710],
  ],
};

// [channelName, parentMsgIndex, authorIndex, content, minsAfterParent]
const THREAD_REPLIES: Array<[string, number, number, string, number]> = [
  // engineering: PR #247 review
  ['engineering', 0, 5, "One thing: the eviction policy for cache misses should be **LRU** not FIFO — hot prompts will age out under FIFO", 20],
  ['engineering', 0, 1, "Great catch! Swapping to LRU now. Also adding a `CACHE_MAX_ENTRIES` config, defaults to 10k", 25],
  ['engineering', 0, 0, "Also consider: the embedding model version should be pinned in the cache key, otherwise a model upgrade silently invalidates your whole cache", 30],
  ['engineering', 0, 1, "Oh wow yes — adding `embedding_model_version` to the cache key now. That would have been a brutal prod incident 😬", 40],
  // engineering: context window strategy
  ['engineering', 6, 5, "I prototyped AST-aware chunking with `tree-sitter` last week. The POC is at github.com/slawk/tree-sitter-poc (internal). Happy to walk you through it", 10],
  ['engineering', 6, 0, "Please! That would save us days. Can we schedule a 30-min walkthrough?", 15],
  ['engineering', 6, 5, "Done — calendar invite sent for tomorrow 2pm. I'll screen-share the code", 20],
  ['engineering', 6, 8, "Add me to that invite please — I want to see how the chunk overlap strategy handles multi-file dependencies", 25],
  // ml-research: fine-tuning results
  ['ml-research', 0, 6, "The training methodology doc is in Notion if anyone wants the full breakdown. The filtering criteria for PR quality were surprisingly impactful", 15],
  ['ml-research', 0, 1, "What dataset size? And how long did training take on the H100s?", 20],
  ['ml-research', 0, 8, "118k PR diffs, ~6 hours on 8xH100. The data filtering pipeline took longer than training honestly", 25],
  ['ml-research', 0, 0, "Any filtering for code quality? Low-quality PRs from beginners might hurt more than help", 30],
  ['ml-research', 0, 8, "Yes — we also filter on: `author_stars > 100`, PR passes CI checks, PR is merged (not abandoned). Quality signal is important", 35],
  // product: customer interview
  ['product', 5, 9, "Full interview notes + verbatim quotes in Notion `/customer-research`. Added tagging by theme so it's easy to find patterns", 10],
  ['product', 5, 2, "Can I get read access? Verbatim quotes are gold for UX decisions — I want to use them in the design critique on Friday", 15],
  ['product', 5, 9, "Added you! Also tagged Carol on the onboarding-related quotes specifically", 18],
  // general: caching conversation
  ['general', 15, 0, "Quick q: the cache key will be the embedding of the prompt, right? Not the literal string?", 5],
  ['general', 15, 1, "Correct — embedding-based so near-synonymous prompts share a cache entry. `cosine_similarity(embed(A), embed(B)) > 0.92` → same cache bucket", 8],
  ['general', 15, 8, "Make sure the cache is **per-customer isolated**. We absolutely cannot serve Customer A's cached responses to Customer B", 12],
  ['general', 15, 1, "Absolutely — cache key is prefixed with `org_id`. Namespace isolation is layer 0 of the design", 15],
  // random: Warp terminal
  ['random', 9, 3, "Fine I'll try Warp. If I hate it this is entirely on you Nathan", 20],
  ['random', 9, 0, "You'll thank me in a week. Trust the process 😎", 25],
  ['random', 9, 3, "...ok I like it. I hate that I like it. The AI history search alone is worth it", 10080],
  // design: v3 launch
  ['design', 0, 5, "The `@slawk/design-tokens` package is *incredibly* clean. Used it this morning, zero friction", 30],
  ['design', 0, 9, "Can we use these tokens in the marketing site too? Or is it eng-only?", 35],
  ['design', 0, 2, "Designed to be universal! The tokens are just CSS custom properties, works anywhere 🎨", 40],
];

// [channelName, msgIndex, authorIndex, emoji]
const REACTIONS: Array<[string, number, number, string]> = [
  // general: Series A
  ['general', 0, 0, 'tada'], ['general', 0, 1, 'tada'], ['general', 0, 2, 'tada'],
  ['general', 0, 4, 'rocket'], ['general', 0, 5, 'fire'], ['general', 0, 6, 'confetti_ball'],
  ['general', 0, 8, 'tada'], ['general', 0, 9, 'tada'],
  // general: Claude extended thinking
  ['general', 11, 0, 'mind_blown'], ['general', 11, 5, '+1'], ['general', 11, 8, 'fire'], ['general', 11, 9, 'eyes'],
  // general: caching cost savings
  ['general', 16, 0, '+1'], ['general', 16, 8, 'white_check_mark'], ['general', 16, 4, 'fire'],
  // general: demo reminder
  ['general', 20, 0, 'white_check_mark'], ['general', 20, 1, '+1'], ['general', 20, 3, '+1'], ['general', 20, 4, '+1'],
  // engineering: PR #247
  ['engineering', 0, 0, '+1'], ['engineering', 0, 8, 'rocket'], ['engineering', 0, 3, '+1'], ['engineering', 0, 4, 'white_check_mark'],
  // engineering: load test 47k
  ['engineering', 13, 0, 'exploding_head'], ['engineering', 13, 7, 'tada'], ['engineering', 13, 5, 'rocket'], ['engineering', 13, 6, 'fire'], ['engineering', 13, 9, 'muscle'],
  // engineering: LGTM merging
  ['engineering', 19, 0, 'tada'], ['engineering', 19, 1, 'tada'], ['engineering', 19, 5, 'star-struck'],
  // ml-research: fine-tuning results
  ['ml-research', 0, 0, 'tada'], ['ml-research', 0, 1, 'fire'], ['ml-research', 0, 5, '+1'], ['ml-research', 0, 9, 'exploding_head'],
  // ml-research: Llama eval table
  ['ml-research', 17, 7, 'exploding_head'], ['ml-research', 17, 1, '+1'], ['ml-research', 17, 5, 'rocket'], ['ml-research', 17, 0, 'eyes'],
  // product: roadmap
  ['product', 0, 7, '+1'], ['product', 0, 2, 'tada'], ['product', 0, 0, 'fire'], ['product', 0, 1, 'rocket'],
  // product: user research 38%
  ['product', 10, 0, 'exploding_head'], ['product', 10, 1, 'mind_blown'], ['product', 10, 5, '+1'], ['product', 10, 6, 'eyes'],
  // design: v3 launch
  ['design', 0, 0, 'art'], ['design', 0, 5, 'fire'], ['design', 0, 7, 'heart'], ['design', 0, 1, '+1'], ['design', 0, 9, 'tada'],
  // announcements: v2.0
  ['announcements', 3, 0, 'rocket'], ['announcements', 3, 1, 'rocket'], ['announcements', 3, 2, 'rocket'],
  ['announcements', 3, 4, 'tada'], ['announcements', 3, 5, 'fire'], ['announcements', 3, 6, 'confetti_ball'],
  ['announcements', 3, 8, 'tada'], ['announcements', 3, 9, 'tada'],
  // announcements: YC top 10
  ['announcements', 4, 0, 'trophy'], ['announcements', 4, 1, '+1'], ['announcements', 4, 2, 'heart'], ['announcements', 4, 5, 'tada'], ['announcements', 4, 6, 'trophy'],
  // devops: multi-region
  ['devops', 0, 0, 'tada'], ['devops', 0, 1, 'rocket'], ['devops', 0, 7, 'white_check_mark'], ['devops', 0, 5, 'fire'], ['devops', 0, 8, '+1'],
  // random: Friday vibes
  ['random', 14, 0, '+1'], ['random', 14, 1, 'fire'], ['random', 14, 2, 'tada'],
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
  // Nathan <-> Bob: pairing on feature
  [0, 1, "Hey Bob, want to pair on the context window spike? I have some ideas about the AST chunking strategy", 1440],
  [1, 0, "Yes! I was just reading about the tree-sitter approach Frank mentioned. Let's do it", 1435],
  [0, 1, "Free tomorrow at 2pm? I'll send a Tuple link", 1430],
  [1, 0, "Perfect. See you then 👍", 1428],
  // Nathan <-> Hank: demo prep
  [7, 0, "Nathan — the Sequoia demo is Thursday. Can you make sure the streaming UI is rock solid? That's going to be our wow moment", 720],
  [0, 7, "Already on it. Tested on 3 different network conditions, it's smooth even at 2G. Will do one more pass tomorrow morning", 715],
  [7, 0, "Amazing. You're the best 🙏", 710],
  [0, 7, "Also noticed a subtle cursor flicker in the token stream — fixing that tonight, shouldn't block the demo", 700],
  // Nathan <-> Carol: design handoff
  [2, 0, "Nathan, the new design tokens are ready in Figma. The `@slawk/design-tokens` package is published to the internal registry", 2880],
  [0, 2, "Just installed it. This is SO much cleaner than hardcoded hex values everywhere 😍 The dark mode tokens especially look great", 2875],
  [2, 0, "Glad you like it! Let me know if any tokens are missing — I can add to v3.1 quickly", 2870],
  [0, 2, "Will do. One thing: there's no token for the code block background. Using #f0f0f0 for now but should be in the system", 2865],
  [2, 0, "Good catch! Adding `--color-code-bg` to the next release 🎨", 2860],
  // Nathan <-> Eve: bug report
  [4, 0, "Nathan, found a weird edge case in the streaming UI — when the token stream pauses for >2s and resumes, the cursor blinks in the wrong position", 360],
  [0, 4, "Ugh, I know exactly what that is — the cursor position state gets stale when the `ReadableStream` pauses. Fix is straightforward, on it now", 355],
  [4, 0, "Amazing. Adding a regression test for this, what's a good observable to check?", 350],
  [0, 4, "Check that cursor is always at `content.length` after each token event, regardless of pauses. Also worth asserting stream resumes within 5s of pause", 345],
  [4, 0, "Perfect, test written and passing ✅", 340],
  // Bob <-> Carol: design review
  [2, 9, "Jack, the new onboarding designs are ready for product review. Can you block 30min this week?", 2880],
  [9, 2, "Absolutely! The progressive disclosure approach sounds really interesting. Tuesday 4pm?", 2875],
  [2, 9, "Tuesday works. I'll send the Figma link beforehand", 2870],
  [9, 2, "Perfect. I'll bring the user research quotes that are relevant 📊", 2865],
  // Grace <-> Frank: OSS blog post
  [6, 5, "Frank, I want to open source the eval harness after we clean it up. Would you co-author the blog post? You'd write the implementation sections, I'd do background + results", 1440],
  [5, 6, "Would love that! The OSS community would get a lot of value from this. Gergely's newsletter would be incredible distribution", 1435],
  [6, 5, "Exactly what I was thinking. Let's target The Pragmatic Engineer. I'll draft the outline this week", 1430],
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
  console.log('Login as: alice@slawk.dev / password123 (Nathan Cavaglione)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
