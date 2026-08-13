document.addEventListener('DOMContentLoaded', function(){
  // Mobile menu toggle
  var toggle = document.querySelector('.mobile-toggle');
  var menu = document.querySelector('.mobile-menu');
  if(toggle && menu){
    toggle.addEventListener('click', function(){
      menu.classList.toggle('open');
    });
  }

  // Reveal on scroll
  var reveals = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window && reveals.length){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, {threshold:0.12});
    reveals.forEach(function(el){ io.observe(el); });
  } else {
    reveals.forEach(function(el){ el.classList.add('in'); });
  }
});
