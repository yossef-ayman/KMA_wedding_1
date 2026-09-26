/**
 * KMA Wedding & Media Production
 * Domain API Services Layer
 *
 * Encapsulates all REST endpoint calls for Projects, Bookings, Services,
 * Authentication, and Media Uploads.
 */

import { apiClient } from './client';

export const portfolioApi = {
  // Health
  getHealth: () => apiClient.get('/api/health'),

  // Monolithic Portfolio Data Sync (Backward compatibility)
  getPortfolioData: () => apiClient.get('/api/data'),
  savePortfolioData: (data) => apiClient.post('/api/data', data),

  // Granular Projects REST API
  getProjects: () => apiClient.get('/api/projects'),
  getProjectById: (id) => apiClient.get(`/api/projects/${id}`),
  createProject: (project) => apiClient.post('/api/projects', project),
  updateProject: (id, project) => apiClient.put(`/api/projects/${id}`, project),
  deleteProject: (id) => apiClient.delete(`/api/projects/${id}`),

  // Granular Services REST API
  getServices: () => apiClient.get('/api/services'),
  createService: (service) => apiClient.post('/api/services', service),
  updateService: (id, service) => apiClient.put(`/api/services/${id}`, service),
  deleteService: (id) => apiClient.delete(`/api/services/${id}`),

  // Bookings
  getBookings: () => apiClient.get('/api/bookings'),
  createBooking: (booking) => apiClient.post('/api/bookings', booking),
  updateBookingStatus: (id, status) =>
    apiClient.patch(`/api/bookings/${id}/status`, { status }),
  deleteBooking: (id) => apiClient.delete(`/api/bookings/${id}`),

  // Admin Auth & Sessions
  login: (credentials) => {
    const payload =
      typeof credentials === 'string'
        ? { passcode: credentials }
        : credentials;
    return apiClient.post('/api/auth/login', payload);
  },
  checkAuth: () => apiClient.get('/api/auth/me'),
  logout: () => apiClient.post('/api/auth/logout'),
  changePassword: (data) => apiClient.post('/api/auth/change-password', data),
  changePasscode: (currentPasscode, newPasscode) =>
    apiClient.post('/api/auth/change-passcode', { currentPasscode, newPasscode }),

  // Media Storage & Uploads
  uploadMedia: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload('/api/media/upload', formData);
  }
};
