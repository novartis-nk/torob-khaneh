import React, { useEffect, useRef, useState, useId } from 'react';
import {
  X,
  Heart,
  ArrowUpLeft,
  MapPin,
  BedDouble,
  Expand,
  TrainFront,
  Check,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Info,
  TriangleAlert,
  Layers3,
  ArrowLeftRight,
  Building2,
  CarFront,
  ArrowUpDown,
} from 'lucide-react';
import { fa, money, timeAgo } from './utils';
export const Icon = ({ name: Component, size = 18, ...props }) => (
  <Component size={size} strokeWidth={1.7} aria-hidden="true" {...props} />
);
export function HomePhoto({ home, className = '', children }) {
  const index = Number(home.image.match(/home-(\d)/)?.[1] || 1) - 1;
  return (
    <div
      role="img"
      aria-label="تصویر تولیدشده برای نمونه؛ تصویر واقعی این ملک نیست"
      className={`home-photo ${className}`}
      style={{ backgroundPosition: `${(index % 3) * 50}% ${index < 3 ? 15 : 85}%` }}
    >
      {children}
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const headingId = useId();
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = old;
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={headingId}
    >
      <div className="modal-head">
        <h2 id={headingId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="بستن">
          <Icon name={X} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function HomeCard({ home, index, onOpen, saved, onSave, compared, onCompare }) {
  return (
    <article className="home-card" style={{ '--i': Math.min(index, 5) }}>
      <div className="photo-wrap">
        <button
          className="photo-button"
          onClick={() => onOpen(home)}
          aria-label={`جزئیات ${home.title}`}
        >
          <HomePhoto home={home} />
        </button>
        <span className="image-note">تصویر نمایشی</span>
        <button
          className={`save-button ${saved ? 'active' : ''}`}
          aria-label={`${saved ? 'حذف از' : 'افزودن به'} نشان‌شده‌ها: ${home.title}`}
          aria-pressed={saved}
          onClick={() => onSave(home.id)}
        >
          <Icon name={Heart} size={19} fill={saved ? 'currentColor' : 'none'} />
        </button>
        {home.freshOfferCount > 1 && (
          <span className="offer-badge">
            <Icon name={Layers3} size={14} />
            {fa(home.freshOfferCount)} پیشنهاد برای همین خانه
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="card-location">
          <span>
            <Icon name={MapPin} size={14} /> تهران، {home.district}
          </span>
          <span>{timeAgo(home.best.observedAt)}</span>
        </div>
        <h3>
          <button onClick={() => onOpen(home)}>{home.title}</button>
        </h3>
        <div className="property-facts">
          <span>
            <Icon name={Expand} size={15} />
            {fa(home.area)} متر
          </span>
          <span>
            <Icon name={BedDouble} size={16} />
            {fa(home.bedrooms)} خواب
          </span>
          <span>
            <Icon name={Building2} size={15} />
            طبقهٔ {fa(home.floor)}
          </span>
        </div>
        <div className="prices">
          <div>
            <span>ودیعه</span>
            <strong>
              {money(home.best.deposit)} <small>تومان</small>
            </strong>
          </div>
          <div>
            <span>اجارهٔ ماهانه</span>
            <strong>
              {home.best.rent === 0 ? 'رهن کامل' : money(home.best.rent)}{' '}
              {home.best.rent > 0 && <small>تومان</small>}
            </strong>
          </div>
        </div>
        <div className="card-reason">
          <Icon name={TrainFront} size={16} />
          <span>
            {home.metroMinutes === null
              ? 'فاصله تا مترو مشخص نیست'
              : `${fa(home.metroMinutes)} دقیقه پیاده تا مترو`}
          </span>
          {home.parking && (
            <>
              <i />
              <span>پارکینگ</span>
            </>
          )}
        </div>
        <div className="card-bottom">
          <button className="text-button" onClick={() => onOpen(home)}>
            مقایسهٔ پیشنهادها
            <Icon name={ChevronLeft} size={17} />
          </button>
          <button
            className={`compare-toggle ${compared ? 'selected' : ''}`}
            onClick={() => onCompare(home.id)}
            aria-pressed={compared}
            aria-label={`مقایسه ${home.title}`}
          >
            <Icon name={compared ? Check : Plus} size={15} />
            مقایسه
          </button>
        </div>
      </div>
    </article>
  );
}
export function Filters({ filters, onChange, districts, onReset, mobile, onClose }) {
  const filterRef = useRef(null);
  useEffect(() => {
    if (!mobile) return;
    const panel = filterRef.current,
      previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.querySelector('.filter-title .icon-button')?.focus();
    const trap = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll('button,input,select')].filter(
        (el) => !el.disabled && el.getClientRects().length,
      );
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0].focus();
      }
    };
    panel.addEventListener('keydown', trap);
    return () => {
      panel.removeEventListener('keydown', trap);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [mobile]);
  const toggleDistrict = (d) => {
    const next = filters.districts?.includes(d)
      ? filters.districts.filter((x) => x !== d)
      : [...(filters.districts || []), d];
    onChange('districts', next);
  };
  return (
    <aside
      ref={filterRef}
      role={mobile ? 'dialog' : undefined}
      aria-modal={mobile ? true : undefined}
      className={`filter-panel ${mobile ? 'mobile-open' : ''}`}
      aria-label="فیلترهای جست‌وجو"
    >
      <div className="filter-title">
        <h2>
          <Icon name={SlidersHorizontal} />
          فیلترها
        </h2>
        <button className="text-button muted" onClick={onReset}>
          پاک کردن
        </button>
        {mobile && (
          <button className="icon-button mobile-only" onClick={onClose} aria-label="بستن فیلترها">
            <Icon name={X} />
          </button>
        )}
      </div>
      <section className="filter-section">
        <h3>
          محدودهٔ جست‌وجو <Icon name={ChevronDown} size={15} />
        </h3>
        <div className="city-field">
          <Icon name={MapPin} size={17} />
          <span>تهران</span>
          <span className="small-tag">نسخهٔ اول</span>
        </div>
        <div className="district-list">
          {districts.map((d) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={filters.districts?.includes(d) || false}
                onChange={() => toggleDistrict(d)}
              />
              {d}
            </label>
          ))}
        </div>
      </section>
      <section className="filter-section">
        <h3>
          بودجه <span>میلیون تومان</span>
        </h3>
        <label className="field-label" htmlFor="deposit">
          حداکثر ودیعه
        </label>
        <div className="number-field">
          <input
            id="deposit"
            type="number"
            min="0"
            max="100000"
            placeholder="بدون محدودیت"
            value={filters.maxDeposit ?? ''}
            onChange={(e) => onChange('maxDeposit', e.target.value)}
          />
          <span>میلیون</span>
        </div>
        <label className="field-label" htmlFor="rent">
          حداکثر اجارهٔ ماهانه
        </label>
        <div className="number-field">
          <input
            id="rent"
            type="number"
            min="0"
            max="10000"
            placeholder="بدون محدودیت"
            value={filters.maxRent ?? ''}
            onChange={(e) => onChange('maxRent', e.target.value)}
          />
          <span>میلیون</span>
        </div>
      </section>
      <section className="filter-section">
        <h3>مشخصات خانه</h3>
        <label className="field-label" htmlFor="area">
          حداقل متراژ
        </label>
        <select
          id="area"
          value={filters.minArea || ''}
          onChange={(e) => onChange('minArea', e.target.value)}
        >
          <option value="">همهٔ متراژها</option>
          <option value="60">۶۰ متر</option>
          <option value="75">۷۵ متر</option>
          <option value="85">۸۵ متر</option>
          <option value="100">۱۰۰ متر</option>
        </select>
        <label className="field-label" htmlFor="bedrooms">
          تعداد اتاق خواب
        </label>
        <select
          id="bedrooms"
          value={filters.bedrooms || ''}
          onChange={(e) => onChange('bedrooms', e.target.value)}
        >
          <option value="">فرقی ندارد</option>
          <option value="1">۱ خواب و بیشتر</option>
          <option value="2">۲ خواب و بیشتر</option>
          <option value="3">۳ خواب و بیشتر</option>
        </select>
        <div className="amenity-filters">
          {[
            ['parking', 'پارکینگ'],
            ['elevator', 'آسانسور'],
            ['balcony', 'بالکن'],
          ].map(([k, v]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={!!filters[k]}
                onChange={(e) => onChange(k, e.target.checked)}
              />
              {v}
            </label>
          ))}
        </div>
        <label className="switch-row">
          <span>
            <Icon name={TrainFront} size={17} />
            نزدیک مترو<small>تا ۱۲ دقیقه پیاده</small>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={!!filters.maxMetro}
            onChange={(e) => onChange('maxMetro', e.target.checked ? 12 : '')}
          />
        </label>
      </section>
      <div className="filter-note">
        <Icon name={Info} size={16} />
        <p>هر دو شرط بودجه باید در یک پیشنهاد برقرار باشند.</p>
      </div>
      {mobile && (
        <button className="primary mobile-only" onClick={onClose}>
          دیدن نتایج
        </button>
      )}
    </aside>
  );
}
export function Detail({ home, onClose, onCompare, compared, rate, onSource }) {
  const [tab, setTab] = useState('offers');
  return (
    <Modal title="یک خانه، همهٔ پیشنهادها" onClose={onClose} wide>
      <div className="detail-hero">
        <HomePhoto home={home} />
        <div className="detail-summary">
          <span className="eyebrow">تهران / {home.district}</span>
          <h3>{home.title}</h3>
          <p>
            {fa(home.area)} متر · {fa(home.bedrooms)} خواب · ساخت{' '}
            {fa(home.year).replaceAll('٬', '')}
          </p>
          <div className="detail-features">
            {[
              [CarFront, 'پارکینگ', home.parking],
              [ArrowUpDown, 'آسانسور', home.elevator],
              [Building2, 'بالکن', home.balcony],
            ].map(([icon, label, value]) => (
              <span key={label}>
                <Icon name={icon} />
                {label}: {value === null ? 'نامشخص' : value ? 'دارد' : 'ندارد'}
              </span>
            ))}
          </div>
          <button className="secondary" onClick={() => onCompare(home.id)}>
            <Icon name={compared ? Check : ArrowLeftRight} />
            {compared ? 'به مقایسه اضافه شد' : 'افزودن به مقایسه'}
          </button>
        </div>
      </div>
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="اطلاعات ملک"
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const tabs = [...e.currentTarget.querySelectorAll('[role=tab]')];
          const index = tabs.indexOf(document.activeElement);
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? tabs.length - 1
                : (index + (e.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next].focus();
          tabs[next].click();
        }}
      >
        {[
          ['offers', 'پیشنهادهای منابع'],
          ['why', 'چرا این خانه؟'],
          ['evidence', 'چرا یک خانه‌اند؟'],
        ].map(([key, label]) => (
          <button
            role="tab"
            tabIndex={tab === key ? 0 : -1}
            aria-selected={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="detail-content" role="tabpanel">
        {tab === 'offers' && (
          <>
            <p className="subtle">
              مبالغ هر ردیف متعلق به یک پیشنهاد هستند. همهٔ آگهی‌ها و زمان‌ها نمایشی‌اند.
            </p>
            <div className="offer-list">
              {home.offers.map((o) => (
                <div className={`offer-row ${o.stale ? 'stale' : ''}`} key={o.id}>
                  <div className="source-name">
                    <span className={`source-dot ${o.source}`} />
                    <strong>{o.sourceName}</strong>
                    <small>
                      {timeAgo(o.observedAt)}
                      {o.stale
                        ? ' · قدیمی'
                        : o.id === home.best.id
                          ? ' · پیشنهاد منتخب'
                          : !o.eligible
                            ? ' · خارج از بودجه'
                            : ''}
                    </small>
                  </div>
                  <div>
                    <small>ودیعه</small>
                    <strong>{money(o.deposit)}</strong>
                  </div>
                  <div>
                    <small>اجاره</small>
                    <strong>{o.rent ? money(o.rent) : 'رهن کامل'}</strong>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => onSource(o.id)}
                    aria-label={`مشاهده دادهٔ ${o.sourceName}`}
                  >
                    <Icon name={ArrowUpLeft} />
                  </button>
                </div>
              ))}
            </div>
            <p className="unit-note">
              تمام مبالغ به تومان · پیشنهادهای بیش از ۷۲ ساعت در رتبه‌بندی استفاده نمی‌شوند.
            </p>
            {home.cautions.map((c) => (
              <div className="caution" key={c}>
                <Icon name={TriangleAlert} size={17} />
                {c}
              </div>
            ))}
          </>
        )}
        {tab === 'why' && (
          <>
            <h3>اول محدودیت‌های شما، بعد رتبه‌بندی</h3>
            <ul className="reason-list">
              {home.reasons.map((r) => (
                <li key={r}>
                  <Icon name={Check} />
                  {r.replace(/\d+/g, (n) => fa(Number(n)))}
                </li>
              ))}
            </ul>
            <p>
              امتیاز مقایسه: <strong>{fa(home.score)} از ۱۰۰</strong>؛ این عدد احتمال یا تضمین کیفیت
              ملک نیست.
            </p>
            <div className="score-grid">
              {[
                ['cost', 'هزینهٔ مقایسه', 45],
                ['metro', 'دسترسی مترو', 25],
                ['freshness', 'تازگی پیشنهاد', 20],
                ['completeness', 'کامل بودن اطلاعات', 10],
              ].map(([key, label, max]) => (
                <div key={key}>
                  <span>{label}</span>
                  <strong>
                    {fa(home.components[key])} / {fa(max)}
                  </strong>
                  <meter value={home.components[key]} max={max} aria-label={label} />
                </div>
              ))}
            </div>
            <div className="formula">
              <strong>هزینهٔ مقایسه: {money(home.effective)} تومان در ماه</strong>
              <p>
                اجاره + ودیعه × {fa(rate)}٪. این ضریب انتخاب شخصی برای مقایسه است؛ نرخ تبدیل
                پیشنهادی مالک یا نرخ بازار نیست. در پنل مقایسه قابل تغییر است.
              </p>
            </div>
            {home.cautions.map((c) => (
              <div className="caution" key={c}>
                <Icon name={Info} />
                {c}
              </div>
            ))}
          </>
        )}
        {tab === 'evidence' && (
          <>
            <h3>
              {home.offers.length > 1
                ? 'این نشانه‌ها هم‌زمان تطبیق دارند'
                : 'فقط یک منبع برای این خانه داریم'}
            </h3>
            <ul className="reason-list">
              {home.matchEvidence.map((e) => (
                <li key={e}>
                  <Icon name={Check} />
                  {e}
                </li>
              ))}
            </ul>
            <div className="formula">
              <p>
                هر پیشنهاد با همهٔ اعضای گروه تطبیق داده می‌شود. اشتراک عکس یا محله به‌تنهایی کافی
                نیست. خانهٔ هم‌متراژ در طبقهٔ دیگر جدا می‌ماند.
              </p>
              <p>
                در نسخهٔ نمایشی، اثر تصویر و نشانی دادهٔ ساختگی‌اند؛ صحت ادغام روی آگهی واقعی هنوز
                ارزیابی نشده است.
              </p>
            </div>
          </>
        )}
      </div>
      <div className="modal-foot">
        <Icon name={Info} size={16} />
        این نمونه آگهی واقعی نیست و امکان تماس یا رزرو ندارد.
      </div>
    </Modal>
  );
}
export function Compare({ homes, onClose, onRemove, rate, onRate }) {
  return (
    <Modal title="خانه‌ها را کنار هم ببین" onClose={onClose} wide>
      <div className="compare-settings">
        <div>
          <h3>ودیعه برای شما چقدر وزن دارد؟</h3>
          <p>فقط برای مرتب‌سازی هزینهٔ مقایسه؛ مبلغ آگهی‌ها تغییر نمی‌کند.</p>
        </div>
        <label htmlFor="rate">
          ضریب ماهانهٔ شخصی <strong>{fa(rate)}٪</strong>
          <input
            id="rate"
            type="range"
            min="0"
            max="5"
            step="0.5"
            value={rate}
            onChange={(e) => onRate(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="comparison-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">مشخصات</th>
              {homes.map((h) => (
                <th key={h.id} scope="col">
                  <HomePhoto home={h} />
                  <div>
                    {h.district} · {fa(h.area)} متر{' '}
                    <button
                      className="icon-button"
                      aria-label={`حذف ${h.district} از مقایسه`}
                      onClick={() => onRemove(h.id)}
                    >
                      <Icon name={X} size={16} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['ودیعه', (h) => `${money(h.best.deposit)} تومان`],
              ['اجارهٔ ماهانه', (h) => (h.best.rent ? `${money(h.best.rent)} تومان` : 'رهن کامل')],
              ['هزینهٔ مقایسه', (h) => `${money(h.effective)} تومان`],
              [
                'پیاده تا مترو',
                (h) => (h.metroMinutes === null ? 'نامشخص' : `${fa(h.metroMinutes)} دقیقه`),
              ],
              ['اتاق خواب', (h) => fa(h.bedrooms)],
              ['پارکینگ', (h) => (h.parking === null ? 'نامشخص' : h.parking ? 'دارد' : 'ندارد')],
              ['آسانسور', (h) => (h.elevator === null ? 'نامشخص' : h.elevator ? 'دارد' : 'ندارد')],
              ['پیشنهاد معتبر', (h) => fa(h.freshOfferCount)],
              ['نکتهٔ تصمیم', (h) => h.cautions[0] || 'در دادهٔ نمونه تعارض ثبت نشده'],
            ].map(([label, get]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {homes.map((h) => (
                  <td key={h.id}>{get(h)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="modal-foot">
        <Icon name={Info} />
        هزینهٔ مقایسه = اجاره + ودیعه × ضریب شخصی. مبلغ قابل پرداخت، همان ودیعه و اجارهٔ جداگانه
        است.
      </div>
    </Modal>
  );
}
export function MapView({ homes, onOpen }) {
  const points = {
    صادقیه: [26, 65],
    ستارخان: [42, 73],
    'جنت آباد': [16, 27],
    پونک: [37, 24],
    شهرآرا: [53, 49],
    'یوسف آباد': [76, 34],
    امیرآباد: [65, 54],
    تهرانپارس: [87, 69],
  };
  const groups = Object.entries(points).map(([name, p]) => ({
    name,
    p,
    homes: homes.filter((h) => h.district === name),
  }));
  return (
    <div className="map-view">
      <div className="map-caption">
        <Icon name={MapPin} />
        <strong>نمای محله‌ها</strong>
        <span>چیدمان شماتیک؛ موقعیت دقیق ملک نیست</span>
      </div>
      <div className="map-canvas">
        <svg viewBox="0 0 900 540" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="blocks" width="60" height="48" patternUnits="userSpaceOnUse">
              <rect width="52" height="39" x="4" y="4" rx="5" fill="#e5e8e1" />
            </pattern>
          </defs>
          <rect width="900" height="540" fill="url(#blocks)" />
          <path
            d="M0 260 Q250 170 450 240 T900 210 M0 440 Q330 350 540 395 T900 300 M210 0 Q290 270 220 540 M540 0 Q470 250 640 540"
            stroke="white"
            strokeWidth="19"
            fill="none"
          />
          <path d="M35 90 Q220 115 390 90 T880 120" stroke="#dce5d3" strokeWidth="55" fill="none" />
          <path
            d="M60 460 Q250 295 440 330 T820 365"
            stroke="#d96567"
            strokeWidth="3"
            strokeDasharray="8 8"
            fill="none"
          />
        </svg>
        {groups.map((g) => (
          <div
            key={g.name}
            className={`map-pin-group ${!g.homes.length ? 'inactive' : ''}`}
            style={{ left: `${g.p[0]}%`, top: `${g.p[1]}%` }}
          >
            {g.homes.length ? (
              <button onClick={() => onOpen(g.homes[0])}>
                <span>{money(Math.min(...g.homes.map((h) => h.best.rent)))}</span>
                <small>
                  {g.name} · {fa(g.homes.length)} خانه
                </small>
              </button>
            ) : (
              <span>{g.name}</span>
            )}
          </div>
        ))}
      </div>
      <p className="unit-note">
        برچسب‌ها اجارهٔ ماهانهٔ کمترین پیشنهاد منتخب در هر محله را نشان می‌دهند. برای دیدن ودیعه،
        روی محله بزنید.
      </p>
    </div>
  );
}
