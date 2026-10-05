import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Minus, Plus } from 'lucide-react';
import { Modal, Icon } from '../components';
import { fa, day, today, dateLabel, monthStart, shiftMonth, monthDays } from './dates';
export function DatePicker({ trip, onApply, onClose }) {
  const [arrival, setArrival] = useState(trip.checkin),
    [departure, setDeparture] = useState(trip.checkout),
    [stage, setStage] = useState('arrival'),
    [month, setMonth] = useState(monthStart(trip.checkin));
  const start = today(),
    limit = day(start, 365);
  function pick(iso) {
    if (stage === 'arrival') {
      setArrival(iso);
      setDeparture('');
      setStage('departure');
    } else {
      setDeparture(iso);
    }
  }
  return (
    <Modal title="تاریخ سفرت" onClose={onClose}>
      <div className="sf-picker">
        <div className="sf-date-tabs">
          <button
            className={stage === 'arrival' ? 'selected' : ''}
            onClick={() => setStage('arrival')}
          >
            ورود <strong>{dateLabel(arrival)}</strong>
          </button>
          <button
            className={stage === 'departure' ? 'selected' : ''}
            onClick={() => setStage('departure')}
          >
            خروج <strong>{departure ? dateLabel(departure) : 'انتخاب کن'}</strong>
          </button>
        </div>
        <p className="muted">
          {stage === 'arrival' ? 'روز ورود را انتخاب کن.' : 'روز خروج را انتخاب کن؛ حداکثر ۳۰ شب.'}
        </p>
        <div className="sf-month-nav">
          <button
            aria-label="ماه قبل"
            className="icon-button"
            disabled={month <= monthStart(start)}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <Icon name={ChevronRight} />
          </button>
          <strong>{dateLabel(month, { year: 'numeric', day: undefined })}</strong>
          <button
            aria-label="ماه بعد"
            className="icon-button"
            disabled={month >= monthStart(day(limit, 30))}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <Icon name={ChevronLeft} />
          </button>
        </div>
        <div className="sf-calendar">
          {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d, i) => (
            <span key={i} className="sf-weekday">
              {d}
            </span>
          ))}
          {monthDays(month).map((iso, i) =>
            iso ? (
              <button
                key={iso}
                aria-label={dateLabel(iso, { year: 'numeric' })}
                aria-pressed={iso === arrival || iso === departure}
                disabled={
                  iso < start ||
                  (stage === 'arrival' ? iso > limit : iso <= arrival || iso > day(arrival, 30))
                }
                className={`${iso === arrival || iso === departure ? 'selected' : ''} ${iso > arrival && iso < departure ? 'in-range' : ''}`}
                onClick={() => pick(iso)}
              >
                {dateLabel(iso, { month: undefined })}
              </button>
            ) : (
              <span key={`blank-${i}`} />
            ),
          )}
        </div>
        <button
          className="primary sf-full"
          disabled={!departure || departure <= arrival}
          onClick={() => {
            onApply({ checkin: arrival, checkout: departure });
            onClose();
          }}
        >
          تأیید تاریخ ·{' '}
          {departure
            ? fa(Math.round((Date.parse(departure) - Date.parse(arrival)) / 86400000))
            : '—'}{' '}
          شب
        </button>
      </div>
    </Modal>
  );
}
export function GuestPicker({ trip, onApply, onClose }) {
  const [adults, setAdults] = useState(trip.adults),
    [children, setChildren] = useState(trip.children);
  return (
    <Modal title="همسفرها" onClose={onClose}>
      <div className="sf-picker">
        <div className="sf-counter">
          <div>
            <strong>بزرگسال</strong>
            <p className="muted">۱۸ سال و بیشتر</p>
          </div>
          <div>
            <button
              className="secondary"
              aria-label="کاهش بزرگسال"
              disabled={adults <= 1}
              onClick={() => setAdults(adults - 1)}
            >
              <Icon name={Minus} />
            </button>
            <b aria-live="polite">{fa(adults)}</b>
            <button
              className="secondary"
              aria-label="افزایش بزرگسال"
              disabled={adults >= 16}
              onClick={() => setAdults(adults + 1)}
            >
              <Icon name={Plus} />
            </button>
          </div>
        </div>
        <div className="sf-counter">
          <div>
            <strong>کودک</strong>
            <p className="muted">سن در زمان سفر</p>
          </div>
          <div>
            <button
              className="secondary"
              aria-label="کاهش کودک"
              disabled={!children.length}
              onClick={() => setChildren(children.slice(0, -1))}
            >
              <Icon name={Minus} />
            </button>
            <b aria-live="polite">{fa(children.length)}</b>
            <button
              className="secondary"
              aria-label="افزایش کودک"
              disabled={children.length >= 6}
              onClick={() => setChildren([...children, 0])}
            >
              <Icon name={Plus} />
            </button>
          </div>
        </div>
        {children.map((age, i) => (
          <label className="sf-child" key={i}>
            سن کودک {fa(i + 1)}
            <select
              value={age}
              onChange={(e) =>
                setChildren(children.map((v, j) => (j === i ? Number(e.target.value) : v)))
              }
            >
              {Array.from({ length: 18 }, (_, v) => (
                <option value={v} key={v}>
                  {fa(v)} سال
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="sf-note">
          ظرفیت با تعداد همهٔ مهمان‌ها سنجیده می‌شود. هزینه و قوانین کودکان را در سایت میزبان تأیید
          کن.
        </p>
        <button
          className="primary sf-full"
          onClick={() => {
            onApply({ adults, children });
            onClose();
          }}
        >
          تأیید · {fa(adults + children.length)} مهمان
        </button>
      </div>
    </Modal>
  );
}
