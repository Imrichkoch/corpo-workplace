import { bookingOrder, dateFromKey, formatDate, shiftDay } from "../data.js";
import { bookingRows, button, esc, iconButton, pageHeader } from "../components.js";

export const calendar = {
  id: "calendar", title: "Kalendár", icon: "calendar", group: "Pracovný priestor", configurable: true,
  description: "Týždenný prehľad a správa osobných rezervácií.",
  render({ state, bookings, today }) {
    const selected = state.calendarDay;
    const start = shiftDay(selected, -((dateFromKey(selected).getUTCDay() + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
    const mine = bookings.filter((b) => b.mine).sort(bookingOrder);
    return pageHeader("Kalendár", "Prehľad vašich rezervácií vo vybranej kancelárii.", button("Nová rezervácia", "new-booking", "plus", "primary", 'data-date="' + (selected >= today ? selected : today) + '"')) +
      '<section class="panel calendar-panel"><header class="panel-heading"><div><h2>' + esc(formatDate(selected, { month: "long", year: "numeric" })) + '</h2><p>Týždeň v kancelárii</p></div><div class="toolbar">' +
      iconButton("Predchádzajúci týždeň", "calendar-shift", "left", 'data-step="-7"') +
      button("Dnes", "calendar-today", null) + iconButton("Nasledujúci týždeň", "calendar-shift", "right", 'data-step="7"') +
      '</div></header><div class="week">' + week.map((date) => {
        const count = mine.filter((b) => b.date === date).length;
        return '<button type="button" class="week-day' + (date === selected ? " selected" : "") + '" data-action="select-calendar-day" data-date="' + date + '" aria-pressed="' + (date === selected) + '"><span>' + esc(formatDate(date, { weekday: "short" })) + '</span><strong>' + dateFromKey(date).getUTCDate() + '</strong><small>' + (count ? count + ' <span class="week-reservation">rez.</span>' : "–") + '</small></button>';
      }).join("") + '</div></section><section class="panel calendar-items"><header class="panel-heading"><div><h2>' + esc(formatDate(selected, { weekday: "long", day: "numeric", month: "long" })) + '</h2><p>Rezervácie na vybraný deň</p></div></header>' +
      bookingRows(mine.filter((b) => b.date === selected), today, { cancellable: selected >= today }) + "</section>";
  },
};
