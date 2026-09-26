import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { DEFAULT_PORTFOLIO_DATA } from '../data/defaultData';
import { THEME_PRESETS, BG_TONES } from '../data/themes';
import { persistData, retrieveData, getLocalSync } from '../utils/storage';
import { normalizeProject, normalizePortfolioData, getProjectCover } from '../utils/projectModel';
import { portfolioApi } from '../api/portfolioApi';

const STORAGE_KEY = 'kma_portfolio_data_clean_v1';
const STORAGE_LANG_KEY = 'kma_wedding_lang_v8';
const STORAGE_BOOKINGS_KEY = 'kma_wedding_bookings_clean_v2';
const STORAGE_THEME_KEY = 'kma_wedding_theme_v1';
const STORAGE_BGTONE_KEY = 'kma_wedding_bgtone_v1';
const STORAGE_PASSCODE_KEY = 'kma_admin_passcode_v1';
const STORAGE_ADMIN_EMAIL_KEY = 'kma_admin_email_v1';
const SESSION_AUTH_KEY = 'kma_admin_auth_session_v1';

const PortfolioContext = createContext(null);

export const PortfolioProvider = ({ children }) => {
  // Purge any legacy keys containing old mock/dummy data
  if (typeof window !== 'undefined') {
    try {
      [
        'kma_wedding_media_production_en_v6',
        'kma_wedding_bookings_v1',
        'mariam_awad_judge_data_v4',
        'awad_partners_firm_data_v1',
        'awad_partners_firm_data_v2',
        'awad_partners_lang_v1',
        'kma_wedding_media_data_v3',
        'kma_wedding_media_production_v5',
        'kma_wedding_lang_v3',
        'kma_wedding_lang_en_v4'
      ].forEach(k => {
        localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  // Language state: English only
  const [lang, setLang] = useState('en');

  // Admin Security & Passcode Gate
  const [adminPasscode, setAdminPasscode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_PASSCODE_KEY) || 'kma2026';
    } catch (e) {
      return 'kma2026';
    }
  });

  const [adminUser, setAdminUser] = useState(() => {
    try {
      const email = localStorage.getItem(STORAGE_ADMIN_EMAIL_KEY);
      return { email, name: 'Admin', role: 'admin' };
    } catch (e) {
      return { email: '', name: 'Admin', role: 'admin' };
    }
  });

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_AUTH_KEY) === 'true';
    } catch (e) {
      return false;
    }
  });

  // Verify server-side session on mount
  useEffect(() => {
    portfolioApi.checkAuth().then((res) => {
      if (res && res.authenticated) {
        setIsAdminAuthenticated(true);
        if (res.user) setAdminUser(res.user);
        try {
          sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
        } catch (e) {}
      } else {
        setIsAdminAuthenticated(false);
        try {
          sessionStorage.removeItem(SESSION_AUTH_KEY);
        } catch (e) {}
      }
    }).catch(() => {
      // offline: preserve existing state
    });
  }, []);

  // Backend Connectivity Status: 'connecting' | 'connected' | 'offline'
  const [backendStatus, setBackendStatus] = useState('connecting');

  const loginAdmin = async (emailOrPasscode, maybePassword) => {
    let email = '';
    let password = '';

    if (typeof emailOrPasscode === 'object' && emailOrPasscode !== null) {
      email = emailOrPasscode.email ;
      password = emailOrPasscode.password || '';
    } else if (maybePassword) {
      email = emailOrPasscode;
      password = maybePassword;
    } else {
      // Passcode string fallback
      password = emailOrPasscode;
    }

    // Attempt backend verification first (sets secure HTTP-only cookie)
    try {
      const payload = maybePassword || (typeof emailOrPasscode === 'object')
        ? { email: email.trim().toLowerCase(), password }
        : { passcode: password, email: email.trim().toLowerCase() };

      const json = await portfolioApi.login(payload);
      if (json && json.authenticated) {
        setIsAdminAuthenticated(true);
        const userObj = json.user || { email, name: 'Admin', role: 'admin' };
        setAdminUser(userObj);
        try {
          sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
          localStorage.setItem(STORAGE_ADMIN_EMAIL_KEY, userObj.email);
        } catch (e) {}
        showToast('Admin session authenticated successfully!');
        return true;
      }
    } catch (e) {
      if (e.status === 401) {
        showToast('Invalid email or password.', 'error');
        return false;
      }
      if (e.status === 429) {
        showToast(e.message || 'Too many login attempts. Please wait 15 minutes.', 'error');
        return false;
      }
    }

    // Local admin fallback check only if backend is unreachable or offline
    

    if (isDefaultAdmin) {
      setIsAdminAuthenticated(true);
      const userObj = { email: 'admin@kma.com', name: 'Admin', role: 'admin' };
      setAdminUser(userObj);
      try {
        sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
        localStorage.setItem(STORAGE_ADMIN_EMAIL_KEY, 'admin@kma.com');
      } catch (e) {}
      showToast('Admin signed in successfully (offline mode).', 'info');
      return true;
    }
    showToast('Invalid email or password.', 'error');
    return false;
  };

  const logoutAdmin = async () => {
    setIsAdminAuthenticated(false);
    try {
      sessionStorage.removeItem(SESSION_AUTH_KEY);
      await portfolioApi.logout();
    } catch (e) {}
    showToast('Admin session ended.', 'info');
  };

  const updateAdminPassword = async (currentPassword, newPassword) => {
    if (!newPassword || newPassword.length < 4) {
      showToast('Password must be at least 4 characters.', 'error');
      return false;
    }
    try {
      await portfolioApi.changePassword({
        email: adminUser?.email || 'admin@kma.com',
        currentPassword,
        newPassword
      });
      setAdminPasscode(newPassword);
      try {
        localStorage.setItem(STORAGE_PASSCODE_KEY, newPassword);
      } catch (e) {}
      showToast('Admin password updated successfully!');
      return true;
    } catch (e) {
      // Fallback
      setAdminPasscode(newPassword);
      try {
        localStorage.setItem(STORAGE_PASSCODE_KEY, newPassword);
      } catch (err) {}
      showToast('Admin password updated locally.');
      return true;
    }
  };

  const updateAdminPasscode = async (newCode) => {
    return updateAdminPassword('', newCode);
  };

  // Theme state: defaults to 'gold'
  const [currentTheme, setCurrentTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
      if (savedTheme && THEME_PRESETS.some(t => t.id === savedTheme)) {
        return savedTheme;
      }
    } catch (e) {
      console.error(e);
    }
    return 'gold';
  });

  // Apply theme to document
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', currentTheme);
      localStorage.setItem(STORAGE_THEME_KEY, currentTheme);
    } catch (e) {
      console.error(e);
    }
  }, [currentTheme]);

  const setTheme = (themeId) => {
    setCurrentTheme(themeId);
    const themeObj = THEME_PRESETS.find(t => t.id === themeId);
    showToast(`Theme switched to: ${themeObj?.name || themeId}`);
  };

  // Background Canvas Tone state: defaults to 'beige'
  const [bgTone, setBgTone] = useState(() => {
    try {
      const savedTone = localStorage.getItem(STORAGE_BGTONE_KEY);
      if (savedTone && BG_TONES.some(b => b.id === savedTone)) {
        return savedTone;
      }
    } catch (e) {
      console.error(e);
    }
    return 'beige';
  });

  // Apply background tone to document
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-bgtone', bgTone);
      localStorage.setItem(STORAGE_BGTONE_KEY, bgTone);
    } catch (e) {
      console.error(e);
    }
  }, [bgTone]);

  const setBackgroundTone = (toneId) => {
    setBgTone(toneId);
    const toneObj = BG_TONES.find(b => b.id === toneId);
    showToast(`Background updated to: ${toneObj?.name || toneId}`);
  };

  // Fast synchronous initial read from localStorage, fallback to clean DEFAULT_PORTFOLIO_DATA
  const [data, setData] = useState(() => {
    const initial = getLocalSync(STORAGE_KEY, DEFAULT_PORTFOLIO_DATA);
    return normalizePortfolioData(initial);
  });

  // Async IndexedDB hydration on mount
  useEffect(() => {
    let isHydrated = true;
    retrieveData(STORAGE_KEY, null).then((storedData) => {
      if (isHydrated && storedData && storedData.profile) {
        const normalized = normalizePortfolioData(storedData);
        setData((prev) => {
          const storedTime = normalized.updatedAt ? new Date(normalized.updatedAt).getTime() : 0;
          const prevTime = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
          if (storedTime >= prevTime) {
            return normalized;
          }
          return prev;
        });
      }
    });
    return () => {
      isHydrated = false;
    };
  }, []);

  // Client-side Event Bookings - Clean default: []
  const [bookings, setBookings] = useState(() => {
    return getLocalSync(STORAGE_BOOKINGS_KEY, []);
  });

  // Save bookings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_BOOKINGS_KEY, JSON.stringify(bookings));
    } catch (e) {
      console.error('Error saving bookings to localStorage', e);
    }
  }, [bookings]);

  const addBooking = async (bookingData) => {
    const now = new Date().toISOString();
    const newBooking = {
      ...bookingData,
      id: bookingData.id || `book-${Date.now()}`,
      createdAt: bookingData.createdAt || now,
      updatedAt: now,
      status: bookingData.status || 'new'
    };
    setBookings((prev) => [newBooking, ...prev]);

    // Send to backend API
    try {
      await portfolioApi.createBooking(newBooking);
    } catch (e) {
      // Graceful offline fallback
    }
    return newBooking;
  };

  const deleteBooking = async (id) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
    try {
      await portfolioApi.deleteBooking(id);
    } catch (e) {}
  };

  const updateBookingStatus = async (id, newStatus) => {
    const now = new Date().toISOString();
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: newStatus, updatedAt: now } : b))
    );
    try {
      await portfolioApi.updateBookingStatus(id, newStatus);
    } catch (e) {}
  };

  // Dispatch live email to KMA inbox via free Web3Forms API
  const sendBookingEmail = async (bookingData) => {
    const accessKey = data.profile?.web3formsKey?.trim();
    const destinationEmail = data.profile?.notificationEmail?.trim() || data.profile?.email || 'contact@kmawedding.com';

    if (accessKey) {
      try {
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            access_key: accessKey,
            subject: `New Event Booking: ${bookingData.name} - KMA Production`,
            from_name: `KMA Booking System (${bookingData.name})`,
            to_email: destinationEmail,
            client_name: bookingData.name,
            client_phone: bookingData.phone,
            client_email: bookingData.email,
            event_type: bookingData.eventType,
            event_date: bookingData.eventDate || 'Not specified',
            event_location: bookingData.location || 'Not specified',
            client_message: bookingData.message
          })
        });
        const result = await response.json();
        return { success: result.success, message: result.message };
      } catch (err) {
        console.error('Email service error:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: true, isLocalOnly: true };
  };

  // Test live email delivery
  const sendTestEmail = async () => {
    const accessKey = data.profile?.web3formsKey?.trim();
    const destinationEmail = data.profile?.notificationEmail?.trim() || data.profile?.email || 'contact@kmawedding.com';

    if (!accessKey) {
      showToast('Please enter your Web3Forms Access Key first to send live test emails.', 'error');
      return false;
    }

    try {
      showToast('Sending test email...', 'info');
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          access_key: accessKey,
          subject: 'KMA Wedding Production - Test Email Notification',
          from_name: 'KMA System Check',
          to_email: destinationEmail,
          status: 'SUCCESSFUL_SETUP',
          message: 'Congratulations! Your free KMA email notification system is configured and working perfectly.'
        })
      });
      const result = await response.json();
      if (result.success) {
        showToast(`Test email sent successfully to ${destinationEmail}!`, 'success');
        return true;
      } else {
        showToast(result.message || 'Failed to send test email', 'error');
        return false;
      }
    } catch (err) {
      showToast('Connection error: ' + err.message, 'error');
      return false;
    }
  };

  // Current view: 'portfolio' or 'admin'
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#admin') {
      return 'admin';
    }
    return 'portfolio';
  });

  // Active certificate modal for full-screen inspection
  const [activeModalCert, setActiveModalCert] = useState(null);

  // Active project/deal modal for full-screen inspection
  const [activeModalProject, setActiveModalProject] = useState(null);

  // Certificate currently being edited in the admin panel
  const [editingCertId, setEditingCertId] = useState(null);

  // Toast system
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  // Keep HTML lang & dir attribute in sync (English only, LTR)
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    try {
      localStorage.setItem(STORAGE_LANG_KEY, 'en');
    } catch (e) {}
  }, []);

  const toggleLanguage = () => {};
  const setLanguage = () => {};

  // Helper function to extract text
  const t = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      return val.en || val.ar || '';
    }
    return String(val);
  };

  // Keep document.title synchronized with studio brand name
  useEffect(() => {
    const siteName = t(data?.profile?.fullName) || t(data?.profile?.shortName) || 'KMA Wedding';
    document.title = `${siteName} • Premier Cinematography`;
  }, [data?.profile?.fullName, data?.profile?.shortName]);

  // Synchronize hash with view
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setCurrentView('admin');
      } else {
        setCurrentView('portfolio');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (view) => {
    setCurrentView(view);
    if (view === 'admin') {
      window.location.hash = 'admin';
    } else {
      window.location.hash = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  // Initial Backend Synchronization on mount with timestamp comparison
  useEffect(() => {
    let isMounted = true;

    const initBackend = async () => {
      try {
        await portfolioApi.getHealth();
        if (isMounted) setBackendStatus('connected');

        // Load data from backend safely
        try {
          const resJson = await portfolioApi.getPortfolioData();
          if (resJson && resJson.success && resJson.data && resJson.data.profile) {
            const serverData = normalizePortfolioData(resJson.data);
            const currentLocal = getLocalSync(STORAGE_KEY, null);

            const serverTime = serverData.updatedAt ? new Date(serverData.updatedAt).getTime() : 0;
            const localTime = currentLocal?.updatedAt ? new Date(currentLocal.updatedAt).getTime() : 0;

            // If local data is NEWER than server data, do NOT overwrite! Push local data to server!
            if (localTime > serverTime) {
              try {
                await portfolioApi.savePortfolioData(currentLocal);
              } catch (e) {}
            } else if (serverTime > localTime && serverTime > 0) {
              // Server data is newer, adopt it
              if (isMounted) {
                setData(serverData);
                persistData(STORAGE_KEY, serverData);
              }
            }
          }
        } catch (e) {}

        // Load bookings from backend
        try {
          const bookJson = await portfolioApi.getBookings();
          if (bookJson && bookJson.success && Array.isArray(bookJson.bookings)) {
            if (isMounted) {
              setBookings(bookJson.bookings);
              try {
                localStorage.setItem(STORAGE_BOOKINGS_KEY, JSON.stringify(bookJson.bookings));
              } catch (e) {}
            }
          }
        } catch (e) {}
      } catch (err) {
        if (isMounted) setBackendStatus('offline');
      }
    };

    initBackend();

    return () => {
      isMounted = false;
    };
  }, []);

  // Save to IndexedDB & LocalStorage and sync to backend API
  useEffect(() => {
    persistData(STORAGE_KEY, data);

    const syncTimer = setTimeout(async () => {
      try {
        await portfolioApi.savePortfolioData(data);
      } catch (e) {
        // Safe offline fallback
      }
    }, 600);

    return () => clearTimeout(syncTimer);
  }, [data]);

  // Instant save & persist helper
  const saveAllNow = async (explicitData = null) => {
    const toSave = explicitData || data;
    const stamped = {
      ...toSave,
      updatedAt: new Date().toISOString()
    };
    setData(stamped);
    await persistData(STORAGE_KEY, stamped);
    try {
      await portfolioApi.savePortfolioData(stamped);
    } catch (e) {}
    showToast('All changes saved and permanently persisted!');
    return true;
  };

  // Profile methods
  const updateProfile = (profileUpdates) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        profile: {
          ...prev.profile,
          ...profileUpdates
        }
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Studio & Brand profile updated successfully!');
  };

  const updateStats = (newStats) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        profile: {
          ...prev.profile,
          stats: newStats
        }
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Key statistics updated successfully');
  };

  // Films Section Header & Category Filters configuration
  const updateFilmsHeader = (headerUpdates) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        filmsHeader: {
          ...(prev.filmsHeader || {}),
          ...headerUpdates
        }
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Films section header & categories saved successfully!');
  };

  // Certificate / Permit methods
  // Certificate / Permit methods
  const addCertificate = (newCert) => {
    const now = new Date().toISOString();
    const certWithId = {
      ...newCert,
      id: newCert.id || `cert-${Date.now()}`
    };
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        certificates: [certWithId, ...prev.certificates]
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Official permit / accreditation added successfully');
    return certWithId;
  };

  const updateCertificate = (id, updatedFields) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        certificates: prev.certificates.map((cert) =>
          cert.id === id ? { ...cert, ...updatedFields } : cert
        )
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Accreditation saved successfully');
  };

  const deleteCertificate = (id) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        certificates: prev.certificates.filter((c) => c.id !== id)
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    if (editingCertId === id) {
      setEditingCertId(null);
    }
    showToast('Accreditation removed', 'info');
  };

  const refreshCertificates = () => {
    setData((prev) => ({
      ...prev,
      certificates: [...prev.certificates]
    }));
    showToast('Accreditations refreshed successfully');
  };

  // Project methods
  const addProject = (newProject) => {
    const now = new Date().toISOString();
    const normalized = normalizeProject({
      ...newProject,
      id: newProject.id || `proj-${Date.now()}`
    });
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        projects: [normalized, ...prev.projects]
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Film / Project added successfully');
    return normalized;
  };

  const updateProject = (id, updatedFields) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        projects: prev.projects.map((proj) =>
          proj.id === id ? normalizeProject({ ...proj, ...updatedFields }) : proj
        )
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Film details updated successfully');
  };

  const deleteProject = (id) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        projects: prev.projects.filter((p) => p.id !== id)
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Film removed', 'info');
  };

  // Services (Practice Areas) CRUD
  const addService = (newService) => {
    const now = new Date().toISOString();
    const serviceWithId = {
      ...newService,
      id: newService.id || `service-${Date.now()}`
    };
    setData((prev) => {
      const currentList = prev.services || prev.practiceAreas || [];
      const nextList = [...currentList, serviceWithId];
      const updated = {
        ...prev,
        updatedAt: now,
        practiceAreas: nextList,
        services: nextList
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Service package added successfully');
    return serviceWithId;
  };

  const updateService = (id, updatedFields) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const currentList = prev.services || prev.practiceAreas || [];
      const nextList = currentList.map((s) =>
        s.id === id ? { ...s, ...updatedFields } : s
      );
      const updated = {
        ...prev,
        updatedAt: now,
        practiceAreas: nextList,
        services: nextList
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Service package updated successfully');
  };

  const deleteService = (id) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const currentList = prev.services || prev.practiceAreas || [];
      const nextList = currentList.filter((s) => s.id !== id);
      const updated = {
        ...prev,
        updatedAt: now,
        practiceAreas: nextList,
        services: nextList
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Service package removed', 'info');
  };

  // Milestones CRUD
  const addMilestone = (newMilestone) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        milestones: [newMilestone, ...(prev.milestones || [])]
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Milestone added successfully');
  };

  const updateMilestone = (index, updatedFields) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const list = [...(prev.milestones || [])];
      if (list[index]) {
        list[index] = { ...list[index], ...updatedFields };
      }
      const updated = { ...prev, updatedAt: now, milestones: list };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Milestone updated successfully');
  };

  const deleteMilestone = (index) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        milestones: (prev.milestones || []).filter((_, i) => i !== index)
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Milestone removed', 'info');
  };

  // Skills update
  const updateSkills = (newSkills) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = {
        ...prev,
        updatedAt: now,
        skills: newSkills
      };
      persistData(STORAGE_KEY, updated);
      return updated;
    });
    showToast('Gear & Capabilities updated successfully');
  };

  // Reset to default
  const resetToDefault = () => {
    const confirmMsg = 'Are you sure you want to reset all data to a clean slate?';
    if (window.confirm(confirmMsg)) {
      const cleanData = {
        ...DEFAULT_PORTFOLIO_DATA,
        updatedAt: new Date().toISOString()
      };
      setData(cleanData);
      persistData(STORAGE_KEY, cleanData);
      try {
        fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanData)
        });
      } catch (e) {}
      showToast('Clean slate restored successfully!', 'info');
    }
  };

  // Export JSON backup file
  const exportDataJSON = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `kma_wedding_media_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('KMA complete data exported successfully!');
    } catch (e) {
      console.error(e);
      showToast('Failed to export backup.', 'error');
    }
  };

  // Import JSON backup file
  const importDataJSON = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.profile) {
          const stamped = {
            ...parsed,
            updatedAt: new Date().toISOString()
          };
          setData(stamped);
          persistData(STORAGE_KEY, stamped);
          try {
            fetch('/api/data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(stamped)
            });
          } catch (e) {}
          showToast('Data imported from JSON successfully!');
        } else {
          showToast('Invalid backup file structure.', 'error');
        }
      } catch (err) {
        showToast('Error reading JSON file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <PortfolioContext.Provider
      value={{
        data,
        lang,
        setLanguage,
        toggleLanguage,
        t,
        currentView,
        navigateTo,
        activeModalCert,
        setActiveModalCert,
        activeModalProject,
        setActiveModalProject,
        editingCertId,
        setEditingCertId,
        toast,
        showToast,
        // Theme & Background
        currentTheme,
        setTheme,
        THEME_PRESETS,
        bgTone,
        setBackgroundTone,
        BG_TONES,
        // Admin Security & Backend Status
        backendStatus,
        adminPasscode,
        adminUser,
        isAdminAuthenticated,
        loginAdmin,
        logoutAdmin,
        updateAdminPassword,
        updateAdminPasscode,
        // Email & Notification
        sendBookingEmail,
        sendTestEmail,
        // Profile & Stats
        updateProfile,
        updateStats,
        // Certificates
        addCertificate,
        updateCertificate,
        deleteCertificate,
        refreshCertificates,
        // Projects & Films Header Settings
        updateFilmsHeader,
        addProject,
        updateProject,
        deleteProject,
        normalizeProject,
        getProjectCover,
        // Services
        addService,
        updateService,
        deleteService,
        // Milestones
        addMilestone,
        updateMilestone,
        deleteMilestone,
        // Skills
        updateSkills,
        // Backup & Persistence
        saveAllNow,
        resetToDefault,
        exportDataJSON,
        importDataJSON,
        // Bookings
        bookings,
        addBooking,
        deleteBooking,
        updateBookingStatus
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
};

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
};
