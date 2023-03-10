import axios from "axios";

export const apiClient = axios.create({
  baseURL: "http://localhost:5000/",
  headers: {
    "Content-type": "application/json",
    Authorization: ` Bearer ${localStorage.getItem("token")}`,
  },
});

export const apiClientPost = axios.create({
  baseURL: "http://localhost:5000/",
  headers: {
    Authorization: ` Bearer ${localStorage.getItem("token")}`,
    "Content-type": "application/json",
  },
});
