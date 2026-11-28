import { language, languageLocale, setLanguage, t, type Language } from "./i18n";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AdminPanel from "./AdminPanel";

const origin = "https://raizenko.cloud/corpo/app/";
const key = "corpo.session";
type Kind = "desk" | "room" | "parking";
type Role = "owner" | "admin" | "member";
type Tab = "book" | "mine" | "plans" | "account";
type Tenant = { id: string; name: string; role: Role };
type Account = { user: { id: string; name: string; email: string }; tenants: Tenant[]; token?: string };
type Resource = {
  id: string; office: string; name: string; kind: Kind; description: string; capacity: number;
  plan: string | null; x: number | null; y: number | null; disabled: number;
};
type Reservation = { id: string; resourceName: string; kind: Kind; office: string; date: string; start: string; end: string; title: string };
type Plan = { id: string; name: string; office: string; kind: "office" | "parking" };
type Work = {
  tenant: Tenant; date: string; today: string; offices: { id: string; name: string; archived: number }[]; resources: Resource[];
  security?: { sso: boolean };
  busy: { resource: string; start: string; end: string }[]; mine: Reservation[]; plans: Plan[];
};
const labels = () => ({ desk: t("Stoly"), room: t("Zasadačky"), parking: t("Parkovanie") });
const kindNames = () => ({ desk: t("Pracovný stôl"), room: t("Zasadačka"), parking: t("Parkovacie miesto") });
const roleNames = () => ({ owner: t("Vlastník"), admin: t("Správca"), member: t("Člen") });
const formatDate = (value:string) => new Intl.DateTimeFormat(languageLocale(), {day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(value+"T12:00:00Z"));
const translatedTabs = (): [Tab|"admin",string][] => [["book",t("Priestory")],["mine",t("Rezervácie")],["plans",t("Pôdorysy")],["account",t("Účet")]];

class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function request<T>(path: string, token = "", record?: object): Promise<T> {
  const headers: Record<string,string> = { Accept: "application/json", "Accept-Language":language() };
  if (token) headers.Authorization = "Bearer " + token;
  if (record) headers["Content-Type"] = "application/json";
  const result = await fetch(origin+"api/"+path,{headers,method:record ? "POST" : "GET",body:record ? JSON.stringify(record) : undefined});
  const data = await result.json().catch(() => null);
  if (!result.ok || !data) throw new RequestError(data?.message || t("Pracovisko je dočasne nedostupné."), result.status);
  return data as T;
}
function shiftDay(value: string, count: number) {
  const date = new Date(value+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+count);
  return date.toISOString().slice(0,10);
}
function describe(error: unknown) { return error instanceof Error ? error.message : t("Nastala chyba."); }
function openWeb(fragment = "") {
  Linking.openURL(origin + "?lang=" + language() + fragment).catch(() => Alert.alert(t("Adresu sa nepodarilo otvoriť.")));
}
function Button({label,onPress,outlined = false,disabled = false}: {label:string;onPress:()=>void;outlined?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({pressed})=>[styles.button,outlined && styles.outlined,(disabled || pressed) && styles.dim]}>
    <Text style={outlined ? styles.outlinedLabel : styles.buttonLabel}>{label}</Text>
  </Pressable>;
}
function Heading({title,description}: {title:string;description:string}) {
  return <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.muted}>{description}</Text></View>;
}
function Field({label,value,set,secret = false,email = false,example}: {label:string;value:string;set:(value:string)=>void;secret?:boolean;email?:boolean;example?:string}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <TextInput value={value} onChangeText={set} accessibilityLabel={label} placeholder={example} placeholderTextColor="#677d70"
      secureTextEntry={secret} autoCapitalize={email || secret ? "none" : "sentences"} autoCorrect={!email && !secret}
      autoComplete={email ? "email" : secret ? "current-password" : "off"}
      keyboardType={email ? "email-address" : "default"} maxLength={secret ? 128 : email ? 254 : 120} style={styles.input}/>
  </View>;
}
function Segments<T extends string>({items,value,select}: {items:[T,string][];value:T;select:(v:T)=>void}) {
  return <View style={styles.segments}>{items.map(([id,label])=>
    <Pressable key={id} accessibilityRole="button" accessibilityState={{selected:value===id}} onPress={()=>select(id)}
      style={[styles.segment,value===id && styles.active]}><Text style={styles.segmentLabel}>{label}</Text></Pressable>)}</View>;
}
function Card({name,description,action}: {name:string;description:string;action?:React.ReactNode}) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{name}</Text><Text style={styles.muted}>{description}</Text>{action}</View>;
}

function MfaPrompt({id,credential,verified,leave}: {id:string;credential:string;verified:()=>void;leave:()=>void}) {
  const [step,setStep] = useState<"loading"|"email"|"setup"|"verify"|"recovery">("loading");
  const [code,setCode] = useState(""), [secret,setSecret] = useState(""), [codes,setCodes] = useState<string[]>([]);
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  const base = "tenant/" + id + "/mfa";
  async function run() {
    if (step==="recovery") { verified(); return; }
    setError(""); setPending(true);
    try {
      if (step==="loading") {
        const result = await request<{enrolled:boolean;required:boolean}>(base,credential);
        if (!result.required) { verified(); return; }
        setStep(result.enrolled ? "verify" : "email");
      } else if (step==="email") {
        await request(base+"/email",credential,{});
        setStep("setup");
      } else if (step==="setup") {
        const result = await request<{secret:string}>(base+"/setup",credential,{code});
        setSecret(result.secret); setStep("verify");
      } else {
        const {recoveryCodes} = await request<{recoveryCodes:string[]}>(base+"/verify",credential,{code});
        setSecret("");
        if (recoveryCodes.length) { setCodes(recoveryCodes); setStep("recovery"); }
        else verified();
      }
      setCode("");
    } catch (error) { setError(describe(error)); }
    finally { setPending(false); }
  }
  useEffect(()=>{ void run(); },[]);
  const help = {
    loading:t("Načítavam…"),
    email:t("Pošlite si overovací kód na e-mail svojho účtu. Potom pridajte Corpo do overovacej aplikácie."),
    setup:t("Zadajte kód, ktorý sme poslali na váš e-mail."),
    verify:secret ? t("V overovacej aplikácii vytvorte časový účet s týmto kľúčom a zadajte šesťmiestny kód.") :
      t("Zadajte šesťmiestny kód z overovacej aplikácie alebo obnovovací kód."),
    recovery:t("Uložte si obnovovacie kódy na bezpečnom mieste. Každý môžete použiť raz."),
  }[step];
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Heading title={t("Viacfaktorové overenie (MFA)")} description={help}/>
    {!!secret && <Text selectable style={styles.label} accessibilityLabel={t("Kľúč aplikácie")}>{secret}</Text>}
    {codes.map(value=><Text key={value} selectable style={styles.label}>{value}</Text>)}
    {(step==="setup" || step==="verify") && <Field label={t("Overovací kód")} value={code} set={setCode}/>}
    {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    <Button label={step==="email" ? t("Poslať kód na e-mail") : step==="recovery" ? t("Pokračovať do pracoviska") :
      step==="loading" ? t("Skúsiť znova") : t("Overiť kód")} disabled={pending || ((step==="setup" || step==="verify") && !code.trim())} onPress={run}/>
    {(step==="setup" || !!secret) && <Button label={t("Začať znova")} outlined disabled={pending}
      onPress={()=>{setSecret("");setCode("");setError("");setStep("email");}}/>}
    <Button label={t("Späť do účtu")} outlined disabled={pending} onPress={leave}/>
  </ScrollView>;
}

function SignIn({onLogin}: {onLogin:(account:Account)=>Promise<void>}) {
  const [email,setEmail] = useState(""), [secret,setSecret] = useState(""), [error,setError] = useState(""), [pending,setPending] = useState(false);
  const [showSso,setShowSso] = useState(false), [tenant,setTenant] = useState("");
  async function signInSso() {
    setPending(true); setError("");
    try {
      const begin = await request<{url:string;poll:string}>("auth/entra/start","",{tenant:tenant.trim(),client:"native"});
      await Linking.openURL(begin.url);
      const deadline = Date.now()+285000;
      for (;;) {
        if (Date.now()>deadline) throw new Error(t("Prihlásenie Microsoft Entra sa nepodarilo dokončiť."));
        const result = await request<Account & {pending?:boolean}>("auth/entra/complete","",{poll:begin.poll});
        if (!result.pending) { await onLogin(result); return; }
        await new Promise(resolve=>setTimeout(resolve,2500));
      }
    } catch (error) { setError(describe(error)); } finally { setPending(false); }
  }
  async function signIn() {
    setPending(true); setError("");
    try {
      await onLogin(await request<Account>("auth/login","",{email,password:secret,client:"native"}));
      setSecret("");
    } catch (error) { setError(describe(error)); } finally { setPending(false); }
  }
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==="ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.login} keyboardShouldPersistTaps="handled">
      <Image source={require("./assets/icon.png")} style={styles.logo} accessibilityIgnoresInvertColors/>
      <Heading title="Corpo Workplace" description={t("Prihláste sa do svojho firemného pracoviska.")}/>
      {!showSso && <><Field label={t("E-mail")} value={email} set={setEmail} email />
      <Field label={t("Heslo")} value={secret} set={setSecret} secret />
      <Button label={pending ? t("Prihlasovanie…") : t("Prihlásiť sa")} disabled={pending || !email || !secret} onPress={signIn}/></>}
      {showSso && <>
        <Field label={t("Identifikátor firmy pre prihlásenie SSO")} value={tenant} set={setTenant}/>
        <Button label={pending ? t("Prihlasovanie…") : t("Pokračovať do Microsoft Entra")} disabled={pending || tenant.trim().length!==22} onPress={signInSso}/>
      </>}
      {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      <Button label={showSso ? t("Späť na prihlásenie") : t("Prihlásiť sa cez Microsoft Entra")} outlined disabled={pending}
        onPress={()=>{setShowSso(!showSso);setError("");}}/>
      <Button label={t("Vytvoriť účet alebo obnoviť heslo")} outlined onPress={()=>openWeb()}/>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Booking({item,date,close,submit}: {item:Resource;date:string;close:()=>void;submit:(record:object)=>Promise<void>}) {
  const [start,setStart] = useState("09:00"), [end,setEnd] = useState(item.kind==="room" ? "10:00" : "17:00");
  const [title,setTitle] = useState(""), [error,setError] = useState(""), [pending,setPending] = useState(false);
  async function save() {
    setPending(true); setError("");
    try { await submit({resource:item.id,date,start,end,title:title.slice(0,100)}); }
    catch (error) { setError(describe(error)); } finally { setPending(false); }
  }
  return <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={pending ? undefined : close}>
    <SafeAreaView style={styles.flex} edges={["top","bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS==="ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.login} keyboardShouldPersistTaps="handled">
          <Heading title={item.name} description={formatDate(date)+" · "+kindNames()[item.kind]}/>
          <View style={styles.two}>
            <View style={styles.flex}><Field label={t("Od (HH:MM)")} value={start} set={setStart}/></View>
            <View style={styles.flex}><Field label={t("Do (HH:MM)")} value={end} set={setEnd}/></View>
          </View>
          <Field label={t("Názov rezervácie (voliteľné)")} value={title} set={setTitle}/>
          {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
          <Button label={pending ? t("Ukladá sa…") : t("Potvrdiť rezerváciu")} onPress={save} disabled={pending}/>
          <Button label={t("Späť")} onPress={close} disabled={pending} outlined/>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
function FloorPlan({plan,work,token,open}: {plan:Plan;work:Work;token:string;open:(r:Resource)=>void}) {
  const [ratio,setRatio] = useState(1);
  const pins = work.resources.filter(r=>!r.disabled && r.plan===plan.id && r.x!==null && r.y!==null);
  return <View style={[styles.floor,{aspectRatio:ratio}]}>
    <Image accessibilityLabel={plan.name} resizeMode="stretch" style={styles.floorImage}
      source={{uri:origin+"api/tenant/"+work.tenant.id+"/plan/"+plan.id,headers:{Authorization:"Bearer "+token},cache:"reload"}}
      onLoad={event=>{ const {width,height}=event.nativeEvent.source; if(width && height) setRatio(width/height); }}/>
    {pins.map(r=><Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.name} onPress={()=>open(r)}
      style={[styles.pin,{left:(r.x+"%") as `${number}%`,top:(r.y+"%") as `${number}%`}]}><Text style={styles.pinText}>{r.kind==="parking" ? "P" : r.kind==="room" ? (language()==="en" ? "R" : "Z") : (language()==="en" ? "D" : "S")}</Text></Pressable>)}
  </View>;
}

function Workspace() {
  const [account,setAccount] = useState<Account|null>(null), [token,setToken] = useState(""), [tenant,setTenant] = useState(""), [work,setWork] = useState<Work|null>(null);
  const [tab,setTab] = useState<Tab>("book"), [kind,setKind] = useState<Kind|"">(""), [office,setOffice] = useState(""), [plan,setPlan] = useState("");
  const [date,setDate] = useState(""), [book,setBook] = useState<Resource|null>(null), [busy,setBusy] = useState(false), [boot,setBoot] = useState(true);
  const [error,setError] = useState(""), [mfa,setMfa] = useState(false);
  const [showAdmin,setShowAdmin] = useState(false);
  const sequence = useRef(0);
  const adminTicket = useCallback(async () => {
    const result = await request<{ticket:string}>("auth/mobile-admin",token,{tenant});
    return result.ticket;
  },[tenant,token]);
  function storeIdentity(identity:Account, credential:string) {
    setAccount(identity); setToken(credential); setTenant(identity.tenants[0]?.id || "");
  }
  async function onLogin(identity:Account) {
    if (!identity.token) throw new Error(t("Nepodarilo sa vytvoriť mobilné prihlásenie."));
    await SecureStore.setItemAsync(key,identity.token);
    storeIdentity(identity,identity.token);
  }
  async function signOut(revoke = true) {
    ++sequence.current;
    if (revoke) await request("auth/logout",token,{}).catch(()=>null);
    await SecureStore.deleteItemAsync(key);
    setAccount(null); setToken(""); setWork(null); setTenant(""); setDate(""); setOffice(""); setPlan(""); setKind(""); setTab("book"); setBook(null); setShowAdmin(false); setBusy(false); setError(""); setMfa(false);
  }
  useEffect(()=>{
    async function restore() {
      try {
        const stored=await SecureStore.getItemAsync(key);
        if (stored) storeIdentity(await request<Account>("account",stored),stored);
      } catch(error) {
        if (error instanceof RequestError && error.status===401) await SecureStore.deleteItemAsync(key);
        else Alert.alert(t("Pracovisko sa nepodarilo načítať"),describe(error));
      } finally {setBoot(false);}
    }
    void restore();
  },[]);
  async function refresh(id:string, selected:string, credential=token) {
    if (!id || !credential) return;
    const current = ++sequence.current;
    setBusy(true); setError("");
    try {
      const value = await request<Work>("tenant/"+id+(selected ? "?date="+encodeURIComponent(selected) : ""),credential);
      if (current===sequence.current) { setMfa(false); setWork(value); setDate(value.date); }
    } catch(error) {
      if(current===sequence.current) {
        if(error instanceof RequestError && error.status===401) await signOut(false);
        else if (error instanceof RequestError && error.status===428) {
          setWork(null); setShowAdmin(false); setBook(null); setMfa(true); setTab("book");
        } else setError(describe(error));
      }
    } finally { if(current===sequence.current) setBusy(false); }
  }
  useEffect(()=>{ if(tenant && token) void refresh(tenant,"",token); },[tenant,token]);
  function switchTenant(id:string) {
    if(id===tenant) return;
    setMfa(false); setTenant(id); setWork(null); setDate(""); setOffice(""); setPlan(""); setKind(""); setBook(null);
  }
  const officeName = (id:string) => work?.offices.find(o=>o.id===id)?.name || t("Kancelária");
  async function change(action:string,record:object) {
    await request("tenant/"+tenant,token,{action,record});
    await refresh(tenant,date);
  }
  function cancel(id:string) {
    Alert.alert(t("Zrušiť rezerváciu?"),t("Čas bude opäť voľný."),
      [{text:t("Späť"),style:"cancel"},{text:t("Zrušiť rezerváciu"),style:"destructive",onPress:()=>change("reservation.cancel",{id}).catch(error=>Alert.alert(t("Rezerváciu sa nepodarilo zrušiť"),describe(error)))}]);
  }
  if (boot) return <View style={styles.center}><ActivityIndicator color="#235743"/><Text style={styles.muted}>{t("Načítavam účet…")}</Text></View>;
  if (!account) return <SignIn onLogin={onLogin}/>;
  const active = account.tenants.find(item=>item.id===tenant);
  const role = work?.tenant.role ?? active?.role;
  const isAdmin = !mfa && (role==="owner" || role==="admin");
  const tabs = translatedTabs();
  const mobileTabs: [Tab|"admin",string][] = isAdmin ? [...tabs.slice(0,-1),["admin",t("Správa")],tabs[tabs.length-1]] : tabs;
  const closeAdmin = () => { setShowAdmin(false); void refresh(tenant,date); };
  const choices = account.tenants.map(t=>[t.id,t.name] as [string,string]);
  const places: [string,string][] = [["",t("Všetky kancelárie")],...(work?.offices.filter(o=>!o.archived).map(o=>[o.id,o.name] as [string,string]) || [])];
  const plans = work?.plans.filter(p=>(!office || p.office===office) && !work.offices.find(o=>o.id===p.office)?.archived) || [];
  const selected = plans.find(p=>p.id===plan) || plans[0];
  const items = work?.resources.filter(r=>!r.disabled && (!kind || r.kind===kind) && (!office || r.office===office)) || [];
  const datePicker = work && <View style={styles.dayBar}><Button label={t("Skôr")} outlined disabled={busy || date<=work.today} onPress={()=>refresh(tenant,shiftDay(date,-1))}/>
    <Text style={styles.label}>{formatDate(date)}</Text><Button label={t("Neskôr")} outlined disabled={busy} onPress={()=>refresh(tenant,shiftDay(date,1))}/></View>;
  return <View style={styles.flex}>
    <View style={styles.top}><Image source={require("./assets/icon.png")} style={styles.miniLogo}/><Text style={styles.topTitle}>{work?.tenant.name || "Corpo Workplace"}</Text></View>
    {busy && <ActivityIndicator color="#235743" accessibilityLabel={t("Načítavam")}/>}
    {!!error && <View style={styles.failure}><Text style={styles.error}>{error}</Text><Button label={t("Skúsiť znova")} outlined onPress={()=>refresh(tenant,date)}/></View>}
    {mfa && tab!=="account" && <MfaPrompt key={tenant} id={tenant} credential={token}
      verified={()=>{setMfa(false);void refresh(tenant,date);}} leave={()=>setTab("account")}/>}
    {!mfa && tab==="book" && <FlatList data={items} keyExtractor={r=>r.id} contentContainerStyle={styles.content}
      ListHeaderComponent={<><Heading title={t("Rezervovať")} description={t("Stoly, zasadačky a parkovacie miesta.")}/>
        {datePicker}<Segments items={places} value={office} select={setOffice}/>
        <Segments<Kind|""> items={[["",t("Všetky")],["desk",labels().desk],["room",labels().room],["parking",labels().parking]]} value={kind} select={setKind}/></>}
      ListEmptyComponent={<Text style={styles.muted}>{busy ? t("Načítavam priestory…") : t("Vo výbere zatiaľ nie sú žiadne priestory.")}</Text>}
      renderItem={({item})=>{
        const reserved=work?.busy.filter(b=>b.resource===item.id).map(b=>b.start+"–"+b.end).join(", ");
        return <Card name={item.name} description={[officeName(item.office),kindNames()[item.kind],item.kind==="room" ? item.capacity+t(" osôb") : "",item.description,reserved ? t("Rezervované: ")+reserved : ""].filter(Boolean).join(" · ")}
          action={<Button label={t("Rezervovať")} onPress={()=>setBook(item)}/>}/>;
      }}/>}
    {!mfa && tab==="mine" && <FlatList data={work?.mine || []} keyExtractor={r=>r.id} contentContainerStyle={styles.content}
      ListHeaderComponent={<Heading title={t("Moje rezervácie")} description={t("Nadchádzajúce rezervácie pracoviska.")}/>}
      ListEmptyComponent={<Text style={styles.muted}>{t("Zatiaľ nemáte rezervácie.")}</Text>}
      renderItem={({item})=><Card name={item.title || item.resourceName}
        description={[item.resourceName,officeName(item.office),formatDate(item.date),item.start+"–"+item.end].join(" · ")}
        action={<Button label={t("Zrušiť rezerváciu")} outlined onPress={()=>cancel(item.id)}/>}/>}/>}
    {!mfa && tab==="plans" && <ScrollView contentContainerStyle={styles.content}>
      <Heading title={t("Pôdorysy")} description={t("Označené miesto môžete priamo rezervovať.")}/>
      {datePicker}<Segments items={places} value={office} select={setOffice}/>
      {selected && work ? <><Segments items={plans.map(p=>[p.id,p.name])} value={selected.id} select={setPlan}/>
        <FloorPlan key={selected.id} plan={selected} work={work} token={token} open={setBook}/></> :
        <Text style={styles.muted}>{t("Žiadne pôdorysy pre vybrané pracovisko.")}</Text>}
    </ScrollView>}
    {tab==="account" && <ScrollView contentContainerStyle={styles.content}>
      <Heading title={t("Účet")} description={t("Profil a výber firemného pracoviska.")}/>
      <Card name={account.user.name} description={account.user.email}/>
      {!!choices.length && <Segments items={choices} value={tenant} select={switchTenant}/>}
      {work && <Text style={styles.muted}>{roleNames()[work.tenant.role]}</Text>}
      {work?.security?.sso && <Button label={t("Zabezpečenie účtu")} outlined onPress={()=>openWeb("#security")}/>}
      {isAdmin && <Button label={t("Správa firmy")} outlined onPress={()=>setShowAdmin(true)}/>}
      {!choices.length && <Button label={t("Vytvoriť pracovisko")} outlined onPress={()=>openWeb()}/>}
      <Button label={t("Odhlásiť sa")} outlined onPress={()=>signOut().catch(error=>Alert.alert(t("Odhlásenie zlyhalo"),describe(error)))}/>
    </ScrollView>}
    <View style={styles.tabBar}>{mobileTabs.map(([id,label])=>{
      const selected = id==="admin" ? showAdmin : !showAdmin && tab===id;
      return <Pressable key={id} accessibilityRole="tab" accessibilityState={{selected}} style={[styles.tabButton,selected && styles.active]}
        onPress={()=>id==="admin" ? setShowAdmin(true) : setTab(id)}><Text style={styles.tabLabel}>{label}</Text></Pressable>;
    })}</View>
    {showAdmin && isAdmin && <AdminPanel base={origin} company={work?.tenant.name || active?.name || ""} ticket={adminTicket} close={closeAdmin}/>}
    {book && <Booking key={book.id} item={book} date={date} close={()=>setBook(null)}
      submit={async record=>{await change("reservation.create",record);setBook(null);setTab("mine");}}/>}
  </View>;
}
export default function App() {
  const [locale,setLocale] = useState<Language|null>(null);
  useEffect(()=>{
    SecureStore.getItemAsync("corpo.language").then(saved=>{
      const value=saved==="en" ? "en" : "sk";
      setLanguage(value); setLocale(value);
    }).catch(()=>setLocale("sk"));
  },[]);
  const selectLocale = (value:Language) => {
    setLanguage(value); setLocale(value);
    void SecureStore.setItemAsync("corpo.language",value).catch(()=>{});
  };
  return <SafeAreaProvider><StatusBar style="dark"/><SafeAreaView style={styles.application}>
    {locale && <>
      <View style={styles.languageMenu} accessibilityLabel={t("Jazyk")}>
        <Segments<Language> items={[["sk","SK"],["en","EN"]]} value={locale} select={selectLocale}/>
      </View>
      <Workspace/>
    </>}
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  application:{flex:1,backgroundColor:"#f4f6f1"},
  languageMenu:{alignItems:"flex-end",paddingHorizontal:14,paddingTop:3},
  flex:{flex:1},
  center:{flex:1,justifyContent:"center",alignItems:"center",gap:12},
  content:{padding:16,paddingBottom:24},
  login:{padding:24,paddingTop:34,gap:12},
  logo:{width:70,height:70,borderRadius:16},
  miniLogo:{width:31,height:31,borderRadius:7},
  top:{paddingHorizontal:16,paddingVertical:9,minHeight:53,backgroundColor:"white",borderBottomWidth:1,borderColor:"#e1e8df",flexDirection:"row",alignItems:"center",gap:8},
  topTitle:{fontSize:17,fontWeight:"700",color:"#17372a",flex:1},
  heading:{marginBottom:15,gap:6},
  title:{fontSize:31,fontWeight:"800",letterSpacing:-1.2,color:"#17372a"},
  muted:{fontSize:15,color:"#526d5d",lineHeight:21},
  error:{color:"#982c2c",fontSize:14,marginVertical:5},
  failure:{padding:12,gap:5},
  label:{fontSize:14,fontWeight:"700",color:"#17372a"},
  field:{marginBottom:5,gap:6},
  input:{minHeight:46,borderColor:"#d9e4da",borderRadius:8,borderWidth:1,backgroundColor:"white",paddingHorizontal:10,color:"#17372a",fontSize:16},
  button:{minHeight:44,justifyContent:"center",alignItems:"center",backgroundColor:"#245743",borderColor:"#245743",borderWidth:1,borderRadius:8,paddingHorizontal:12,marginVertical:4},
  outlined:{backgroundColor:"white",borderColor:"#cfdfd2"},
  buttonLabel:{color:"white",fontSize:14,fontWeight:"700"},
  outlinedLabel:{color:"#245743",fontSize:14,fontWeight:"700"},
  dim:{opacity:.52},
  card:{borderRadius:12,backgroundColor:"white",borderColor:"#e0e8df",borderWidth:1,padding:14,marginBottom:10,gap:7},
  cardTitle:{fontSize:20,fontWeight:"700",color:"#17372a"},
  dayBar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:5,marginBottom:7},
  segments:{flexDirection:"row",flexWrap:"wrap",gap:6,marginBottom:10},
  segment:{borderRadius:8,borderColor:"#e0e8df",borderWidth:1,paddingHorizontal:10,minHeight:42,justifyContent:"center",backgroundColor:"white"},
  active:{backgroundColor:"#e6f1df",borderColor:"#c9dfc3"},
  segmentLabel:{fontSize:13,color:"#235743",fontWeight:"700"},
  two:{flexDirection:"row",gap:7},
  tabBar:{flexDirection:"row",borderTopWidth:1,borderColor:"#e0e8df",backgroundColor:"white",padding:4,gap:3},
  tabButton:{flex:1,minHeight:45,justifyContent:"center",alignItems:"center",borderRadius:7,paddingHorizontal:2},
  tabLabel:{fontSize:12,fontWeight:"700",color:"#285541",textAlign:"center"},
  floor:{width:"100%",position:"relative",backgroundColor:"#e8eee7",borderRadius:11,overflow:"hidden"},
  floorImage:{width:"100%",height:"100%"},
  pin:{position:"absolute",width:28,height:28,borderRadius:14,marginLeft:-14,marginTop:-14,backgroundColor:"#255741",borderWidth:2,borderColor:"white",alignItems:"center",justifyContent:"center"},
  pinText:{fontSize:12,color:"white",fontWeight:"800"},
});
