// ============ PACKAGE YOURSELF LIKE AN EXPERT: REGISTRATION ============
// December 2026 intake (12 weeks, fully online, starts 14 December 2026).
//
// Price until 31 December 2026 (Kampala time):
//   full        -> UGX 3,000,000 paid once
//   installment -> UGX 1,500,000 now + UGX 1,500,000 by 11 January 2027
//                  (2nd half paid at /academy-balance)
// From 1 January 2027 the investment is USD 1,000; academy-deadline.js then
// switches the page to "WhatsApp to register" so the team can take payment
// (online USD payment isn't enabled on the Flutterwave account yet).
//
// The server (verify-academy-payment) checks the amount itself; it never
// trusts the price sent from this page.

const AMA_PLANS = {
  full: { amount: 3000000, label: 'Package Yourself Like an Expert · full payment', summary: 'UGX 3,000,000', desc: 'Full payment' },
  installment: { amount: 1500000, label: '1st of 2 instalments · due today', summary: 'UGX 1,500,000', desc: '1st of 2 instalments' }
};
let amaPlan = 'full';

const AMA = {
  CURRENCY: 'UGX',
  PRICE_CHANGE_AT: new Date('2027-01-01T00:00:00+03:00'),
  TITLE: 'Package Yourself Like an Expert (12 weeks, online)',
  FLW_PUBLIC_KEY: 'FLWPUBK-0ca4b5cd4a979d874b5aafe0f61a23da-X'
};

document.addEventListener('DOMContentLoaded', function () {
  // Auto-detect platform from a shared link's ?src= parameter, e.g.
  // .../register-7-power-systems.html?src=whatsapp
  const SOURCE_MAP = { whatsapp: 'WhatsApp', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube' };
  const params = new URLSearchParams(window.location.search);
  const srcParam = (params.get('src') || '').toLowerCase();
  if (SOURCE_MAP[srcParam]) {
    const sourceSelect = document.getElementById('reg-source');
    if (sourceSelect) sourceSelect.value = SOURCE_MAP[srcParam];
  }

  function selectPlan(plan) {
    amaPlan = plan;
    document.getElementById('plan-full-card').classList.toggle('selected', plan === 'full');
    document.getElementById('plan-installment-card').classList.toggle('selected', plan === 'installment');
    document.getElementById('plan-full').checked = plan === 'full';
    document.getElementById('plan-installment').checked = plan === 'installment';
    document.getElementById('reg-summary-label').textContent = AMA_PLANS[plan].label;
    document.getElementById('reg-summary-amount').textContent = AMA_PLANS[plan].summary;
  }
  const fullCard = document.getElementById('plan-full-card');
  if (fullCard) {
    fullCard.addEventListener('click', function () { selectPlan('full'); });
    document.getElementById('plan-installment-card').addEventListener('click', function () { selectPlan('installment'); });
    if (params.get('plan') === 'installment') selectPlan('installment');
  }

  const btn = document.getElementById('reg-pay-btn');
  if (btn && !document.documentElement.classList.contains('ama-price-changed')) {
    btn.addEventListener('click', payAndRegister);
  }
});

function setMsg(text, kind) {
  const msgEl = document.getElementById('reg-msg');
  msgEl.textContent = text;
  msgEl.className = 'reg-msg ' + kind;
}

function payAndRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const source = document.getElementById('reg-source').value;

  if (new Date() >= AMA.PRICE_CHANGE_AT) {
    setMsg('The early price has ended. Please WhatsApp +256 757 117 117 to register.', 'error');
    return;
  }
  if (!name || !email || !phone) return setMsg('Please fill in your name, email and phone number.', 'error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setMsg('Please check your email address. Your confirmation will be sent there.', 'error');
  if (!source) return setMsg('Please let us know how you heard about us.', 'error');
  if (typeof FlutterwaveCheckout !== 'function') return setMsg('Payment system is still loading, please try again in a moment.', 'error');

  const plan = amaPlan;
  const txRef = 'AMA7PS_DEC26_' + (plan === 'full' ? 'FULL' : 'INST1') + '_' + Date.now();

  FlutterwaveCheckout({
    public_key: AMA.FLW_PUBLIC_KEY,
    tx_ref: txRef,
    amount: AMA_PLANS[plan].amount,
    currency: AMA.CURRENCY,
    payment_options: 'mobilemoneyuganda, card',
    customer: { email: email, phone_number: phone, name: name },
    customizations: {
      title: AMA.TITLE,
      description: AMA_PLANS[plan].desc + ', starts 14 December 2026 — ' + txRef,
      logo: location.origin + '/assets/images/hilda-portrait-cream-coat.jpg'
    },
    callback: function (flwResponse) {
      // The client callback isn't proof of payment: the Netlify function
      // re-verifies with Flutterwave using the secret key.
      setMsg('Confirming your payment, please wait...', 'info');
      fetch('/.netlify/functions/verify-academy-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: flwResponse.transaction_id,
          tx_ref: txRef,
          plan: plan,
          student: { name: name, email: email, phone: phone, source: source }
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          if (!result.verified) {
            setMsg('We could not confirm this payment. If money left your account, please WhatsApp +256 757 117 117 with reference ' + txRef + '.', 'error');
            return;
          }
          showConfirmation(txRef, plan);
        })
        .catch(function () {
          setMsg('Payment went through but the confirmation didn’t load. Please WhatsApp +256 757 117 117 with reference ' + txRef + ' to confirm your place.', 'error');
        });
    },
    onclose: function () {}
  });
}

function showConfirmation(txRef, plan) {
  if (plan === 'installment') {
    document.getElementById('reg-confirmation-body').textContent =
      'Your 1st instalment of UGX 1,500,000 is confirmed and your place in the 14 December intake is secured. Your 2nd instalment of UGX 1,500,000 is due by 11 January 2027. We’ve emailed you a link to pay it, and you can also pay any time at bahatihildasabiti.com/academy-balance.';
  }
  document.getElementById('register').style.display = 'none';
  document.querySelector('.reg-hero').style.display = 'none';
  document.getElementById('reg-confirmation-ref').textContent = txRef;
  document.getElementById('reg-confirmation').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
