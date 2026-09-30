/*
 * Academy deadline switch
 * Package Yourself Like an Expert: The 7 Power Systems (October 2026 cohort)
 *
 * From midnight Kampala time on 1st October this script:
 *   - sends /register-7-power-systems to /academy-waitlist (unless ?late=1)
 *   - turns every "Register Now" link into "Join the Waitlist"
 *   - changes the WhatsApp registration message to a waitlist message
 *   - updates the "Registration closes..." / "Starts 1st October" wording
 *   - hides the price line in the homepage popup
 *
 * Load it in the <head> of every page, WITHOUT defer:
 *   <script src="/assets/js/academy-deadline.js"></script>
 *
 * Test before the deadline:  add ?preview-closed=1 to any page URL
 * Let a late registrant pay:  send them /register-7-power-systems?late=1
 * Extend the deadline:        change CLOSE_AT below
 */
(function () {
  var CLOSE_AT = new Date('2026-10-01T00:00:00+03:00'); // midnight, Kampala (EAT)
  var WAITLIST_URL = '/academy-waitlist';
  var REGISTER_SLUG = 'register-7-power-systems';
  var WA_NUMBER = '256757117117';
  var WA_TEXT = "Hi, I'd like to join the waitlist for the next Accelerated Mentorship Academy cohort.";

  var params = new URLSearchParams(window.location.search);
  var preview = params.has('preview-closed');
  var closed = preview || new Date() >= CLOSE_AT;
  if (!closed) return;

  var path = window.location.pathname.replace(/(\.html)?\/?$/, '');
  var onRegisterPage = path.slice(-REGISTER_SLUG.length) === REGISTER_SLUG;

  if (onRegisterPage) {
    if (params.has('late')) return; // private late-registration link: leave the page working
    window.location.replace(WAITLIST_URL + (preview ? '?preview-closed=1' : ''));
    return;
  }

  function isLeaf(el) {
    // an element whose only children are inline emphasis (strong/b/em), e.g. "Registration deadline: <strong>30th September</strong>"
    for (var i = 0; i < el.children.length; i++) {
      if (!/^(STRONG|B|EM|I|SPAN)$/.test(el.children[i].tagName)) return false;
    }
    return true;
  }

  function run() {
    document.documentElement.classList.add('academy-closed');

    // 1. Registration links -> waitlist
    document.querySelectorAll('a[href*="' + REGISTER_SLUG + '"]').forEach(function (a) {
      a.setAttribute('href', WAITLIST_URL);
      if (/register/i.test(a.textContent)) {
        a.textContent = /\u2192/.test(a.textContent) ? 'Join the Waitlist \u2192' : 'Join the Waitlist';
      }
    });

    // 2. WhatsApp registration links -> waitlist message
    document.querySelectorAll('a[href*="wa.me"]').forEach(function (a) {
      var href = decodeURIComponent(a.getAttribute('href') || '');
      if (href.indexOf('7 Power Systems') === -1) return;
      a.setAttribute('href', 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(WA_TEXT));
      a.textContent = a.textContent.replace(/WhatsApp to Register/i, 'WhatsApp to Join the Waitlist');
    });

    // 3. Wording changes in plain text
    var swaps = [
      [/Registration closes 30th September/i, 'October cohort now in session'],
      [/Starts 1st October/i, 'October cohort in session']
    ];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue;
      for (var i = 0; i < swaps.length; i++) text = text.replace(swaps[i][0], swaps[i][1]);
      if (text !== node.nodeValue) node.nodeValue = text;
    }

    // 4. "Registration deadline: 30th September" lines
    document.querySelectorAll('p, li, div, span').forEach(function (el) {
      if (!isLeaf(el)) return;
      if (/Payment Deadline/i.test(el.textContent) && /1st October/i.test(el.textContent)) {
        el.textContent = '8 Weeks \u00B7 October cohort now in session \u00B7 Join the waitlist for the next one';
        return;
      }
      if (/Registration deadline/i.test(el.textContent)) {
        el.textContent = '\u23F3 Registration for this cohort has closed. The next cohort opens to the waitlist first.';
      }
    });

    // 5. Homepage popup: hide the price line (next cohort's fee isn't set yet)
    var img = document.querySelector('img[src*="7-power-systems-popup"]');
    var popup = img;
    while (popup && popup !== document.body && !popup.querySelector('a[href*="wa.me"]')) {
      popup = popup.parentElement;
    }
    if (popup && popup !== document.body) {
      popup.querySelectorAll('p, li, div, span').forEach(function (el) {
        if (isLeaf(el) && /UGX\s?[\d,]+/.test(el.textContent)) el.style.display = 'none';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
