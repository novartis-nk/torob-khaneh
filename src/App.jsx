import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  MapPin,
  Heart,
  ArrowLeft,
  ArrowUpLeft,
  Bookmark,
  X,
  LayoutGrid,
  Map as MapIcon,
  SlidersHorizontal,
  Check,
  Info,
  Layers3,
  House,
  ArrowLeftRight,
  ChevronLeft,
  RotateCcw,
  Share2,
  Bell,
  Database,
  Sparkles,
} from 'lucide-react';
import { Icon, HomeCard, Filters, Modal, Detail, Compare, MapView } from './components';
import { fa, readSaved, persist, searchParams, initialParams } from './utils';
const DISTRICTS = [
  'صادقیه',
  'ستارخان',
  'جنت آباد',
  'پونک',
  'شهرآرا',
  'یوسف آباد',
  'امیرآباد',
  'تهرانپارس',
];
const EXAMPLES = [
  'دو خواب، ودیعه تا ۶۰۰ میلیون، اجاره تا ۲۰ میلیون، نزدیک مترو',
  'صادقیه با پارکینگ',
  'رهن کامل',
  'اجاره تا ۱۵ میلیون',
];
const init = initialParams();
export default function App() {
  const [query, setQuery] = useState(init.q),
    [draft, setDraft] = useState(init.q),
    [filters, setFilters] = useState(init.filters),
    [sort, setSort] = useState(init.sort),
    [data, setData] = useState(null),
    [catalog, setCatalog] = useState(null),
    [allHomes, setAllHomes] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [view, setView] = useState('grid'),
    [saved, setSaved] = useState(() => readSaved('khaneh-saved', [])),
    [savedOnly, setSavedOnly] = useState(false),
    [compareIds, setCompareIds] = useState([]),
    [detail, setDetail] = useState(null),
    [modal, setModal] = useState(null),
    [source, setSource] = useState(null),
    [sourceError, setSourceError] = useState(''),
    [mobileFilters, setMobileFilters] = useState(false),
    [toast, setToast] = useState(''),
    [savedSearches, setSavedSearches] = useState(() => readSaved('khaneh-searches', []));
  const searchRef = useRef(null),
    resultsRef = useRef(null),
    sourceRequest = useRef(0);
  const params = searchParams(query, filters, sort).toString();
  const effective = data?.filters || filters,
    rate = Number(effective.rate ?? 1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error('جست‌وجو انجام نشد. فیلترها و اتصال را بررسی کنید.');
        const next = await res.json();
        setData(next);
        history.replaceState(null, '', `${location.pathname}${params ? `?${params}` : ''}`);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params, retry]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/catalog', { signal: controller.signal }).then((r) => {
        if (!r.ok) throw Error('catalog');
        return r.json();
      }),
      fetch(`/api/search?rate=${rate}`, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw Error('catalog');
        return r.json();
      }),
    ])
      .then(([c, h]) => {
        setCatalog(c);
        setAllHomes(h.results);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setAllHomes([]);
      });
    return () => controller.abort();
  }, [rate, retry]);
  useEffect(() => {
    persist('khaneh-saved', saved);
  }, [saved]);
  useEffect(() => {
    persist('khaneh-searches', savedSearches);
  }, [savedSearches]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const fn = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  const reset = () => {
    setQuery('');
    setDraft('');
    setFilters({});
    setSort('recommended');
    setSavedOnly(false);
  };
  const change = (key, value) => {
    setFilters({ ...effective, [key]: value });
    setQuery('');
    setDraft('');
  };
  const doSearch = (text) => {
    setDraft(text);
    setQuery(text);
    setFilters({ rate });
    setSavedOnly(false);
  };
  const toggleSave = (id) =>
    setSaved((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  const toggleCompare = (id) =>
    setCompareIds((old) => {
      if (old.includes(id)) return old.filter((x) => x !== id);
      if (old.length >= 3) {
        setToast('حداکثر سه خانه را می‌توانید هم‌زمان مقایسه کنید.');
        return old;
      }
      return [...old, id];
    });
  const homeMap = new Map([...allHomes, ...(data?.results || [])].map((h) => [h.id, h]));
  const compared = compareIds.map((id) => homeMap.get(id)).filter(Boolean);
  const visible = savedOnly
    ? (data?.results || []).filter((h) => saved.includes(h.id))
    : data?.results || [];
  const activeDetail = detail ? homeMap.get(detail.id) || detail : null;
  const chipLabels = {
    maxDeposit: (v) => `ودیعه تا ${fa(v)} میلیون`,
    maxRent: (v) => (Number(v) === 0 ? 'رهن کامل' : `اجاره تا ${fa(v)} میلیون`),
    bedrooms: (v) => `${fa(v)} خواب و بیشتر`,
    minArea: (v) => `از ${fa(v)} متر`,
    maxMetro: (v) => `مترو تا ${fa(v)} دقیقه`,
    parking: () => 'پارکینگ',
    elevator: () => 'آسانسور',
    balcony: () => 'بالکن',
  };
  const chips = Object.entries(effective)
    .filter(
      ([k, v]) =>
        k !== 'rate' && v !== '' && v !== false && v != null && (!Array.isArray(v) || v.length),
    )
    .map(([key, value]) => ({
      key,
      label: key === 'districts' ? value.join('، ') : chipLabels[key]?.(value) || '',
    }));
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setToast('لینک این جست‌وجو کپی شد.');
    } catch {
      setToast('لینک را از نوار آدرس مرورگر کپی کنید.');
    }
  };
  const saveSearch = () => {
    const label = query || chips.map((c) => c.label).join(' · ') || 'همهٔ خانه‌های تهران';
    if (savedSearches.some((s) => s.params === params)) {
      setToast('این جست‌وجو قبلاً ذخیره شده است.');
      return;
    }
    setSavedSearches((old) => [...old, { id: Date.now(), label, params }]);
    setToast('جست‌وجو در همین مرورگر ذخیره شد.');
  };
  const openSource = async (id) => {
    const req = ++sourceRequest.current;
    setSource({ loading: true });
    setSourceError('');
    try {
      const res = await fetch(`/api/source/${encodeURIComponent(id)}`);
      if (!res.ok) throw Error('دادهٔ منبع دریافت نشد.');
      const result = await res.json();
      if (req === sourceRequest.current) setSource(result);
    } catch (e) {
      if (req === sourceRequest.current) setSourceError(e.message);
    }
  };
  const closeSource = () => {
    sourceRequest.current++;
    setSource(null);
  };
  return (
    <>
      <a className="skip-link" href="#results">
        رفتن به نتایج
      </a>
      <header className="header">
        <div className="header-inner">
          <button className="brand" onClick={reset} aria-label="ترب خانه؛ صفحهٔ اصلی">
            <span className="brand-mark">
              <Icon name={House} size={25} />
            </span>
            <strong>
              ترب<span>خانه</span>
            </strong>
            <span className="brand-beta">یک تجربهٔ تازه</span>
          </button>
          <div className="service-switch" aria-label="سرویس‌ها">
            <a href="/" aria-current="page">
              خانه
            </a>
            <a href="/safar">سفر</a>
          </div>
          <nav aria-label="منوی اصلی">
            <button
              className={!savedOnly ? 'nav-active' : ''}
              onClick={() => {
                setSavedOnly(false);
                resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              کشف خانه‌ها
            </button>
            <button onClick={() => setModal('how')}>چطور کار می‌کند؟</button>
          </nav>
          <div className="header-actions">
            <button
              className={savedOnly ? 'saved-nav active' : 'saved-nav'}
              aria-label="نشان‌شده‌ها"
              onClick={() => {
                setSavedOnly(!savedOnly);
                resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Icon name={Heart} />
              <span>نشان‌شده‌ها</span>
              {saved.length > 0 && <b>{fa(saved.length)}</b>}
            </button>
            <button
              className="icon-button"
              onClick={() => setModal('searches')}
              aria-label="جست‌وجوهای ذخیره‌شده"
            >
              <Icon name={Bookmark} />
            </button>
          </div>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="red-dot" />
                جست‌وجو و مقایسهٔ خانه‌های اجاره‌ای
              </div>
              <h1>
                یک خانه،
                <br />
                <span>همهٔ پیشنهادها.</span>
              </h1>
              <p>
                خانهٔ مناسب تو، میان آگهی‌های پراکنده.
                <br className="desktop-only" /> بودجه و خواسته‌هایت را بگو؛ پیشنهادها را کنار هم
                ببین.
              </p>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-orbit" />
              <svg viewBox="0 0 400 290">
                <g fill="#fff" stroke="#dbd7d2" strokeWidth="1.5">
                  <path d="m65 240 0-142 78-39 80 39v142Z" />
                  <path d="m143 59 0 181m-78-142 78 39 80-39" />
                  <path d="m184 240 0-177 75-36 79 36v177Z" />
                  <path d="m259 27 0 213m-75-177 75 37 79-37" />
                </g>
                <g fill="#e9e5df">
                  {[0, 1, 2].map((r) =>
                    [0, 1].map((c) => (
                      <path
                        key={`${r}-${c}`}
                        d={`m${198 + c * 26} ${93 + r * 40} 16 8v24l-16-8Z`}
                      />
                    )),
                  )}
                  {[0, 1, 2, 3].map((r) => (
                    <path key={r} d={`m277 ${84 + r * 35} 39-19v21l-39 19Z`} />
                  ))}
                </g>
                <path d="m279 189 35-17v43l-35 17Z" fill="#d52c30" />
                <path d="M40 241h320" stroke="#d0ccc7" />
                <path
                  d="M101 187v53m-12-33c-22-40 6-71 13-67 21 12 34 55 10 67Z"
                  fill="#d8e0d1"
                  stroke="#a5b09b"
                />
                <g fill="#ece8e3">
                  <path d="m79 126 20 10v25l-20-10Zm32 16 20 10v25l-20-10Zm-32 33 20 10v25l-20-10Z" />
                </g>
              </svg>
              <span className="floating-note note-one">
                <span className="small-red-icon">
                  <Icon name={Layers3} size={17} />
                </span>
                <span>
                  آگهی‌های تکراری<strong>یک‌جا، کنار هم</strong>
                </span>
                <span className="note-check">
                  <Icon name={Check} size={15} />
                </span>
              </span>
              <span className="floating-note note-two">
                <Icon name={Check} size={15} />
                انتخاب با دلیل
              </span>
            </div>
          </div>
          <div className="search-section">
            <form
              className="search-box"
              onSubmit={(e) => {
                e.preventDefault();
                doSearch(draft);
              }}
            >
              <div className="search-city">
                <Icon name={MapPin} size={19} />
                تهران
              </div>
              <label className="sr-only" htmlFor="search">
                خانه‌ای که دنبالش هستید
              </label>
              <input
                id="search"
                ref={searchRef}
                placeholder="مثلاً دو خواب، ودیعه تا ۶۰۰ میلیون، نزدیک مترو…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
              />
              {draft && (
                <button
                  type="button"
                  className="icon-button clear-search"
                  aria-label="پاک کردن عبارت"
                  onClick={() => setDraft('')}
                >
                  <Icon name={X} size={17} />
                </button>
              )}
              <button type="submit" aria-label="پیدا کن" className="primary search-submit">
                <Icon name={Search} size={20} />
                <span>پیدا کن</span>
              </button>
            </form>
            <div className="search-examples">
              <span>از اینجا شروع کن</span>
              {EXAMPLES.slice(1).map((t) => (
                <button key={t} onClick={() => doSearch(t)}>
                  {t}
                  <Icon name={ArrowUpLeft} size={13} />
                </button>
              ))}
              <button className="example-smart" onClick={() => doSearch(EXAMPLES[0])}>
                دو خواب، نزدیک مترو
                <Icon name={ArrowUpLeft} size={13} />
              </button>
            </div>
          </div>
        </section>
        <div className="workspace">
          <div className="demo-strip">
            <span>
              <span className="status-dot" />
              نسخهٔ نمایشی مستقل · آگهی‌ها و تصاویر نمونه‌اند
            </span>
            <button onClick={() => setModal('data')}>
              شفافیت داده‌ها
              <Icon name={ArrowUpLeft} size={14} />
            </button>
          </div>
          <div className="content-layout">
            <Filters
              filters={effective}
              districts={catalog?.districts || DISTRICTS}
              onChange={change}
              onReset={reset}
              mobile={mobileFilters}
              onClose={() => setMobileFilters(false)}
            />
            <section
              className="results"
              id="results"
              ref={resultsRef}
              aria-label="نتایج جست‌وجوی خانه"
            >
              <div className="results-heading">
                <div>
                  <div className="breadcrumb">
                    خانه <ChevronLeft size={12} /> تهران <ChevronLeft size={12} /> رهن و اجاره
                  </div>
                  <h2>
                    {savedOnly ? 'خانه‌های نشان‌شده' : 'خانه‌های اجاره‌ای تهران'}
                    <span aria-live="polite">
                      {!loading && fa(visible.length)}
                      {!loading && ' خانه'}
                    </span>
                  </h2>
                </div>
                <button className="save-search text-button" onClick={saveSearch}>
                  <Icon name={Bookmark} size={17} />
                  <span>ذخیرهٔ جست‌وجو</span>
                </button>
              </div>
              <div className="results-toolbar">
                <div className="sort-control">
                  <Icon name={SlidersHorizontal} size={17} />
                  <label htmlFor="sort">مرتب‌سازی:</label>
                  <select
                    id="sort"
                    aria-label="مرتب‌سازی نتایج"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recommended">پیشنهاد ترب خانه</option>
                    <option value="rent">کمترین اجارهٔ پیشنهاد منتخب</option>
                    <option value="deposit">کمترین ودیعهٔ پیشنهاد منتخب</option>
                    <option value="metro">نزدیک‌ترین به مترو</option>
                    <option value="newest">تازه‌ترین پیشنهاد منتخب</option>
                  </select>
                </div>
                <div className="view-controls">
                  <button
                    className="mobile-only filter-open"
                    onClick={() => setMobileFilters(true)}
                  >
                    <Icon name={SlidersHorizontal} />
                    <span>فیلترها</span>
                  </button>
                  <button
                    aria-label="نمای کارت‌ها"
                    aria-pressed={view === 'grid'}
                    className={view === 'grid' ? 'active' : ''}
                    onClick={() => setView('grid')}
                  >
                    <Icon name={LayoutGrid} />
                  </button>
                  <button
                    aria-label="نمای محله‌ها"
                    aria-pressed={view === 'map'}
                    className={view === 'map' ? 'active' : ''}
                    onClick={() => setView('map')}
                  >
                    <Icon name={MapIcon} />
                  </button>
                  <button aria-label="کپی لینک جست‌وجو" onClick={share}>
                    <Icon name={Share2} size={17} />
                  </button>
                </div>
              </div>
              {chips.length > 0 && (
                <div className="intent-chips">
                  <span>خواسته‌های شما</span>
                  {chips.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => change(c.key, '')}
                      aria-label={`حذف فیلتر ${c.label}`}
                    >
                      {c.label}
                      <Icon name={X} size={13} />
                    </button>
                  ))}
                </div>
              )}
              {data?.intent.warnings.map((w) => (
                <div className="query-warning" key={w}>
                  <Icon name={Info} size={16} />
                  {w}
                </div>
              ))}
              <div className="results-insight">
                <div className="insight-symbol">
                  <Icon name={Layers3} size={20} />
                </div>
                <div>
                  <strong>هر خانه فقط یک‌بار، با پیشنهادهای همهٔ منابع</strong>
                  <p>
                    {catalog
                      ? `${fa(catalog.offerCount)} آگهی نمونه، ${fa(catalog.homeCount)} خانهٔ متمایز. `
                      : ''}
                    قیمت‌های قدیمی در انتخاب پیشنهاد دخالت ندارند.
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="دربارهٔ تطبیق آگهی‌ها"
                  onClick={() => setModal('how')}
                >
                  <Icon name={Info} size={17} />
                </button>
              </div>
              {error ? (
                <div className="empty-state">
                  <Info size={38} />
                  <h3>نتایج دریافت نشد</h3>
                  <p>{error}</p>
                  <button className="primary" onClick={() => setRetry((r) => r + 1)}>
                    تلاش دوباره
                  </button>
                </div>
              ) : loading ? (
                <div className="card-grid" aria-label="در حال دریافت خانه‌ها" aria-busy="true">
                  {[1, 2, 3, 4].map((n) => (
                    <div className="skeleton" key={n}>
                      <div />
                      <span />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <Search size={32} />
                  </div>
                  <h3>
                    {savedOnly
                      ? 'اینجا خانه‌های دلخواهت را نگه دار'
                      : 'خانه‌ای با همهٔ این شرایط پیدا نشد'}
                  </h3>
                  <p>
                    {savedOnly
                      ? 'با قلب روی کارت، خانه را نشان کن. فیلترهای فعلی روی نشان‌شده‌ها هم اعمال می‌شوند.'
                      : 'بودجه یا محدوده را تغییر بده. هیچ‌یک از شرط‌ها را خودکار حذف نمی‌کنیم.'}
                  </p>
                  <button className="primary" onClick={reset}>
                    دیدن همهٔ خانه‌ها
                    <Icon name={ArrowLeft} />
                  </button>
                </div>
              ) : view === 'map' ? (
                <MapView homes={visible} onOpen={setDetail} />
              ) : (
                <div className="card-grid">
                  {visible.map((home, i) => (
                    <HomeCard
                      key={home.id}
                      home={home}
                      index={i}
                      onOpen={setDetail}
                      saved={saved.includes(home.id)}
                      onSave={toggleSave}
                      compared={compareIds.includes(home.id)}
                      onCompare={toggleCompare}
                    />
                  ))}
                </div>
              )}
              <div className="results-end">
                <span />
                <House size={18} />
                <p>یک قدم نزدیک‌تر به خانهٔ بعدی.</p>
                <span />
              </div>
            </section>
          </div>
        </div>
      </main>
      <footer className="footer">
        <div>
          <span className="footer-brand">ترب خانه</span>
          <p>جست‌وجو کن. مقایسه کن. با خیال روشن‌تر انتخاب کن.</p>
        </div>
        <span>نمونهٔ مستقل برای چالش AI Product Engineer ترب · ۱۴۰۵</span>
        <button className="text-button" onClick={() => setModal('data')}>
          دربارهٔ داده‌های این نسخه
          <ArrowUpLeft size={15} />
        </button>
      </footer>
      {compareIds.length > 0 && (
        <div className="compare-bar">
          <div className="compare-bar-title">
            <Icon name={ArrowLeftRight} />
            <strong>{fa(compared.length)} خانه برای مقایسه</strong>
          </div>
          <div className="compare-miniatures">
            {compared.map((h) => (
              <button
                key={h.id}
                aria-label={`حذف ${h.district} از مقایسه`}
                onClick={() => toggleCompare(h.id)}
              >
                <span>{h.district}</span>
                <X size={12} />
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={compared.length < 2}
            onClick={() => setModal('compare')}
          >
            مقایسهٔ خانه‌ها
            <Icon name={ArrowLeft} size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="پاک کردن مقایسه"
            onClick={() => setCompareIds([])}
          >
            <Icon name={X} />
          </button>
        </div>
      )}
      <div className="toast" role="status" aria-live="polite">
        {toast && (
          <span>
            <Icon name={Check} size={17} />
            {toast}
          </span>
        )}
      </div>
      {activeDetail && (
        <Detail
          home={activeDetail}
          onClose={() => setDetail(null)}
          onCompare={toggleCompare}
          compared={compareIds.includes(activeDetail.id)}
          rate={rate}
          onSource={openSource}
        />
      )}
      {modal === 'compare' && (
        <Compare
          homes={compared}
          onClose={() => setModal(null)}
          onRemove={toggleCompare}
          rate={rate}
          onRate={(value) => change('rate', value)}
        />
      )}
      {modal === 'how' && (
        <Modal title="از آگهی‌های پراکنده تا انتخاب روشن" onClose={() => setModal(null)}>
          <div className="explain-content">
            <div className="explain-step">
              <span>۱</span>
              <div>
                <h3>یک خانه، یک نتیجه</h3>
                <p>
                  نشانه‌های تصویر، نشانی و مشخصات باید با هم سازگار باشند تا چند آگهی در یک خانه جمع
                  شوند.
                </p>
              </div>
            </div>
            <div className="explain-step">
              <span>۲</span>
              <div>
                <h3>بودجهٔ واقعی خودت</h3>
                <p>
                  سقف ودیعه و اجاره جدا هستند. هیچ نتیجه‌ای با ترکیب مبلغ دو آگهی ساخته نمی‌شود.
                </p>
              </div>
            </div>
            <div className="explain-step">
              <span>۳</span>
              <div>
                <h3>دلیل انتخاب را ببین</h3>
                <p>
                  هزینهٔ مقایسه، نزدیکی مترو، تازگی و کامل بودن اطلاعات در ترتیب نتایج اثر دارند. در
                  صفحهٔ هر خانه، سهم هر عامل مشخص است.
                </p>
              </div>
            </div>
            <div className="formula">
              <h3>برداشت از جست‌وجوی شما</h3>
              <p>
                این نسخه محله، بودجه، اتاق و چند امکان مشخص را از متن فارسی استخراج می‌کند. فیلترهای
                برداشت‌شده قابل اصلاح‌اند. «آرام»، «نوساز» و زمان مسیر تا محل کار هنوز ارزیابی
                نمی‌شوند.
              </p>
            </div>
            <p className="subtle">
              فاصله‌های مترو در این نسخه دادهٔ نمونه‌اند؛ مسیر واقعی محاسبه نشده است.
            </p>
          </div>
        </Modal>
      )}
      {modal === 'data' && (
        <Modal title="دادهٔ روشن، انتخاب آگاهانه" onClose={() => setModal(null)}>
          <div className="explain-content">
            <span className="pill">دادهٔ نمایشی · بدون اتصال به آگهی‌های واقعی</span>
            <h3>این نمونه چه چیزی را نشان می‌دهد؟</h3>
            <p>
              آگهی‌ها برای آزمودن تکرار، تفاوت واحد پول، قیمت متعارض و اطلاعات قدیمی ساخته شده‌اند.
              تصاویر با هوش مصنوعی تولید شده‌اند و متعلق به ملک واقعی نیستند.
            </p>
            <div className="data-stats">
              {[
                [catalog?.rawCount, 'دادهٔ ورودی'],
                [catalog?.offerCount, 'آگهی پذیرفته‌شده'],
                [catalog?.homeCount, 'خانهٔ متمایز'],
              ].map(([v, l]) => (
                <div key={l}>
                  <strong>{fa(v || 0)}</strong>
                  <span>{l}</span>
                </div>
              ))}
            </div>
            <p>
              یک آگهی با قیمت «توافقی» از مقایسهٔ عددی حذف شده است. پیشنهادهای بیش از ۷۲ ساعت تنها
              در جزئیات قابل بررسی‌اند.
            </p>
            <h3>برای استفادهٔ واقعی چه چیزی لازم است؟</h3>
            <p>
              دسترسی مجاز به منابع، به‌روزرسانی منظم، ارزیابی تطبیق روی آگهی‌های واقعی و محاسبهٔ
              مسیر پیاده. این نسخه به دیوار، کیلید یا ترب وابستگی رسمی ندارد.
            </p>
            <p>
              نشان‌ها و جست‌وجوهای ذخیره‌شده فقط در همین مرورگر نگه‌داری می‌شوند. اعلان یا پیام
              خودکار ارسال نمی‌شود.
            </p>
          </div>
        </Modal>
      )}
      {modal === 'searches' && (
        <Modal title="جست‌وجوهای ذخیره‌شده" onClose={() => setModal(null)}>
          <div className="explain-content">
            <p className="subtle">ذخیره در همین مرورگر؛ بدون اعلان خودکار.</p>
            {savedSearches.length ? (
              savedSearches.map((s) => (
                <div className="saved-search-row" key={s.id}>
                  <button
                    onClick={() => {
                      const p = new URLSearchParams(s.params);
                      setQuery(p.get('q') || '');
                      setDraft(p.get('q') || '');
                      setSort(p.get('sort') || 'recommended');
                      const next = {};
                      for (const [k, v] of p)
                        if (!['q', 'sort'].includes(k))
                          next[k] =
                            k === 'districts'
                              ? v.split(',')
                              : ['parking', 'elevator', 'balcony'].includes(k)
                                ? v === 'true'
                                : v;
                      setFilters(next);
                      setModal(null);
                      setSavedOnly(false);
                    }}
                  >
                    <Icon name={Search} />
                    {s.label}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`حذف جست‌وجوی ${s.label}`}
                    onClick={() => setSavedSearches((old) => old.filter((x) => x.id !== s.id))}
                  >
                    <Icon name={X} />
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Bookmark size={30} />
                <h3>جست‌وجویی ذخیره نکرده‌ای</h3>
                <p>بعد از انتخاب شرایط، «ذخیرهٔ جست‌وجو» را بزن.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {source && (
        <Modal title="ردِ داده تا منبع" onClose={closeSource}>
          <div className="explain-content">
            <p className="subtle">
              رکورد نمونهٔ همان منبع؛ قیمت و مشخصات از این داده استخراج شده‌اند.
            </p>
            {sourceError ? (
              <p role="alert">{sourceError}</p>
            ) : source.loading ? (
              <p>در حال دریافت…</p>
            ) : (
              <>
                <h3>دادهٔ ورودی</h3>
                <pre className="source-json" dir="ltr" tabIndex={0} aria-label="دادهٔ ورودی منبع">
                  {JSON.stringify(source.raw, null, 2)}
                </pre>
                <h3>مبالغ یکسان‌شده به تومان</h3>
                <div className="data-stats">
                  <div>
                    <strong>{fa(source.normalized.deposit)}</strong>
                    <span>ودیعه</span>
                  </div>
                  <div>
                    <strong>{fa(source.normalized.rent)}</strong>
                    <span>اجاره</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
