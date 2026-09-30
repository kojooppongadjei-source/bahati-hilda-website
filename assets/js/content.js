/*
 * Renders content managed in /site-admin:
 *   blog.html         -> published posts (replaces the "Coming Soon" cards once there are posts)
 *   post.html         -> a single post at /insights/<slug>
 *   testimonials.html -> published testimonials
 */
(function () {
  var API = '/.netlify/functions/content';

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function fmtDate(d) {
    if (!d) return '';
    return new Date(d.length === 10 ? d + 'T12:00:00' : d)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  var ALLOWED = { P: 1, H2: 1, H3: 1, STRONG: 1, B: 1, EM: 1, I: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, A: 1, BR: 1 };
  function clean(html) {
    var doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1 || !ALLOWED[n.tagName]) {
          if (n.nodeType === 1 && !/^(SCRIPT|STYLE|IFRAME|OBJECT)$/.test(n.tagName)) {
            walk(n);
            while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
          }
          n.remove();
          return;
        }
        walk(n);
        var href = n.tagName === 'A' ? n.getAttribute('href') : null;
        Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
        if (href && /^(https?:|mailto:|tel:|\/)/i.test(href)) {
          n.setAttribute('href', href);
          if (/^https?:/i.test(href)) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
        }
      });
    })(doc.body.firstChild);
    return doc.body.firstChild.innerHTML;
  }
  function get(qs) {
    return fetch(API + qs).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // ---------- Insights listing ----------
  var postGrid = document.querySelector('[data-posts]');
  if (postGrid) {
    get('?type=posts').then(function (d) {
      if (!d.items || !d.items.length) return; // keep the Coming Soon cards
      postGrid.innerHTML = d.items.map(function (p) {
        var url = '/insights/' + encodeURIComponent(p.slug);
        return '<a class="post-card" href="' + url + '">' +
          (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : '<div class="post-card-noimg"></div>') +
          '<div class="post-card-body"><div class="post-meta">' + esc(p.category) + '<span>' + esc(fmtDate(p.date)) + '</span></div>' +
          '<h3>' + esc(p.title) + '</h3>' + (p.excerpt ? '<p>' + esc(p.excerpt) + '</p>' : '') +
          '<span class="post-more">Read article</span></div></a>';
      }).join('');
      var lede = document.querySelector('.page-header .lede');
      if (lede) lede.textContent = "Reflections and practical tools from Hilda's coaching room, mentorship academy and stage.";
    }).catch(function () {});
  }

  // ---------- Single post ----------
  var postEl = document.querySelector('[data-post]');
  if (postEl) {
    var m = location.pathname.match(/\/insights\/([^/]+)\/?$/);
    var slug = m ? decodeURIComponent(m[1]) : new URLSearchParams(location.search).get('slug');
    var notFound = function () {
      document.querySelector('[data-post-title]').textContent = 'This article isn\u2019t available.';
      postEl.innerHTML = '<p>It may have been moved or unpublished. <a href="/blog.html">See all insights</a>.</p>';
    };
    if (!slug) notFound();
    else get('?type=posts&slug=' + encodeURIComponent(slug)).then(function (d) {
      var p = d.item;
      document.title = p.title + ' | Dr. Bahati Hilda Sabiti';
      var desc = document.querySelector('meta[name="description"]');
      if (desc && p.excerpt) desc.setAttribute('content', p.excerpt);
      document.querySelector('[data-post-title]').textContent = p.title;
      document.querySelector('[data-post-meta]').textContent = [p.category, fmtDate(p.date)].filter(Boolean).join('  |  ');
      var crumb = document.querySelector('[data-post-crumb]');
      if (crumb) crumb.textContent = p.title;
      postEl.innerHTML = (p.image ? '<img class="post-cover" src="' + esc(p.image) + '" alt="">' : '') + clean(p.body);
    }).catch(notFound);
  }

  // ---------- Testimonials ----------
  var tmWrap = document.querySelector('[data-testimonials]');
  if (tmWrap) {
    get('?type=testimonials').then(function (d) {
      if (!d.items || !d.items.length) return; // keep the Coming Soon message
      var lede = document.querySelector('.page-header .lede');
      if (lede) lede.textContent = 'Client transformations, mentorship success stories, Altar testimonies and corporate impact.';
      tmWrap.style.maxWidth = 'none';
      tmWrap.style.textAlign = 'left';
      tmWrap.innerHTML =
        '<div class="tm-grid">' + d.items.map(function (t) {
          return '<figure class="tm-card"><div class="tm-type">' + esc(t.category) + '</div>' +
            '<blockquote>' + esc(t.quote).replace(/\n/g, '<br>') + '</blockquote>' +
            '<figcaption>' + (t.image ? '<img src="' + esc(t.image) + '" alt="">' : '') +
            '<span><b>' + esc(t.name) + '</b>' + (t.role ? esc(t.role) : '') + '</span></figcaption></figure>';
        }).join('') + '</div>' +
        '<div style="text-align:center;margin-top:44px;"><a href="/contact.html" class="btn btn-primary">Share Your Story</a></div>';
    }).catch(function () {});
  }
})();
