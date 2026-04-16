document.addEventListener('click', function(e) {
  var header = e.target.closest('.snb-ft-zone-header');
  if (!header) return;
  var group = header.parentElement;
  if (group && group.classList.contains('snb-ft-zone-group')) {
    group.classList.toggle('open');
  }
});