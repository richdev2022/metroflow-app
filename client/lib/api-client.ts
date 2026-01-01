import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Add business ID header if it exists
  const businessId = localStorage.getItem("businessId");
  if (businessId) {
    config.headers["x-business-id"] = businessId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Check if response data is string and starts with < (likely HTML)
    if (typeof response.data === 'string' && response.data.trim().startsWith('<')) {
        console.error("Received HTML response instead of JSON. Check API URL configuration.");
        // We can't easily recover here, but we can reject it so the app knows it failed
        return Promise.reject(new Error("Invalid API response (HTML received)"));
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Handle token expiration
      localStorage.removeItem("token");
      localStorage.removeItem("businessId");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
