import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assembleTrending,
  curateTrending,
  fallbackTrending,
  formatTrending,
  parseBlueskyFeed,
  parseGithubTrending,
  parseHfModels,
  selectPosts,
  selectRepos,
  trendingUrlsOf,
} from '../src/trending.mjs';

const now = new Date('2026-09-28T08:00:00Z');
const hoursAgo = (hours) => new Date(now - hours * 3_600_000);

function row(name, description, stars, gained, period = 'today') {
  return `<article class="Box-row">
  <div class="float-right d-flex"><a href="/login?return_to=%2F${name}">Star</a></div>
  <h2 class="h3 lh-condensed">
    <a data-hydro-click="{&quot;payload&quot;:{}}" href="/${name}" class="Link"><svg class="octicon"><path d="M0"></path></svg>
      <span class="text-normal">${name.split('/')[0]} /</span> ${name.split('/')[1]}</a>
  </h2>
  <p class="col-9 color-fg-muted my-1 tmp-pr-4">
    ${description}
  </p>
  <div class="f6 color-fg-muted mt-2">
    <span class="d-inline-block ml-0 mr-3"><span itemprop="programmingLanguage">Python</span></span>
    <a href="/${name}/stargazers" class="Link"><svg class="octicon octicon-star"><path d="M8"></path></svg>
        ${stars}</a>
    <span class="d-inline-block float-sm-right"><svg class="octicon"><path d="M8"></path></svg>
        ${gained} stars ${period}</span>
  </div>
</article>`;
}

test('parseGithubTrending reads each repo row', () => {
  const html = `<main>${row('vectorize-io/hindsight', 'Agent Memory &amp; Learning', '39,506', '4,520')}</main>`;
  assert.deepEqual(parseGithubTrending(html, 'daily'), [
    {
      name: 'vectorize-io/hindsight',
      url: 'https://github.com/vectorize-io/hindsight',
      description: 'Agent Memory & Learning',
      language: 'Python',
      stars: 39506,
      gained: 4520,
      period: 'daily',
    },
  ]);
  assert.equal(parseGithubTrending(row('a/b', 'x', '10', '2', 'this week'), 'weekly')[0].gained, 2);
});

test('parseGithubTrending fails loudly when the page layout changes', () => {
  assert.throws(() => parseGithubTrending('<html>new layout</html>'), /no repositories/);
});

test('parseHfModels skips re-uploads and adult models, keeps the base model', () => {
  const body = JSON.stringify([
    { id: 'Qwen/Qwen-Image-2.1', likes: 2543, downloads: 58700, pipeline_tag: 'text-to-image', tags: ['diffusers', 'license:apache-2.0'] },
    { id: 'someone/Qwen-Image-2.1-GGUF', likes: 900, tags: ['gguf', 'base_model:quantized:Qwen/Qwen-Image-2.1'] },
    { id: 'someone/model-uncensored', likes: 800, tags: [] },
    { id: 'someone/lora', likes: 700, tags: ['base_model:adapter:Qwen/Qwen-Image-2.1'] },
    { id: 'someone/nsfw-free', likes: 600, tags: ['not-for-all-audiences'] },
    { id: 'lab/tuned', likes: 500, tags: ['base_model:finetune:Qwen/Qwen3-8B', 'base_model:Qwen/Qwen3-8B'] },
    { id: '../escape', likes: 400, tags: [] },
  ]);
  const models = parseHfModels(body);
  assert.deepEqual(
    models.map((model) => model.name),
    ['Qwen/Qwen-Image-2.1', 'lab/tuned'],
  );
  assert.equal(models[0].url, 'https://huggingface.co/Qwen/Qwen-Image-2.1');
  assert.equal(models[0].license, 'apache-2.0');
  assert.equal(models[1].baseModel, 'Qwen/Qwen3-8B');
});

function post({ handle = 'emollick.bsky.social', text = 'New LLM benchmark results', likes = 10, reply, reason, labels = [], at = hoursAgo(2) } = {}) {
  return {
    ...(reason ? { reason } : {}),
    post: {
      uri: `at://did:plc:abc/app.bsky.feed.post/${Math.abs(likes)}rkey`,
      author: { handle, displayName: 'Ethan Mollick', labels: [] },
      record: { text, createdAt: at.toISOString(), ...(reply ? { reply } : {}) },
      likeCount: likes,
      repostCount: 1,
      quoteCount: 0,
      labels,
      indexedAt: at.toISOString(),
    },
  };
}

test('parseBlueskyFeed keeps original posts and builds the bsky.app link', () => {
  const body = JSON.stringify({
    feed: [
      post({ likes: 5 }),
      post({ likes: 6, reason: { $type: 'app.bsky.feed.defs#reasonRepost' } }),
      post({ likes: 7, reply: { parent: {} } }),
      post({ likes: 8, labels: [{ val: 'porn' }] }),
    ],
  });
  const posts = parseBlueskyFeed(body);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://bsky.app/profile/emollick.bsky.social/post/5rkey');
  assert.equal(posts[0].author, 'Ethan Mollick');
  assert.equal(posts[0].likes, 5);
});

test('selectRepos keeps AI projects, daily first by stars gained, each repo once', () => {
  const repo = (name, description, gained, period) => ({ name, url: `https://github.com/${name}`, description, gained, period });
  const daily = [repo('a/tool', 'Agent memory for LLMs', 100, 'daily'), repo('b/radar', 'Phased array radar', 900, 'daily'), repo('c/voice', 'Local voice cloning studio', 300, 'daily')];
  const weekly = [repo('a/tool', 'Agent memory for LLMs', 5000, 'weekly'), repo('d/rag', 'RAG pipeline', 2000, 'weekly')];
  assert.deepEqual(
    selectRepos([daily, weekly]).map((picked) => `${picked.name}:${picked.period}`),
    ['c/voice:daily', 'a/tool:daily', 'd/rag:weekly'],
  );
});

test('selectPosts applies the window and AI filter, ranks by engagement and caps each author', () => {
  const item = (handle, text, likes, age) => ({ url: `https://bsky.app/profile/${handle}/post/${likes}`, handle, text, likes, reposts: 0, quotes: 0, publishedAt: hoursAgo(age) });
  const posts = [
    item('a.bsky.social', 'LLM agents are everywhere', 50, 1),
    item('a.bsky.social', 'OpenAI ships a new model', 40, 2),
    item('a.bsky.social', 'Claude gets faster', 30, 3),
    item('b.bsky.social', 'My cat is asleep', 500, 1),
    item('c.bsky.social', 'Gemini paper is out', 45, 40),
    item('d.bsky.social', 'A new AI benchmark', 20, 5),
  ];
  assert.deepEqual(
    selectPosts(posts, { now }).map((picked) => picked.likes),
    [50, 40, 20],
  );
});

const pool = {
  repos: [
    { id: 'r1', name: 'a/tool', url: 'https://github.com/a/tool', description: 'Agent memory', language: 'Python', stars: 1000, gained: 100, period: 'daily' },
    { id: 'r2', name: 'b/rag', url: 'https://github.com/b/rag', description: 'RAG', language: 'Go', stars: 500, gained: 50, period: 'weekly' },
  ],
  models: [{ id: 'm1', name: 'lab/model', url: 'https://huggingface.co/lab/model', task: 'text-generation', library: 'transformers', likes: 10, downloads: 20 }],
  posts: [
    { id: 'p1', url: 'https://bsky.app/profile/x.bsky.social/post/1', author: 'X', handle: 'x.bsky.social', text: 'LLM news', likes: 9, reposts: 1, quotes: 0, publishedAt: hoursAgo(3), trusted: false },
    { id: 'p2', url: 'https://bsky.app/profile/y.bsky.social/post/2', author: 'Y', handle: 'y.bsky.social', text: 'AI paper', likes: 5, reposts: 0, quotes: 0, publishedAt: hoursAgo(4), trusted: true },
  ],
};
const report = [{ name: 'GitHub Trending', ok: true, count: 2 }];

test('formatTrending lists every item and flags the ones featured yesterday', () => {
  const text = formatTrending(pool, { now, previousUrls: new Set(['https://github.com/b/rag']) });
  assert.match(text, /\[r1\] a\/tool · Python · 1000 stars · \+100 today\nAgent memory/);
  assert.match(text, /\[r2\] .*\+50 this week · \[in previous edition\]/);
  assert.match(text, /\[m1\] lab\/model · text-generation · transformers · 10 likes · 20 downloads/);
  assert.match(text, /\[p1\] X \(@x\.bsky\.social\) · 9 likes · 1 reposts · 3h ago\nLLM news/);
  assert.doesNotMatch(text.split('\n\n')[1], /previous edition/);
});

test('assembleTrending drops unknown and repeated ids and takes every link from the pool', () => {
  const raw = {
    repos: [
      { id: 'r2', note: '<b>Pipeline</b> de RAG' },
      { id: 'r2', note: 'again' },
      { id: 'r9', note: 'invented' },
    ],
    models: [{ id: 'm1', note: 'Modelo novo.' }],
    posts: [],
  };
  const section = assembleTrending({ raw, pool, curation: { curated: true, model: 'claude-sonnet-5' }, report });
  assert.deepEqual(section.repos, [
    { name: 'b/rag', url: 'https://github.com/b/rag', description: 'RAG', language: 'Go', stars: 500, gained: 50, period: 'weekly', note: 'Pipeline de RAG' },
  ]);
  assert.equal(section.models[0].url, 'https://huggingface.co/lab/model');
  assert.deepEqual(section.posts, []);
  assert.equal(section.curated, true);
  assert.deepEqual(section.sources, report);
  assert.equal(assembleTrending({ raw: { repos: [{ id: 'nope', note: '' }] }, pool, curation: { curated: true }, report }), null);
});

test('the fallback keeps the top items and only posts from the hand-picked accounts', () => {
  const section = assembleTrending({ raw: fallbackTrending(pool), pool, curation: { curated: false }, report });
  assert.equal(section.repos.length, 2);
  assert.deepEqual(
    section.posts.map((picked) => picked.handle),
    ['y.bsky.social'],
  );
  assert.equal(section.posts[0].publishedAt, hoursAgo(4).toISOString());
  assert.deepEqual([...trendingUrlsOf({ trending: section })].length, 4);
  assert.equal(trendingUrlsOf(null).size, 0);
});

test('curateTrending asks for structured picks at low effort', async () => {
  const calls = [];
  const client = {
    messages: {
      stream: (request) => {
        calls.push(request);
        return {
          finalMessage: async () => ({
            model: 'claude-sonnet-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 900, output_tokens: 300 },
            content: [{ type: 'text', text: '{"repos":[{"id":"r1","note":"n"}],"models":[],"posts":[]}' }],
          }),
        };
      },
    },
  };
  const result = await curateTrending({ pool, now, previousUrls: new Set(), model: 'claude-sonnet-5', client });
  assert.equal(calls[0].output_config.effort, 'low');
  assert.equal(calls[0].output_config.format.type, 'json_schema');
  assert.deepEqual(calls[0].output_config.format.schema.required, ['repos', 'models', 'posts']);
  assert.match(calls[0].messages[0].content, /\[p2\] Y/);
  assert.deepEqual(result.raw.repos, [{ id: 'r1', note: 'n' }]);
});
