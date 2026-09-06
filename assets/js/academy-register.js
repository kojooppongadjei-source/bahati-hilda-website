// ============ 7 POWER SYSTEMS REGISTRATION ============
// Single flagship-program registration page. Two payment options:
//   full        -> UGX 2,500,000 paid once
//   installment -> UGX 1,250,000 paid now (1st of 2 instalments)
// Same Flutterwave + server-side verification pattern as shop.js, but its
// own Netlify function (verify-academy-payment) so registration emails stay
// separate from bookstore order emails.

const CURRENCY = 'UGX';
const FLW_PUBLIC_KEY = 'FLWPUBK-0ca4b5cd4a979d874b5aafe0f61a23da-X';

const PLAN_DETAILS = {
  full: {
    amount: 2500000,
    label: 'Full Payment — due now',
    summaryAmount: 'UGX 2,500,000'
  },
  installment: {
    amount: 1250000,
    label: '1st of 2 Instalments — due now',
    summaryAmount: 'UGX 1,250,000'
  }
};

let selectedPlan = null;

document.addEventListener('DOMContentLoaded', function () {
  const fullCard = document.getElementById('plan-full-card');
  const installmentCard = document.getElementById('plan-installment-card');
  const fullRadio = document.getElementById('plan-full');
  const installmentRadio = document.getElementById('plan-installment');

  function selectPlan(plan) {
    selectedPlan = plan;
    fullCard.classList.toggle('selected', plan === 'full');
    installmentCard.classList.toggle('selected', plan === 'installment');
    fullRadio.checked = plan === 'full';
    installmentRadio.checked = plan === 'installment';
    updateSummary();
  }

  fullCard.addEventListener('click', function () { selectPlan('full'); });
  installmentCard.addEventListener('click', function () { selectPlan('installment'); });

  document.getElementById('reg-pay-btn').addEventListener('click', payAndRegister);

  updateSummary();
});

function updateSummary() {
  const labelEl = document.getElementById('reg-summary-label');
  const amountEl = document.getElementById('reg-summary-amount');
  if (!selectedPlan) {
    labelEl.textContent = 'Select a payment option above';
    amountEl.textContent = '';
    return;
  }
  const plan = PLAN_DETAILS[selectedPlan];
  labelEl.textContent = plan.label;
  amountEl.textContent = plan.summaryAmount;
}

function payAndRegister() {
  const msgEl = document.getElementById('reg-msg');
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();

  if (!selectedPlan) {
    msgEl.textContent = 'Please choose a payment option above.';
    msgEl.className = 'reg-msg error';
    return;
  }
  if (!name || !email || !phone) {
    msgEl.textContent = 'Please fill in your name, email and phone number.';
    msgEl.className = 'reg-msg error';
    return;
  }

  if (typeof FlutterwaveCheckout !== 'function') {
    msgEl.textContent = 'Payment system is still loading, please try again in a moment.';
    msgEl.className = 'reg-msg error';
    return;
  }

  const plan = PLAN_DETAILS[selectedPlan];
  const amount = plan.amount;
  const txRef = 'AMA7PS_' + selectedPlan.toUpperCase() + '_' + Date.now();

  FlutterwaveCheckout({
    public_key: FLW_PUBLIC_KEY,
    tx_ref: txRef,
    amount: amount,
    currency: CURRENCY,
    payment_options: 'card, mobilemoneyuganda, ussd',
    customer: { email: email, phone_number: phone, name: name },
    customizations: {
      title: 'Package Yourself Like an Expert: The 7 Power Systems',
      description: (selectedPlan === 'full' ? 'Full payment' : '1st of 2 instalments') + ' — ' + txRef,
      logo: '/assets/images/hilda-portrait-cream-coat.jpg'
    },
    callback: function (flwResponse) {
      // Client-side callback is not proof of payment on its own — the
      // Netlify function re-verifies with Flutterwave's API server-side
      // using the secret key before we treat this as a real registration.
      msgEl.textContent = 'Confirming your payment, please wait...';
      msgEl.className = 'reg-msg info';

      fetch('/.netlify/functions/verify-academy-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: flwResponse.transaction_id,
          expected_amount: amount,
          expected_currency: CURRENCY,
          tx_ref: txRef,
          plan: selectedPlan,
          student: { name: name, email: email, phone: phone }
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          if (!result.verified) {
            msgEl.textContent = 'We could not confirm this payment. If money left your account, please contact us with reference ' + txRef + '.';
            msgEl.className = 'reg-msg error';
            return;
          }
          showConfirmation(txRef, selectedPlan);
        })
        .catch(function () {
          msgEl.textContent = 'Payment succeeded but confirmation failed to load. Please contact us with reference ' + txRef + ' to confirm your seat.';
          msgEl.className = 'reg-msg error';
        });
    },
    onclose: function () {
      // User closed the Flutterwave modal without completing payment — no action needed.
    }
  });
}

function showConfirmation(txRef, plan) {
  document.getElementById('register').style.display = 'none';
  document.querySelector('.reg-hero').style.display = 'none';
  const conf = document.getElementById('reg-confirmation');
  const body = document.getElementById('reg-confirmation-body');
  document.getElementById('reg-confirmation-ref').textContent = txRef;

  if (plan === 'installment') {
    body.textContent = 'Your first instalment has been confirmed and your seat in the October cohort is secured. Your second instalment of UGX 1,250,000 is due by 29th October — we will send you a reminder with a payment link closer to the date.';
  } else {
    body.textContent = 'Your full payment has been confirmed and your seat in the October cohort is secured.';
  }

  conf.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
