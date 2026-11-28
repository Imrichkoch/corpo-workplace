import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

type Props = {
  base: string;
  company: string;
  ticket: () => Promise<string>;
  close: () => void;
};
type Transfer = {
  uri: string;
  method: "POST";
  body: string;
  headers: { "Content-Type": string };
};

export default function AdminPanel({base, company, ticket, close}:Props) {
  const [source, setSource] = useState<Transfer|null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const entry = base + "mobile-admin/session";

  useEffect(() => {
    let active = true;
    void ticket().then(raw => {
      if (!active) return;
      setSource({uri:entry,method:"POST",body:"ticket="+encodeURIComponent(raw),
        headers:{"Content-Type":"application/x-www-form-urlencoded"}});
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "Správu sa nepodarilo otvoriť.");
    });
    return () => { active = false; };
  }, [ticket, entry, attempt]);

  function retry() { setError(""); setSource(null); setAttempt(value => value + 1); }
  function connectionError() { setError("Správu sa nepodarilo načítať. Skúste ju otvoriť znova."); }
  const spinner = () => <View style={styles.center}><ActivityIndicator color="#245743" accessibilityLabel="Načítavam správu"/></View>;

  return <Modal animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">Správa firmy</Text>
          <Text style={styles.company} numberOfLines={1}>{company}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Zavrieť správu" onPress={close} style={styles.smallButton}>
          <Text style={styles.buttonText}>Zavrieť</Text>
        </Pressable>
      </View>
      {error ? <View style={styles.center}>
        <Text style={styles.message} accessibilityLiveRegion="polite">{error}</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.smallButton}>
          <Text style={styles.buttonText}>Skúsiť znova</Text>
        </Pressable>
      </View> : source ? <WebView
        style={styles.browser}
        source={source}
        originWhitelist={["https://raizenko.cloud"]}
        onShouldStartLoadWithRequest={request => request.url.startsWith(base)}
        mixedContentMode="never"
        allowFileAccess={false}
        thirdPartyCookiesEnabled={false}
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={spinner}
        onError={connectionError}
        onHttpError={({nativeEvent}) => {
          if (nativeEvent.url === entry) connectionError();
        }}
        onMessage={({nativeEvent}) => {
          if (nativeEvent.url.startsWith(base) && nativeEvent.data === "corpo-admin-expired") {
            setError("Relácia správy vypršala. Otvorte ju znova z aplikácie.");
          }
        }}
      /> : spinner()}
    </SafeAreaView>
  </Modal>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#f4f6f1"},
  header:{flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:14,paddingVertical:8,
    borderBottomColor:"#e1e8df",borderBottomWidth:1,backgroundColor:"#fff"},
  titleBlock:{flex:1,minWidth:0},
  title:{fontSize:17,fontWeight:"700",color:"#17372a"},
  company:{fontSize:13,color:"#526d5d",marginTop:3},
  smallButton:{minHeight:44,borderColor:"#cfdfd2",borderRadius:8,borderWidth:1,paddingHorizontal:12,
    alignItems:"center",justifyContent:"center",backgroundColor:"#fff"},
  buttonText:{fontWeight:"700",color:"#245743",fontSize:14},
  browser:{flex:1,backgroundColor:"#f4f6f1"},
  center:{flex:1,alignItems:"center",justifyContent:"center",padding:18,gap:12,backgroundColor:"#f4f6f1"},
  message:{color:"#375845",fontSize:15,textAlign:"center"},
});
