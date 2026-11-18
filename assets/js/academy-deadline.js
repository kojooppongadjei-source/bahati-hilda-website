/*
 * Academy price switch — Package Yourself Like an Expert, December 2026 intake
 *
 * Until midnight Kampala time on 1 January 2027: nothing changes. The page
 * sells at UGX 3,000,000 (approx. USD 722) with online payment.
 *
 * From 1 January 2027:
 *   - prices shown as "UGX 3,000,000" become "USD 1,000"
 *   - the "available until 31 December" note is replaced
 *   - the online pay button becomes "WhatsApp to Register", because
 *     USD payment isn't enabled on the Flutterwave account yet
 *
 * Loaded in the <head> of pages that mention the program, WITHOUT defer.
 * Preview the January state:  add ?preview-jan=1 to any page URL
 * Change the date:            edit PRICE_CHANGE_AT below (and in
 *                             assets/js/academy-register.js and the
 *                             verify-academy-payment function)
 */
(function () {
  var PRICE_CHANGE_AT = new Date('2027-01-01T00:00:00+03:00'); // midnight, Kampala (EAT)
  var WA = 'https://wa.me/256757117117?text=' +
    encodeURIComponent("Hi, I'd like to register for Package Yourself Like an Expert (12-week online program).");

  var params = new URLSearchParams(window.location.search);
  var changed = params.has('preview-jan') || new Date() >= PRICE_CHANGE_AT;
  if (!changed) return;

  document.documentElement.classList.add('ama-price-changed');

  function run() {
    // 1. Price wording anywhere on the page
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var t = node.nodeValue
        .replace(/UGX\s?3,000,000/g, 'USD 1,000')
        .replace(/approx\.?\s*USD\s*722/gi, '');
      if (t !== node.nodeValue) node.nodeValue = t;
    }

    // 2. Early-price note
    document.querySelectorAll('.ama-early').forEach(function (el) {
      el.textContent = 'The program started on 14 December 2026. WhatsApp us to ask about joining.';
    });

    // 2b. The two-instalment option was an early-price offer
    document.querySelectorAll('.plan-grid, .ama-split').forEach(function (el) { el.style.display = 'none'; });

    // 3. Registration page: online payment -> WhatsApp
    var btn = document.getElementById('reg-pay-btn');
    if (btn) {
      var form = document.getElementById('reg-form');
      if (form) {
        // hide the "Your details" heading and its subtitle above the form
        var sub = form.previousElementSibling, head = sub && sub.previousElementSibling;
        if (sub) sub.style.display = 'none';
        if (head) head.style.display = 'none';
        form.querySelectorAll('input, select, .reg-summary').forEach(function (el) {
          var wrap = el.closest('div') || el;
          wrap.style.display = 'none';
        });
      }
      var a = document.createElement('a');
      a.href = WA;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = btn.className;
      a.textContent = 'WhatsApp to Register';
      btn.replaceWith(a);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
