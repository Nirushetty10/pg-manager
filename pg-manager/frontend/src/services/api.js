import axios from 'axios';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 15000 });

API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('pg_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

API.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
  }
  return Promise.reject(err);
});

export const authAPI = {
  login: (d) => API.post('/auth/login', d),
  getMe: () => API.get('/auth/me'),
  inviteOwner: (d) => API.post('/auth/invite/owner', d),
  inviteTenant: (d) => API.post('/auth/invite/tenant', d),
  validateInvite: (token) => API.get(`/auth/invite/${token}`),
  registerOwner: (d) => API.post('/auth/register/owner', d),
};

export const masterAPI = {
  getDashboard: () => API.get('/master/dashboard'),
  getOwners: (p) => API.get('/master/owners', { params: p }),
  getOwnerById: (id) => API.get(`/master/owners/${id}`),
  toggleOwnerStatus: (id) => API.patch(`/master/owners/${id}/toggle`),
  getPGDetails: (pgId) => API.get(`/master/pgs/${pgId}`),
};

export const ownerAPI = {
  getPGs: () => API.get('/owner/pgs'),
  createPG: (d) => API.post('/owner/pgs', d),
};

// PG-scoped API factory
const pg = (pgId) => ({
  get: () => API.get(`/pg/${pgId}`),
  update: (d) => API.put(`/pg/${pgId}`, d),
  getDashboard: () => API.get(`/pg/${pgId}/dashboard`),
  getReports: (p) => API.get(`/pg/${pgId}/reports`, { params: p }),
  getLogs: (p) => API.get(`/pg/${pgId}/logs`, { params: p }),

  // Staff
  getStaff: () => API.get(`/pg/${pgId}/staff`),
  createStaff: (d) => API.post(`/pg/${pgId}/staff`, d),
  updateStaff: (sid, d) => API.put(`/pg/${pgId}/staff/${sid}`, d),
  resetStaffPassword: (sid, d) => API.put(`/pg/${pgId}/staff/${sid}/reset-password`, d),

  // Permissions
  getPermissions: () => API.get(`/pg/${pgId}/permissions`),
  updatePermissions: (d) => API.put(`/pg/${pgId}/permissions`, d),

  // Tenants
  getTenants: (p) => API.get(`/pg/${pgId}/tenants`, { params: p }),
  getTenantById: (id) => API.get(`/pg/${pgId}/tenants/${id}`),
  createTenant: (d) => API.post(`/pg/${pgId}/tenants`, d),
  assignRoom: (id, d) => API.patch(`/pg/${pgId}/tenants/${id}/assign`, d),
  updateRent: (id, d) => API.patch(`/pg/${pgId}/tenants/${id}/rent`, d),
  markVacated: (id, d) => API.patch(`/pg/${pgId}/tenants/${id}/vacate`, d),
  deleteTenant: (id) => API.delete(`/pg/${pgId}/tenants/${id}`),

  // Rooms
  getRooms: (p) => API.get(`/pg/${pgId}/rooms`, { params: p }),
  getRoomById: (id) => API.get(`/pg/${pgId}/rooms/${id}`),
  createRoom: (d) => API.post(`/pg/${pgId}/rooms`, d),
  updateRoom: (id, d) => API.put(`/pg/${pgId}/rooms/${id}`, d),
  deleteRoom: (id) => API.delete(`/pg/${pgId}/rooms/${id}`),
  assignBed: (d) => API.post(`/pg/${pgId}/rooms/assign-bed`, d),

  // Maintenance
  getMaintenance: () => API.get(`/pg/${pgId}/maintenance`),
  createMaintenance: (d) => API.post(`/pg/${pgId}/maintenance`, d),
  updateMaintenance: (id, d) => API.patch(`/pg/${pgId}/maintenance/${id}`, d),

  // Payments
  getPayments: (p) => API.get(`/pg/${pgId}/payments`, { params: p }),
  createPayment: (d) => API.post(`/pg/${pgId}/payments`, d),
  updatePaymentStatus: (id, d) => API.patch(`/pg/${pgId}/payments/${id}/status`, d),

  // Expenses
  getExpenses: (p) => API.get(`/pg/${pgId}/expenses`, { params: p }),
  createExpense: (d) => API.post(`/pg/${pgId}/expenses`, d),
  updateExpense: (id, d) => API.put(`/pg/${pgId}/expenses/${id}`, d),
  deleteExpense: (id) => API.delete(`/pg/${pgId}/expenses/${id}`),
});

export { pg as pgAPI };
export default API;
