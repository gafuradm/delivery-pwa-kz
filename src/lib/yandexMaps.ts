// @ts-nocheck
// Загрузка API Яндекс.Карт (только для карты)
let ymapsPromise: Promise<any> | null = null;

// ВРЕМЕННО: жёстко задаём ключ (рабочий, который ты использовал)
const YANDEX_API_KEY = 'c365abdd-dfb3-46e2-9297-c7747f29214d';

export function loadYandexMaps(): Promise<any> {
  if (ymapsPromise) return ymapsPromise;
  
  ymapsPromise = new Promise((resolve, reject) => {
    if (window.ymaps) {
      window.ymaps.ready(() => resolve(window.ymaps));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU`;
    script.onload = () => {
      window.ymaps.ready(() => resolve(window.ymaps));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return ymapsPromise;
}

// Геокодирование через HTTP API
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_API_KEY}&geocode=${encodeURIComponent(address)}&format=json`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    const featureMember = data.response.GeoObjectCollection.featureMember;
    if (featureMember && featureMember.length > 0) {
      const coords = featureMember[0].GeoObject.Point.pos.split(' ');
      const lng = parseFloat(coords[0]);
      const lat = parseFloat(coords[1]);
      const displayName = featureMember[0].GeoObject.name;
      return { lat, lng, displayName };
    }
    return null;
  } catch (error) {
    console.error('Ошибка геокодера:', error);
    return null;
  }
}

// Подсказки адресов через геокодер (поиск по фрагменту)
export async function suggestAddress(query: string): Promise<Array<{ displayName: string; lat: number; lng: number }>> {
  if (query.length < 3) return [];
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_API_KEY}&geocode=${encodeURIComponent(query)}&results=5&format=json`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const members = data.response.GeoObjectCollection.featureMember;
    return members.map((member: any) => {
      const coords = member.GeoObject.Point.pos.split(' ');
      const lng = parseFloat(coords[0]);
      const lat = parseFloat(coords[1]);
      const displayName = member.GeoObject.name;
      return { displayName, lat, lng };
    });
  } catch (error) {
    console.error('Ошибка suggest:', error);
    return [];
  }
}

// Расчёт расстояния и времени с учётом пробок (автоматически в режиме auto)
export async function getRouteDistance(origin: [number, number], dest: [number, number]): Promise<{ distance: number; duration: number; distanceText: string; durationText: string } | null> {
  const ymaps = await loadYandexMaps();
  return new Promise((resolve) => {
    const multiRoute = new ymaps.multiRouter.MultiRoute({
      referencePoints: [origin, dest],
      params: { routingMode: 'auto' }
    });
    multiRoute.model.events.add('update', () => {
      const route = multiRoute.getActiveRoute();
      if (route) {
        const distance = route.properties.get('distance')?.value || 0;
        const duration = route.properties.get('duration')?.value || 0;
        const distanceText = route.properties.get('distance')?.text || '0 км';
        const durationText = route.properties.get('duration')?.text || '0 мин';
        resolve({ distance, duration, distanceText, durationText });
      } else {
        resolve(null);
      }
    });
    setTimeout(() => resolve(null), 5000);
  });
}