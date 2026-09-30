import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addLeadImage, leadOf, shareImageOf } from '../src/lead-image.mjs';

const page = (meta) => `<html><head><title>x</title>${meta}</head><body></body></html>`;

test('shareImageOf reads og:image in either attribute order and decodes entities', () => {
  assert.equal(
    shareImageOf(page('<meta property="og:image" content="https://cdn.site.com/a.jpg?w=1200&amp;q=90" />'), 'https://site.com/story'),
    'https://cdn.site.com/a.jpg?w=1200&q=90',
  );
  assert.equal(shareImageOf(page("<meta content='https://cdn.site.com/b.png' property='og:image'>"), 'https://site.com/story'), 'https://cdn.site.com/b.png');
});

test('shareImageOf reads unquoted attributes, as Google pages write them', () => {
  const html = page('<meta content="https://lh3.googleusercontent.com/abc=w1200-h630" property=og:image><meta name=twitter:image content=https://x.com/t.jpg/>');
  assert.equal(shareImageOf(html, 'https://deepmind.google/blog/x/'), 'https://lh3.googleusercontent.com/abc=w1200-h630');
  assert.equal(shareImageOf(page('<meta name=twitter:image content=https://x.com/t.jpg/>'), 'https://x.com/'), 'https://x.com/t.jpg');
});

test('shareImageOf prefers og:image, falls back to twitter:image, resolves relative URLs and upgrades http', () => {
  const both = page('<meta name="twitter:image" content="https://site.com/t.jpg"><meta property="og:image" content="/img/og.jpg">');
  assert.equal(shareImageOf(both, 'https://site.com/news/story'), 'https://site.com/img/og.jpg');
  assert.equal(shareImageOf(page('<meta name="twitter:image" content="http://site.com/t.jpg">'), 'https://site.com/x'), 'https://site.com/t.jpg');
});

test('shareImageOf ignores logos, non-http URLs and pages without a share image', () => {
  assert.equal(shareImageOf(page('<meta property="og:image" content="https://site.com/static/logo-dark.png">'), 'https://site.com/x'), null);
  assert.equal(shareImageOf(page('<meta property="og:image" content="https://site.com/brand.svg">'), 'https://site.com/x'), null);
  assert.equal(shareImageOf(page('<meta property="og:image" content="javascript:alert(1)">'), 'https://site.com/x'), null);
  assert.equal(shareImageOf(page('<meta property="og:title" content="Hello">'), 'https://site.com/x'), null);
});

test('leadOf skips one-line briefs', () => {
  const edition = { stories: [{ id: 's1', format: 'brief' }, { id: 's2', format: 'full' }] };
  assert.equal(leadOf(edition).id, 's2');
  assert.equal(leadOf({ stories: [] }), null);
});

test('addLeadImage uses the first source page with a picture and credits that outlet', async () => {
  const pages = {
    'https://a.com/1': Promise.reject(new Error('HTTP 403')),
    'https://b.com/2': Promise.resolve(page('<meta property="og:title" content="no image">')),
    'https://c.com/3': Promise.resolve(page('<meta property="og:image" content="https://c.com/pic.jpg">')),
  };
  Object.values(pages).forEach((pending) => pending.catch(() => {}));
  const edition = {
    stories: [
      {
        id: 's1',
        sources: [
          { name: 'A', url: 'https://a.com/1' },
          { name: 'B', url: 'https://b.com/2' },
          { name: 'C', url: 'https://c.com/3' },
        ],
      },
    ],
  };
  const warnings = [];
  const image = await addLeadImage(edition, { fetchPage: (url) => pages[url], log: { warn: (line) => warnings.push(line) } });
  assert.deepEqual(image, { url: 'https://c.com/pic.jpg', credit: 'C' });
  assert.deepEqual(edition.stories[0].image, image);
  assert.equal(warnings.length, 1);
});

test('addLeadImage stops after maxPages and leaves the lead without a picture', async () => {
  const asked = [];
  const edition = { stories: [{ id: 's1', sources: [1, 2, 3, 4].map((n) => ({ name: `S${n}`, url: `https://s${n}.com/` })) }] };
  const image = await addLeadImage(edition, {
    maxPages: 2,
    fetchPage: async (url) => {
      asked.push(url);
      return page('');
    },
  });
  assert.equal(image, null);
  assert.equal(edition.stories[0].image, undefined);
  assert.deepEqual(asked, ['https://s1.com/', 'https://s2.com/']);
});
