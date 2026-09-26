import React, { useState, useEffect } from 'react';
import {
  Award,
  Mail,
  MapPin,
  Phone,
  ArrowRight,
  Search,
  RefreshCw,
  CheckCircle,
  Calendar,
  Layers,
  Send,
  Camera,
  Film,
  Video,
  Sparkles,
  Heart,
  Clock,
  ShieldCheck,
  Play
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePortfolio } from '../context/PortfolioContext';
import { getProjectCover } from '../utils/projectModel';

export const PortfolioPage = () => {
  const {
    data,
    t,
    setActiveModalCert,
    setActiveModalProject,
    refreshCertificates,
    addBooking,
    sendBookingEmail,
    showToast,
    isAdminAuthenticated
  } = usePortfolio();

  const [lastBookingSubmitted, setLastBookingSubmitted] = useState(null);

  const filmsHeader = data.filmsHeader || {
    badge: 'Cinematography & Films',
    title: 'KMA Featured Films & Highlights',
    subtitle: 'Watch live highlights from our premier weddings. Click on any work to play the video instantly.',
    countLabel: 'Films Shown',
    searchPlaceholder: 'Search films by title, venue, or style...',
    allWorksLabel: 'All Works',
    categories: [
      { id: 'weddings', label: 'Cinematic Weddings' },
      { id: 'destination', label: 'Destination Weddings' },
      { id: 'photography', label: 'Bridal Photography' },
      { id: 'events', label: 'Corporate Events' },
      { id: 'commercial', label: 'Commercial Media' }
    ]
  };

  const configuredCategories = filmsHeader.categories && filmsHeader.categories.length > 0
    ? filmsHeader.categories
    : [
        { id: 'weddings', label: 'Cinematic Weddings' },
        { id: 'destination', label: 'Destination Weddings' },
        { id: 'photography', label: 'Bridal Photography' },
        { id: 'events', label: 'Corporate Events' },
        { id: 'commercial', label: 'Commercial Media' }
      ];

  const projectCategories = [
    ...configuredCategories,
    { id: 'all', label: filmsHeader.allWorksLabel || 'All Works' }
  ];

  // Projects filter and search state (defaults to first category or 'all')
  const [projectFilter, setProjectFilter] = useState(() => configuredCategories[0]?.id || 'all');
  const [projectSearch, setProjectSearch] = useState('');

  // Keep filter valid if categories change
  useEffect(() => {
    if (projectFilter !== 'all' && !configuredCategories.some((c) => c.id === projectFilter)) {
      setProjectFilter(configuredCategories[0]?.id || 'all');
    }
  }, [configuredCategories, projectFilter]);

  // Filter projects
  const filteredProjects = (data.projects || []).filter((proj) => {
    if (proj.status === 'draft') return false;
    const matchesCategory = projectFilter === 'all' || proj.category === projectFilter;
    const titleText = (t(proj.title) || '').toLowerCase();
    const descText = (t(proj.description) || '').toLowerCase();
    const clientText = (t(proj.clientType) || '').toLowerCase();
    const q = projectSearch.toLowerCase();

    const matchesSearch = !q || titleText.includes(q) || descText.includes(q) || clientText.includes(q);
    return matchesCategory && matchesSearch;
  });

  // Contact / Event Booking form state
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    eventType: 'wedding',
    eventDate: '',
    location: '',
    message: ''
  });
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.phone || !contactForm.message) {
      showToast('Please enter your name, phone number, and event details.', 'error');
      return;
    }
    setIsSending(true);

    const bookingPayload = {
      name: contactForm.name.trim(),
      phone: contactForm.phone.trim(),
      email: contactForm.email.trim(),
      eventType: contactForm.eventType,
      eventDate: contactForm.eventDate,
      location: contactForm.location.trim(),
      message: contactForm.message.trim()
    };

    // 1. Record client-side in state & localStorage
    addBooking(bookingPayload);
    setLastBookingSubmitted(bookingPayload);

    // 2. Dispatch live email via Web3Forms API
    const emailResult = await sendBookingEmail(bookingPayload);

    setIsSending(false);

    if (emailResult.success && !emailResult.isLocalOnly) {
      showToast(
        `Thank you, ${contactForm.name}! Your booking request was recorded and emailed to ${t(data.profile?.shortName) || 'KMA'} management!`,
        'success'
      );
    } else {
      showToast(
        `Thank you, ${contactForm.name}! Your booking request was submitted and recorded in the Admin Panel.`,
        'success'
      );
    }

    confetti({
      particleCount: 130,
      spread: 85,
      origin: { y: 0.65 },
      colors: ['#b45309', '#78350f', '#d97706', '#f5ebd8', '#fbbf24', '#f43f5e']
    });

    setContactForm({
      name: '',
      phone: '',
      email: '',
      eventType: 'wedding',
      eventDate: '',
      location: '',
      message: ''
    });
  };

  // Scroll reveal observer
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.remove('reveal'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          observer.unobserve(el);
          el.classList.add('is-visible');
          const cleanup = () => {
            el.classList.remove('reveal', 'is-visible');
            el.style.transitionDelay = '';
            el.removeEventListener('transitionend', cleanup);
          };
          el.addEventListener('transitionend', cleanup);
          setTimeout(() => {
            if (el.classList.contains('reveal')) cleanup();
          }, 1500);
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [projectFilter]);

  return (
    <div className="relative isolate overflow-hidden bg-[#faf7f2]">
      {/* Background ambient glows */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[850px] h-[450px] bg-[#f2e7d5]/70 blur-[150px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-[900px] right-5 w-[600px] h-[500px] bg-[#f5ebd8]/80 blur-[140px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-[2000px] left-5 w-[650px] h-[500px] bg-[#ece0ca]/60 blur-[160px] rounded-full pointer-events-none -z-10" />

      {/* ============================================================ */}
      {/* 1. HERO SECTION (Logo first on mobile)                      */}
      {/* ============================================================ */}
      <section className="relative pt-6 pb-16 md:pt-14 md:pb-20 border-b border-[#e8dfd5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            
            {/* Logo Brand Showpiece: Renders FIRST on mobile (order-1), and right column on desktop (lg:order-2) */}
            <div className="order-1 lg:order-2 lg:col-span-5 flex justify-center">
              <div className="relative group w-full max-w-sm sm:max-w-md">
                <div className="absolute -inset-3 bg-gradient-to-r from-amber-700/20 via-yellow-600/15 to-amber-900/20 rounded-3xl blur-2xl opacity-80 group-hover:opacity-100 transition duration-500" />
                {/* <div className="relative rounded-3xl overflow-hidden border border-[#dfd2c0] bg-white shadow-2xl p-6 text-center space-y-5">
                  {/* Central KMA Logo */}
                  <div className="w-36 h-36 sm:w-48 sm:h-48 mx-auto rounded-full bg-white p-2.5 shadow-xl ring-4 ring-[#dfd2c0]/70 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                    <img
                      src={data.profile?.logoUrl || data.profile?.avatarUrl || "/logo.png"}
                      alt={t(data.profile?.fullName)}
                      className="w-full h-full object-contain rounded-full"
                      onError={(e) => { e.target.src = "/logo.png"; }}
                    />
                  </div>

                  {/* <div className="space-y-1.5 border-t border-[#f0e6d6] pt-3">
                    {/* <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Cinema Crew & 4K/6K Gear</span>
                    </div> }
                    <h3 className="text-base font-bold text-stone-900 judicial-heading">
                      {t(data.profile?.fullName)}
                    </h3>
                    <p className="text-xs text-stone-500 flex items-center justify-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                      <span>{t(data.profile?.location)}</span>
                    </p>
                  </div> 
                </div> */}
              </div>
            </div>

            {/* Headline & Action Column: Renders SECOND on mobile (order-2), left column on desktop (lg:order-1) */}
            <div className="order-2 lg:order-1 lg:col-span-7 space-y-6 text-center lg:text-left">
              {/* Title & Headline */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-center lg:justify-start gap-2.5">
                  <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-stone-900 judicial-heading">
                    <span className="gradient-gold">{t(data.profile?.shortName) || 'KMA'}</span>
                  </h1>
                  <span className="text-lg sm:text-2xl uppercase tracking-widest text-stone-500 font-light">
                    {t(data.profile?.brandSubtitle) || 'wedding'}
                  </span>
                </div>
                <h2 className="text-lg sm:text-2xl font-bold text-stone-800 leading-snug">
                  {t(data.profile?.title)}
                </h2>
                <p className="text-xs sm:text-base text-stone-600 max-w-2xl leading-relaxed mx-auto lg:mx-0 font-normal">
                  {t(data.profile?.tagline)}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-1">
                <button
                  onClick={() => {
                    const target = document.querySelector('#contact');
                    if (target) {
                      const navHeight = 84;
                      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-amber-800 to-yellow-900 hover:from-amber-700 hover:to-yellow-800 shadow-md transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Book Your Event Now</span>
                </button>

                <button
                  onClick={() => {
                    const target = document.querySelector('#projects');
                    if (target) {
                      const navHeight = 84;
                      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-xs sm:text-sm text-stone-800 bg-white hover:bg-[#f6eee4] border border-[#ded0bf] shadow-sm transition-all"
                >
                  <Film className="w-4 h-4 text-amber-800" />
                  <span>Explore Portfolio</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. VISION & MISSION SECTION                                  */}
      {/* ============================================================ */}
      <section id="about" className="py-16 sm:py-20 border-b border-[#e8dfd5] bg-[#f5ece1]/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-900">
              <Heart className="w-4 h-4 text-amber-800 fill-amber-800" />
              <span>Our Vision & Philosophy</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight judicial-heading">
              {`Crafting Visual Legacies with ${t(data.profile?.shortName) || 'KMA'}`}
            </h3>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              {t(data.profile?.bio)}
            </p>
          </div>

          {/* Dual Luxury Cards: Vision & Mission */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vision Card */}
            {/* <div className="p-8 rounded-3xl bg-white border border-[#ded0bf] shadow-sm hover:shadow-md transition-all space-y-4 relative overflow-hidden group">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold shadow-sm">
                <Sparkles className="w-6 h-6 text-amber-800" />
              </div>
              <h4 className="text-lg font-bold text-stone-900 judicial-heading">
                Our Artistic Vision
              </h4>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-medium">
                {t(data.profile?.vision) || 'To immortalize your once-in-a-lifetime celebrations into timeless cinema films that evoke deep emotions for generations.'}
              </p>
              <div className="pt-2 flex items-center gap-2 text-[11px] text-amber-900 font-bold uppercase tracking-wider">
                <span>✦ Timeless Visual Storytelling</span>
              </div>
            </div> */}

            {/* Mission Card */}
            {/* <div className="p-8 rounded-3xl bg-white border border-[#ded0bf] shadow-sm hover:shadow-md transition-all space-y-4 relative overflow-hidden group">
              <div className="w-12 h-12 rounded-2xl bg-[#efe6d8] text-amber-950 border border-[#dfd2c0] flex items-center justify-center font-bold shadow-sm">
                <Camera className="w-6 h-6 text-amber-800" />
              </div>
              <h4 className="text-lg font-bold text-stone-900 judicial-heading">
                Our Filmmaking Mission
              </h4>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-medium">
                {t(data.profile?.mission) || 'Blending state-of-the-art 4K cinema optics, artistic lighting, and candid documentary storytelling to deliver unmatched visual excellence.'}
              </p>
              <div className="pt-2 flex items-center gap-2 text-[11px] text-amber-900 font-bold uppercase tracking-wider">
                <span>✦ 4K/6K Cinema Standard</span>
              </div>
            </div> */}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. KEY NUMBERS & REALISTIC STATS (Only when configured)      */}
      {/* ============================================================ */}
      {(data.profile?.stats || []).length > 0 && (
        <section id="stats" className="py-14 sm:py-16 border-b border-[#e8dfd5] bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-xl mx-auto mb-10 space-y-1.5">
              <h3 className="text-xl sm:text-2xl font-bold text-stone-900 judicial-heading">
                Highlights in Numbers
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                A documented track record of client trust and excellence
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {(data.profile?.stats || []).map((stat, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-[#fbf9f6] border border-[#e8dfd5] text-center shadow-sm hover:border-amber-400 transition-colors space-y-1.5"
                >
                  <div className="text-3xl sm:text-4xl font-extrabold text-stone-900 font-serif gradient-gold">
                    {stat.value}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-stone-800">
                    {t(stat.label)}
                  </div>
                  {stat.desc && (
                    <div className="text-[11px] text-stone-500 font-medium">
                      {t(stat.desc)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 4. THE LEGACY & VENUES / PARTITIONS (Only when configured)   */}
      {/* ============================================================ */}
      {((data.milestones && data.milestones.length > 0) || (data.partners && data.partners.length > 0)) && (
        <section id="partners" className="py-16 sm:py-20 border-b border-[#e8dfd5] bg-[#f5ece1]/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            {/* Single Signature Milestone / Journey Block */}
            {data.milestones && data.milestones.length > 0 && (
              <div>
                <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-900">
                    <Clock className="w-4 h-4 text-amber-800" />
                    <span>{`The ${t(data.profile?.shortName) || 'KMA'} Creative Legacy`}</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-stone-900 judicial-heading">
                    Our Creative Journey & Heritage
                  </h3>
                </div>

                <div className="max-w-3xl mx-auto p-6 sm:p-8 rounded-3xl bg-white border border-[#ded0bf] shadow-md flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
                  <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-800 to-yellow-900 text-white font-bold font-mono text-sm shrink-0 shadow-sm">
                    {data.milestones[0]?.year}
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-base sm:text-lg font-bold text-stone-900 judicial-heading">
                      {t(data.milestones[0]?.title)}
                    </h4>
                    <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-medium">
                      {t(data.milestones[0]?.description)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Partitions & Prestige Venues We Filmed At */}
            {data.partners && data.partners.length > 0 && (
              <div className="pt-4">
                <div className="text-center max-w-xl mx-auto mb-8 space-y-1.5">
                  <h4 className="text-lg sm:text-xl font-bold text-stone-900 judicial-heading flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-700" />
                    <span>Prestigious Venues We Have Filmed At</span>
                  </h4>
                  <p className="text-xs text-stone-500 font-medium">
                    Experienced across top-tier luxury ballrooms, open-air venues, and coastal resorts
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {data.partners.map((partner, pIdx) => (
                    <div
                      key={pIdx}
                      className="p-4 rounded-2xl bg-white border border-[#ded0bf] hover:border-amber-700 transition-all text-center shadow-sm space-y-1 group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#f7efe4] text-amber-900 mx-auto flex items-center justify-center mb-1 group-hover:bg-amber-100 transition-colors">
                        <MapPin className="w-4 h-4 text-amber-800" />
                      </div>
                      <div className="text-xs font-bold text-stone-900 line-clamp-1">
                        {partner.name}
                      </div>
                      {partner.venueType && (
                        <div className="text-[10px] text-stone-500 font-medium line-clamp-1">
                          {partner.venueType}
                        </div>
                      )}
                      {partner.location && (
                        <div className="text-[10px] font-mono text-amber-900 font-bold">
                          {partner.location}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 5. FEATURED FILMS & PORTFOLIO SHOWCASE (Compact video items) */}
      {/* ============================================================ */}
      <section id="projects" className="py-20 border-b border-[#e8dfd5] bg-white/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-900 mb-1.5">
                <Film className="w-4 h-4 text-amber-800" />
                <span>{filmsHeader.badge || 'Cinematography & Films'}</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight judicial-heading">
                {filmsHeader.title || `${t(data.profile?.shortName) || 'KMA'} Featured Films & Highlights`}
              </h3>
              <p className="text-stone-600 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
                {filmsHeader.subtitle || 'Watch live highlights from our premier weddings. Click on any work to play the video instantly.'}
              </p>
            </div>

            <div className="text-xs font-bold text-amber-950 bg-amber-100/90 px-3.5 py-1.5 rounded-xl border border-amber-300 shrink-0 self-start md:self-end">
              <span>
                {filteredProjects.length} {filmsHeader.countLabel || 'Films Shown'}
              </span>
            </div>
          </div>

          {/* Search & Category Filter Bar */}
          <div className="flex flex-col md:flex-row gap-3 mb-8">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder={filmsHeader.searchPlaceholder || 'Search films by title, venue, or style...'}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#ded0bf] text-xs sm:text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-700 shadow-sm"
              />
            </div>

            {/* Category tabs (Specific wedding categories first, All Works at the end) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {projectCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setProjectFilter(cat.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    projectFilter === cat.id
                      ? 'bg-amber-800 text-white font-bold shadow-sm'
                      : 'bg-white text-stone-700 hover:bg-[#f6eee4] border border-[#ded0bf]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Compact Project Cards with Instant Video & Photo */}
          {filteredProjects.length === 0 ? (
            <div className="p-12 sm:p-16 text-center rounded-3xl bg-white border border-[#ded0bf] shadow-sm max-w-xl mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#f7efe4] text-amber-900 mx-auto flex items-center justify-center shadow-inner">
                <Film className="w-7 h-7 text-amber-800" />
              </div>
              <h4 className="text-base font-bold text-stone-900 judicial-heading">
                {(data.projects || []).length === 0
                  ? 'No Films Uploaded Yet'
                  : 'No Films Matching Search'}
              </h4>
              <p className="text-stone-500 font-medium text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">
                {(data.projects || []).length === 0
                  ? 'Your showcase is clean and ready. Add and upload your featured films, videos, and photography sessions from the Admin Dashboard.'
                  : 'No films match your selected filter or keywords. Try resetting your search.'}
              </p>
              {(data.projects || []).length > 0 ? (
                <button
                  onClick={() => {
                    setProjectSearch('');
                    setProjectFilter('weddings');
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs text-amber-900 font-bold bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map((proj) => {
                const coverMedia = getProjectCover(proj);
                const coverUrl = coverMedia?.url || proj.imageUrl || "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=800";
                const mediaItems = Array.isArray(proj.media) ? proj.media : [];
                const hasVideo = mediaItems.some((m) => m.type === 'video') || Boolean(proj.videoUrl);
                const mediaCount = mediaItems.length;

                return (
                  <div
                    key={proj.id}
                    onClick={() => setActiveModalProject(proj)}
                    className="beige-card rounded-2xl overflow-hidden cursor-pointer flex flex-col group relative transform transition-all duration-250 hover:-translate-y-1 border border-[#e8dfd5] hover:border-[#cbb497] shadow-sm hover:shadow-md"
                  >
                    {/* Compact Media Header (Image + Video Play Button) */}
                    <div className="relative h-44 sm:h-48 w-full bg-stone-900 overflow-hidden">
                      <img
                        src={coverUrl}
                        alt={t(proj.title)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />

                      {/* Dark gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/20 to-transparent group-hover:via-stone-950/30 transition-colors" />

                      {/* Instant Play or View Button */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-11 h-11 rounded-full bg-amber-800/90 text-white flex items-center justify-center shadow-xl group-hover:bg-amber-700 transform group-hover:scale-110 transition-all border border-amber-300/40">
                          {hasVideo ? (
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                          ) : (
                            <Camera className="w-4 h-4 text-white" />
                          )}
                        </div>
                      </div>

                      {/* Top Left: Category Pill */}
                      <div className="absolute top-2.5 left-2.5">
                        <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-md bg-white/95 backdrop-blur-md text-amber-950 border border-amber-300 shadow-sm">
                          {t(proj.categoryLabel)}
                        </span>
                      </div>

                      {/* Top Right: Badges for Video & Media count */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                        {hasVideo && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-stone-950/85 text-amber-300 border border-amber-500/30 font-mono shadow-sm flex items-center gap-1">
                            <Video className="w-3 h-3 text-amber-400" />
                            <span>Film</span>
                          </span>
                        )}
                        {mediaCount > 1 && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-stone-950/85 text-white/90 border border-white/20 font-mono shadow-sm flex items-center gap-1">
                            <Camera className="w-3 h-3 text-amber-300" />
                            <span>{mediaCount}</span>
                          </span>
                        )}
                      </div>

                      {/* Bottom overlay: Year & Venue */}
                      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-white/90 font-mono drop-shadow">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>{proj.year}</span>
                        </span>
                        <span className="truncate max-w-[170px] text-stone-300">
                          {proj.location || proj.tribunal?.split('•')[0]}
                        </span>
                      </div>
                    </div>

                    {/* Compact Card Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-stone-900 group-hover:text-amber-800 transition-colors line-clamp-1 judicial-heading">
                          {t(proj.title)}
                        </h4>

                        <p className="text-[11px] text-stone-600 line-clamp-2 leading-relaxed mt-1">
                          {t(proj.description)}
                        </p>
                      </div>

                      {/* Card Footer: Play / Inspect trigger */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#eee5d8] text-[11px] font-bold text-amber-900">
                        <span className="flex items-center gap-1">
                          {hasVideo ? (
                            <>
                              <Play className="w-3 h-3 fill-amber-800 text-amber-800" />
                              <span>View Production & Film</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-3 h-3 text-amber-800" />
                              <span>View Project Gallery</span>
                            </>
                          )}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform text-amber-800" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. BOOKING & CONTACT FORM */}
      {/* ============================================================ */}
      <section id="contact" className="py-24 bg-[#f5ece1]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Direct Contact Info */}
            <div className="reveal lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-900">
                <Heart className="w-4 h-4 text-amber-800 fill-amber-800" />
                <span>{`Connect with ${t(data.profile?.shortName) || 'KMA'}`}</span>
              </div>
              <h3 className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight judicial-heading">
                {`Reserve Your Date with ${t(data.profile?.shortName) || 'KMA'}`}
              </h3>
              <p className="text-stone-600 text-xs sm:text-base leading-relaxed">
                We are thrilled to capture your once-in-a-lifetime moments. Fill in your event details to check availability.
              </p>

              <div className="space-y-3.5 pt-2">
                <a
                  href={`mailto:${data.profile.email}`}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#ded0bf] hover:border-amber-700 transition-colors text-stone-700 hover:text-stone-900 shadow-sm"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center border border-amber-300 shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-stone-500 uppercase font-bold">
                      Official Email
                    </div>
                    <div className="text-sm font-bold text-stone-900 font-mono">{data.profile.email}</div>
                  </div>
                </a>

                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#ded0bf] text-stone-700 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-[#efe6d8] text-amber-950 flex items-center justify-center border border-[#dfd2c0] shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-stone-500 uppercase font-bold">
                      Studio & Production Base
                    </div>
                    <div className="text-sm font-bold text-stone-900">{t(data.profile.location)}</div>
                  </div>
                </div>

                {data.profile.phone && (
                  <a
                    href={`tel:${data.profile.phone.replace(/[^+\d]/g, '')}`}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#ded0bf] hover:border-amber-700 transition-colors text-stone-700 hover:text-stone-900 shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#efe6d8] text-amber-950 flex items-center justify-center border border-[#dfd2c0] shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] text-stone-500 uppercase font-bold">
                        Phone / WhatsApp
                      </div>
                      <div className="text-sm font-bold text-stone-900 font-mono">{data.profile.phone}</div>
                    </div>
                  </a>
                )}
              </div>
            </div>

            {/* Interactive Wedding Booking Form */}
            <div className="reveal lg:col-span-7" style={{ transitionDelay: '120ms' }}>
              <div className="p-8 sm:p-10 rounded-3xl bg-white border border-[#ded0bf] shadow-xl space-y-6">
                {/* Fast WhatsApp Bar */}
                {data.profile?.phone && (
                  <div className="p-4 rounded-2xl bg-[#f0faf3] border border-[#c3ebce] flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#25D366] text-white flex items-center justify-center shadow-sm shrink-0">
                        <Phone className="w-5 h-5 fill-current" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-900">
                          Prefer instant direct concierge?
                        </div>
                        <div className="text-[11px] text-stone-500">
                          Available 24/7 for date checks & packages
                        </div>
                      </div>
                    </div>
                    <a
                      href={`https://wa.me/${data.profile.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Hello ${t(data.profile?.fullName) || 'KMA Wedding'}, I would like to inquire about booking your cinematic team for an upcoming event.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs shadow-sm transition-all text-center shrink-0 flex items-center justify-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 fill-current" />
                      <span>Chat via WhatsApp</span>
                    </a>
                  </div>
                )}

                <div className="flex items-center justify-between pb-4 border-b border-[#f0e6d6]">
                  <div>
                    <h4 className="text-xl font-bold text-stone-900 judicial-heading">
                      Event Booking Form
                    </h4>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Book in advance to secure our cinematography crew for your date
                    </p>
                  </div>
                  <Sparkles className="w-5 h-5 text-amber-700 shrink-0" />
                </div>

                <form onSubmit={handleSendMessage} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        placeholder="Full Name"
                        className="w-full px-4 py-3 rounded-xl bg-[#fbf9f6] border border-[#ded0bf] text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-700 text-xs sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                        Phone / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        placeholder="+20 ..."
                        className="w-full px-4 py-3 rounded-xl bg-[#fbf9f6] border border-[#ded0bf] text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-700 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                        Event Date
                      </label>
                      <input
                        type="date"
                        value={contactForm.eventDate}
                        onChange={(e) => setContactForm({ ...contactForm, eventDate: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#fbf9f6] border border-[#ded0bf] text-stone-900 focus:outline-none focus:border-amber-700 text-xs sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                        Venue / City
                      </label>
                      <input
                        type="text"
                        value={contactForm.location}
                        onChange={(e) => setContactForm({ ...contactForm, location: e.target.value })}
                        placeholder="Venue Name / City"
                        className="w-full px-4 py-3 rounded-xl bg-[#fbf9f6] border border-[#ded0bf] text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-700 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      Event Type
                    </label>
                    <select
                      value={contactForm.eventType}
                      onChange={(e) => setContactForm({ ...contactForm, eventType: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#fbf9f6] border border-[#ded0bf] text-stone-900 focus:outline-none focus:border-amber-700 text-xs sm:text-sm font-medium"
                    >
                      <option value="wedding">Cinematic Wedding</option>
                      <option value="destination">Destination Beach Wedding</option>
                      <option value="engagement">Engagement & Photoshoot</option>
                      <option value="event">Corporate Event</option>
                      <option value="commercial">Commercial Video</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      Additional Notes / Vision *
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      placeholder="Tell us about your vision for the special day..."
                      className="w-full px-4 py-3 rounded-xl bg-[#fbf9f6] border border-[#ded0bf] text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-700 text-xs sm:text-sm resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSending}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-amber-800 to-yellow-900 hover:from-amber-700 hover:to-yellow-800 shadow-md transition-all disabled:opacity-50"
                  >
                    {isSending ? (
                      <span>Sending Request...</span>
                    ) : (
                      <>
                        <span>Submit Booking Request</span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {lastBookingSubmitted && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2.5 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold">
                          {`Thank you, ${lastBookingSubmitted.name}! Your request has been recorded.`}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        {`You can also send a direct instant copy via WhatsApp to confirm availability immediately with ${t(data.profile?.shortName) || 'KMA'}.`}
                      </p>
                      {data.profile?.phone && (
                        <a
                          href={`https://wa.me/${data.profile.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `Hello ${t(data.profile?.shortName) || 'KMA'} Team! I just submitted a booking request for my ${lastBookingSubmitted.eventType} on ${lastBookingSubmitted.eventDate || 'soon'} in ${lastBookingSubmitted.location || 'Cairo'}. Name: ${lastBookingSubmitted.name}.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Confirm Instantly via WhatsApp</span>
                        </a>
                      )}
                    </div>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
