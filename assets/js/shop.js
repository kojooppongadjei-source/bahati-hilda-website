// ============ PRODUCT CATALOG ============
// To add more books or souvenirs later, just add another object here.
// Digital products need `digital: true` and a `file` path. After payment
// succeeds, the file download starts automatically for that item.
const PRODUCTS = [
  {
    id: 'book-deliberately-selfish',
    name: 'Deliberately Selfish',
    price: 45000,
    image: '/assets/images/book-deliberately-selfish.jpg',
    description: 'A guide to self-respect and the confidence to live life on your own terms.'
  },
  {
    id: 'book-tears-on-my-pillow',
    name: 'Tears on My Pillow',
    price: 45000,
    image: '/assets/images/book-tears-on-my-pillow.jpg',
    description: 'A raw, honest account of marriage, heartbreak and healing.'
  },
  {
    id: 'ebook-deliberately-selfish',
    name: 'Deliberately Selfish (Digital Edition)',
    price: 20000,
    image: '/assets/images/book-deliberately-selfish.jpg',
    description: 'Instant PDF download, read on any device, right after payment.',
    digital: true,
    file: '/assets/downloads/deliberately-selfish.pdf'
  },
  {
    id: 'ebook-tears-on-my-pillow',
    name: 'Tears on My Pillow (Digital Edition)',
    price: 20000,
    image: '/assets/images/book-tears-on-my-pillow.jpg',
    description: 'Instant PDF download, read on any device, right after payment.',
    digital: true,
    file: '/assets/downloads/tears-on-my-pillow.pdf'
  }
];

const CART_KEY = 'bhs_cart_v1';
const CURRENCY = 'UGX';
const FLW_PUBLIC_KEY = 'FLWPUBK-06aad0a3fd4609421d774be186af3fc8-X';

function getCart(){
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch(e){ return {}; }
}
function saveCart(cart){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartCount();
}
function addToCart(id, qty){
  const cart = getCart();
  cart[id] = (cart[id] || 0) + qty;
  saveCart(cart);
  renderCartDrawer();
}
function removeFromCart(id){
  const cart = getCart();
  delete cart[id];
  saveCart(cart);
  renderCartDrawer();
}
function setQty(id, qty){
  const cart = getCart();
  if (qty <= 0) { delete cart[id]; } else { cart[id] = qty; }
  saveCart(cart);
  renderCartDrawer();
}
function cartCount(){
  const cart = getCart();
  return Object.values(cart).reduce((a, b) => a + b, 0);
}
function cartSubtotal(){
  const cart = getCart();
  let total = 0;
  Object.keys(cart).forEach(function(id){
    const p = PRODUCTS.find(function(x){ return x.id === id; });
    if (p) total += p.price * cart[id];
  });
  return total;
}
function cartHasPhysical(){
  const cart = getCart();
  return Object.keys(cart).some(function(id){
    const p = PRODUCTS.find(function(x){ return x.id === id; });
    return p && !p.digital;
  });
}
function formatUGX(n){
  return 'UGX ' + n.toLocaleString('en-UG');
}
function renderCartCount(){
  const n = cartCount();
  document.querySelectorAll('.cart-count').forEach(function(el){
    el.textContent = n;
    el.classList.toggle('zero', n === 0);
  });
}
function renderCartDrawer(){
  const body = document.getElementById('cart-drawer-body');
  if (!body) return;
  const cart = getCart();
  const ids = Object.keys(cart);
  if (ids.length === 0) {
    body.innerHTML = '<div class="cart-empty">Your cart is empty. Browse the bookstore to add something.</div>';
  } else {
    body.innerHTML = ids.map(function(id){
      const p = PRODUCTS.find(function(x){ return x.id === id; });
      if (!p) return '';
      const qty = cart[id];
      return '<div class="cart-item">' +
        '<img src="' + p.image + '" alt="' + p.name + '">' +
        '<div class="cart-item-info">' +
          '<h4>' + p.name + '</h4>' +
          '<div class="cart-item-price">' + formatUGX(p.price) + '</div>' +
          '<div class="cart-item-controls">' +
            '<button class="qty-btn" onclick="setQty(\'' + id + '\', ' + (qty - 1) + ')">&minus;</button>' +
            '<span class="qty-val">' + qty + '</span>' +
            '<button class="qty-btn" onclick="setQty(\'' + id + '\', ' + (qty + 1) + ')">+</button>' +
            '<button class="cart-item-remove" onclick="removeFromCart(\'' + id + '\')">Remove</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  const subtotalEl = document.getElementById('cart-subtotal-val');
  if (subtotalEl) subtotalEl.textContent = formatUGX(cartSubtotal());
}

function openCart(){
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if (overlay) overlay.classList.add('open');
  if (drawer) drawer.classList.add('open');
  renderCartDrawer();
}
function closeCart(){
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if (overlay) overlay.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
}

function showCheckoutFields(){
  const cart = getCart();
  if (Object.keys(cart).length === 0) return;
  const fields = document.getElementById('checkout-fields');
  const toggleBtn = document.getElementById('checkout-toggle-btn');
  const addressWrap = document.getElementById('checkout-address-wrap');
  if (addressWrap) addressWrap.style.display = cartHasPhysical() ? '' : 'none';
  if (fields) fields.classList.add('show');
  if (toggleBtn) toggleBtn.style.display = 'none';
}

function payWithFlutterwave(){
  const cart = getCart();
  if (Object.keys(cart).length === 0) return;
  const name = document.getElementById('checkout-name').value.trim();
  const email = document.getElementById('checkout-email').value.trim();
  const phone = document.getElementById('checkout-phone').value.trim();
  const addressEl = document.getElementById('checkout-address');
  const address = addressEl ? addressEl.value.trim() : '';
  const hasPhysical = cartHasPhysical();
  const msgEl = document.getElementById('cart-msg');

  if (!name || !email || !phone) {
    msgEl.textContent = 'Please fill in your name, email and phone number.';
    msgEl.className = 'cart-msg error';
    return;
  }
  if (hasPhysical && !address) {
    msgEl.textContent = 'Please add a delivery address for your physical book(s).';
    msgEl.className = 'cart-msg error';
    return;
  }

  const amount = cartSubtotal();
  const txRef = 'BHS_' + Date.now();

  if (typeof FlutterwaveCheckout !== 'function') {
    msgEl.textContent = 'Payment system is still loading, please try again in a moment.';
    msgEl.className = 'cart-msg error';
    return;
  }

  FlutterwaveCheckout({
    public_key: FLW_PUBLIC_KEY,
    tx_ref: txRef,
    amount: amount,
    currency: CURRENCY,
    payment_options: 'card, mobilemoneyuganda, ussd',
    customer: { email: email, phone_number: phone, name: name },
    customizations: {
      title: 'Dr. Bahati Hilda Sabiti | Bookstore',
      description: 'Order ' + txRef,
      logo: '/assets/images/hilda-portrait-cream-coat.jpg'
    },
    callback: function(flwResponse){
      // IMPORTANT: this client-side callback firing is NOT proof of payment —
      // it can be spoofed. We re-check with our own backend, which calls
      // Flutterwave's verify endpoint using the secret key server-side.
      msgEl.textContent = 'Confirming your payment, please wait...';
      msgEl.className = 'cart-msg';

      fetch('/.netlify/functions/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: flwResponse.transaction_id,
          expected_amount: amount,
          expected_currency: CURRENCY,
          tx_ref: txRef,
          customer: { name: name, email: email, phone: phone, address: address },
          items: Object.keys(cart).map(function(id){
            const p = PRODUCTS.find(function(x){ return x.id === id; });
            return p ? { name: p.name, qty: cart[id], price: p.price, digital: !!p.digital } : null;
          }).filter(Boolean)
        })
      })
        .then(function(res){ return res.json(); })
        .then(function(result){
          if (!result.verified) {
            msgEl.textContent = 'We could not confirm this payment. If money left your account, please contact us with reference ' + txRef + '.';
            msgEl.className = 'cart-msg error';
            return;
          }

          const cart = getCart();
          const digitalItems = Object.keys(cart)
            .map(function(id){ return PRODUCTS.find(function(p){ return p.id === id; }); })
            .filter(function(p){ return p && p.digital; });

          // Trigger a download for each digital item purchased, staggered
          // slightly so the browser doesn't block multiple simultaneous downloads.
          digitalItems.forEach(function(p, i){
            setTimeout(function(){
              const a = document.createElement('a');
              a.href = p.file;
              a.download = '';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }, i * 800);
          });

          if (digitalItems.length > 0) {
            msgEl.innerHTML = 'Payment confirmed, thank you! Your download' + (digitalItems.length > 1 ? 's have' : ' has') + ' started. If it didn\'t open automatically, ' +
              digitalItems.map(function(p){ return '<a href="' + p.file + '" download>' + p.name + '</a>'; }).join(' · ') + '.';
          } else {
            msgEl.textContent = 'Payment confirmed, thank you! A confirmation will be sent to ' + email + '.';
          }
          msgEl.className = 'cart-msg success';
          localStorage.removeItem(CART_KEY);
          renderCartCount();
          renderCartDrawer();
          const fields = document.getElementById('checkout-fields');
          const toggleBtn = document.getElementById('checkout-toggle-btn');
          if (fields) fields.classList.remove('show');
          if (toggleBtn) toggleBtn.style.display = '';
        })
        .catch(function(){
          msgEl.textContent = 'We could not confirm this payment right now. If money left your account, please contact us with reference ' + txRef + '.';
          msgEl.className = 'cart-msg error';
        });
    },
    onclose: function(){}
  });
}

document.addEventListener('DOMContentLoaded', function(){
  renderCartCount();
  renderCartDrawer();

  document.querySelectorAll('#cart-open-btn').forEach(function(btn){
    btn.addEventListener('click', openCart);
  });
  const closeBtn = document.getElementById('cart-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeCart);
  const overlay = document.getElementById('cart-overlay');
  if (overlay) overlay.addEventListener('click', closeCart);

  document.querySelectorAll('.add-to-cart-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      const id = btn.getAttribute('data-id');
      addToCart(id, 1);
      const original = btn.textContent;
      btn.textContent = 'Added ✓';
      btn.disabled = true;
      setTimeout(function(){
        btn.textContent = original;
        btn.disabled = false;
      }, 1100);
    });
  });

  const checkoutToggle = document.getElementById('checkout-toggle-btn');
  if (checkoutToggle) checkoutToggle.addEventListener('click', showCheckoutFields);

  const payBtn = document.getElementById('pay-btn');
  if (payBtn) payBtn.addEventListener('click', payWithFlutterwave);
});
