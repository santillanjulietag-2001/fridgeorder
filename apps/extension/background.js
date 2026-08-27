chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-product') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PRODUCT' }, async (res) => {
    if (!res?.ok) return;
    const { apiUrl, accessToken } = await chrome.storage.local.get(['apiUrl', 'accessToken']);
    if (!apiUrl || !accessToken) return;
    await fetch(`${apiUrl}/ingest/product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(res.product),
    });
  });
});
