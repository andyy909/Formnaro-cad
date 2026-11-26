function trackDownload(event) {
  if (event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;

  const link = event.target.closest?.('a[data-download-event]');
  if (link) window.umami?.track(link.dataset.downloadEvent);
}

document.addEventListener('click', trackDownload);
document.addEventListener('auxclick', trackDownload);
