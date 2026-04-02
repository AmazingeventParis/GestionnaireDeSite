var burger = document.getElementById('snbBurger');
var mobileMenu = document.getElementById('snbMobileMenu');
burger.addEventListener('click', function() {
  burger.classList.toggle('active');
  mobileMenu.classList.toggle('open');
});

var header = document.getElementById('snbHeader');
window.addEventListener('scroll', function() {
  header.classList.toggle('scrolled', window.scrollY > 20);
});
document.querySelectorAll('[data-slideshow]').forEach(function(wrap) {
  var imgs = wrap.querySelectorAll('.lpem-row-img');
  if (imgs.length < 2) return;
  var idx = 0;
  setInterval(function() {
    imgs[idx].classList.remove('lpem-active');
    idx = (idx + 1) % imgs.length;
    imgs[idx].classList.add('lpem-active');
  }, 3000);
});
document.querySelectorAll('.lpee-svc-step-card').forEach(function(card) {
  card.addEventListener('mousemove', function(e) {
    var rect = card.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width - 0.5;
    var y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = 'perspective(800px) rotateX(' + (-y * 12) + 'deg) rotateY(' + (x * 12) + 'deg) translateY(-4px) scale(1.02)';
    card.style.transition = 'transform 0.1s ease';
  });
  card.addEventListener('mouseleave', function() {
    card.style.transform = '';
    card.style.transition = 'transform 0.5s cubic-bezier(.22,.68,0,1.2)';
  });
});