import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  ChevronUp,
  Expand,
  Heart,
  Home,
  House,
  Layers3,
  LayoutGrid,
  MapPin,
  Search,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import { Icon } from '../components';
import { fa, money, persist, readSaved, timeAgo } from '../utils';
import './explore.css';

const VIEWS = new Set(['feed', 'search', 'grid', 'saved']);
const EXAMPLES = ['صادقیه با پارکینگ', 'دو خواب نزدیک مترو', 'رهن کامل'];

function initialState() {
  const params = new URLSearchParams(location.search);
  const requestedView = params.get('view');
  return {
    view: VIEWS.has(requestedView) ? requestedView : 'feed',
    query: params.get('q') || '',
  };
}

function ExploreNav({ view, onView, savedCount }) {
  const items = [
    ['feed', Sparkles, 'کشف'],
    ['search', Search, 'جست‌وجو'],
    ['grid', LayoutGrid, 'شبکه'],
    ['saved', Heart, 'نشان‌شده'],
  ];
  const onKeyDown = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowLeft'
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
    onView(items[nextIndex][0]);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };
  return (
    <nav className="explore-nav" aria-label="حالت نمایش خانه‌ها" role="tablist">
      {items.map(([key, icon, label], index) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={view === key}
          aria-controls={`explore-${key}`}
          tabIndex={view === key ? 0 : -1}
          onClick={() => onView(key)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className="explore-nav-icon">
            <Icon
              name={icon}
              size={22}
              fill={key === 'saved' && view === key ? 'currentColor' : 'none'}
            />
            {key === 'saved' && savedCount > 0 && <b>{fa(savedCount)}</b>}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function ExploreTopbar({ view, count }) {
  return (
    <header className="explore-topbar">
      <a href="/" aria-label="ترب؛ صفحهٔ اصلی" className="explore-brand">
        <span>
          <Icon name={House} size={20} />
        </span>
        <strong>ترب خانه</strong>
      </a>
      <h1>
        {view === 'feed' ? 'کشف خانه' : view === 'saved' ? 'خانه‌های نشان‌شده' : 'خانه‌های تهران'}
      </h1>
      <span className="explore-count">{fa(count)} خانه</span>
    </header>
  );
}

function FeedSlide({ home, index, total, saved, onSave, onShare, onGrid }) {
  return (
    <article className="explore-slide" id={`explore-home-${home.id}`} data-home-id={home.id}>
      <div className="explore-slide-media">
        <img
          src={home.image}
          alt={`تصویر نمایشی ${home.title}؛ تصویر ملک واقعی نیست`}
          loading={index < 2 ? 'eager' : 'lazy'}
        />
      </div>
      <div className="explore-slide-shade" />
      <div className="explore-slide-meta">
        <span>تصویر نمایشی</span>
        <span>
          {fa(index + 1)} / {fa(total)}
        </span>
      </div>
      <div className="explore-actions" aria-label={`اقدام‌های ${home.title}`}>
        <button
          type="button"
          className={saved ? 'active' : ''}
          aria-label={`${saved ? 'حذف از' : 'افزودن به'} نشان‌شده‌ها: ${home.title}`}
          aria-pressed={saved}
          onClick={() => onSave(home.id)}
        >
          <span>
            <Icon name={Heart} size={23} fill={saved ? 'currentColor' : 'none'} />
          </span>
          <small>{saved ? 'ذخیره شد' : 'نشان'}</small>
        </button>
        <button
          type="button"
          aria-label={`اشتراک‌گذاری ${home.title}`}
          onClick={() => onShare(home)}
        >
          <span>
            <Icon name={Share2} size={22} />
          </span>
          <small>ارسال</small>
        </button>
        <button type="button" aria-label="نمایش شبکه‌ای خانه‌ها" onClick={onGrid}>
          <span>
            <Icon name={LayoutGrid} size={21} />
          </span>
          <small>شبکه</small>
        </button>
      </div>
      <div className="explore-slide-copy">
        <div className="explore-location">
          <span>
            <Icon name={MapPin} size={14} /> تهران، {home.district}
          </span>
          <span>{timeAgo(home.best.observedAt)}</span>
        </div>
        <h2>{home.title}</h2>
        <div className="explore-facts">
          <span>
            <Icon name={Expand} size={16} /> {fa(home.area)} متر
          </span>
          <span>
            <Icon name={BedDouble} size={17} /> {fa(home.bedrooms)} خواب
          </span>
          <span>
            <Icon name={Building2} size={16} /> طبقهٔ {fa(home.floor)}
          </span>
        </div>
        <div className="explore-price-row">
          <div>
            <small>ودیعه</small>
            <strong>{money(home.best.deposit)}</strong>
          </div>
          <div>
            <small>اجارهٔ ماهانه</small>
            <strong>{home.best.rent === 0 ? 'رهن کامل' : money(home.best.rent)}</strong>
          </div>
        </div>
        <div className="explore-offer-row">
          <span>
            <Icon name={Layers3} size={16} /> {fa(home.freshOfferCount)} پیشنهاد تازه
          </span>
          <a href={`/khaneh?districts=${encodeURIComponent(home.district)}`}>
            جزئیات و مقایسه
            <Icon name={ArrowLeft} size={16} />
          </a>
        </div>
        {index === 0 && total > 1 && (
          <span className="explore-swipe-hint">
            <Icon name={ChevronUp} size={15} /> برای خانهٔ بعدی بالا بکش
          </span>
        )}
      </div>
    </article>
  );
}

function GridCard({ home, saved, onOpen, onSave }) {
  return (
    <article className="explore-grid-card">
      <button type="button" className="explore-grid-photo" onClick={() => onOpen(home.id)}>
        <img src={home.image} alt={`تصویر نمایشی ${home.title}`} loading="lazy" />
        <span>{home.district}</span>
      </button>
      <button
        type="button"
        className={saved ? 'explore-grid-save active' : 'explore-grid-save'}
        aria-label={`${saved ? 'حذف از' : 'افزودن به'} نشان‌شده‌ها: ${home.title}`}
        aria-pressed={saved}
        onClick={() => onSave(home.id)}
      >
        <Icon name={Heart} size={17} fill={saved ? 'currentColor' : 'none'} />
      </button>
      <div>
        <h2>{home.title}</h2>
        <p>
          {fa(home.area)} متر · {fa(home.bedrooms)} خواب
        </p>
        <strong>{home.best.rent === 0 ? 'رهن کامل' : `${money(home.best.rent)} اجاره`}</strong>
      </div>
    </article>
  );
}

export default function ExploreApp() {
  const initial = initialState();
  const [view, setView] = useState(initial.view);
  const [query, setQuery] = useState(initial.query);
  const [draft, setDraft] = useState(initial.query);
  const [homes, setHomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(() => readSaved('khaneh-saved', []));
  const [pendingHome, setPendingHome] = useState(null);
  const [toast, setToast] = useState('');
  const feedRef = useRef(null);

  useEffect(() => {
    document.title = 'اکسپلور خانه | ترب خانه';
    document.body.classList.add('explore-active');
    return () => document.body.classList.remove('explore-active');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('خانه‌ها دریافت نشدند. دوباره تلاش کنید.');
        const result = await response.json();
        setHomes(result.results || []);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => persist('khaneh-saved', saved), [saved]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (view !== 'feed') params.set('view', view);
    history.replaceState(null, '', `/explore${params.size ? `?${params}` : ''}`);
  }, [query, view]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (view !== 'feed' || !pendingHome) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`explore-home-${pendingHome}`)?.scrollIntoView({ block: 'start' });
      setPendingHome(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingHome, view]);

  const displayed = view === 'saved' ? homes.filter((home) => saved.includes(home.id)) : homes;
  const toggleSaved = (id) =>
    setSaved((current) =>
      current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id],
    );
  const changeView = (nextView) => {
    setView(nextView);
    if (nextView === 'feed') requestAnimationFrame(() => feedRef.current?.scrollTo({ top: 0 }));
  };
  const openInFeed = (id) => {
    setPendingHome(id);
    setView('feed');
  };
  const submitSearch = (event, value = draft) => {
    event?.preventDefault();
    setDraft(value);
    setQuery(value.trim());
    setView('feed');
  };
  const share = async (home) => {
    const url = `${location.origin}/khaneh?districts=${encodeURIComponent(home.district)}`;
    try {
      if (navigator.share)
        await navigator.share({ title: home.title, text: `خانه‌ای در ${home.district}`, url });
      else await navigator.clipboard.writeText(url);
      setToast('لینک خانه آمادهٔ ارسال شد.');
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setToast('لینک را از نوار آدرس کپی کنید.');
    }
  };

  return (
    <div className={`explore-app explore-view-${view}`} dir="rtl">
      <a className="skip-link" href="#explore-content">
        رفتن به خانه‌ها
      </a>
      <ExploreTopbar view={view} count={displayed.length} />
      <main id="explore-content" className="explore-main">
        {view === 'search' ? (
          <section
            className="explore-search"
            id="explore-search"
            role="tabpanel"
            aria-label="جست‌وجوی خانه"
          >
            <div className="explore-search-intro">
              <span>
                <Icon name={Sparkles} size={17} /> جست‌وجوی تصویری
              </span>
              <h2>چی از خانهٔ بعدی می‌خواهی؟</h2>
              <p>محله، بودجه یا ویژگی مهمت را بنویس؛ نتیجه را مستقیم در اکسپلور ببین.</p>
            </div>
            <form className="explore-search-form" role="search" onSubmit={submitSearch}>
              <Icon name={Search} size={20} />
              <label className="sr-only" htmlFor="explore-query">
                جست‌وجوی خانه در اکسپلور
              </label>
              <input
                id="explore-query"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="مثلاً صادقیه با پارکینگ"
                autoComplete="off"
                maxLength={500}
              />
              {draft && (
                <button type="button" aria-label="پاک کردن جست‌وجو" onClick={() => setDraft('')}>
                  <Icon name={X} size={17} />
                </button>
              )}
              <button className="explore-search-submit" type="submit">
                دیدن
                <Icon name={ArrowLeft} size={17} />
              </button>
            </form>
            <div className="explore-suggestions" aria-label="جست‌وجوهای پیشنهادی">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => submitSearch(null, example)}>
                  {example}
                </button>
              ))}
            </div>
            {query && (
              <div className="explore-current-search">
                <span>جست‌وجوی فعال</span>
                <strong>{query}</strong>
                <button type="button" onClick={() => submitSearch(null, '')}>
                  حذف
                </button>
              </div>
            )}
            <div className="explore-search-preview">
              <span>
                {loading ? 'در حال جست‌وجو…' : `${fa(homes.length)} خانه آمادهٔ مرور است`}
              </span>
              <button type="button" onClick={() => setView('grid')}>
                دیدن شبکه
                <Icon name={LayoutGrid} size={17} />
              </button>
            </div>
          </section>
        ) : view === 'grid' || view === 'saved' ? (
          <section
            className="explore-grid-screen"
            id={view === 'saved' ? 'explore-saved' : 'explore-grid'}
            role="tabpanel"
            aria-label={view === 'saved' ? 'خانه‌های نشان‌شده' : 'نمای شبکه‌ای خانه‌ها'}
          >
            <div className="explore-grid-heading">
              <div>
                <span>{view === 'saved' ? 'انتخاب‌های تو' : 'همه در یک نگاه'}</span>
                <h2>{view === 'saved' ? 'خانه‌های نشان‌شده' : 'شبکهٔ خانه‌ها'}</h2>
              </div>
              <button type="button" onClick={() => setView('search')}>
                <Icon name={Search} size={18} /> جست‌وجو
              </button>
            </div>
            {loading ? (
              <div className="explore-loading" aria-busy="true">
                در حال چیدن خانه‌ها…
              </div>
            ) : error ? (
              <div className="explore-empty">
                <p>{error}</p>
              </div>
            ) : displayed.length === 0 ? (
              <div className="explore-empty">
                <Icon name={view === 'saved' ? Heart : Home} size={34} />
                <h2>{view === 'saved' ? 'هنوز خانه‌ای نشان نکردی' : 'خانه‌ای پیدا نشد'}</h2>
                <p>
                  {view === 'saved'
                    ? 'در نمای کشف، قلب هر خانه را بزن تا اینجا بماند.'
                    : 'عبارت جست‌وجو را تغییر بده.'}
                </p>
                <button type="button" onClick={() => setView(view === 'saved' ? 'feed' : 'search')}>
                  ادامه
                </button>
              </div>
            ) : (
              <div className="explore-grid">
                {displayed.map((home) => (
                  <GridCard
                    key={home.id}
                    home={home}
                    saved={saved.includes(home.id)}
                    onOpen={openInFeed}
                    onSave={toggleSaved}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section
            ref={feedRef}
            className="explore-feed"
            id="explore-feed"
            role="tabpanel"
            aria-label="اکسپلور خانه‌ها"
          >
            {loading ? (
              <div className="explore-feed-state" aria-busy="true">
                <span className="explore-loader" />
                <p>داریم خانه‌ها را می‌چینیم…</p>
              </div>
            ) : error ? (
              <div className="explore-feed-state">
                <p>{error}</p>
              </div>
            ) : displayed.length === 0 ? (
              <div className="explore-feed-state">
                <Icon name={Search} size={36} />
                <h2>خانه‌ای با این عبارت پیدا نشد</h2>
                <button type="button" onClick={() => setView('search')}>
                  تغییر جست‌وجو
                </button>
              </div>
            ) : (
              displayed.map((home, index) => (
                <FeedSlide
                  key={home.id}
                  home={home}
                  index={index}
                  total={displayed.length}
                  saved={saved.includes(home.id)}
                  onSave={toggleSaved}
                  onShare={share}
                  onGrid={() => setView('grid')}
                />
              ))
            )}
          </section>
        )}
      </main>
      <ExploreNav view={view} onView={changeView} savedCount={saved.length} />
      <div className="explore-toast" role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
