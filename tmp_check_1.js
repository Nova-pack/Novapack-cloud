
        document.addEventListener('DOMContentLoaded', function() {
            var intro = document.getElementById('admin-intro');
            if (intro) {
                setTimeout(function() {
                    intro.classList.add('fade-out');
                    setTimeout(function() { intro.style.display='none'; }, 800);
                }, 2800);
            }
        });
    