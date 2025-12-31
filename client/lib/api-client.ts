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
  (response) => response,
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
