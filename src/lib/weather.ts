export interface WeatherInfo {
    factor: number;
    description: string;
    temperature: number;
    windSpeed: number;
    humidity: number;
    icon: string;
  }
  
  export async function getWeatherInfo(lat: number, lng: number): Promise<WeatherInfo> {
    const apiKey = 'bd5e378503939ddaee76f12ad7a97608'; // или из .env
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=ru`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.cod !== 200) {
        console.warn('Погода не найдена:', data.message);
        return {
          factor: 1.0,
          description: 'нет данных',
          temperature: 0,
          windSpeed: 0,
          humidity: 0,
          icon: ''
        };
      }
      const weatherMain = data.weather[0]?.main?.toLowerCase() || '';
      const weatherDesc = data.weather[0]?.description || '';
      const windSpeed = data.wind?.speed || 0;
      const humidity = data.main?.humidity || 0;
      const temperature = data.main?.temp || 0;
      let factor = 1.0;
      if (weatherMain.includes('rain')) factor = 1.15;
      if (weatherMain.includes('snow')) factor = 1.25;
      if (weatherMain.includes('thunderstorm')) factor = 1.3;
      if (windSpeed > 10) factor += 0.05;
      factor = Math.min(factor, 1.5);
      const icon = data.weather[0]?.icon || '';
      return {
        factor,
        description: weatherDesc,
        temperature,
        windSpeed,
        humidity,
        icon
      };
    } catch (error) {
      console.error('Ошибка получения погоды:', error);
      return {
        factor: 1.0,
        description: 'ошибка загрузки',
        temperature: 0,
        windSpeed: 0,
        humidity: 0,
        icon: ''
      };
    }
  }