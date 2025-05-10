// Show fallback UI if options.js fails to render within 2 seconds
setTimeout(() => {
  const root = document.getElementById('root');
  if (root && root.textContent.includes('Loading options...')) {
    document.getElementById('fallback').style.display = 'block';
    document.getElementById('reload-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}, 2000);