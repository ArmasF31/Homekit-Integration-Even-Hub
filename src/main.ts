import { initUi, populateAccessories } from './ui';
import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  OsEventTypeList,
  TextContainerUpgrade,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk';
import { HomeKitAPI, DashboardState, AccessoryState } from './homekit-api';

const bridge = await waitForEvenAppBridge();
await initUi(bridge);

// Navigation States
const SCREEN_DASHBOARD = 0;
const SCREEN_SCENES = 1;
const SCREEN_ROOM = 2;
const SCREEN_ACCESSORY = 3;

let currentScreen = SCREEN_DASHBOARD;
let listSelectedIndex = 0;

// HA API State
let configLoaded = false;
let bridgeUrl = '';
let bridgeToken = '';
let api: HomeKitAPI | null = null;
let dashboardData: DashboardState | null = null;

// Selected Registry Indices
let selectedRoomIndex = 0;
let selectedAccessoryIndex = 0;

// Dynamic Lists
const MAX_LIST = 20; // G2 hard limit
let activeListItems: string[] = [];
let activeAccessoryPresets: string[] = [];
let activeRoomAccessories: AccessoryState[] = [];
let hasRoomLights = false;

// Pagination state
let roomPage = 0;
let scenePage = 0;
// Indices within the current page list for special navigation items (set in rebuildActiveList)
let pageMoreIndex = -1;
let pagePrevIndex = -1;
let pageItemsOffset = 0; // index in activeListItems where accessories/scenes start on current page

// Hidden accessories caching
let cachedHiddenAccessories: string[] = [];
function loadHiddenAccessoriesCache() {
  try {
    const str = localStorage.getItem('hidden_accessories') || '[]';
    cachedHiddenAccessories = JSON.parse(str);
  } catch (e) {
    cachedHiddenAccessories = [];
  }
}
loadHiddenAccessoriesCache();

// Dashboard display preferences
let showScenes = true;
let showAllLights = true;
function loadDashboardPrefs() {
  showScenes = localStorage.getItem('show_scenes') !== 'false';
  showAllLights = localStorage.getItem('show_all_lights') !== 'false';
}
loadDashboardPrefs();

// Dynamic dashboard item indices (set in rebuildActiveList)
let dashScenesIndex = -1;
let dashAllLightsIndex = -1;
let dashRoomsOffset = 0;

// Action States
let isPerformingAction = false;
let actionStatusMessage = '';
let pollIntervalId: any = null;

// Dotted Font Matrix for 4-bit Retro HUD (using CJK full-width block '■' and full-width space '　' to guarantee monospaced grid alignment in proportional fonts)
const DOTTED_CHARS: Record<string, string[]> = {
  '0': ['■■■', '■　■', '■　■', '■　■', '■■■'],
  '1': ['　■　', '■■　', '　■　', '　■　', '■■■'],
  '2': ['■■■', '　　■', '■■■', '■　　', '■■■'],
  '3': ['■■■', '　　■', '■■■', '　　■', '■■■'],
  '4': ['■　■', '■　■', '■■■', '　　■', '　　■'],
  '5': ['■■■', '■　　', '■■■', '　　■', '■■■'],
  '6': ['■■■', '■　　', '■■■', '■　■', '■■■'],
  '7': ['■■■', '　　■', '　■　', '■　　', '■　　'],
  '8': ['■■■', '■　■', '■■■', '■　■', '■■■'],
  '9': ['■■■', '■　■', '■■■', '　　■', '■■■'],
  '°': ['■■　', '■　■', '■■　', '　　　', '　　　'],
  '%': ['■　■', '　■　', '■　■', '　　　', '　　　'],
  '-': ['　　　', '　　　', '■■■', '　　　', '　　　'],
  'O': ['■■■', '■　■', '■　■', '■　■', '■■■'],
  'N': ['■　■', '■■■', '■■■', '■　■', '■　■'],
  'F': ['■■■', '■　　', '■■　', '■　　', '■　　'],
  'L': ['■　　', '■　　', '■　　', '■　　', '■■■'],
  'K': ['■　■', '■■　', '■■　', '■　■', '■　■'],
  'D': ['■■　', '■　■', '■　■', '■　■', '■■　'],
  'U': ['■　■', '■　■', '■　■', '■　■', '■■■'],
  'P': ['■■■', '■　■', '■■■', '■　　', '■　　'],
  'C': ['■■■', '■　　', '■　　', '■　　', '■■■'],
  'E': ['■■■', '■　　', '■■　', '■　　', '■■■'],
  'R': ['■■■', '■　■', '■■■', '■■　', '■　■'],
  'S': ['■■■', '■　　', '■■■', '　　■', '■■■'],
  'A': ['■■■', '■　■', '■■■', '■　■', '■　■'],
  'T': ['■■■', '　■　', '　■　', '　■　', '　■　'],
  'G': ['■■■', '■　　', '■　■', '■　■', '■■■'],
  ' ': ['　　　', '　　　', '　　　', '　　　', '　　　']
};

function renderBigText(text: string): string {
  const cleanText = text.toUpperCase();
  const lines = ['', '', '', '', ''];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < cleanText.length; j++) {
      const char = cleanText[j];
      const charLines = DOTTED_CHARS[char] || DOTTED_CHARS[' '];
      lines[i] += charLines[i];
      if (j < cleanText.length - 1) {
        lines[i] += '　';
      }
    }
  }
  return lines.join('\n');
}

// Write Lock Queue to serialize BLE rebuilds
let writeChain = Promise.resolve();
function rebuildPageWithLists(listItems: string[], rightContent: string) {
  writeChain = writeChain.then(async () => {
    try {
      const leftPanel = new ListContainerProperty({
        xPosition: 0,
        yPosition: 10,
        width: 280,
        height: 268,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 0,
        containerID: 1,
        containerName: 'left',
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: listItems.length,
          itemWidth: 280,
          isItemSelectBorderEn: 1,
          itemName: listItems,
        })
      });

      const rightPanel = new TextContainerProperty({
        xPosition: 296,
        yPosition: 10,
        width: 280,
        height: 268,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 0,
        containerID: 2,
        containerName: 'right',
        content: rightContent || ' ',
        isEventCapture: 0,
      });

      await bridge.rebuildPageContainer(new RebuildPageContainer({
        containerTotalNum: 2,
        listObject: [leftPanel],
        textObject: [rightPanel]
      }));
    } catch (err) {
      console.error('Error rebuilding page container:', err);
    }
  });
}

function queueRightPanelUpdate(content: string) {
  writeChain = writeChain.then(async () => {
    try {
      await bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: 2,
        content: content || ' '
      }));
    } catch (err) {
      console.error('Error upgrading right panel container:', err);
    }
  });
}

// Build list arrays dynamically based on navigation state
function rebuildActiveList() {
  if (!dashboardData) {
    activeListItems = ['Loading dashboard...'];
    return;
  }

  // Reset pagination item markers
  pageMoreIndex = -1;
  pagePrevIndex = -1;
  pageItemsOffset = 1; // default: items start after '< Back'

  if (currentScreen === SCREEN_DASHBOARD) {
    activeListItems = [];
    let idx = 0;
    dashScenesIndex = -1;
    dashAllLightsIndex = -1;
    if (showScenes) { dashScenesIndex = idx++; activeListItems.push('Scenes >'); }
    if (showAllLights) { dashAllLightsIndex = idx++; activeListItems.push('All Lights >'); }
    dashRoomsOffset = idx;
    // Dashboard rooms are unlikely to exceed 20, but cap just in case
    const rooms = dashboardData.rooms.map(r => `${r.name} >`);
    activeListItems.push(...rooms.slice(0, MAX_LIST - idx));
  } else if (currentScreen === SCREEN_SCENES) {
    // Paginate scenes: 1 Back + up to 17 scenes + optional Prev/More
    const allScenes = dashboardData.scenes;
    const pageSize = MAX_LIST - 2; // reserve Back + possible More/Prev
    const start = scenePage * pageSize;
    const pageScenes = allScenes.slice(start, start + pageSize);
    const hasMore = allScenes.length > start + pageSize;
    const hasPrev = scenePage > 0;

    activeListItems = ['< Back'];
    if (hasPrev) { pagePrevIndex = activeListItems.length; activeListItems.push('< Prev Page'); }
    pageItemsOffset = activeListItems.length;
    activeListItems.push(...pageScenes.map(s => s.name));
    if (hasMore) { pageMoreIndex = activeListItems.length; activeListItems.push('More >'); }
  } else if (currentScreen === SCREEN_ROOM) {
    const room = dashboardData.rooms[selectedRoomIndex];
    activeRoomAccessories = room.accessories.filter(a => !cachedHiddenAccessories.includes(a.id));
    hasRoomLights = activeRoomAccessories.some(a => a.domain === 'light');

    // Calculate slots: Back(1) + ToggleLights(0/1) + Prev(0/1) + items + More(0/1) <= 20
    const fixedSlots = 1 + (hasRoomLights && roomPage === 0 ? 1 : 0);
    const pageSize = MAX_LIST - fixedSlots - 1; // reserve 1 for More/Prev nav
    const start = roomPage * pageSize;
    const pageAccs = activeRoomAccessories.slice(start, start + pageSize);
    const hasMore = activeRoomAccessories.length > start + pageSize;
    const hasPrev = roomPage > 0;

    activeListItems = ['< Back'];
    if (hasRoomLights && roomPage === 0) activeListItems.push('Toggle All Lights');
    if (hasPrev) { pagePrevIndex = activeListItems.length; activeListItems.push('< Prev Page'); }
    pageItemsOffset = activeListItems.length;
    activeListItems.push(...pageAccs.map(a => a.name));
    if (hasMore) { pageMoreIndex = activeListItems.length; activeListItems.push('More >'); }
  } else if (currentScreen === SCREEN_ACCESSORY) {
    const acc = activeRoomAccessories[selectedAccessoryIndex];
    activeAccessoryPresets = ['< Back'];

    if (acc.domain === 'light') {
      activeAccessoryPresets.push('Toggle Power', 'Preset 25%', 'Preset 50%', 'Preset 75%', 'Preset 100%');
    } else if (acc.domain === 'climate') {
      activeAccessoryPresets.push('Toggle Power', 'Temp 18°C', 'Temp 20°C', 'Temp 22°C', 'Temp 24°C', 'Temp 26°C');
    } else if (acc.domain === 'fan') {
      activeAccessoryPresets.push('Toggle Power', 'Speed Low', 'Speed Medium', 'Speed High');
    } else if (acc.domain === 'cover') {
      activeAccessoryPresets.push('Open', 'Close', 'Stop');
    } else if (acc.domain === 'lock') {
      activeAccessoryPresets.push('Lock', 'Unlock');
    } else {
      activeAccessoryPresets.push('Toggle Power');
    }
    activeListItems = activeAccessoryPresets;
  }
}

// Generate the Right Container Details View
function getRightPanelContent(): string {
  if (!dashboardData) {
    return 'Connecting to\nHomeKit Bridge...';
  }

  if (currentScreen === SCREEN_DASHBOARD) {
    const visibleAccsCount = dashboardData.rooms.reduce((sum, room) => {
      return sum + room.accessories.filter(a => !cachedHiddenAccessories.includes(a.id)).length;
    }, 0);
    const bigTemp = renderBigText(`${dashboardData.average_temp}°`);
    return `HOME\n\n${bigTemp}\n\n${dashboardData.total_rooms} rooms\n${visibleAccsCount} accessories\n${dashboardData.total_offline} offline\n${dashboardData.total_scenes} scenes`;
  }

  if (currentScreen === SCREEN_SCENES) {
    return `   SCENES\n\nTap any scene\nto activate it.\n\nAll scenes\nsynced from\nHomeKit Bridge.`;
  }

  if (currentScreen === SCREEN_ROOM) {
    const room = dashboardData.rooms[selectedRoomIndex];
    const visibleRoomAccs = room.accessories.filter(a => !cachedHiddenAccessories.includes(a.id));
    return `   ${room.name.toUpperCase()}\n\nTemp: ${room.temp}°\nHumidity: ${room.humidity}%\n\n${visibleRoomAccs.length} devices`;
  }

  if (currentScreen === SCREEN_ACCESSORY) {
    const acc = activeRoomAccessories[selectedAccessoryIndex];
    
    // Get state details
    let stateVal = acc.state.toUpperCase();
    if (isPerformingAction) {
      stateVal = actionStatusMessage ? actionStatusMessage.toUpperCase() : 'PENDING';
    } else {
      if (acc.domain === 'light' && acc.state === 'on' && acc.brightness !== null) {
        const pct = Math.round((acc.brightness / 255) * 100);
        stateVal = pct === 100 ? '100' : `${pct}%`;
      } else if (acc.domain === 'climate') {
        const target = acc.target_temp !== null ? `${acc.target_temp}°` : 'OFF';
        const curr = acc.current_temp !== null ? `(${acc.current_temp}°)` : '';
        stateVal = `${target}\n${curr}`;
      } else if (acc.domain === 'fan' && acc.state === 'on' && acc.speed_pct !== null) {
        const pct = acc.speed_pct;
        stateVal = pct === 100 ? '100' : `${pct}%`;
      } else if (acc.domain === 'cover') {
        if (acc.position !== null) {
          stateVal = acc.position === 100 ? '100' : `${acc.position}%`;
        } else {
          stateVal = acc.state === 'open' ? 'OPN' : 'CLS';
        }
      } else if (acc.domain === 'lock') {
        stateVal = acc.state === 'locked' ? 'LKD' : 'UNL';
      }
    }

    // Format & cap displayState to exactly 3 characters max to prevent wrapping
    let displayState = stateVal.split('\n')[0];
    if (displayState.length > 3) {
      if (displayState === 'UNAVAILABLE') displayState = 'UNA';
      else if (displayState === 'UNKNOWN') displayState = 'UNK';
      else if (displayState === 'SENDING') displayState = 'SND';
      else if (displayState === 'PENDING') displayState = 'PND';
      else if (displayState === 'ERROR') displayState = 'ERR';
      else displayState = displayState.slice(0, 3);
    }

    const nameHeader = acc.name.length > 18 ? acc.name.slice(0, 16) + '..' : acc.name;
    const bigState = renderBigText(displayState);
    const extraInfo = stateVal.includes('\n') ? stateVal.split('\n')[1] : '';

    return `${nameHeader.toUpperCase()}\n\n${bigState}\n${extraInfo}`;
  }

  return '';
}

// Update both Left and Right panels
// Update both Left and Right panels
function updateDisplay(onlyRight = false) {
  if (!configLoaded) {
    rebuildPageWithLists(
      ['HomeKit Bridge', 'Not Configured'],
      'HomeKit Bridge\nNot Configured\n\nOpen companion\napp on phone to\nenter credentials'
    );
    return;
  }
  
  if (onlyRight) {
    queueRightPanelUpdate(getRightPanelContent());
    return;
  }
  
  rebuildActiveList();
  listSelectedIndex = 0; // Reset select index to 0 whenever we rebuild the list
  rebuildPageWithLists(activeListItems, getRightPanelContent());
}

// Fetch the complete HomeKit Bridge dashboard state
async function refreshDashboard() {
  if (!api) return;
  const isFirstLoad = !dashboardData;
  if (isFirstLoad) {
    updateDisplay();
  }
  const data = await api.fetchFullDashboardState();
  if (data) {
    dashboardData = data;
    // Populate the accessories list in the companion app UI
    populateAccessories(data.rooms);
    // Perform a full display rebuild on first load to populate the rooms/scenes list;
    // otherwise, perform right-panel-only updates to preserve list scroll selection.
    updateDisplay(!isFirstLoad);
  } else {
    updateDisplay(true);
  }
}

// Perform active preset/toggle action on accessory
async function triggerAccessoryControl() {
  if (!api || isPerformingAction) return;

  const acc = activeRoomAccessories[selectedAccessoryIndex];
  const choice = activeAccessoryPresets[listSelectedIndex];
  
  console.log(`[ACTION] listSelectedIndex=${listSelectedIndex} choice="${choice}" acc=${acc?.id} domain=${acc?.domain}`);

  // Back is always index 0; also match string as fallback
  if (listSelectedIndex === 0 || choice === '< Back') {
    goBack();
    return;
  }

  if (!choice) {
    console.warn('[ACTION] No choice found for index', listSelectedIndex);
    return;
  }

  isPerformingAction = true;
  actionStatusMessage = 'Sending';
  updateDisplay(true);

  let ok = false;
  
  // Compile API Action Mapping
  if (choice === 'Toggle Power') {
    ok = await api.controlAccessory(acc.id, acc.domain, 'toggle');
    if (ok) {
      // Optimistically flip state so display updates instantly after DON clears
      acc.state = acc.state === 'on' ? 'off' : 'on';
      if (acc.state === 'off') acc.brightness = null;
    }
  } else if (choice.startsWith('Preset ')) {
    const pct = choice.split(' ')[1].replace('%', '');
    ok = await api.controlAccessory(acc.id, acc.domain, `pct_${pct}`);
    if (ok) acc.brightness = Math.round((parseInt(pct, 10) / 100) * 255);
  } else if (choice.startsWith('Temp ')) {
    const temp = choice.split(' ')[1].replace('°C', '');
    ok = await api.controlAccessory(acc.id, acc.domain, `temp_${temp}`);
    if (ok) acc.target_temp = parseInt(temp, 10);
  } else if (choice.startsWith('Speed ')) {
    const speed = choice.split(' ')[1].toLowerCase();
    ok = await api.controlAccessory(acc.id, acc.domain, `speed_${speed}`);
  } else if (choice === 'Open' || choice === 'Close' || choice === 'Stop') {
    // Optimistic Cover Updates
    ok = await api.controlAccessory(acc.id, acc.domain, choice.toLowerCase());
    if (ok) {
      if (choice === 'Open') acc.state = 'open';
      if (choice === 'Close') acc.state = 'closed';
    }
  } else if (choice === 'Lock' || choice === 'Unlock') {
    ok = await api.controlAccessory(acc.id, acc.domain, choice.toLowerCase());
    if (ok) acc.state = choice === 'Lock' ? 'locked' : 'unlocked';
  }

  console.log(`[ACTION] Result: ok=${ok}`);

  if (ok) {
    actionStatusMessage = 'Done';
    updateDisplay(true);
    setTimeout(async () => {
      isPerformingAction = false;
      actionStatusMessage = '';
      await refreshDashboard();
    }, 1000);
  } else {
    actionStatusMessage = 'Error';
    updateDisplay(true);
    setTimeout(() => {
      isPerformingAction = false;
      actionStatusMessage = '';
      updateDisplay(true);
    }, 1500);
  }
}

// Single Tap selection logic
async function handleSelect() {
  if (!dashboardData) return;

  if (currentScreen === SCREEN_DASHBOARD) {
    if (dashScenesIndex >= 0 && listSelectedIndex === dashScenesIndex) {
      scenePage = 0;
      currentScreen = SCREEN_SCENES;
      listSelectedIndex = 0;
      updateDisplay();
    } else if (dashAllLightsIndex >= 0 && listSelectedIndex === dashAllLightsIndex) {
      // Toggle all lights globally
      isPerformingAction = true;
      updateDisplay();
      if (api) await api.toggleAllLightsGlobal();
      isPerformingAction = false;
      await refreshDashboard();
    } else {
      selectedRoomIndex = listSelectedIndex - dashRoomsOffset;
      roomPage = 0;
      currentScreen = SCREEN_ROOM;
      listSelectedIndex = 0;
      updateDisplay();
    }
  } else if (currentScreen === SCREEN_SCENES) {
    if (listSelectedIndex === 0) {
      goBack();
    } else if (pageMoreIndex >= 0 && listSelectedIndex === pageMoreIndex) {
      scenePage++;
      listSelectedIndex = 0;
      updateDisplay();
    } else if (pagePrevIndex >= 0 && listSelectedIndex === pagePrevIndex) {
      scenePage--;
      listSelectedIndex = 0;
      updateDisplay();
    } else {
      const pageSize = MAX_LIST - 2;
      const globalIdx = scenePage * pageSize + (listSelectedIndex - pageItemsOffset);
      const scene = dashboardData.scenes[globalIdx];
      if (!scene) return;
      isPerformingAction = true;
      updateDisplay();
      if (api) await api.fireScene(scene.id);
      isPerformingAction = false;
      goBack();
    }
  } else if (currentScreen === SCREEN_ROOM) {
    if (listSelectedIndex === 0) {
      goBack();
    } else if (pageMoreIndex >= 0 && listSelectedIndex === pageMoreIndex) {
      roomPage++;
      listSelectedIndex = 0;
      updateDisplay();
    } else if (pagePrevIndex >= 0 && listSelectedIndex === pagePrevIndex) {
      roomPage--;
      listSelectedIndex = 0;
      updateDisplay();
    } else if (hasRoomLights && roomPage === 0 && listSelectedIndex === 1) {
      // Toggle all lights in area
      const room = dashboardData.rooms[selectedRoomIndex];
      isPerformingAction = true;
      updateDisplay();
      if (api) await api.toggleAreaLights(room.id);
      isPerformingAction = false;
      await refreshDashboard();
    } else {
      const fixedSlots = 1 + (hasRoomLights && roomPage === 0 ? 1 : 0);
      const pageSize = MAX_LIST - fixedSlots - 1;
      const globalIdx = roomPage * pageSize + (listSelectedIndex - pageItemsOffset);
      selectedAccessoryIndex = globalIdx;
      currentScreen = SCREEN_ACCESSORY;
      listSelectedIndex = 0;
      updateDisplay();
    }
  } else if (currentScreen === SCREEN_ACCESSORY) {
    await triggerAccessoryControl();
  }
}

// Double Tap exit or return logic
function goBack() {
  if (currentScreen === SCREEN_DASHBOARD) {
    stopPolling();
    bridge.shutDownPageContainer(1);
    return;
  }

  if (currentScreen === SCREEN_SCENES) {
    scenePage = 0;
    currentScreen = SCREEN_DASHBOARD;
    listSelectedIndex = dashScenesIndex >= 0 ? dashScenesIndex : 0;
  } else if (currentScreen === SCREEN_ROOM) {
    roomPage = 0;
    currentScreen = SCREEN_DASHBOARD;
    listSelectedIndex = selectedRoomIndex + dashRoomsOffset;
  } else if (currentScreen === SCREEN_ACCESSORY) {
    currentScreen = SCREEN_ROOM;
    // Restore selection to the page/position the accessory was on
    const fixedSlots = 1 + (hasRoomLights && roomPage === 0 ? 1 : 0);
    const pageSize = MAX_LIST - fixedSlots - 1;
    const posInPage = selectedAccessoryIndex - roomPage * pageSize;
    listSelectedIndex = pageItemsOffset + posInPage;
  }
  updateDisplay();
}

// Setup background polling
function startPolling() {
  stopPolling();
  refreshDashboard();
  pollIntervalId = setInterval(() => {
    refreshDashboard();
  }, 6000);
}

function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

// Load configurations from Bridge LocalStorage
async function loadConfig(): Promise<boolean> {
  try {
    let url = localStorage.getItem('bridge_url') || '';
    let token = localStorage.getItem('bridge_token') || '';
    
    if (url === 'null' || url === 'undefined') url = '';
    if (token === 'null' || token === 'undefined') token = '';
    
    // Fallback to bridge
    if (!url && bridge) {
      const bUrl = await bridge.getLocalStorage('bridge_url');
      url = (bUrl && bUrl !== 'null' && bUrl !== 'undefined') ? bUrl : '';
    }
    if (!token && bridge) {
      const bToken = await bridge.getLocalStorage('bridge_token');
      token = (bToken && bToken !== 'null' && bToken !== 'undefined') ? bToken : '';
    }
    
    if (url && token) {
      localStorage.setItem('bridge_url', url);
      localStorage.setItem('bridge_token', token);
      bridgeUrl = url;
      bridgeToken = token;
      api = new HomeKitAPI({ url: bridgeUrl, token: bridgeToken });
      configLoaded = true;
      return true;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  configLoaded = false;
  return false;
}

// Initialize G2 split screen text containers
async function initGlasses() {
  const loaded = await loadConfig();

  // Left scrollable list panel (handles event capture)
  const leftPanel = new ListContainerProperty({
    xPosition: 0,
    yPosition: 10,
    width: 280,
    height: 268,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 0,
    containerID: 1,
    containerName: 'left',
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: loaded ? 1 : 2,
      itemWidth: 280,
      isItemSelectBorderEn: 1,
      itemName: loaded ? ['Loading list...'] : ['HomeKit Bridge', 'Not Configured'],
    })
  });

  // Right details and dotted-state panel
  const rightPanel = new TextContainerProperty({
    xPosition: 296,
    yPosition: 10,
    width: 280,
    height: 268,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 0,
    containerID: 2,
    containerName: 'right',
    content: loaded ? 'Connecting...' : 'Setup via phone',
    isEventCapture: 0,
  });

  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 2,
      listObject: [leftPanel],
      textObject: [rightPanel],
    })
  );

  console.log('Split-screen page initialization:', result === 0 ? 'success' : `failed (${result})`);

  if (loaded) {
    startPolling();
  } else {
    // Poll storage until companion app finishes credential entry
    const checkConfigInterval = setInterval(async () => {
      const isOk = await loadConfig();
      if (isOk) {
        clearInterval(checkConfigInterval);
        updateDisplay();
        startPolling();
      }
    }, 2000);
  }
}

// Execute setup
await initGlasses();

// Helper to resolve event types dynamically from numbers, strings, or nested objects
function resolveEventType(event: any): number | null {
  const raw =
    event.listEvent?.eventType ??
    event.textEvent?.eventType ??
    event.sysEvent?.eventType ??
    event.jsonData?.eventType ??
    event.jsonData?.event_type ??
    event.jsonData?.Event_Type ??
    event.jsonData?.type;

  if (raw === undefined || raw === null) {
    if (event.listEvent || event.textEvent || event.sysEvent) {
      return OsEventTypeList.CLICK_EVENT;
    }
    return null;
  }

  if (typeof raw === 'number') {
    return raw;
  }

  if (typeof raw === 'string') {
    const v = raw.toUpperCase();
    if (v.includes('DOUBLE')) return OsEventTypeList.DOUBLE_CLICK_EVENT;
    if (v.includes('CLICK')) return OsEventTypeList.CLICK_EVENT;
    if (v.includes('SCROLL_TOP') || v.includes('UP')) return OsEventTypeList.SCROLL_TOP_EVENT;
    if (v.includes('SCROLL_BOTTOM') || v.includes('DOWN')) return OsEventTypeList.SCROLL_BOTTOM_EVENT;
  }

  return null;
}

// Event dispatch router
const unsubscribe = bridge.onEvenHubEvent(async (event: any) => {
  const eventType = resolveEventType(event);
  console.log('[EVENT] raw:', JSON.stringify(event), 'resolved type:', eventType, 'listSelectedIndex before:', listSelectedIndex);

  // Always update index from any listEvent that contains currentSelectItemIndex.
  // KNOWN SDK BUG: When index 0 (first item) is selected, the SDK may send 'undefined'
  // instead of 0 due to JSON null-normalization. We handle this by treating undefined
  // from a click event as index 0.
  if (event.listEvent) {
    const idx = event.listEvent.currentSelectItemIndex;
    if (idx !== undefined && idx !== null) {
      listSelectedIndex = Number(idx);
      console.log('[EVENT] listSelectedIndex updated to:', listSelectedIndex);
    } else if (eventType === OsEventTypeList.CLICK_EVENT) {
      // SDK sends undefined when index 0 is clicked — treat as 0
      listSelectedIndex = 0;
      console.log('[EVENT] listSelectedIndex defaulted to 0 (SDK null-normalization quirk)');
    }
  }

  // Double tap -> Back / Exit
  if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    goBack();
    return;
  }

  // System Exit confirmation cleanup
  if (eventType === OsEventTypeList.SYSTEM_EXIT_EVENT || eventType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    stopPolling();
    unsubscribe();
    return;
  }

  // Single Click -> Select item (triggers navigation flow)
  if (eventType === OsEventTypeList.CLICK_EVENT) {
    await handleSelect();
  }
});

window.addEventListener('hk-accessories-changed', () => {
  loadHiddenAccessoriesCache();
  // If we are on the dashboard or room screen, we must rebuild the list to reflect additions/removals
  if (currentScreen === SCREEN_DASHBOARD || currentScreen === SCREEN_ROOM) {
    // Rebuild active items list and rebuild the G2 list container
    rebuildActiveList();
    // Keep selection clamped to new bounds
    if (listSelectedIndex >= activeListItems.length) {
      listSelectedIndex = Math.max(0, activeListItems.length - 1);
    }
    rebuildPageWithLists(activeListItems, getRightPanelContent());
  } else {
    // Otherwise just update the right details panel
    updateDisplay(true);
  }
});

window.addEventListener('hk-dashboard-prefs-changed', () => {
  loadDashboardPrefs();
  if (currentScreen === SCREEN_DASHBOARD) {
    rebuildActiveList();
    if (listSelectedIndex >= activeListItems.length) {
      listSelectedIndex = Math.max(0, activeListItems.length - 1);
    }
    rebuildPageWithLists(activeListItems, getRightPanelContent());
  }
});
