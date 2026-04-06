import axios from "axios";
const API = axios.create({
  // baseURL: import.meta.env.VITE_API_URL || "/api",
  baseURL: "http://localhost:5000/api",
  timeout: 20000,
});
API.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("pg_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
API.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);
export const authAPI = {
  login: (d) => API.post("/auth/login", d),
  getMe: () => API.get("/auth/me"),
  inviteOwner: (d) => API.post("/auth/invite/owner", d),
  validateInvite: (t) => API.get(`/auth/invite/${t}`),
  registerOwner: (d) => API.post("/auth/register/owner", d),
  validateTenantInvite: (t) => API.get(`/tenant-invite/${t}`),
  submitTenantInvite: (fd) => API.post("/tenant-invite/submit", fd),
};
export const masterAPI = {
  getDashboard: () => API.get("/master/dashboard"),
  getOwners: (p) => API.get("/master/owners", { params: p }),
  getOwnerById: (id) => API.get(`/master/owners/${id}`),
  toggleOwnerStatus: (id) => API.patch(`/master/owners/${id}/toggle`),
  getPGDetails: (pgId) => API.get(`/master/pgs/${pgId}`),
};
export const ownerAPI = {
  getPGs: () => API.get("/owner/pgs"),
  createPG: (d) => API.post("/owner/pgs", d),
};
const pg = (pgId) => ({
  get: () => API.get(`/pg/${pgId}`),
  update: (fd) => API.put(`/pg/${pgId}`, fd),
  removeImage: (u) =>
    API.delete(`/pg/${pgId}/images`, { data: { imageUrl: u } }),
  getDashboard: () => API.get(`/pg/${pgId}/dashboard`),
  getReports: (p) => API.get(`/pg/${pgId}/reports`, { params: p }),
  getLogs: (p) => API.get(`/pg/${pgId}/logs`, { params: p }),
  getStaff: () => API.get(`/pg/${pgId}/staff`),
  createStaff: (d) => API.post(`/pg/${pgId}/staff`, d),
  updateStaff: (sid, d) => API.put(`/pg/${pgId}/staff/${sid}`, d),
  resetStaffPassword: (sid, d) =>
    API.put(`/pg/${pgId}/staff/${sid}/reset-password`, d),
  getPermissions: () => API.get(`/pg/${pgId}/permissions`),
  updatePermissions: (d) => API.put(`/pg/${pgId}/permissions`, d),
  getTenants: (p) => API.get(`/pg/${pgId}/tenants`, { params: p }),
  getTenantById: (id) => API.get(`/pg/${pgId}/tenants/${id}`),
  createTenant: (fd) => API.post(`/pg/${pgId}/tenants`, fd),
  updateTenant: (id, fd) => API.put(`/pg/${pgId}/tenants/${id}`, fd),
  assignRoom: (id, d) => API.patch(`/pg/${pgId}/tenants/${id}/assign`, d),
  updateRent: (id, d) => API.patch(`/pg/${pgId}/tenants/${id}/rent`, d),
  markVacated: (id, d) => API.patch(`/pg/${pgId}/tenants/${id}/vacate`, d),
  deleteTenant: (id) => API.delete(`/pg/${pgId}/tenants/${id}`),
  inviteTenant: (d) => API.post(`/pg/${pgId}/tenants/invite`, d),
  getQRCode: () => API.get(`/pg/${pgId}/tenants/qr-code`),
  getRooms: (p) => API.get(`/pg/${pgId}/rooms`, { params: p }),
  getRoomById: (id) => API.get(`/pg/${pgId}/rooms/${id}`),
  createRoom: (d) => API.post(`/pg/${pgId}/rooms`, d),
  updateRoom: (id, d) => API.put(`/pg/${pgId}/rooms/${id}`, d),
  deleteRoom: (id) => API.delete(`/pg/${pgId}/rooms/${id}`),
  assignBed: (d) => API.post(`/pg/${pgId}/rooms/assign-bed`, d),
  unassignBed: (d) => API.post(`/pg/${pgId}/rooms/unassign-bed`, d),
  getPayments: (p) => API.get(`/pg/${pgId}/payments`, { params: p }),
  createPayment: (d) => API.post(`/pg/${pgId}/payments`, d),
  updatePayment: (id, d) => API.put(`/pg/${pgId}/payments/${id}`, d),
  deletePayment: (paymentId) => API.delete(`/pg/${pgId}/payments/${paymentId}`),
  exportPaymentsCSV: (p) =>
    API.get(`/pg/${pgId}/payments/export-csv`, {
      params: p,
      responseType: "blob",
    }),
  getExpenses: (p) => API.get(`/pg/${pgId}/expenses`, { params: p }),
  createExpense: (d) => API.post(`/pg/${pgId}/expenses`, d),
  updateExpense: (id, d) => API.put(`/pg/${pgId}/expenses/${id}`, d),
  deleteExpense: (id) => API.delete(`/pg/${pgId}/expenses/${id}`),
});
export { pg as pgAPI };
export default API;
