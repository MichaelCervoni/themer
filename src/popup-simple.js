console.log('Popup script loaded!');

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded fired');
  
  const themeSelect = document.getElementById('theme-select');
  const applyBtn = document.getElementById('apply-btn');
  const optionsBtn = document.getElementById('options-btn');
  const msgDiv = document.getElementById('message');
  
  if (!applyBtn || !optionsBtn || !themeSelect || !msgDiv) {
    console.error('Could not find necessary DOM elements');
    return;
  }
  
  console.log('DOM elements found');
  
  // Apply theme button
  applyBtn.addEventListener('click', async function() {
    try {
      msgDiv.textContent = 'Applying theme...';
      msgDiv.style.color = 'blue';
      
      const tabs = await browser.tabs.query({active: true, currentWindow: true});
      
      if (!tabs || !tabs[0]) {
        throw new Error('No active tab found');
      }
      
      const result = await browser.runtime.sendMessage({
        type: "REFRESH_PALETTE",
        targetTab: tabs[0],
        settings: {
          style: themeSelect.value,
          customDescription: ''
        }
      });
      
      if (result && result.success) {
        msgDiv.textContent = 'Theme applied!';
        msgDiv.style.color = 'green';
      } else {
        throw new Error(result?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error applying theme:', error);
      msgDiv.textContent = 'Error: ' + (error.message || 'Unknown error');
      msgDiv.style.color = 'red';
    }
  });
  
  // Options button
  optionsBtn.addEventListener('click', function() {
    browser.runtime.openOptionsPage();
  });
});

// For browsers where DOMContentLoaded might have already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  console.log('Document already interactive/complete, running script immediately');
  // The event listener above should still run asynchronously
}