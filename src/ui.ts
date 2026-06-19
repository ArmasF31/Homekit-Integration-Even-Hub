import { HomeKitAPI, RoomState } from './homekit-api';

let bridge: any = null;

// DOM Elements
const bridgeUrlInput = document.getElementById('bridge-url') as HTMLInputElement;
const bridgeTokenInput = document.getElementById('bridge-token') as HTMLInputElement;
const btnTest = document.getElementById('btn-test') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const connectionStatus = document.getElementById('connection-status') as HTMLDivElement;

// Initialize Even App Bridge & Load Settings
export async function initUi(appBridge: any) {
  bridge = appBridge;
  console.log('Even App Bridge initialized in UI module.');

  let url = localStorage.getItem('bridge_url') || '';
  let token = localStorage.getItem('bridge_token') || '';

  if (url === 'null' || url === 'undefined') url = '';
  if (token === 'null' || token === 'undefined') token = '';

  try {
    if (bridge) {
      if (!url) {
        const bUrl = await bridge.getLocalStorage('bridge_url');
        url = (bUrl && bUrl !== 'null' && bUrl !== 'undefined') ? bUrl : '';
      }
      if (!token) {
        const bToken = await bridge.getLocalStorage('bridge_token');
        token = (bToken && bToken !== 'null' && bToken !== 'undefined') ? bToken : '';
      }
    }
  } catch (error) {
    console.error('Bridge load failed:', error);
  }

  bridgeUrlInput.value = url;
  bridgeTokenInput.value = token;
  
  if (url && token) {
    localStorage.setItem('bridge_url', url);
    localStorage.setItem('bridge_token', token);
    updateStatusBadge('neutral', 'Configured (Unverified)');
    testConnection(url, token);
  }
}

function updateStatusBadge(type: 'neutral' | 'success' | 'error', text: string) {
  connectionStatus.className = `badge badge-${type}`;
  connectionStatus.innerText = `Status: ${text}`;
}

async function testConnection(url: string, token: string) {
  updateStatusBadge('neutral', 'Testing...');
  if (!url || !token) {
    updateStatusBadge('error', 'Bridge URL and Access Token are required.');
    return;
  }
  
  const api = new HomeKitAPI({ url, token });
  const ok = await api.testConnection();
  if (ok) {
    updateStatusBadge('success', 'Connected to HomeKit Bridge');
  } else {
    updateStatusBadge('error', 'Connection failed (check CORS or credentials)');
  }
}

async function saveConfig() {
  const url = bridgeUrlInput.value.trim();
  const token = bridgeTokenInput.value.trim();
  
  if (!url || !token) {
    alert('Please enter both HomeKit Bridge URL and Access Token.');
    return;
  }
  
  // Persist to standard HTML5 localStorage
  localStorage.setItem('bridge_url', url);
  localStorage.setItem('bridge_token', token);

  // Sync with bridge storage if available
  if (bridge) {
    try {
      await bridge.setLocalStorage('bridge_url', url);
      await bridge.setLocalStorage('bridge_token', token);
    } catch (e) {
      console.error('Failed to sync to bridge storage:', e);
    }
  }
  
  alert('Configuration saved successfully!');
  testConnection(url, token);
}

// Event Listeners
btnTest.addEventListener('click', () => testConnection(bridgeUrlInput.value.trim(), bridgeTokenInput.value.trim()));
btnSave.addEventListener('click', saveConfig);

function initDashboardOptions() {
  const toggleScenes = document.getElementById('toggle-scenes') as HTMLInputElement;
  const toggleAllLights = document.getElementById('toggle-all-lights') as HTMLInputElement;
  if (!toggleScenes || !toggleAllLights) return;

  // Load saved prefs
  toggleScenes.checked = localStorage.getItem('show_scenes') !== 'false';
  toggleAllLights.checked = localStorage.getItem('show_all_lights') !== 'false';

  function saveAndDispatch() {
    localStorage.setItem('show_scenes', String(toggleScenes.checked));
    localStorage.setItem('show_all_lights', String(toggleAllLights.checked));
    window.dispatchEvent(new CustomEvent('hk-dashboard-prefs-changed'));
  }

  toggleScenes.addEventListener('change', saveAndDispatch);
  toggleAllLights.addEventListener('change', saveAndDispatch);
}

initDashboardOptions();

export function populateAccessories(rooms: RoomState[]) {
  const container = document.getElementById('accessories-container');
  const card = document.getElementById('accessories-card');
  if (!container || !card) return;

  // Show card
  card.style.display = 'block';

  // Read current hidden accessories
  const hiddenStr = localStorage.getItem('hidden_accessories') || '[]';
  let hidden: string[] = [];
  try {
    hidden = JSON.parse(hiddenStr);
  } catch (e) {
    hidden = [];
  }

  container.innerHTML = '';

  // Get all accessories
  const allAccs: { id: string; name: string; roomName: string }[] = [];
  rooms.forEach(room => {
    room.accessories.forEach(acc => {
      allAccs.push({
        id: acc.id,
        name: acc.name,
        roomName: room.name
      });
    });
  });

  // Sort by room name, then accessory name
  allAccs.sort((a, b) => {
    const r = a.roomName.localeCompare(b.roomName);
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  });

  if (allAccs.length === 0) {
    container.innerHTML = '<div class="empty-state">No accessories found.</div>';
    return;
  }

  allAccs.forEach(acc => {
    const item = document.createElement('div');
    item.className = 'accessory-item';
    
    const checked = !hidden.includes(acc.id);
    
    item.innerHTML = `
      <input type="checkbox" class="accessory-checkbox" id="chk-${acc.id}" ${checked ? 'checked' : ''} />
      <div class="accessory-details">
        <span class="accessory-name">${acc.name}</span>
        <span class="accessory-room">${acc.roomName} • ${acc.id}</span>
      </div>
    `;

    // Toggle check when clicking the card row (except when clicking the checkbox itself which handles it)
    item.addEventListener('click', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
        // Handled by checkbox change listener
        return;
      }
      const chk = item.querySelector('.accessory-checkbox') as HTMLInputElement;
      chk.checked = !chk.checked;
      chk.dispatchEvent(new Event('change'));
    });

    const checkbox = item.querySelector('.accessory-checkbox') as HTMLInputElement;
    checkbox.addEventListener('change', async () => {
      const isVisible = checkbox.checked;
      let currentHidden: string[] = [];
      try {
        currentHidden = JSON.parse(localStorage.getItem('hidden_accessories') || '[]');
      } catch (e) {
        currentHidden = [];
      }
      
      if (!isVisible) {
        if (!currentHidden.includes(acc.id)) {
          currentHidden.push(acc.id);
        }
      } else {
        currentHidden = currentHidden.filter((id: string) => id !== acc.id);
      }
      
      const newHiddenStr = JSON.stringify(currentHidden);
      localStorage.setItem('hidden_accessories', newHiddenStr);
      if (bridge) {
        try {
          await bridge.setLocalStorage('hidden_accessories', newHiddenStr);
        } catch (e) {
          console.error(e);
        }
      }
      
      // Trigger a refresh of the dashboard to update the display on the glasses instantly
      window.dispatchEvent(new CustomEvent('hk-accessories-changed'));
    });

    container.appendChild(item);
  });
}
