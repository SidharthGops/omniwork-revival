import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000",
});

// sessionStorage, matching AuthContext — see the comment there. Keeping
// these two reads in sync matters: if one used localStorage and the other
// sessionStorage, requests would silently authenticate as the wrong tab's
// user instead of failing loudly.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
