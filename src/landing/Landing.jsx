import React, { useEffect, useRef, useState } from 'react';
import { Search, X, House, Compass } from 'lucide-react';
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
  return (
    <div className="landing">
      <header className="landing-header">
        <span>خانه و سفر</span>
        <button onClick={() => setAbout(true)}>دربارهٔ این تجربه</button>
      </header>
      <main className="landing-main">
        <section className="landing-search" aria-label="جست‌وجوی خانه و سفر">
          <h1 className="landing-wordmark">ترب</h1>
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
    </div>
  );
}
