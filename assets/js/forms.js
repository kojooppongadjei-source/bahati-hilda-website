/*
 * Netlify form submit without a page reload.
 * Any <form data-netlify="true" data-ajax> posts in the background, then hides
 * itself and shows the element whose id matches data-success.
 */
(function () {
  document.querySelectorAll('form[data-ajax]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var label = btn ? btn.textContent : '';
      var error = form.querySelector('.form-error');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      if (error) error.style.display = 'none';

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString()
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Status ' + res.status);
          var success = document.getElementById(form.getAttribute('data-success'));
          form.style.display = 'none';
          if (success) {
            success.style.display = 'block';
            success.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = label; }
          if (error) error.style.display = 'block';
        });
    });
  });
})();
