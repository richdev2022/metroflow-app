import axios from "axios";

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || "/api").trim(),
});

console.log("API Configured with Base URL:", api.defaults.baseURL);

if (!import.meta.env.VITE_API_BASE_URL && import.meta.env.PROD) {
  console.warn("VITE_API_BASE_URL is not set. API calls might fail if backend is not proxied correctly.");
}

api.interceptors.request.use((config) => {
  console.log(`[API Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config);
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
        return Promise.reject(new Error("Invalid API response (HTML received)"));
    }
    return response;
  },
  (error) => {
    // Handle Network Errors (CORS, Offline, Server Down)
    if (error.code === 'ERR_NETWORK') {
        console.error("Network Error: Unable to connect to the server.");
        // Optional: You could trigger a global toast here if you had access to the toast hook
        return Promise.reject(new Error("Unable to connect to the server. Please check your connection or try again later."));
    }

    if (error.response?.status === 401) {
      // Handle token expiration
      localStorage.removeItem("token");
      localStorage.removeItem("businessId");
      window.location.href = "/login";
    }

    // Handle custom token expiration/invalid messages
    const errorMessage = error.response?.data?.message || error.response?.data || "";
    const errorString = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : "";
    
    if (errorString.includes("token expires") || errorString.includes("invalid token") || errorString.includes("token expired")) {
       localStorage.removeItem("token");
       localStorage.removeItem("businessId");
       window.location.href = "/login";
       return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);
