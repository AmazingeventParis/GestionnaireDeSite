(function(){
  function snbFormatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function snbAnimateCounter(el, target, duration) {
    var startTime = performance.now();
    function update(now) {
      var elapsed = now - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(eased * target);
      el.textContent = snbFormatNumber(current);
      if (progress < 1) requestAnimationFrame(update);
      else el.textContent = snbFormatNumber(target);
    }
    requestAnimationFrame(update);
  }
  var cards = document.querySelectorAll('.snb-stats .stat-card');
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var card = entry.target;
        card.classList.add('visible');
        var numEl = card.querySelector('.stat-number');
        var target = parseInt(numEl.getAttribute('data-target'));
        var idx = Array.prototype.indexOf.call(cards, card);
        var delay = idx * 300;
        setTimeout(function(){ snbAnimateCounter(numEl, target, 2000); }, delay);
        observer.unobserve(card);
      }
    });
  }, { threshold: 0.3 });
  cards.forEach(function(card){ observer.observe(card); });
})();
(function(){
  var carousel = document.querySelector(".avis-carousel");
  if (!carousel) return;
  var track = document.getElementById("snbAvisTrack");
  if (!track) return;
  var cards = track.querySelectorAll(".avis-card");
  if (!cards.length) return;

  var pos = 0;
  var isMobile = window.innerWidth <= 768;

  function getGap() { return isMobile ? 12 : 16; }
  function getCardW() { return cards[0].offsetWidth + getGap(); }
  function getVisible() { return isMobile ? 1 : (carousel.offsetWidth < 900 ? 2 : 3); }
  function getMaxPos() { return Math.max(0, cards.length - getVisible()); }

  function slideTo(p, animate) {
    pos = Math.max(0, Math.min(p, getMaxPos()));
    track.style.transition = animate ? "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)" : "none";
    track.style.transform = "translateX(" + (-pos * getCardW()) + "px)";
  }

  // Desktop arrows
  var prevBtn = document.getElementById("snbAvisPrev");
  var nextBtn = document.getElementById("snbAvisNext");
  if (prevBtn) prevBtn.addEventListener("click", function(e) { e.preventDefault(); slideTo(pos - 1, true); });
  if (nextBtn) nextBtn.addEventListener("click", function(e) { e.preventDefault(); slideTo(pos + 1, true); });

  // Touch swipe — listeners on document to avoid any interception
  var startX = 0, startY = 0, dx = 0, isDragging = false, isScrolling = false;

  function isInsideCarousel(el) {
    while (el) {
      if (el === carousel) return true;
      el = el.parentElement;
    }
    return false;
  }

  document.addEventListener("touchstart", function(e) {
    if (!isInsideCarousel(e.target)) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    isDragging = true;
    isScrolling = false;
    track.style.transition = "none";
  }, {passive: true});

  document.addEventListener("touchmove", function(e) {
    if (!isDragging) return;
    var moveX = e.touches[0].clientX - startX;
    var moveY = e.touches[0].clientY - startY;

    if (!isScrolling && Math.abs(moveX) < 5 && Math.abs(moveY) < 5) return;
    if (!isScrolling && Math.abs(moveY) > Math.abs(moveX)) {
      isDragging = false;
      return;
    }
    isScrolling = true;

    e.preventDefault();
    dx = moveX;
    var base = -pos * getCardW();
    var newX = base + dx;
    if (pos === 0 && dx > 0) newX = base + dx * 0.3;
    if (pos >= getMaxPos() && dx < 0) newX = base + dx * 0.3;
    track.style.transform = "translateX(" + newX + "px)";
  }, {passive: false});

  document.addEventListener("touchend", function() {
    if (!isDragging && !isScrolling) return;
    isDragging = false;
    if (Math.abs(dx) > 40) {
      if (dx < 0) slideTo(pos + 1, true);
      else slideTo(pos - 1, true);
    } else {
      slideTo(pos, true);
    }
  }, {passive: true});

  window.addEventListener("resize", function() {
    isMobile = window.innerWidth <= 768;
    slideTo(pos, false);
  });
})();
(function() {
  var btns = document.querySelectorAll('.sm-filter-btn');
  var photos = document.querySelectorAll('.sm-photo');
  var strip = document.getElementById('smStrip');
  var wrap = document.querySelector('.sm-strip-wrap');

  /* ── Filtres ── */
  var isMobile = window.innerWidth <= 540;
  var allCount = photos.length;

  /* Appliquer vitesse mobile au chargement */
  if (isMobile && strip) {
    strip.style.setProperty('animation', 'smSlide 10s linear infinite', 'important');
  }

  btns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      btns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.getAttribute('data-filter');

      strip.style.setProperty('animation', 'none', 'important');
      var visibleCount = 0;
      photos.forEach(function(p) {
        if (filter === 'all' || p.getAttribute('data-cat') === filter) {
          p.classList.remove('hidden');
          visibleCount++;
        } else {
          p.classList.add('hidden');
        }
      });
      var dur;
      if (isMobile) {
        var mobileSpeeds = { all: 10, paysage: 10, portrait: 10, slim: 10 };
        dur = mobileSpeeds[filter] || 10;
      } else {
        var desktopSpeeds = { all: 45, paysage: 45, portrait: 25, slim: 15 };
        dur = desktopSpeeds[filter] || 45;
      }
      setTimeout(function() {
        strip.style.setProperty('animation', 'smSlide ' + dur + 's linear infinite', 'important');
      }, 50);
    });
  });


})();
(function() {
  var pins = document.querySelectorAll(".snb-cf-pin");
  var animated = false;
  function animatePins() {
    if (animated) return;
    animated = true;
    for (var i = 0; i < pins.length; i++) {
      (function(pin, delay) {
        setTimeout(function() {
          pin.classList.add("snb-cf-anim");
          setTimeout(function() {
            pin.classList.remove("snb-cf-anim");
            pin.classList.add("snb-cf-swing");
            pin.style.opacity = "1";
            pin.style.animationDelay = (Math.random() * 2).toFixed(1) + "s";
          }, 600);
        }, delay * 120);
      })(pins[i], parseInt(pins[i].getAttribute("data-delay")));
    }
  }
  var container = document.getElementById("snbCfContainer");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) { animatePins(); observer.disconnect(); }
    }, { threshold: 0.3 });
    observer.observe(container);
  } else { animatePins(); }
})();
window.snbBlPage=0;
window.snbBlColors=["rose","bleu","orange","violet","cyan","vert"];
window.snbBlMonths=["janvier","f\u00e9vrier","mars","avril","mai","juin","juillet","ao\u00fbt","septembre","octobre","novembre","d\u00e9cembre"];
window.snbBlNav=function(dir){
  var np=snbBlPage+dir;if(np<0)return;var off=np*6;
  var x=new XMLHttpRequest();
  x.open("GET","https://shootnbox.fr/wp-json/wp/v2/posts?per_page=6&offset="+off+"&_embed");
  x.onload=function(){
    if(x.status!==200)return;var ps=JSON.parse(x.responseText);if(ps.length===0)return;
    snbBlPage=np;var g=document.getElementById("snbBlGrid");var h="";
    for(var i=0;i<ps.length;i++){
      var p=ps[i];var t=p.title.rendered.replace(/<[^>]*>/g,"");var l=p.link;
      var d=new Date(p.date);var ds=d.getDate()+" "+snbBlMonths[d.getMonth()]+" "+d.getFullYear();
      var iu="";var ca="";
      if(p._embedded){
        if(p._embedded["wp:featuredmedia"]&&p._embedded["wp:featuredmedia"][0]){
          var m=p._embedded["wp:featuredmedia"][0];
          if(m.media_details&&m.media_details.sizes&&m.media_details.sizes.medium_large)iu=m.media_details.sizes.medium_large.source_url;
          else if(m.source_url)iu=m.source_url;
        }
        if(p._embedded["wp:term"]&&p._embedded["wp:term"][0]&&p._embedded["wp:term"][0][0])ca=p._embedded["wp:term"][0][0].name.replace(/<[^>]*>/g,"");
      }
      var c=snbBlColors[(off+i)%6];
      var arw='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
      h+='<article class="snb-bl-card snb-bl-cat-'+c+'"><div class="snb-bl-card-imgwrap">'+(iu?'<a href="'+l+'"><img src="'+iu+'" class="snb-bl-card-img" loading="lazy" decoding="async"></a>':'')+(ca?'<span class="snb-bl-badge snb-bl-badge-'+c+'">'+ca+'</span>':'')+'</div><div class="snb-bl-card-body"><div class="snb-bl-card-date">'+ds.toUpperCase()+'</div><h3 class="snb-bl-card-title"><a href="'+l+'" style="color:inherit;text-decoration:none">'+t+'</a></h3><a href="'+l+'" class="snb-bl-card-link">Lire la suite '+arw+'</a></div></article>';
    }
    g.innerHTML=h;
    document.getElementById("snbBlPrev").disabled=(snbBlPage===0);
    document.getElementById("snbBlNext").disabled=(ps.length<6);
    document.querySelector(".snb-bl-header").scrollIntoView({behavior:"smooth",block:"start"});
  };x.send();
};