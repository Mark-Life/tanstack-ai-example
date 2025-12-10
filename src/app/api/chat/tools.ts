import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const outputSchema = z.object({
  temperature: z.number(),
  conditions: z.string(),
  location: z.string(),
});

export type WeatherOutput = z.infer<typeof outputSchema>;

// Step 1: Define the tool schema
export const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
  }),
  outputSchema,
});

/**
 * Maps WMO weather codes to human-readable conditions
 * @see https://open-meteo.com/en/docs
 */
const getWeatherCondition = (code: number): string => {
  const conditions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
  };
  return conditions[code] || "Unknown";
};

// Step 2: Create a server implementation using Open-Meteo (free, no API key)
export const getWeatherServer = getWeatherDef.server(async ({ location }) => {
  console.log("requesting weather data for:", location);

  try {
    // First, geocode the location using Open-Meteo's geocoding API
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    console.log("geocoding:", geoUrl);

    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();

    if (!geoData.results?.length) {
      throw new Error(`Location not found: ${location}`);
    }

    const { latitude, longitude, name, country } = geoData.results[0];
    console.log("found location:", name, country, latitude, longitude);

    // Fetch weather data (always celsius)
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`;
    console.log("fetching weather:", weatherUrl);

    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    console.log("weather data:", weatherData);

    return {
      temperature: weatherData.current.temperature_2m,
      conditions: getWeatherCondition(weatherData.current.weather_code),
      location: `${name}, ${country}`,
    };
  } catch (error) {
    console.error("Weather fetch error:", error);
    throw error;
  }
});

// Step 1: Define the secure weather tool schema with approval requirement
export const getSecureWeatherDef = toolDefinition({
  name: "secure_get_weather",
  description: "Get the current weather for a location (requires approval)",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
  }),
  outputSchema,
  needsApproval: true,
});

// Step 2: Create a server implementation using Open-Meteo (free, no API key)
export const getSecureWeatherServer = getSecureWeatherDef.server(
  async ({ location }) => {
    console.log("🔐 [SERVER] Secure weather tool EXECUTING (approved):", {
      location,
      timestamp: new Date().toISOString(),
    });

    try {
      // First, geocode the location using Open-Meteo's geocoding API
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
      console.log("geocoding:", geoUrl);

      const geoResponse = await fetch(geoUrl);
      const geoData = await geoResponse.json();

      if (!geoData.results?.length) {
        throw new Error(`Location not found: ${location}`);
      }

      const { latitude, longitude, name, country } = geoData.results[0];
      console.log("found location:", name, country, latitude, longitude);

      // Fetch weather data (always celsius)
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`;
      console.log("fetching weather:", weatherUrl);

      const weatherResponse = await fetch(weatherUrl);
      const weatherData = await weatherResponse.json();
      console.log("weather data:", weatherData);

      const result = {
        temperature: weatherData.current.temperature_2m,
        conditions: getWeatherCondition(weatherData.current.weather_code),
        location: `${name}, ${country}`,
      };
      console.log("✅ [SERVER] Secure weather tool COMPLETED:", {
        location,
        result,
        timestamp: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      console.error("❌ [SERVER] Secure weather tool ERROR:", {
        location,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
);
