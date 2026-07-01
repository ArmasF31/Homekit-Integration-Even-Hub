import { HomeKitAPI, RoomState } from './homekit-api';

let bridge: any = null;

const SHOW_SCENES_KEY = 'show_scenes';
const SHOW_ALL_LIGHTS_KEY = 'show_all_lights';
const HIDDEN_ACCESSORIES_KEY = 'hidden_accessories';
const FAVORITE_LIGHTS_KEY = 'favorite_light_ids';

// DOM Elements
const bridgeUrlInput = document.getElementById('bridge-url') as HTMLInputElement;
const bridgeTokenInput = document.getElementById('bridge-token') as HTMLInputElement;
const btnTest = document.getElementById('btn-test') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const connectionStatus = document.getElementById('connection-status') as HTMLDivElement;

function isStoredValue(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== 'null' && value !== 'undefined';
}

async function getStoredValue(key: string): Promise<string | null> {
  let value = localStorage.getItem(key);
  try {
    if (bridge) {
      const bridgeValue = await bridge.getLocalStorage(key);
      if (isStoredValue(bridgeValue)) value = bridgeValue;
    }
  } catch (error) {
    console.warn(`Failed to load ${key} from bridge storage:`, error);
  }
  return isStoredValue(value) ? value : null;
}

async function setStoredValue(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
  if (!bridge) return;
  try {
    await bridge.setLocalStorage(key, value);
  } catch (error) {
    console.error(`Failed to sync ${key} to bridge storage:`, error);
  }
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function getStoredStringArray(key: string): Promise<string[]> {
  const value = await getStoredValue(key);
  const parsed = parseStringArray(value);
  localStorage.setItem(key, JSON.stringify(parsed));
  return parsed;
}

async function setStoredStringArray(key: string, values: string[]): Promise<void> {
  const unique = Array.from(new Set(values));
  await setStoredValue(key, JSON.stringify(unique));
}

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
  await initDashboardOptions();
  
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
  
  let formattedUrl = url;
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = 'http://' + formattedUrl;
  }
  
  const api = new HomeKitAPI({ url: formattedUrl, token });
  const ok = await api.testConnection();
  if (ok) {
    updateStatusBadge('success', 'Connected to HomeKit Bridge');
  } else {
    updateStatusBadge('error', 'Connection failed (check CORS or credentials)');
  }
}

async function saveConfig() {
  let url = bridgeUrlInput.value.trim();
  const token = bridgeTokenInput.value.trim();
  
  if (!url || !token) {
    alert('Please enter both HomeKit Bridge URL and Access Token.');
    return;
  }
  
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
    bridgeUrlInput.value = url;
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

let dashboardOptionsBound = false;

async function initDashboardOptions() {
  const toggleScenes = document.getElementById('toggle-scenes') as HTMLInputElement;
  const toggleAllLights = document.getElementById('toggle-all-lights') as HTMLInputElement;
  if (!toggleScenes || !toggleAllLights) return;

  const savedScenes = await getStoredValue(SHOW_SCENES_KEY);
  const savedAllLights = await getStoredValue(SHOW_ALL_LIGHTS_KEY);
  toggleScenes.checked = savedScenes !== 'false';
  toggleAllLights.checked = savedAllLights !== 'false';
  localStorage.setItem(SHOW_SCENES_KEY, String(toggleScenes.checked));
  localStorage.setItem(SHOW_ALL_LIGHTS_KEY, String(toggleAllLights.checked));

  async function saveAndDispatch() {
    await setStoredValue(SHOW_SCENES_KEY, String(toggleScenes.checked));
    await setStoredValue(SHOW_ALL_LIGHTS_KEY, String(toggleAllLights.checked));
    window.dispatchEvent(new CustomEvent('hk-dashboard-prefs-changed'));
  }

  if (dashboardOptionsBound) return;
  dashboardOptionsBound = true;
  toggleScenes.addEventListener('change', saveAndDispatch);
  toggleAllLights.addEventListener('change', saveAndDispatch);
}

export async function populateAccessories(rooms: RoomState[]) {
  const container = document.getElementById('accessories-container');
  const card = document.getElementById('accessories-card');
  if (!container || !card) return;

  // Show card
  card.style.display = 'block';

  let hidden = await getStoredStringArray(HIDDEN_ACCESSORIES_KEY);
  let favoriteLights = await getStoredStringArray(FAVORITE_LIGHTS_KEY);

  container.innerHTML = '';

  // Get all accessories
  const allAccs: { id: string; name: string; roomName: string; domain: string }[] = [];
  rooms.forEach(room => {
    room.accessories.forEach(acc => {
      allAccs.push({
        id: acc.id,
        name: acc.name,
        roomName: room.name,
        domain: acc.domain
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
    const canFavorite = acc.domain === 'light';
    const isFavorite = favoriteLights.includes(acc.id);
    
    item.innerHTML = `
      <input type="checkbox" class="accessory-checkbox visibility-checkbox" ${checked ? 'checked' : ''} />
      <div class="accessory-details">
        <span class="accessory-name">${acc.name}</span>
        <span class="accessory-room">${acc.roomName} • ${acc.id}</span>
      </div>
      <button type="button" class="favorite-toggle ${isFavorite ? 'active' : ''}" ${canFavorite ? '' : 'disabled'} aria-label="Toggle favorite light" title="${canFavorite ? 'Pin light to G2 home list' : 'Favorites are only available for lights'}">
        ★
      </button>
    `;

    // Toggle check when clicking the card row (except when clicking the checkbox itself which handles it)
    item.addEventListener('click', (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLButtonElement
      ) {
        // Handled by checkbox change listener
        return;
      }
      const chk = item.querySelector('.visibility-checkbox') as HTMLInputElement;
      chk.checked = !chk.checked;
      chk.dispatchEvent(new Event('change'));
    });

    const favoriteButton = item.querySelector('.favorite-toggle') as HTMLButtonElement;
    favoriteButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!canFavorite) return;

      favoriteLights = await getStoredStringArray(FAVORITE_LIGHTS_KEY);
      if (favoriteLights.includes(acc.id)) {
        favoriteLights = favoriteLights.filter(id => id !== acc.id);
        favoriteButton.classList.remove('active');
      } else {
        favoriteLights.push(acc.id);
        favoriteButton.classList.add('active');
      }

      await setStoredStringArray(FAVORITE_LIGHTS_KEY, favoriteLights);
      window.dispatchEvent(new CustomEvent('hk-favorites-changed'));
    });

    const checkbox = item.querySelector('.visibility-checkbox') as HTMLInputElement;
    checkbox.addEventListener('change', async () => {
      const isVisible = checkbox.checked;
      let currentHidden = await getStoredStringArray(HIDDEN_ACCESSORIES_KEY);
      
      if (!isVisible) {
        if (!currentHidden.includes(acc.id)) {
          currentHidden.push(acc.id);
        }

        if (favoriteLights.includes(acc.id)) {
          favoriteLights = favoriteLights.filter(id => id !== acc.id);
          await setStoredStringArray(FAVORITE_LIGHTS_KEY, favoriteLights);
          favoriteButton.classList.remove('active');
        }
      } else {
        currentHidden = currentHidden.filter((id: string) => id !== acc.id);
      }
      
      hidden = currentHidden;
      await setStoredStringArray(HIDDEN_ACCESSORIES_KEY, currentHidden);
      
      // Trigger a refresh of the dashboard to update the display on the glasses instantly
      window.dispatchEvent(new CustomEvent('hk-accessories-changed'));
    });

    container.appendChild(item);
  });
}
