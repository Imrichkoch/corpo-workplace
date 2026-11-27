export const offices = [
  { id: "bratislava", name: "Bratislava HQ", detail: "Pribinova 10, Bratislava", floors: ["2. poschodie", "3. poschodie"] },
  { id: "kosice", name: "Košice Hub", detail: "Mlynská 12, Košice", floors: ["1. poschodie"] },
];

const rooms = [
  ["atlas", "Atlas", "2. poschodie", 8, ["Obrazovka", "Videohovor", "Tabuľa"]],
  ["dunaj", "Dunaj", "2. poschodie", 12, ["Obrazovka", "Videohovor"]],
  ["lipa", "Lipa", "2. poschodie", 4, ["Tabuľa"]],
  ["tatry", "Tatry", "3. poschodie", 6, ["Obrazovka", "Tabuľa"]],
  ["nova", "Nova", "3. poschodie", 8, ["Obrazovka", "Videohovor"]],
  ["studio", "Štúdio", "3. poschodie", 2, ["Videohovor"]],
  ["hornad", "Hornád", "1. poschodie", 10, ["Obrazovka", "Tabuľa"]],
  ["k2", "K2", "1. poschodie", 4, ["Obrazovka"]],
];

const desks = offices.flatMap((office) => {
  const count = office.id === "bratislava" ? 24 : 8;
  return Array.from({ length: count }, (_, i) => {
    const floor = office.floors[i >= 12 ? 1 : 0];
    const zone = i % 12 < 6 ? "Zóna pri okne" : "Tichá zóna";
    const id = "D-" + String(i + 1).padStart(2, "0");
    return { id: office.id + "-" + id, name: id, office: office.id, floor, zone, type: "desk", amenities: i % 3 === 0 ? ["Monitor", "Stojací stôl"] : ["Monitor"] };
  });
});

export const resources = [
  ...desks,
  ...rooms.map(([id, name, floor, capacity, amenities], i) => ({
    id, name, floor, capacity, amenities, type: "room", office: i < 6 ? "bratislava" : "kosice",
  })),
];

export const people = [
  { name: "Lucia Nováková", role: "People & Culture", color: "peach" },
  { name: "Tomáš Kováč", role: "Produkt", color: "lavender" },
  { name: "Nina Horváthová", role: "Dizajn", color: "mint" },
  { name: "Peter Veselý", role: "Operatíva", color: "sand" },
];

export function dayKey(value = new Date()) {
  if (typeof value === "string") return value;
  const part = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" });
  return part.format(value);
}
export function dateFromKey(key) { return new Date(key + "T12:00:00Z"); }
export function shiftDay(key, n) {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
export function formatDate(key, options = { day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("sk-SK", { timeZone: "UTC", ...options }).format(dateFromKey(key));
}
export const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export function officeTime() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}
export const initials = (value) => value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
export const asset = (name) => resources.find((resource) => resource.id === name);
export const rangesOverlap = (a, b) => a.start < b.end && a.end > b.start;
export const bookingOrder = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);

export function sampleData(today) {
  const tomorrow = shiftDay(today, 1);
  const inTwoDays = shiftDay(today, 2);
  const team = resources.filter((r) => r.office === "bratislava" && r.type === "desk" && !["D-08", "D-10", "D-12", "D-14", "D-16", "D-18", "D-20", "D-22", "D-24"].includes(r.name));
  return {
    profile: { name: "Martin Kováč", email: "martin@example.com", demo: true },
    bookings: [
      ...team.map((r, i) => ({ id: "sample-team-" + i, resource: r.id, date: today, start: "08:00", end: "18:00", title: "", mine: false, person: people[i % people.length].name })),
      { id: "sample-dunaj", resource: "dunaj", date: today, start: "08:00", end: "18:00", title: "", mine: false, person: "Tím produktu" },
      { id: "sample-nova", resource: "nova", date: today, start: "08:00", end: "18:00", title: "", mine: false, person: "Tím dizajnu" },
      { id: "sample-mine-1", resource: "atlas", date: today, start: "10:00", end: "11:00", title: "Tímový sync", mine: true },
      { id: "sample-mine-2", resource: "bratislava-D-12", date: tomorrow, start: "09:00", end: "17:00", title: "", mine: true },
      { id: "sample-mine-3", resource: "tatry", date: inTwoDays, start: "13:30", end: "14:30", title: "Projektový workshop", mine: true },
    ],
    visits: [
      { id: "sample-guest-1", name: "Eva Urbanová", company: "Studio Forma", date: today, time: "11:00", office: "bratislava", status: "expected" },
      { id: "sample-guest-2", name: "Jakub Baláž", company: "Northline", date: tomorrow, time: "14:00", office: "bratislava", status: "expected" },
    ],
  };
}
