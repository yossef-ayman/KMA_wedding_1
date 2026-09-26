import React, { useState, useEffect } from 'react';
import { Menu, X, Eye, ArrowRight, Camera, Sparkles, Film, LogIn, LayoutDashboard } from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';

export const Navbar = () => {
  const { data, t, currentView, navigateTo, isAdminAuthenticated } = usePortfolio();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  const navLinks = [
    { label: 'Vision & About', href: '#about' },
    { label: 'Key Highlights', href: '#stats' },
    { label: 'Venues & Partners', href: '#partners' },
    { label: 'Films & Showcase', href: '#projects' },
    { label: 'VIP Booking', href: '#contact' },
  ];

  useEffect(() => {
    if (currentView !== 'portfolio') return;

    const handleScroll = () => {
      const scrollPosition = window.scrollY + 140;
      for (const link of [...navLinks].reverse()) {
        const section = document.querySelector(link.href);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(link.href.replace('#', ''));
          return;
        }
      }
      if (window.scrollY < 200) {
        setActiveSection('home');
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentView]);

  const scrollToSection = (href) => {
    setMobileMenuOpen(false);

    if (currentView !== 'portfolio') {
      navigateTo('portfolio');
      setTimeout(() => {
        performScroll(href);
      }, 150);
    } else {
      performScroll(href);
    }
  };

  const performScroll = (href) => {
    if (href === '#') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = document.querySelector(href);
    if (target) {
      const navHeight = 84;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#e8dfd5] bg-[#faf7f2]/95 backdrop-blur-xl shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-3">
          {/* Brand Logo & Name */}
          <div
            onClick={() => {
              if (currentView !== 'portfolio') {
                navigateTo('portfolio');
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="flex items-center gap-3.5 cursor-pointer group shrink-0"
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-[#cbb497] group-hover:ring-stone-900 transition-all shadow-md bg-white p-0.5 flex items-center justify-center">
                <img
                  src={data.profile.logoUrl || data.profile.avatarUrl || "/logo.png"}
                  alt={t(data.profile.shortName) || "KMA"}
                  className="w-full h-full object-contain rounded-full group-hover:scale-105 transition-transform"
                  onError={(e) => { e.target.src = "/logo.png"; }}
                />
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-600 border-2 border-[#faf7f2] rounded-full"
                title="Available for Booking"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-extrabold tracking-tight text-stone-900 group-hover:text-amber-800 transition-colors judicial-heading">
                  {t(data.profile?.shortName) || 'KMA'}
                </span>
                <span className="text-xs uppercase tracking-widest text-stone-500 font-light font-sans">
                  {t(data.profile?.brandSubtitle) || 'wedding'}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded-full border border-amber-300/80">
                  <Film className="w-3 h-3 text-amber-800" />
                  <span>Cinema & Media</span>
                </span>
              </div>
              <p className="text-xs text-stone-500 truncate max-w-[190px] sm:max-w-[280px] font-medium">
                {t(data.profile.title)}
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          {currentView === 'portfolio' ? (
            <nav className="hidden xl:flex items-center gap-1 bg-[#f4ece1]/80 px-3 py-1.5 rounded-2xl border border-[#e5dacb] shadow-inner">
              {navLinks.map((link) => {
                const isActive = activeSection === link.href.replace('#', '');
                return (
                  <button
                    key={link.label}
                    onClick={() => scrollToSection(link.href)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-amber-800 text-white shadow-md shadow-amber-900/20 font-bold'
                        : 'text-stone-700 hover:text-stone-950 hover:bg-[#e9ded0]'
                    }`}
                  >
                    {link.label}
                  </button>
                );
              })}
            </nav>
          ) : (
            <div className="hidden xl:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#f4ece1] border border-[#e5dacb] text-xs text-stone-600 font-medium">
              <Camera className="w-4 h-4 text-amber-800" />
              <span>{`${t(data.profile?.shortName) || 'KMA'} Media Admin Mode`}</span>
            </div>
          )}

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {currentView === 'portfolio' ? (
              <>
                <button
                  onClick={() => scrollToSection('#contact')}
                  className="hidden md:flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-800 to-yellow-900 hover:from-amber-700 hover:to-yellow-800 rounded-xl transition-all shadow-md shadow-amber-950/15"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Book Your Wedding</span>
                </button>

                <button
                  onClick={() => navigateTo('admin')}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-stone-700 hover:text-stone-950 bg-white hover:bg-[#f6eee4] border border-[#ded0bf] hover:border-amber-700/50 rounded-xl transition-all shadow-sm"
                  title={isAdminAuthenticated ? "Go to Admin Dashboard" : "Sign In to Admin Portal"}
                >
                  {isAdminAuthenticated ? (
                    <LayoutDashboard className="w-3.5 h-3.5 text-amber-800" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5 text-amber-800" />
                  )}
                  <span>{isAdminAuthenticated ? 'Admin Panel' : 'Sign In'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => navigateTo('portfolio')}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-800 to-yellow-900 hover:from-amber-700 hover:to-yellow-800 rounded-xl transition-all shadow-md"
              >
                <Eye className="w-4 h-4" />
                <span>Public Showcase</span>
              </button>
            )}

            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-stone-700 hover:text-stone-950 bg-white border border-[#e2d7c8] rounded-xl shadow-sm xl:hidden"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-[#e8dfd5] bg-[#faf7f2]/98 backdrop-blur-2xl px-4 pt-3 pb-6 space-y-2 shadow-xl animate-fade-in">
          {currentView === 'portfolio' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {navLinks.map((link) => {
                const isActive = activeSection === link.href.replace('#', '');
                return (
                  <button
                    key={link.label}
                    onClick={() => scrollToSection(link.href)}
                    className={`px-4 py-2.5 text-xs font-semibold rounded-xl text-left transition-all flex items-center justify-between ${
                      isActive
                        ? 'bg-amber-800 text-white font-bold'
                        : 'bg-white text-stone-700 hover:bg-[#f6eee4] hover:text-stone-950 border border-[#e2d7c8]'
                    }`}
                  >
                    <span>{link.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-[#e8dfd5] flex flex-col gap-2">
            <button
              onClick={() => scrollToSection('#contact')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-white bg-gradient-to-r from-amber-800 to-yellow-900 rounded-xl shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              <span>Book Your Event / Wedding Now</span>
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                navigateTo('admin');
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-stone-800 bg-white hover:bg-[#f6eee4] rounded-xl border border-[#ded0bf] shadow-sm transition-all"
            >
              {isAdminAuthenticated ? (
                <LayoutDashboard className="w-4 h-4 text-amber-800" />
              ) : (
                <LogIn className="w-4 h-4 text-amber-800" />
              )}
              <span>{isAdminAuthenticated ? 'Admin Dashboard' : 'Sign In'}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
