import React, { useState, useEffect } from 'react';
import {
  Search,
  MapPin,
  CalendarDays,
  Users,
  ArrowUpLeft,
  Heart,
  ArrowLeftRight,
  Share2,
  Info,
  Compass,
  Star,
  House,
  SlidersHorizontal,
  X,
  Check,
  ChevronLeft,
} from 'lucide-react';
import { Icon, Modal } from '../components';
import { readSaved, persist } from '../utils';
import { DatePicker, GuestPicker } from './TripPicker';
import { fa, day, today, dateLabel } from './dates';
import './safar.css';
const SOURCES = {
  jabama: { name: 'جاباما', color: '#a6204c' },
  otaghak: { name: 'اتاقک', color: '#18646c' },
  jajiga: { name: 'جاجیگا', color: '#806000' },
};
const TYPES = {
  all: 'همهٔ اقامتگاه‌ها',
  villa: 'ویلا',
  cottage: 'کلبه',
  apartment: 'آپارتمان',
  suite: 'سوئیت و سایر',
};
const stamp = (iso) =>
  iso
    ? new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Tehran',
      }).format(new Date(iso))
    : 'ثبت نشده';
function safeDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  const value = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(value.valueOf()) && value.toISOString().slice(0, 10) === iso;
}
function initial() {
  const p = new URLSearchParams(location.search),
    checkin = p.get('checkin') || day(today(), 2);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(checkin) && Number.isFinite(Date.parse(checkin));
  return {
    q: p.get('q') || '',
    city: p.get('city') || 'all',
    checkin,
    checkout: p.get('checkout') || (valid ? day(checkin, 2) : day(today(), 4)),
    adults: Number(p.get('adults') || 4),
    children: p.get('children') ? p.get('children').split(',').map(Number) : [],
    providers: p.get('providers') || Object.keys(SOURCES).join(','),
    type: p.get('type') || 'all',
    maxNightly: p.get('maxNightly') || '',
    sort: p.get('sort') || 'recommended',
    knownCapacity: p.get('knownCapacity') === 'true',
    confirmedOnly: p.get('confirmedOnly') === 'true',
  };
}
function paramsFor(filters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v !== '' && v !== false && v != null) p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  return p;
}
function Photo({ listing }) {
  const [failed, setFailed] = useState(false);
  return listing.image && !failed ? (
    <img
      src={listing.image}
      alt={listing.title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="sf-photo-fallback">
      <Icon name={House} size={38} />
      <span>تصویر در دسترس نیست</span>
    </div>
  );
}
function Provider({ id }) {
  return (
    <span className="sf-provider" style={{ '--source': SOURCES[id]?.color }}>
      <i />
      {SOURCES[id]?.name || id}
    </span>
  );
}
function Price({ listing }) {
  return (
    <div className="sf-price">
      <span>هر شب از</span>
      <div>
        <strong>{fa(listing.startingPrice)}</strong> <span>تومان</span>
      </div>
      <small>
        {listing.quote
          ? `کل سفر: ${fa(listing.quote.total)} تومان`
          : 'قیمت کل سفر نیاز به تأیید دارد'}
      </small>
    </div>
  );
}
export default function SafarApp() {
  const [filters, setFilters] = useState(initial),
    [draft, setDraft] = useState(filters.q),
    [data, setData] = useState(null),
    [catalog, setCatalog] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [modal, setModal] = useState(null),
    [detail, setDetail] = useState(null),
    [saved, setSaved] = useState(() => {
      const s = readSaved('safar-saved', []);
      return Array.isArray(s) ? s.filter((x) => typeof x === 'string') : [];
    }),
    [savedOnly, setSavedOnly] = useState(false),
    [selected, setSelected] = useState(() =>
      [
        ...new Set(
          (new URLSearchParams(location.search).get('compare') || '').split(',').filter(Boolean),
        ),
      ].slice(0, 3),
    ),
    [toast, setToast] = useState('');
  const params = paramsFor(filters).toString();
  const update = (patch) => setFilters((prev) => ({ ...prev, ...patch }));
  useEffect(() => {
    document.title = 'ترب سفر | اقامتگاه‌ها را کنار هم ببین';
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/safar/search?${params}`, { signal: controller.signal });
        if (!r.ok)
          throw Error(
            r.status === 400
              ? 'تاریخ و تعداد مهمان‌ها را بررسی کن؛ ورود از امروز و اقامت بین ۱ تا ۳۰ شب باشد.'
              : 'دریافت اقامتگاه‌ها انجام نشد. دوباره تلاش کن.',
          );
        setData(await r.json());
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params, retry]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/safar/search?adults=1', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => setCatalog(d.results))
      .catch(() => {});
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const p = paramsFor(filters);
    if (selected.length) p.set('compare', selected.join(','));
    history.replaceState(null, '', `/safar?${p}`);
  }, [params, selected]);
  useEffect(() => persist('safar-saved', saved), [saved]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const rows = data?.results || [],
    visible = savedOnly ? rows.filter((l) => saved.includes(l.id)) : rows;
  const lookup = new Map([...catalog, ...rows].map((l) => [l.id, l]));
  const comparisons = selected.map((id) => lookup.get(id)).filter(Boolean);
  const trip = data?.trip || {
    checkin: day(today(), 2),
    checkout: day(today(), 4),
    adults: 4,
    children: [],
    guests: 4,
    nights: 2,
  };
  const displayTrip = error
    ? trip
    : {
        ...trip,
        checkin: safeDate(filters.checkin) ? filters.checkin : trip.checkin,
        checkout: safeDate(filters.checkout) ? filters.checkout : trip.checkout,
        adults: filters.adults,
        children: filters.children,
        guests: filters.adults + filters.children.length,
      };
  const toggleSave = (id) =>
    setSaved((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  function toggleCompare(id) {
    if (selected.includes(id)) setSelected(selected.filter((v) => v !== id));
    else if (selected.length < 3) setSelected([...selected, id]);
    else setToast('برای مقایسه، حداکثر سه اقامتگاه انتخاب کن.');
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setToast('لینک سفر و مقایسه کپی شد.');
    } catch {
      setModal('share');
    }
  }
  function reset() {
    setFilters({
      ...initial(),
      q: '',
      city: 'all',
      checkin: day(today(), 2),
      checkout: day(today(), 4),
      adults: 4,
      children: [],
      providers: Object.keys(SOURCES).join(','),
      type: 'all',
      maxNightly: '',
      sort: 'recommended',
      knownCapacity: false,
      confirmedOnly: false,
    });
    setDraft('');
    setSavedOnly(false);
  }
  const toggleProvider = (id) => {
    const active = filters.providers.split(',');
    if (active.includes(id) && active.length === 1) {
      setToast('حداقل یک سایت را انتخاب کن.');
      return;
    }
    update({
      providers: active.includes(id)
        ? active.filter((p) => p !== id).join(',')
        : [...active, id].join(','),
    });
  };
  function filterPanel() {
    return (
      <>
        <div className="sf-filter-title">
          <strong>محدود کن، بهتر انتخاب کن</strong>
          <button className="text-button" onClick={reset}>
            پاک کردن
          </button>
        </div>
        <fieldset>
          <legend>سایت‌های رزرو</legend>
          {Object.entries(SOURCES).map(([id, s]) => (
            <label className="sf-check" key={id}>
              <input
                type="checkbox"
                checked={filters.providers.split(',').includes(id)}
                onChange={() => toggleProvider(id)}
              />
              <Provider id={id} />
              <small>{fa(data?.providerStatus?.find((p) => p.id === id)?.count || 0)}</small>
            </label>
          ))}
        </fieldset>
        <label className="sf-field">
          نوع اقامتگاه
          <select value={filters.type} onChange={(e) => update({ type: e.target.value })}>
            {Object.entries(TYPES).map(([v, n]) => (
              <option value={v} key={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="sf-field">
          سقف قیمت پایهٔ هر شب
          <select
            value={filters.maxNightly}
            onChange={(e) => update({ maxNightly: e.target.value })}
          >
            <option value="">بدون محدودیت</option>
            {[1000000, 2000000, 3000000, 5000000, 10000000].map((n) => (
              <option value={n} key={n}>
                {fa(n)} تومان
              </option>
            ))}
          </select>
        </label>
        <p className="sf-fine">
          این فیلتر روی قیمت شروع آگهی است؛ هزینهٔ نهایی تاریخ سفر را مشخص نمی‌کند.
        </p>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={filters.knownCapacity}
            onChange={(e) => update({ knownCapacity: e.target.checked })}
          />
          فقط ظرفیت مشخص
        </label>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={filters.confirmedOnly}
            onChange={(e) => update({ confirmedOnly: e.target.checked })}
          />
          فقط قیمت کلِ تأییدشده
        </label>
        <p className="sf-fine">فعلاً قیمت کل تأییدشده برای این منابع نداریم.</p>
        <div className="sf-filter-help">
          <Icon name={Info} />
          <p>عنوان مشابه، به معنی یک اقامتگاه نیست. هر آگهی با نام سایت خودش نمایش داده می‌شود.</p>
        </div>
      </>
    );
  }
  return (
    <div className="sf-app">
      <a href="#safar-results" className="skip-link">
        رفتن به نتایج
      </a>
      <header className="sf-header">
        <div className="sf-header-inner">
          <a className="brand" href="/" aria-label="ترب؛ صفحهٔ اصلی">
            <span className="brand-mark">
              <Icon name={Compass} size={25} />
            </span>
            <strong>
              ترب<span>سفر</span>
            </strong>
          </a>
          <div className="service-switch" aria-label="سرویس‌ها">
            <a href="/khaneh">خانه</a>
            <a href="/safar" aria-current="page">
              سفر
            </a>
          </div>
          <span className="sf-header-caption">انتخاب با تو، مقایسه با ترب</span>
          <div className="sf-header-actions">
            <button
              className={`sf-mytrip ${savedOnly ? 'active' : ''}`}
              aria-pressed={savedOnly}
              onClick={() => {
                setSavedOnly(!savedOnly);
                document.getElementById('safar-results')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Icon name={Heart} />
              <span>سفر من</span>
              {saved.length > 0 && <b>{fa(saved.length)}</b>}
            </button>
            <button className="icon-button" aria-label="اشتراک‌گذاری سفر" onClick={share}>
              <Icon name={Share2} />
            </button>
          </div>
        </div>
      </header>
      <main>
        <section className="sf-hero">
          <div className="sf-hero-inner">
            <div className="sf-hero-top">
              <div>
                <div className="sf-eyebrow">
                  <span /> از خانه تا سفر
                </div>
                <h1>
                  جای خوبِ سفر،
                  <br />
                  <em>بین همهٔ انتخاب‌ها.</em>
                </h1>
                <p>
                  ویلا، کلبه و سوئیت‌های چند سایت را یک‌جا ببین.
                  <br />
                  گزینه‌ها را مقایسه کن؛ در سایت میزبان رزرو کن.
                </p>
              </div>
              <div className="sf-destination-art" aria-hidden="true">
                <div className="sf-postcard">
                  <img
                    src="/images/safar/otaghak-2512254.webp"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    alt=""
                  />
                  <div className="sf-postcard-label">
                    <Icon name={MapPin} size={15} /> رامسر و اطراف
                  </div>
                </div>
                <span className="sf-postmark">
                  یک مقصد
                  <br />
                  <b>چند انتخاب</b>
                  <Compass size={30} />
                </span>
              </div>
            </div>
            <div className="sf-tripbar">
              <label>
                <span>
                  <Icon name={MapPin} size={16} />
                  کجا می‌ری؟
                </span>
                <select
                  aria-label="مقصد"
                  value={filters.city}
                  onChange={(e) => update({ city: e.target.value })}
                >
                  <option value="all">رامسر و اطراف</option>
                  {(data?.cities || []).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <button className="sf-trip-dates" onClick={() => setModal('dates')}>
                <span>
                  <Icon name={CalendarDays} size={16} /> ورود و خروج
                </span>
                <strong>
                  {dateLabel(displayTrip.checkin)} <span className="sf-date-arrow">←</span>{' '}
                  {dateLabel(displayTrip.checkout)}
                </strong>
              </button>
              <button onClick={() => setModal('guests')}>
                <span>
                  <Icon name={Users} size={16} /> همسفرها
                </span>
                <strong>{fa(displayTrip.guests)} مهمان</strong>
              </button>
              <a className="primary" href="#safar-results">
                <Icon name={Search} />
                دیدن اقامتگاه‌ها
              </a>
            </div>
            <div className="sf-hero-foot">
              <div>
                {Object.keys(SOURCES).map((id) => (
                  <Provider key={id} id={id} />
                ))}
                <span>پوشش اولیهٔ رامسر و اطراف</span>
              </div>
              <button onClick={() => setModal('sources')}>
                دربارهٔ منابع و قیمت‌ها <Icon name={Info} size={15} />
              </button>
            </div>
          </div>
        </section>
        <div className="sf-content" id="safar-results">
          <aside className="sf-sidebar">{filterPanel()}</aside>
          <section className="sf-results" aria-label="اقامتگاه‌ها" aria-busy={loading}>
            <div className="sf-results-top">
              <div>
                <h2>{savedOnly ? 'اقامتگاه‌های سفر من' : 'برای چند روز دور شدن'}</h2>
                <p>
                  {loading
                    ? 'در حال دریافت اقامتگاه‌ها…'
                    : `${fa(visible.length)} گزینه برای ${fa(trip.guests)} مهمان · ${fa(trip.nights)} شب`}
                </p>
              </div>
              <button className="secondary sf-mobile-filters" onClick={() => setModal('filters')}>
                <Icon name={SlidersHorizontal} />
                فیلترها
              </button>
            </div>
            <div className="sf-toolbar">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update({ q: draft });
                }}
              >
                <Icon name={Search} size={18} />
                <input
                  aria-label="جست‌وجوی اقامتگاه"
                  placeholder="نام اقامتگاه، محله یا ویژگی…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button aria-label="اعمال جست‌وجو" type="submit">
                  <Icon name={ChevronLeft} />
                </button>
              </form>
              <select
                aria-label="مرتب‌سازی اقامتگاه‌ها"
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value })}
              >
                <option value="recommended">گزینه‌هایی از هر سایت</option>
                <option value="price">کمترین قیمت پایه</option>
                <option value="price-desc">بیشترین قیمت پایه</option>
                <option value="newest">تازه‌ترین مشاهده</option>
              </select>
            </div>
            <div className="sf-trust-note">
              <Icon name={Info} size={17} />
              <p>
                قیمت‌ها «شروع از» هستند. موجودی و مبلغ نهایی برای تاریخ و مهمان‌های شما در سایت
                میزبان مشخص می‌شود.
              </p>
            </div>
            {error ? (
              <div className="sf-empty" role="alert">
                <Icon name={Info} size={30} />
                <h3>{error}</h3>
                <button className="primary" onClick={() => setRetry(retry + 1)}>
                  تلاش دوباره
                </button>
                <button className="text-button" onClick={reset}>
                  بازنشانی سفر
                </button>
              </div>
            ) : !data ? (
              <div className="sf-grid">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="sf-skeleton" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="sf-empty">
                <Icon name={Compass} size={38} />
                <h3>
                  {filters.confirmedOnly
                    ? 'هنوز قیمت کل تأییدشده نداریم'
                    : savedOnly
                      ? 'در این جست‌وجو اقامتگاه نشان‌شده‌ای نیست'
                      : 'با این شرایط، گزینه‌ای پیدا نشد'}
                </h3>
                <p>
                  {filters.confirmedOnly
                    ? 'قیمت‌های عمومی، موجودی یا مبلغ نهایی سفر را تأیید نمی‌کنند.'
                    : 'فیلترها را کمتر کن یا اقامتگاهی را با علامت قلب به سفر من اضافه کن.'}
                </p>
                <button className="primary" onClick={reset}>
                  دیدن همهٔ گزینه‌ها
                </button>
              </div>
            ) : (
              <div className="sf-grid">
                {visible.map((l) => (
                  <article className="sf-card" key={l.id}>
                    <div className="sf-photo">
                      <button
                        className="sf-photo-open"
                        aria-label={`جزئیات ${l.title}`}
                        onClick={() => setDetail(l)}
                      >
                        <Photo listing={l} />
                      </button>
                      <button
                        className={`sf-save ${saved.includes(l.id) ? 'active' : ''}`}
                        aria-label={`${saved.includes(l.id) ? 'حذف از' : 'افزودن به'} سفر من: ${l.title}`}
                        aria-pressed={saved.includes(l.id)}
                        onClick={() => toggleSave(l.id)}
                      >
                        <Icon
                          name={Heart}
                          size={19}
                          fill={saved.includes(l.id) ? 'currentColor' : 'none'}
                        />
                      </button>
                      <span className="sf-photo-source">تصویر {SOURCES[l.provider].name}</span>
                    </div>
                    <div className="sf-card-body">
                      <div className="sf-card-meta">
                        <Provider id={l.provider} />
                        {l.rating && (
                          <span className="sf-rating">
                            <Icon name={Star} size={13} />
                            {fa(l.rating)}
                            {l.reviews != null && <small>({fa(l.reviews)} نظر)</small>}
                          </span>
                        )}
                      </div>
                      <h3>
                        <button onClick={() => setDetail(l)}>{l.title}</button>
                      </h3>
                      <p className="sf-location">
                        <Icon name={MapPin} size={13} />
                        {l.city || 'رامسر و اطراف؛ شهر نامشخص'}
                        <span>·</span>
                        {l.bedrooms != null ? `${fa(l.bedrooms)} خواب` : 'تعداد خواب نامشخص'}
                        <span>·</span>
                        {l.capacity ? `تا ${fa(l.capacity)} نفر` : 'ظرفیت نامشخص'}
                      </p>
                      <Price listing={l} />
                      <p className="sf-observed">
                        {l.stale ? 'مشاهدهٔ قدیمی' : 'مشاهده'}: {stamp(l.observedAt)}
                      </p>
                      <div className="sf-card-actions">
                        <button
                          className={`sf-compare-check ${selected.includes(l.id) ? 'selected' : ''}`}
                          aria-pressed={selected.includes(l.id)}
                          onClick={() => toggleCompare(l.id)}
                        >
                          <span>{selected.includes(l.id) && <Icon name={Check} size={12} />}</span>
                          مقایسه
                        </button>
                        <a href={l.url} target="_blank" rel="noopener noreferrer">
                          دیدن در {SOURCES[l.provider].name}
                          <Icon name={ArrowUpLeft} size={16} />
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="sf-results-foot">
              ترتیب پیش‌فرض، گزینه‌ها را به‌نوبت از هر سایت نشان می‌دهد؛ امتیازهای کاربران متعلق به
              همان سایت هستند.
            </p>
          </section>
        </div>
      </main>
      <footer className="sf-footer">
        <strong>ترب سفر</strong>
        <span>پروتوتایپ مستقل برای چالش محصول ترب · رزرو در سایت میزبان انجام می‌شود.</span>
        <button className="text-button" onClick={() => setModal('sources')}>
          منابع و محدودهٔ پوشش
        </button>
        <button className="text-button" onClick={share}>
          <Icon name={Share2} size={15} />
          اشتراک‌گذاری سفر
        </button>
      </footer>
      {selected.length > 0 && (
        <div className="sf-compare-tray">
          <div>
            <Icon name={ArrowLeftRight} />
            <strong>{fa(selected.length)} انتخاب</strong>
            <span>برای یک سفر</span>
          </div>
          <button
            className="primary"
            disabled={comparisons.length < 2}
            onClick={() => setModal('compare')}
          >
            مقایسهٔ اقامتگاه‌ها
          </button>
          <button
            className="icon-button"
            aria-label="پاک کردن مقایسه"
            onClick={() => setSelected([])}
          >
            <Icon name={X} />
          </button>
        </div>
      )}
      {modal === 'dates' && (
        <DatePicker trip={displayTrip} onApply={update} onClose={() => setModal(null)} />
      )}
      {modal === 'guests' && (
        <GuestPicker trip={displayTrip} onApply={update} onClose={() => setModal(null)} />
      )}
      {modal === 'filters' && (
        <Modal title="فیلترهای سفر" onClose={() => setModal(null)}>
          <div className="sf-filter-modal">
            {filterPanel()}
            <button className="primary sf-full" onClick={() => setModal(null)}>
              دیدن نتایج
            </button>
          </div>
        </Modal>
      )}
      {modal === 'sources' && (
        <Modal title="این قیمت‌ها از کجا آمده‌اند؟" onClose={() => setModal(null)}>
          <div className="sf-explanation">
            <p>
              این نسخه، آگهی‌های صفحهٔ عمومی رامسر در سه سایت را کنار هم می‌گذارد. همهٔ مقصدها یا
              تمام موجودی این سایت‌ها را پوشش نمی‌دهد.
            </p>
            {(data?.providerStatus || []).map((p) => (
              <div className="sf-source-row" key={p.id}>
                <Provider id={p.id} />
                <div>
                  <b>
                    {fa(p.count)} آگهی ·{' '}
                    {p.status === 'cached'
                      ? 'آخرین نسخهٔ ذخیره‌شده'
                      : p.status === 'unavailable'
                        ? 'فعلاً در دسترس نیست'
                        : 'نسخهٔ مشاهده‌شده'}
                  </b>
                  <p>{stamp(p.observedAt)}</p>
                  {p.status === 'cached' && (
                    <small>به‌روزرسانی اخیر موفق نبود؛ زمان قبلی حفظ شده است.</small>
                  )}
                </div>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`صفحهٔ منبع ${p.name}`}
                >
                  <Icon name={ArrowUpLeft} />
                </a>
              </div>
            ))}
            <h3>قبل از رزرو چه چیزهایی را تأیید کنم؟</h3>
            <p>
              موجودی برای روزهای انتخابی، قیمت تک‌تک شب‌ها، هزینهٔ نفر اضافه و کودک، کارمزدها، ودیعه
              و قوانین لغو. قیمت شروع آگهی به معنی قیمت سفر شما نیست.
            </p>
            <h3>چرا آگهی‌های مشابه جدا هستند؟</h3>
            <p>
              هنوز یکسان بودن واحدها در سایت‌های مختلف تأیید نشده است. مقایسهٔ این نسخه بین
              گزینه‌های اقامت است؛ ادعای ارزان‌ترین فروشندهٔ یک واحد مشترک ندارد.
            </p>
          </div>
        </Modal>
      )}
      {modal === 'share' && (
        <Modal title="لینک سفرت" onClose={() => setModal(null)}>
          <div className="sf-picker">
            <p>لینک را کپی کن؛ تاریخ، مهمان‌ها، فیلترها و گزینه‌های مقایسه در آن ذخیره شده‌اند.</p>
            <input
              className="sf-share-url"
              aria-label="لینک اشتراک سفر"
              value={location.href}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </div>
        </Modal>
      )}
      {modal === 'compare' && (
        <Modal title="چند انتخاب، کنار هم" wide onClose={() => setModal(null)}>
          <div className="sf-comparison">
            <p className="sf-note">
              {dateLabel(trip.checkin)} تا {dateLabel(trip.checkout)} · {fa(trip.guests)} مهمان ·
              مقایسهٔ اقامتگاه‌های متفاوت
            </p>
            <div className="sf-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">برای سفر تو</th>
                    {comparisons.map((l) => (
                      <th key={l.id} scope="col">
                        <div className="sf-table-photo">
                          <Photo listing={l} />
                        </div>
                        {l.title}
                        <Provider id={l.provider} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['شهر', (l) => l.city || 'نامشخص'],
                    ['قیمت پایهٔ هر شب', (l) => `${fa(l.startingPrice)} تومان`],
                    ['کل سفر در این تاریخ', 'نیاز به تأیید در سایت میزبان'],
                    ['موجودی', 'نیاز به تأیید'],
                    [
                      'ظرفیت اعلام‌شده',
                      (l) =>
                        l.capacity
                          ? `تا ${fa(l.capacity)} نفر${l.capacity < trip.guests ? ' · کمتر از مهمان‌های شما' : ''}`
                          : 'نامشخص',
                    ],
                    ['تعداد اتاق خواب', (l) => (l.bedrooms == null ? 'نامشخص' : fa(l.bedrooms))],
                    [
                      'امتیاز در سایت منبع',
                      (l) =>
                        l.rating ? `${fa(l.rating)} از ۵ · ${fa(l.reviews || 0)} نظر` : 'نامشخص',
                    ],
                    ['کارمزد و نفر اضافه', 'نیاز به تأیید'],
                    ['شرایط لغو', 'نیاز به تأیید'],
                    ['زمان مشاهده', (l) => stamp(l.observedAt)],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {comparisons.map((l) => (
                        <td key={l.id}>{typeof value === 'function' ? value(l) : value}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">ادامهٔ رزرو</th>
                    {comparisons.map((l) => (
                      <td key={l.id}>
                        <a
                          className="text-button"
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          دیدن در {SOURCES[l.provider].name}
                          <Icon name={ArrowUpLeft} size={15} />
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <button className="secondary" onClick={share}>
              <Icon name={Share2} />
              اشتراک‌گذاری این مقایسه
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <div className="sf-detail">
            <div className="sf-detail-photo">
              <Photo listing={detail} />
            </div>
            <div className="sf-detail-top">
              <Provider id={detail.provider} />
              <span>
                {detail.city || 'شهر نامشخص'} ·{' '}
                {detail.capacity ? `تا ${fa(detail.capacity)} نفر` : 'ظرفیت نامشخص'}
              </span>
            </div>
            <Price listing={detail} />
            <p className="sf-note">
              برای {fa(trip.nights)} شب و {fa(trip.guests)} مهمان، مبلغ نهایی و موجودی هنوز مشخص
              نیست.
            </p>
            <dl>
              <div>
                <dt>تاریخ سفر شما</dt>
                <dd>
                  {dateLabel(trip.checkin)} تا {dateLabel(trip.checkout)}
                </dd>
              </div>
              <div>
                <dt>کارمزد و نفر اضافه</dt>
                <dd>نیاز به تأیید</dd>
              </div>
              <div>
                <dt>لغو و استرداد</dt>
                <dd>نیاز به تأیید</dd>
              </div>
              <div>
                <dt>زمان مشاهدهٔ آگهی</dt>
                <dd>{stamp(detail.observedAt)}</dd>
              </div>
            </dl>
            {detail.features.length > 0 && (
              <p className="sf-fine">
                ویژگی در عنوان آگهی: {detail.features.join('، ')}. جزئیات را در منبع بررسی کن.
              </p>
            )}
            <a
              className="primary sf-full"
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              بررسی و رزرو در {SOURCES[detail.provider].name}
              <Icon name={ArrowUpLeft} />
            </a>
            <p className="sf-fine">
              تاریخ و مهمان‌ها را در سایت میزبان هم وارد کن؛ این اطلاعات خودکار منتقل نمی‌شوند.
            </p>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="sf-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
