/* =========================================================
   Tastewise API client
   All requests go to the same origin (/api), so the session
   cookie (httpOnly) is sent automatically.
   ========================================================= */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, query } = {}) {
  let url = `/api${path}`;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
      qs.set(k, Array.isArray(v) ? v.join(',') : v);
    });
    if ([...qs].length) url += `?${qs}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Lang': window.I18N?.lang || 'az', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', ({ az: 'Serverə qoşulmaq mümkün olmadı. İnternet bağlantınızı yoxlayıb yenidən cəhd edin.', en: 'Cannot reach the server. Check your connection and try again.', ru: 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.' })[window.I18N?.lang || 'az']);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || t('results.error'), e.details);
  }
  return data;
}

const api = {
  // auth
  register: body => request('/auth/register', { method: 'POST', body }),
  verifyEmail: body => request('/auth/verify-email', { method: 'POST', body }),
  resendCode: email => request('/auth/resend-code', { method: 'POST', body: { email } }),
  login: body => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: email => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: body => request('/auth/reset-password', { method: 'POST', body }),

  // menu
  dishes: query => request('/dishes', { query }),
  dish: id => request(`/dishes/${encodeURIComponent(id)}`),
  recommend: body => request('/recommendations', { method: 'POST', body }),
  categories: () => request('/categories'),
  ingredients: () => request('/ingredients'),
  cuisines: () => request('/cuisines'),
  restaurant: () => request('/restaurant'),
  subscribe: email => request('/newsletter', { method: 'POST', body: { email } }),

  // reviews
  reviews: (dishId, page = 1) => request(`/dishes/${dishId}/reviews`, { query: { page } }),
  saveReview: (dishId, body) => request(`/dishes/${dishId}/reviews`, { method: 'PUT', body }),
  deleteReview: dishId => request(`/dishes/${dishId}/reviews`, { method: 'DELETE' }),

  // account
  profile: () => request('/me/profile'),
  updateProfile: body => request('/me/profile', { method: 'PATCH', body }),
  changePassword: body => request('/me/password', { method: 'POST', body }),

  // favorites
  favorites: () => request('/me/favorites'),
  addFavorite: dishId => request(`/me/favorites/${dishId}`, { method: 'PUT' }),
  removeFavorite: dishId => request(`/me/favorites/${dishId}`, { method: 'DELETE' }),

  // reservations
  reserve: body => request('/reservations', { method: 'POST', body }),
  myReservations: () => request('/me/reservations'),
  cancelReservation: id => request(`/me/reservations/${id}/cancel`, { method: 'POST' }),

  // orders
  orderConfig: () => request('/orders/config'),
  placeOrder: body => request('/orders', { method: 'POST', body }),
  myOrders: () => request('/me/orders'),
  cancelOrder: id => request(`/me/orders/${id}/cancel`, { method: 'POST' }),

  // admin
  adminReservations: query => request('/admin/reservations', { query }),
  adminUpdateReservation: (id, body) => request(`/admin/reservations/${id}`, { method: 'PATCH', body }),
  adminOrders: query => request('/admin/orders', { query }),
  adminUpdateOrder: (id, body) => request(`/admin/orders/${id}`, { method: 'PATCH', body })
};

window.api = api;
window.ApiError = ApiError;
