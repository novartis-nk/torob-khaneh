import React, { useEffect, useRef, useState } from 'react';
import { Search, X, House, Compass, Globe2, Send, CircleCheck } from 'lucide-react';
import { Icon, Modal } from '../components';
import './landing.css';
const SERVICES = {
  housing: {
    label: 'اجاره و خرید',
    icon: House,
    placeholder: 'محله، ویژگی خانه یا بودجه‌ات را بنویس',
    scope: 'در این نسخه: خانه‌های اجاره‌ای تهران؛ آگهی خرید هنوز اضافه نشده.',
    examples: ['صادقیه با پارکینگ', 'رهن کامل', 'دو خواب نزدیک مترو'],
  },
  travel: {
    label: 'سفر',
    icon: Compass,
    placeholder: 'مقصد یا اقامتگاهی که دنبالش هستی',
    scope: 'در این نسخه: اقامتگاه‌های رامسر و اطراف از جاباما، اتاقک و جاجیگا.',
    examples: ['رامسر', 'ویلا در رامسر', 'کلبه'],
  },
};
function destination(service, query) {
  const params = new URLSearchParams();
  const q = query.trim();
  if (service === 'housing') {
    if (q) params.set('q', q);
    return `/khaneh${params.size ? `?${params}` : ''}`;
  }
  // Extract only explicit destinations and property types; preserve the rest as text.
  let text = q.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
  const cities = [
    'کتالم و سادات شهر',
    'سادات شهر',
    'چابکسر',
    'تنکابن',
    'جواهرده',
    'شیرود',
    'کتالم',
    'رامسر',
  ];
  const types = { ویلا: 'villa', کلبه: 'cottage', آپارتمان: 'apartment', سوئیت: 'suite' };
  for (const city of cities) {
    const pattern = new RegExp(`(^|\\s)${city}(?=\\s|$)`);
    if (pattern.test(text)) {
      params.set('city', city);
      text = text.replace(pattern, ' ').trim();
      break;
    }
  }
  for (const [name, type] of Object.entries(types)) {
    const pattern = new RegExp(`(^|\\s)${name}(?=\\s|$)`);
    if (pattern.test(text)) {
      params.set('type', type);
      text = text.replace(pattern, ' ').trim();
      break;
    }
  }
  if (params.size)
    text = text
      .replace(/(^|\s)در(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  if (text) params.set('q', text);
  return `/safar${params.size ? `?${params}` : ''}`;
}
export default function Landing() {
  const [service, setService] = useState('housing');
  const [queries, setQueries] = useState({ housing: '', travel: '' });
  const [about, setAbout] = useState(false);
  const [crawlOpen, setCrawlOpen] = useState(false);
  const [crawlForm, setCrawlForm] = useState({
    url: '',
    vertical: 'housing',
    method: 'crawl',
    apiUrl: '',
    notes: '',
  });
  const [crawlState, setCrawlState] = useState({ status: 'idle', message: '', request: null });
  const input = useRef(null);
  const tabs = useRef([]);
  const current = SERVICES[service];
  const query = queries[service];
  useEffect(() => {
    document.title = 'ترب | جست‌وجوی خانه و سفر';
  }, []);
  function search(value = query) {
    location.assign(destination(service, value));
  }
  function onTabKey(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    setService(Object.keys(SERVICES)[next]);
    tabs.current[next]?.focus();
  }
  async function requestCrawl(event) {
    event.preventDefault();
    setCrawlState({ status: 'loading', message: '', request: null });
    try {
      const response = await fetch(
        crawlForm.method === 'crawl' ? '/api/crawl-requests' : '/api/source-requests',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(crawlForm),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error('آدرس سایت معتبر نیست یا درخواست ثبت نشد.');
      setCrawlState({ status: 'success', message: result.message, request: result });
    } catch (error) {
      setCrawlState({ status: 'error', message: error.message, request: null });
    }
  }
  return (
    <div className="landing">
      <header className="landing-header">
        <span>خانه و سفر</span>
        <div>
          <button onClick={() => setCrawlOpen(true)}>درخواست افزودن سایت</button>
          <button onClick={() => setAbout(true)}>دربارهٔ این تجربه</button>
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-search" aria-label="جست‌وجوی خانه و سفر">
          <h1 className="landing-wordmark" aria-label="ترب">
            <img src="/torob-logo.svg" alt="" />
            <span>ترب</span>
          </h1>
          <p className="landing-tagline">یک جست‌وجو، انتخاب‌های بیشتر</p>
          <div className="landing-tabs" role="tablist" aria-label="چه چیزی می‌خواهی پیدا کنی؟">
            {Object.entries(SERVICES).map(([id, config], i) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={service === id}
                aria-controls="landing-search-panel"
                tabIndex={service === id ? 0 : -1}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                onClick={() => setService(id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                <Icon name={config.icon} size={18} />
                {config.label}
              </button>
            ))}
          </div>
          <div id="landing-search-panel" role="tabpanel" aria-labelledby={`tab-${service}`}>
            <form
              className="landing-form"
              role="search"
              aria-label={`جست‌وجوی ${current.label}`}
              onSubmit={(event) => {
                event.preventDefault();
                search();
              }}
            >
              <input
                ref={input}
                type="search"
                autoComplete="off"
                maxLength={200}
                aria-label={service === 'housing' ? 'جست‌وجوی خانه' : 'جست‌وجوی سفر'}
                aria-describedby="landing-scope"
                placeholder={current.placeholder}
                value={query}
                onChange={(e) => setQueries({ ...queries, [service]: e.target.value })}
              />
              {query && (
                <button
                  className="landing-clear"
                  type="button"
                  aria-label="پاک کردن جست‌وجو"
                  onClick={() => {
                    setQueries({ ...queries, [service]: '' });
                    input.current?.focus();
                  }}
                >
                  <Icon name={X} size={18} />
                </button>
              )}
              <button className="landing-submit" type="submit" aria-label="جست‌وجو">
                <Icon name={Search} size={22} />
              </button>
            </form>
            <p className="landing-scope" id="landing-scope">
              {current.scope}
            </p>
            <div className="landing-examples">
              <span>مثلاً</span>
              {current.examples.map((example) => (
                <button key={example} onClick={() => search(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
          <nav className="landing-browse" aria-label="ورود مستقیم بدون جست‌وجو">
            <a href="/khaneh">
              <Icon name={House} size={16} />
              دیدن همهٔ خانه‌ها
            </a>
            <a href="/safar">
              <Icon name={Compass} size={16} />
              دیدن همهٔ اقامتگاه‌ها
            </a>
          </nav>
          <button className="landing-crawl-link" onClick={() => setCrawlOpen(true)}>
            <Icon name={Globe2} size={16} />
            سایت خانه یا سفر شما اینجا نیست؟ درخواست بررسی بدهید
          </button>
        </section>
      </main>
      <footer className="landing-footer">
        <span>نمونهٔ مستقل ترب خانه و سفر</span>
        <span>جست‌وجو کن؛ پیشنهادها را کنار هم ببین.</span>
      </footer>
      {about && (
        <Modal title="یک شروع ساده برای خانه و سفر" onClose={() => setAbout(false)}>
          <div className="landing-about">
            <p>
              موضوع را انتخاب کن و بنویس دنبال چه می‌گردی. نتایج در بخش خانه یا سفر باز می‌شوند؛
              آنجا می‌توانی فیلترها را دقیق‌تر کنی و گزینه‌ها را مقایسه کنی.
            </p>
            <p>
              بخش خانه فعلاً دادهٔ نمایشی اجارهٔ تهران دارد؛ خرید هنوز فعال نیست. بخش سفر، نسخهٔ
              مشاهده‌شدهٔ آگهی‌های عمومی رامسر و اطراف را نشان می‌دهد. قیمت نهایی و موجودی در سایت
              میزبان تأیید می‌شوند.
            </p>
            <p>این پروژه نمونه‌ای مستقل برای چالش محصول ترب است.</p>
          </div>
        </Modal>
      )}
      {crawlOpen && (
        <Modal
          title="درخواست بررسی یک سایت"
          onClose={() => {
            setCrawlOpen(false);
            setCrawlState({ status: 'idle', message: '', request: null });
          }}
        >
          {crawlState.status === 'success' ? (
            <div className="landing-crawl-success" aria-live="polite">
              <Icon name={CircleCheck} size={38} />
              <h3>درخواست در صف بررسی است</h3>
              <p>{crawlState.message}</p>
              <dl>
                <div>
                  <dt>شناسهٔ پیگیری</dt>
                  <dd dir="ltr">{crawlState.request.id}</dd>
                </div>
                <div>
                  <dt>دامنه</dt>
                  <dd dir="ltr">{crawlState.request.domain}</dd>
                </div>
              </dl>
              <button className="primary" onClick={() => setCrawlOpen(false)}>
                متوجه شدم
              </button>
            </div>
          ) : (
            <form className="landing-crawl-form" onSubmit={requestCrawl}>
              <p>
                روش اتصال را انتخاب کنید: API برای منبعی که فهرست رسمی دارد، یا خزش که به صف
                task-worker می‌رود. درخواست ابتدا از نظر دسترسی و کیفیت داده بررسی می‌شود.
              </p>
              <label>
                آدرس سایت
                <input
                  required
                  type="url"
                  inputMode="url"
                  dir="ltr"
                  placeholder="https://example.com/listings"
                  value={crawlForm.url}
                  onChange={(event) => setCrawlForm({ ...crawlForm, url: event.target.value })}
                />
              </label>
              <label>
                روش اتصال
                <select
                  value={crawlForm.method}
                  onChange={(event) => setCrawlForm({ ...crawlForm, method: event.target.value })}
                >
                  <option value="crawl">خزش با صف task-worker</option>
                  <option value="api">اتصال از طریق API</option>
                </select>
              </label>
              {crawlForm.method === 'api' && (
                <label>
                  آدرس API
                  <input
                    required
                    type="url"
                    inputMode="url"
                    dir="ltr"
                    placeholder="https://example.com/api/listings"
                    value={crawlForm.apiUrl}
                    onChange={(event) => setCrawlForm({ ...crawlForm, apiUrl: event.target.value })}
                  />
                </label>
              )}
              <label>
                نوع داده
                <select
                  value={crawlForm.vertical}
                  onChange={(event) => setCrawlForm({ ...crawlForm, vertical: event.target.value })}
                >
                  <option value="housing">خانه و ملک</option>
                  <option value="travel">اقامتگاه و سفر</option>
                </select>
              </label>
              <label>
                توضیح کوتاه <span>اختیاری</span>
                <textarea
                  maxLength={500}
                  rows={3}
                  placeholder="مثلاً صفحهٔ عمومی نتایج یا نکته‌ای دربارهٔ قیمت‌ها"
                  value={crawlForm.notes}
                  onChange={(event) => setCrawlForm({ ...crawlForm, notes: event.target.value })}
                />
              </label>
              {crawlState.status === 'error' && (
                <p className="landing-crawl-error" role="alert">
                  {crawlState.message}
                </p>
              )}
              <button className="primary" disabled={crawlState.status === 'loading'}>
                <Icon name={Send} size={17} />
                {crawlState.status === 'loading' ? 'در حال ثبت…' : 'ثبت درخواست بررسی'}
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
