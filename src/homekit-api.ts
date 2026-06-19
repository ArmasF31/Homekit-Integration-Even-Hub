export interface HomeKitConfig {
  url: string;
  token: string;
}

export interface AccessoryState {
  id: string;
  name: string;
  state: string;
  domain: string;
  brightness: number | null;
  target_temp: number | null;
  current_temp: number | null;
  speed_pct: number | null;
  position: number | null;
}

export interface RoomState {
  id: string;
  name: string;
  temp: number;
  humidity: number;
  accessories: AccessoryState[];
}

export interface SceneState {
  id: string;
  name: string;
}

export interface DashboardState {
  average_temp: number;
  total_rooms: number;
  total_scenes: number;
  total_offline: number;
  total_accessories: number;
  scenes: SceneState[];
  rooms: RoomState[];
}

export class HomeKitAPI {
  private url: string;
  private token: string;

  constructor(config: HomeKitConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.token = config.token;
  }

  private getHeaders(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Test the connection to HomeKit Bridge API.
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/`, {
        method: 'GET',
        headers: this.getHeaders(),
        mode: 'cors'
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.message === 'API running.';
    } catch (error) {
      console.error('HomeKit Bridge connection failed:', error);
      return false;
    }
  }

  /**
   * Fetch the full home status, areas, devices, scenes using template API.
   */
  async fetchFullDashboardState(): Promise<DashboardState | null> {
    const templateQuery = `{% set domains = ['light', 'switch', 'fan', 'climate', 'cover', 'lock'] %}
{% set acc_count = namespace(total=0) %}
{% for d in domains %}
  {% set acc_count.total = acc_count.total + states[d] | list | length %}
{% endfor %}
{% set t_all = namespace(vals=[]) %}
{% for s in states.sensor %}
  {% if 'temperature' in s.entity_id and s.state | float(none) is not none %}
    {% set t_all.vals = t_all.vals + [s.state | float] %}
  {% endif %}
{% endfor %}
{% set avg_temp = t_all.vals | average | round(0) if t_all.vals else 21 %}
{
  "average_temp": {{ avg_temp }},
  "total_rooms": {{ areas() | length }},
  "total_scenes": {{ states.scene | list | length }},
  "total_offline": {{ states | selectattr('state', 'in', ['unavailable', 'unknown']) | list | length }},
  "total_accessories": {{ acc_count.total }},
  "scenes": [
    {% for s in states.scene %}
      {
        "id": "{{ s.entity_id }}",
        "name": "{{ s.name | replace('\\\"', '\\\\\\\"') | replace('\"', '\\\"') }}"
      }{{ "," if not loop.last }}
    {% endfor %}
  ],
  "rooms": [
    {% for area in areas() %}
      {% set area_name_val = area_name(area) %}
      {% set area_entities_list = area_entities(area) %}
      {% set t_list = namespace(vals=[]) %}
      {% set h_list = namespace(vals=[]) %}
      {% for ent in area_entities_list %}
        {% set dom = ent.split('.')[0] %}
        {% if dom == 'sensor' and 'temperature' in ent %}
          {% set s = states(ent) | float(none) %}
          {% if s is not none %}{% set t_list.vals = t_list.vals + [s] %}{% endif %}
        {% elif dom == 'sensor' and 'humidity' in ent %}
          {% set s = states(ent) | float(none) %}
          {% if s is not none %}{% set h_list.vals = h_list.vals + [s] %}{% endif %}
        {% elif dom == 'climate' %}
          {% set s = state_attr(ent, 'current_temperature') | float(none) %}
          {% if s is not none %}{% set t_list.vals = t_list.vals + [s] %}{% endif %}
        {% endif %}
      {% endfor %}
      {% set area_temp = t_list.vals | average | round(0) if t_list.vals else avg_temp %}
      {% set area_hum = h_list.vals | average | round(0) if h_list.vals else 45 %}
      
      {% set acc_list = namespace(items=[]) %}
      {% for ent_id in area_entities_list %}
        {% set domain = ent_id.split('.')[0] %}
        {% if domain in domains %}
          {% set state_obj = states[ent_id] %}
          {% if state_obj %}
            {% set friendly_name = state_obj.name | replace('\\\"', '\\\\\\\"') | replace('\"', '\\\"') %}
            {% set state_val = state_obj.state %}
            
            {% set b_val = state_attr(ent_id, 'brightness') %}
            {% set brightness = b_val if b_val is not none else 'null' %}
            
            {% set t_val = state_attr(ent_id, 'temperature') or state_attr(ent_id, 'target_temp') %}
            {% set target_temp = t_val if t_val is not none else 'null' %}
            
            {% set c_val = state_attr(ent_id, 'current_temperature') %}
            {% set current_temp = c_val if c_val is not none else 'null' %}
            
            {% set s_val = state_attr(ent_id, 'percentage') %}
            {% set speed_pct = s_val if s_val is not none else 'null' %}
            
            {% set p_val = state_attr(ent_id, 'current_position') %}
            {% set position = p_val if p_val is not none else 'null' %}
            
            {% set item_str = '{\\"id\\":\\"' ~ ent_id ~ '\\",\\"name\\":\\"' ~ friendly_name ~ '\\",\\"state\\":\\"' ~ state_val ~ '\\",\\"domain\\":\\"' ~ domain ~ '\\",\\"brightness\\":' ~ brightness ~ ',\\"target_temp\\":' ~ target_temp ~ ',\\"current_temp\\":' ~ current_temp ~ ',\\"speed_pct\\":' ~ speed_pct ~ ',\\"position\\":' ~ position ~ '}' %}
            {% set acc_list.items = acc_list.items + [item_str] %}
          {% endif %}
        {% endif %}
      {% endfor %}
      
      {
        "id": "{{ area }}",
        "name": "{{ area_name_val | replace('\\\"', '\\\\\\\"') | replace('\"', '\\\"') }}",
        "temp": {{ area_temp }},
        "humidity": {{ area_hum }},
        "accessories": [
          {{ acc_list.items | join(',') }}
        ]
      }{{ "," if not loop.last }}
    {% endfor %}
  ]
}`;

    try {
      const response = await fetch(`${this.url}/api/template`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ template: templateQuery }),
        mode: 'cors'
      });
      if (!response.ok) return null;
      const text = await response.text();
      return JSON.parse(text.trim()) as DashboardState;
    } catch (error) {
      console.error('Failed to fetch full dashboard state:', error);
      return null;
    }
  }

  /**
   * Fire a scene.
   */
  async fireScene(sceneId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/services/scene/turn_on`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ entity_id: sceneId }),
        mode: 'cors'
      });
      return response.ok;
    } catch (error) {
      console.error(`Failed to fire scene ${sceneId}:`, error);
      return false;
    }
  }

  /**
   * Toggle all lights in an area.
   */
  async toggleAreaLights(areaId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/services/light/toggle`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ area_id: areaId }),
        mode: 'cors'
      });
      return response.ok;
    } catch (error) {
      console.error(`Failed to toggle lights in area ${areaId}:`, error);
      return false;
    }
  }

  /**
   * Toggle all lights globally.
   */
  async toggleAllLightsGlobal(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/services/light/toggle`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ entity_id: 'all' }),
        mode: 'cors'
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to toggle all lights globally:', error);
      return false;
    }
  }

  /**
   * Control specific accessory presets or toggle power.
   */
  async controlAccessory(entityId: string, domain: string, actionKey: string): Promise<boolean> {
    try {
      let serviceUrl = `${this.url}/api/services/${domain}`;
      let body: any = { entity_id: entityId };

      if (actionKey === 'toggle') {
        if (domain === 'climate') {
          // Climate toggle is sent directly as climate/toggle
          serviceUrl = `${this.url}/api/services/climate/toggle`;
        } else {
          serviceUrl += '/toggle';
        }
      } else if (domain === 'light') {
        if (actionKey.startsWith('pct_')) {
          const pct = parseInt(actionKey.split('_')[1], 10);
          const brightness = Math.round((pct / 100) * 255);
          serviceUrl += '/turn_on';
          body.brightness = brightness;
        } else {
          serviceUrl += '/toggle';
        }
      } else if (domain === 'climate') {
        if (actionKey.startsWith('temp_')) {
          const temp = parseInt(actionKey.split('_')[1], 10);
          serviceUrl += '/set_temperature';
          body.temperature = temp;
        }
      } else if (domain === 'fan') {
        if (actionKey.startsWith('speed_')) {
          const speed = actionKey.split('_')[1]; // low, med, high
          let pct = 33;
          if (speed === 'med') pct = 66;
          if (speed === 'high') pct = 100;
          serviceUrl += '/set_percentage';
          body.percentage = pct;
        } else {
          serviceUrl += '/toggle';
        }
      } else if (domain === 'cover') {
        if (actionKey === 'open') {
          serviceUrl += '/open_cover';
        } else if (actionKey === 'close') {
          serviceUrl += '/close_cover';
        } else if (actionKey === 'stop') {
          serviceUrl += '/stop_cover';
        }
      } else if (domain === 'lock') {
        if (actionKey === 'lock') {
          serviceUrl += '/lock';
        } else if (actionKey === 'unlock') {
          serviceUrl += '/unlock';
        }
      } else {
        serviceUrl += '/toggle';
      }

      console.log(`[API] POST ${serviceUrl}`, body);

      const response = await fetch(serviceUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        mode: 'cors'
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '(no body)');
        console.error(`[API] FAILED ${response.status} ${response.statusText} - ${serviceUrl}:`, text);
      }

      return response.ok;
    } catch (error) {
      console.error(`Failed to control accessory ${entityId} with action ${actionKey}:`, error);
      return false;
    }
  }
}
