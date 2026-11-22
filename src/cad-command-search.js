export function appendCadCommandSearch(popup, { placeholder, entries, choose }) {
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  const list = document.createElement('div');
  list.className = 'cad-command-search-results';

  function render() {
    const text = input.value.trim().toLocaleLowerCase();
    list.replaceChildren();
    for (const entry of entries()) {
      if (![entry.label, ...(entry.aliases ?? [])].some(label => label.toLocaleLowerCase().includes(text)))
        continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label;
      button.dataset.commandResult = entry.key;
      button.disabled = entry.disabled;
      button.onclick = () => choose(entry.key);
      list.append(button);
    }
  }

  popup.append(input, list);
  input.addEventListener('input', render);
  popup.addEventListener('keydown', event => {
    const choices = [...list.querySelectorAll('button:not(:disabled)')];
    const index = choices.indexOf(event.target);
    if (event.key === 'Enter' && (event.target === input || index >= 0)) {
      event.preventDefault();
      event.stopPropagation();
      choices[Math.max(index, 0)]?.click();
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key) && (event.target === input || index >= 0)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'ArrowDown') choices[index + 1]?.focus();
      else (choices[index - 1] ?? input).focus();
    }
  });
  render();
  return input;
}